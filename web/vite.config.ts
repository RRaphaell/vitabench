import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const RUNS = resolve(dirname(fileURLToPath(import.meta.url)), '../runs');

function listRuns(): { name: string; mtime: number }[] {
  if (!existsSync(RUNS)) return [];
  return readdirSync(RUNS, { withFileTypes: true })
    .map((d) => ({ dir: d, file: ['frames.json', 'run_id'].map((f) => join(RUNS, d.name, f)).find(existsSync) }))
    .filter((row) => row.dir.isDirectory() && !!row.file)
    .map((row) => ({ name: row.dir.name, mtime: statSync(row.file as string).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
}

function newestBoard(dir: string, depth: number): string | null {
  const here = join(dir, 'leaderboard.json');
  let best = existsSync(here) ? here : null;
  if (depth <= 0) return best;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = newestBoard(join(dir, entry.name), depth - 1);
    if (found && (!best || statSync(found).mtimeMs > statSync(best).mtimeMs)) best = found;
  }
  return best;
}

function serveRuns(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const path = (req.url ?? '').split('?')[0] ?? '';
  if (!path.startsWith('/runs/')) return next();
  res.setHeader('cache-control', 'no-store');
  if (path === '/runs/index.json') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(listRuns()));
    return;
  }
  const rel = normalize(decodeURIComponent(path.slice('/runs/'.length)));
  let file = join(RUNS, rel);
  // the batch writes its board wherever the run tree is rooted; the viewer only knows this one url
  if (rel === 'leaderboard.json' && !existsSync(file)) file = newestBoard(RUNS, 2) ?? file;
  if (rel.startsWith('..') || !file.startsWith(RUNS) || !existsSync(file) || !statSync(file).isFile()) {
    res.statusCode = 404;
    res.end('no such run file');
    return;
  }
  res.setHeader('content-type', file.endsWith('.json') ? 'application/json' : 'text/plain');
  createReadStream(file).pipe(res);
}

function runsPlugin(): Plugin {
  return {
    name: 'vitabench-runs',
    configureServer: (server) => {
      server.middlewares.use(serveRuns);
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(serveRuns);
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [runsPlugin()],
  server: { fs: { allow: ['..'] } },
  build: { target: 'es2022', sourcemap: true, assetsDir: 'static' },
});
