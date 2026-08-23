import { el, show } from './dom';

const PANELS: [string, string, string][] = [
  [
    '\u{1F553}',
    'the clock, top left',
    'The year and season of the life being replayed; the strip under it is the last real piece of news to reach Venice.',
  ],
  [
    '\u{1F464}',
    'the hero card',
    'The agent’s body — money in ducats, health, energy — and what it is doing right now. Numbers that jump are shown as +/− next to the bar.',
  ],
  [
    '\u{1F5D3}',
    'the season line, bottom left',
    'Everything the agent planned for this one season: how many weeks it worked, what it ate, who it spoke to, what it wrote in its diary, and the money and health it gained or lost.',
  ],
  [
    '\u{1F9E0}',
    'agent’s memory',
    'The notes the agent wrote for itself this season. It carries nothing else between seasons — no chat history, no hidden state.',
  ],
  [
    '\u{1F4DC}',
    'life chronicle',
    'One line per season, newest on top: what it did, what happened in the world, what it wrote down, and every memory test as it lands.',
  ],
  [
    '▬',
    'the timeline, bottom',
    'One diamond per memory test — hollow = a fact was planted, green = remembered it, red = forgot it, white = death.',
  ],
];

const KEYS: [string, string][] = [
  ['space', 'pause / continue'],
  ['1 2 3', 'speed 1× 4× 12×'],
  ['→', 'jump to the next memory test'],
  ['4 5 6', 'plague · war · end'],
  ['tab', 'follow / overview camera'],
  ['h', 'this help'],
];

export interface Help {
  readonly open: boolean;
  toggle(): void;
  close(): void;
}

export function mountHelp(root: HTMLElement): Help {
  const scrim = el('div', 'scrim helpcard hidden');
  const card = el('div', 'panel helpbox');
  card.append(el('h2', '', 'What you are looking at'));
  card.append(
    el(
      'div',
      'help-sub',
      'VitaBench replays one agent living one life in Venice, 1340–1380. Every season it returns a plan; we check what it does when an old fact comes back.',
    ),
  );
  const rows = el('div', 'help-rows');
  for (const [icon, name, text] of PANELS) {
    const row = el('div', 'help-row');
    row.append(el('span', 'help-ico', icon));
    const body = el('div');
    body.append(el('div', 'help-name', name), el('div', 'help-text', text));
    row.append(body);
    rows.append(row);
  }
  card.append(rows);
  const keys = el('div', 'help-keys');
  for (const [key, what] of KEYS) {
    const item = el('span', 'keyhelp-item');
    item.append(el('kbd', '', key), el('span', '', what));
    keys.append(item);
  }
  card.append(keys);
  card.append(el('div', 'hint', 'press h to close'));
  scrim.append(card);
  root.append(scrim);

  let open = false;
  const set = (next: boolean) => {
    open = next;
    show(scrim, open);
  };
  scrim.addEventListener('click', () => set(false));

  return {
    get open() {
      return open;
    },
    toggle: () => set(!open),
    close: () => set(false),
  };
}
