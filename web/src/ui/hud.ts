import { SEASONS } from '../state/schema';
import { SPEEDS, SPEED_LABELS, Store } from '../state/store';
import { el } from './dom';

export interface HudDeps {
  onTogglePause(): void;
  onSpeed(index: number): void;
  onNextMoment(): void;
  onCamera(): void;
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

  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Space') {
      ev.preventDefault();
      deps.onTogglePause();
    } else if (ev.code === 'Digit1' || ev.code === 'Digit2' || ev.code === 'Digit3') {
      deps.onSpeed(Number(ev.code.slice(-1)) - 1);
    } else if (ev.code === 'Tab') {
      ev.preventDefault();
      deps.onCamera();
    } else if (ev.code === 'ArrowRight') {
      ev.preventDefault();
      deps.onNextMoment();
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
