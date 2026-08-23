import { SEASONS } from '../state/schema';
import { SPEEDS, SPEED_LABELS, Store } from '../state/store';
import { el, fitLines, show } from './dom';
import { rawFrame, yearOf } from './plan';

const HELP_MS = 5000;
const NEWS_LINES = 2;
const KEYS: [string, string][] = [
  ['h', 'what am I looking at?'],
  ['space', 'pause'],
  ['→', 'next memory test'],
];

export type Chapter = 'plague' | 'war' | 'end';

export interface HudDeps {
  onTogglePause(): void;
  onSpeed(index: number): void;
  onNextMoment(): void;
  onCamera(): void;
  onChapter(chapter: Chapter): void;
  onHelp(): void;
}

function mountKeyStrip(root: HTMLElement): () => void {
  const line = el('div', 'keyhelp');
  for (const [key, what] of KEYS) {
    const item = el('span', 'keyhelp-item');
    item.append(el('kbd', '', key), el('span', '', what));
    line.append(item);
  }
  root.append(line);
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    line.classList.remove('gone');
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => line.classList.add('gone'), HELP_MS);
  };
}

export function mountHud(root: HTMLElement, host: HTMLElement, deps: HudDeps): { update(s: Store): void } {
  const panel = el('div', 'panel hud');
  const clock = el('div', 'clock');
  const year = el('div', 'year', '----');
  const season = el('div', 'season', '');
  clock.append(year, season);

  const pills = el('div', 'pills');
  const pause = el('button', 'pill', '⏸');
  pause.title = 'Space';
  pause.addEventListener('click', () => deps.onTogglePause());
  pills.append(pause);
  const speedButtons = SPEED_LABELS.map((label, i) => {
    const b = el('button', 'pill', label);
    b.addEventListener('click', () => deps.onSpeed(i));
    pills.append(b);
    return b;
  });

  const next = el('button', 'next', '→ next memory test');
  next.addEventListener('click', () => deps.onNextMoment());
  panel.append(clock, pills, next);

  const strip = el('div', 'panel histstrip');
  const stripIcon = el('span', 'ico', '\u{1F4DC}');
  const stripText = el('span', 'hs-text', 'latest: nothing has happened yet');
  strip.append(stripIcon, stripText);
  host.append(panel, strip);

  const showKeys = mountKeyStrip(root);
  showKeys();

  const chapters: Record<string, Chapter> = { Digit4: 'plague', Digit5: 'war', Digit6: 'end' };
  window.addEventListener('keydown', (ev) => {
    const chapter = chapters[ev.code];
    if (ev.code === 'Space') {
      ev.preventDefault();
      deps.onTogglePause();
    } else if (ev.code === 'Digit1' || ev.code === 'Digit2' || ev.code === 'Digit3') {
      deps.onSpeed(Number(ev.code.slice(-1)) - 1);
    } else if (chapter) {
      deps.onChapter(chapter);
    } else if (ev.code === 'Tab') {
      ev.preventDefault();
      deps.onCamera();
    } else if (ev.code === 'ArrowRight') {
      ev.preventDefault();
      deps.onNextMoment();
    } else if (ev.key === '?' || ev.code === 'KeyH') {
      deps.onHelp();
    }
  });

  let newsKey = '';
  return {
    update(s: Store) {
      const t = s.cursor;
      year.textContent = String(s.startYear + Math.floor(t / 4));
      season.textContent = SEASONS[Math.floor(t) % 4] ?? '';
      pause.textContent = s.paused ? '▶' : '⏸';
      pause.classList.toggle('on', s.paused);
      speedButtons.forEach((b, i) => b.classList.toggle('on', !s.paused && s.speed === SPEEDS[i]));

      let news = '';
      let at = 0;
      const upto = s.indexAt(t);
      for (let i = 0; i <= upto; i++) {
        const f = s.frames[i];
        if (f?.news) {
          news = f.news;
          at = f.t;
        }
      }
      if (!news) {
        const first = rawFrame(s, t);
        show(strip, !!first);
        if (newsKey !== 'none') {
          newsKey = 'none';
          fitLines(stripText, 'latest news: quiet years so far', NEWS_LINES);
        }
        return;
      }
      show(strip, true);
      const key = `${at}:${news}`;
      if (key === newsKey) return;
      newsKey = key;
      fitLines(stripText, `latest: ${yearOf(s, at)} · ${news}`, NEWS_LINES);
    },
  };
}
