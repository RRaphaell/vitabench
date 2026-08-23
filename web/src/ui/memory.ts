import { Store } from '../state/store';
import { clear, el, fitLines, show } from './dom';

const LINES = 4;

function iconFor(text: string): string {
  const s = text.toLowerCase();
  if (/ducat|debt|lent|owe|paid|coin|price|sold|bought/.test(s)) return '\u{1F4B0}';
  if (/promis|swore|vow|never|always|mother|advice/.test(s)) return '\u{1F4DC}';
  if (/plague|war|doge|flood|senate|galley|news/.test(s)) return '\u{1F4F0}';
  return '\u{1F91D}';
}

export function mountMemory(root: HTMLElement): { update(s: Store): void } {
  const panel = el('div', 'panel memory');
  const title = el('h3', '', 'memory');
  const list = el('div', 'meters');
  panel.append(title, list);
  root.append(panel);

  let lastKey = 'unset';
  return {
    update(s: Store) {
      const f = s.frameAt(s.cursor);
      const wrote = f?.memory.wrote ?? [];
      const recent = wrote.slice(-3).reverse();
      const key = recent.join('|');
      if (key === lastKey) return;
      lastKey = key;
      clear(list);
      show(panel, recent.length > 0);
      for (const text of recent) {
        const card = el('div', 'mem-card');
        const body = el('span', 'mem-text');
        card.append(el('span', 'ico', iconFor(text)), body);
        list.append(card);
        fitLines(body, text, LINES);
      }
    },
  };
}
