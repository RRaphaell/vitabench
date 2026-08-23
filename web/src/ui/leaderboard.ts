import { Store } from '../state/store';
import { clear, el, show } from './dom';

interface Row {
  harness?: string;
  model?: string;
  n?: number | null;
  seeds?: unknown[];
  H?: number | null;
  cost?: number | null;
  cost_usd?: number | null;
  ci?: number[] | { H?: number[] };
}

const GOLD = 'claude-code';
const SUBTITLE =
  'Each row is one agent setup, run on the same lives (n). Higher is better; $ is the average API cost per life.';

function count(row: Row): string {
  if (typeof row.n === 'number') return String(row.n);
  return Array.isArray(row.seeds) ? String(row.seeds.length) : '—';
}

const SOURCES = ['/runs/leaderboard.json', 'http://localhost:8700/runs/leaderboard.json'];

function ciOf(row: Row): [number, number] | null {
  const raw = Array.isArray(row.ci) ? row.ci : row.ci?.H;
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [lo, hi] = raw as [number, number];
  return typeof lo === 'number' && typeof hi === 'number' ? [lo, hi] : null;
}

function bar(row: Row): HTMLElement {
  const wrap = el('div', 'ci');
  const h = typeof row.H === 'number' ? row.H : 0;
  const span = ciOf(row) ?? [h, h];
  const range = el('div', 'ci-range');
  range.style.left = `${Math.max(0, span[0]) * 100}%`;
  range.style.width = `${Math.max(0.01, span[1] - span[0]) * 100}%`;
  const dot = el('div', 'ci-dot');
  dot.style.left = `${h * 100}%`;
  wrap.append(range, dot);
  return wrap;
}

const MODEL_NAME: Record<string, string> = {
  'claude-sonnet-5': 'Sonnet 5',
  sonnet: 'Sonnet 5',
  'claude-opus-5': 'Opus 5',
  opus: 'Opus 5',
  mock: '',
};

function modelKey(model: string): string {
  return model.replace(/^claude-/, '').replace(/-\d+$/, '');
}

function nameFor(row: Row): string {
  const harness = row.harness ?? '?';
  const model = MODEL_NAME[row.model ?? ''] ?? row.model ?? '';
  if (harness === 'claude-code') return `Claude Code · ${model || 'model?'}`;
  if (harness === 'claude-code/caterina') return 'Claude Code · Caterina';
  if (harness === 'mock:sensible') return 'scripted baseline';
  if (harness === 'mock:goldfish') return 'goldfish';
  if (harness === 'mock:random') return 'random';
  return model ? `${harness} · ${model}` : harness;
}

function aboutFor(row: Row): string {
  const harness = row.harness ?? '';
  const model = modelKey(row.model ?? '');
  if (harness === 'claude-code') {
    return `the Claude Code CLI with its own memory.md, ${model === 'opus' ? 'Opus 5' : 'Sonnet 5'}`;
  }
  if (harness === 'claude-code/caterina') return 'second persona, glassmaker’s daughter';
  if (harness === 'mock:sensible') return 'no LLM: works every week, eats plain, pays known debts';
  if (harness === 'mock:goldfish') return 'no memory: refuses every claim';
  if (harness === 'mock:random') return 'random legal plans';
  return 'an agent setup';
}

export function mountLeaderboard(root: HTMLElement, store: Store): { toggle(): void } {
  const button = el('button', 'lb-btn', 'leaderboard');
  const drawer = el('div', 'panel lb-drawer hidden');
  root.append(button, drawer);

  let open = false;
  const toggle = () => {
    open = !open;
    show(drawer, open);
  };
  button.addEventListener('click', toggle);

  const render = (rows: Row[]) => {
    clear(drawer);
    drawer.append(el('h3', '', 'leaderboard'));
    drawer.append(el('div', 'lb-sub', SUBTITLE));
    if (!rows.length) {
      drawer.append(el('div', 'lb-empty', 'no scored runs yet'));
      return;
    }
    const table = el('table');
    const head = el('tr');
    for (const h of ['agent setup', 'lives', 'VitaBench score', '', '$ / life']) head.append(el('th', '', h));
    table.append(head);
    const mine = store.hello?.harness ?? '';
    const mineModel = modelKey(store.hello?.model ?? '');
    for (const row of rows.sort((a, b) => (b.H ?? 0) - (a.H ?? 0))) {
      const isMine = row.harness === mine && modelKey(row.model ?? '') === mineModel;
      const tr = el('tr', isMine || row.harness === GOLD ? 'mine' : '');
      const cell = el('td', 'who');
      const title = el('div', 'lb-name', nameFor(row));
      if (isMine) title.append(el('span', 'lb-here', '◀ this replay'));
      cell.append(title, el('div', 'lb-about', aboutFor(row)));
      tr.append(cell);
      tr.append(el('td', '', count(row)));
      tr.append(el('td', '', typeof row.H === 'number' ? row.H.toFixed(2) : '—'));
      const ciCell = el('td', 'ci-cell');
      ciCell.append(bar(row));
      tr.append(ciCell);
      const cost = row.cost_usd ?? row.cost;
      tr.append(el('td', '', typeof cost === 'number' ? `$${cost.toFixed(2)}` : '—'));
      table.append(tr);
    }
    drawer.append(table);
  };

  void (async () => {
    for (const url of SOURCES) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) continue;
        const rows = (await res.json()) as Row[];
        if (!Array.isArray(rows)) continue;
        render(rows);
        return;
      } catch {
        continue;
      }
    }
    render([]);
  })();

  render([]);
  return { toggle };
}
