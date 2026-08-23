import { SEASONS } from '../state/schema';
import { SPEEDS, SPEED_LABELS, Store } from '../state/store';
import { el } from './dom';

const HELP_MS = 5000;
const KEYS: [string, string][] = [
  ['space', 'pause'],
  ['1 2 3', 'speed'],
  ['→', 'next moment'],
  ['4', 'plague'],
  ['5', 'war'],
  ['6', 'end'],
  ['tab', 'camera'],
];

export type Chapter = 'plague' | 'war' | 'end';

export interface HudDeps {
  onTogglePause(): void;
  onSpeed(index: number): void;
  onNextMoment(): void;
  onCamera(): void;
  onChapter(chapter: Chapter): void;
}

function mountHelp(root: HTMLElement): () => void {
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

export function mountHud(root: HTMLElement, deps: HudDeps): { update(s: Store): void } {
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

  const next = el('button', 'next', '→ next moment');
  next.addEventListener('click', () => deps.onNextMoment());
  panel.append(clock, pills, next);
  root.append(panel);

  const showHelp = mountHelp(root);
  showHelp();

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
      showHelp();
    }
  });

  return {
    update(s: Store) {
      const t = s.cursor;
      year.textContent = String(s.startYear + Math.floor(t / 4));
      season.textContent = SEASONS[Math.floor(t) % 4] ?? '';
      pause.textContent = s.paused ? '▶' : '⏸';
      pause.classList.toggle('on', s.paused);
      speedButtons.forEach((b, i) => b.classList.toggle('on', !s.paused && s.speed === SPEEDS[i]));
    },
  };
}
