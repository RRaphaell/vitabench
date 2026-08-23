import { el, show } from './dom';

interface Row {
  harness?: string;
  model?: string;
  n?: number;
  H?: number;
  N?: number;
  L?: number;
  cost?: number;
  ci?: [number, number] | number[];
}

const fmt = (v: unknown, digits = 2) => (typeof v === 'number' ? v.toFixed(digits) : '—');

export function mountLeaderboard(root: HTMLElement, url = '/runs/leaderboard.json'): { toggle(): void } {
  const button = el('button', 'panel lb-btn hidden', 'leaderboard');
  const drawer = el('div', 'panel lb-drawer hidden');
  root.append(button, drawer);

  let open = false;
  let ready = false;
  const toggle = () => {
    if (!ready) return;
    open = !open;
    show(drawer, open);
  };
  button.addEventListener('click', toggle);

  void (async () => {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return;
      const rows = (await res.json()) as Row[];
      if (!Array.isArray(rows) || !rows.length) return;
      const table = el('table');
      const head = el('tr');
      for (const h of ['harness', 'n', 'H', 'N', 'L', '$/life']) head.append(el('th', '', h));
      table.append(head);
      for (const r of rows) {
        const tr = el('tr');
        const ci = Array.isArray(r.ci) && r.ci.length === 2 ? ` ±${fmt(((r.ci[1] as number) - (r.ci[0] as number)) / 2)}` : '';
        for (const v of [`${r.harness ?? '?'} ${r.model ?? ''}`.trim(), String(r.n ?? '—'), `${fmt(r.H)}${ci}`, fmt(r.N), fmt(r.L), `$${fmt(r.cost)}`]) {
          tr.append(el('td', '', v));
        }
        table.append(tr);
      }
      drawer.append(el('h3', '', 'leaderboard'), table);
      ready = true;
      show(button, true);
    } catch {
      show(button, false);
    }
  })();

  return { toggle };
}
