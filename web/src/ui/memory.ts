import { Store } from '../state/store';
import { clear, el, show } from './dom';

function iconFor(text: string): string {
  const s = text.toLowerCase();
  if (/ducat|debt|lent|owe|paid|coin|price|sold|bought/.test(s)) return '\u{1F4B0}';
  if (/promis|swore|vow|never|always|mother|advice/.test(s)) return '\u{1F4DC}';
  if (/plague|war|doge|flood|senate|galley|news/.test(s)) return '\u{1F4F0}';
  return '\u{1F91D}';
}

export function mountMemory(root: HTMLElement): { update(s: Store): void } {
  const panel = el('div', 'panel memory');
  const title = el('h3', '', 'harness memory');
  const list = el('div', 'meters');
  const retrieved = el('div', 'mem-retrieved hidden');
  panel.append(title, list, retrieved);
  root.append(panel);

  let lastKey = '';
  return {
    update(s: Store) {
      const f = s.frameAt(s.cursor);
      const wrote = f?.memory.wrote ?? [];
      const recent = wrote.slice(-3).reverse();
      const m = s.activeMoment;
      const key = `${recent.join('|')}::${m ? m.probe_id + String(m.retrieved) : ''}`;
      if (key === lastKey) return;
      lastKey = key;
      clear(list);
      for (const text of recent) {
        const card = el('div', 'mem-card');
        card.append(el('span', 'ico', iconFor(text)), el('span', '', text));
        list.append(card);
      }
      show(panel, recent.length > 0 || !!m);
      show(retrieved, !!m);
      if (m) {
        retrieved.classList.toggle('none', !m.retrieved);
        retrieved.textContent = m.retrieved ? `retrieved: ${m.retrieved}` : '— nothing retrieved —';
      }
    },
  };
}
