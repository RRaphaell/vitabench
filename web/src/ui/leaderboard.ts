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


const HARNESS_LABEL: Record<string, string> = {
  'claude-code': 'Claude Code · memory.md',
  'claude-code/caterina': 'Claude Code · Caterina',
  'mock:sensible': 'scripted baseline',
  'mock:goldfish': 'goldfish · no memory',
  'mock:random': 'random plans',
};
const MODEL_LABEL: Record<string, string> = { 'claude-sonnet-5': 'Sonnet', 'claude-opus-5': 'Opus', mock: '' };
function labelFor(row: { harness?: string; model?: string }): string {
  const harness = HARNESS_LABEL[row.harness ?? ''] ?? row.harness ?? '?';
  const model = MODEL_LABEL[row.model ?? ''] ?? row.model ?? '';
  return model ? `${harness} · ${model}` : harness;
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
    if (!rows.length) {
      drawer.append(el('div', 'lb-empty', 'no scored runs yet'));
      return;
    }
    const table = el('table');
    const head = el('tr');
    for (const h of ['harness', 'n', 'H', '', '$/life']) head.append(el('th', '', h));
    table.append(head);
    const mine = store.hello?.harness ?? GOLD;
    for (const row of rows.sort((a, b) => (b.H ?? 0) - (a.H ?? 0))) {
      const tr = el('tr', row.harness === mine || row.harness === GOLD ? 'mine' : '');
      tr.append(el('td', 'who', labelFor(row)));
      tr.append(el('td', '', count(row)));
      tr.append(el('td', '', typeof row.H === 'number' ? row.H.toFixed(3) : '—'));
      const cell = el('td', 'ci-cell');
      cell.append(bar(row));
      tr.append(cell);
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
