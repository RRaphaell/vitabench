import { Store } from '../state/store';
import { clear, el, fitLines, show } from './dom';

const LINES = 3;
const KEEP = 2;
const EXPLAINER =
  'Between seasons the agent keeps nothing but a notes file it writes itself. These are the lines it added most recently — nobody edits them for it.';

function iconFor(text: string): string {
  const s = text.toLowerCase();
  if (/ducat|debt|lent|owe|paid|coin|price|sold|bought/.test(s)) return '\u{1F4B0}';
  if (/promis|swore|vow|never|always|mother|advice/.test(s)) return '\u{1F4DC}';
  if (/plague|war|doge|flood|senate|galley|news/.test(s)) return '\u{1F4F0}';
  return '\u{1F91D}';
}

export function mountMemory(host: HTMLElement): { update(s: Store): void } {
  const panel = el('div', 'panel memory');
  const head = el('div', 'mem-head');
  const title = el('h3', '', 'agent’s memory');
  const ask = el('button', 'ask', '?');
  ask.title = 'what is this?';
  head.append(title, ask);
  const sub = el('div', 'mem-sub', 'what it wrote down');
  const note = el('div', 'mem-note hidden', EXPLAINER);
  const list = el('div', 'meters');
  panel.append(head, sub, note, list);
  host.append(panel);

  let noteOpen = false;
  ask.addEventListener('click', () => {
    noteOpen = !noteOpen;
    show(note, noteOpen);
    ask.classList.toggle('on', noteOpen);
  });

  let lastKey = 'unset';
  return {
    update(s: Store) {
      const f = s.frameAt(s.cursor);
      const wrote = f?.memory.wrote ?? [];
      const recent = wrote.slice(-KEEP).reverse();
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
