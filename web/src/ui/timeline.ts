import { Store } from '../state/store';
import { clear, el, show } from './dom';

export interface TimelineDeps {
  onSeek(t: number): void;
}

export function mountTimeline(root: HTMLElement, deps: TimelineDeps): { update(s: Store): void } {
  const panel = el('div', 'panel timeline');
  const left = el('div', 'yr', '');
  const right = el('div', 'yr', '');
  const wrap = el('div', 'track-wrap');
  const line = el('div', 'track-line');
  const playhead = el('div', 'playhead');
  const hover = el('div', 'hover-year hidden');
  wrap.append(line, playhead, hover);
  panel.append(left, wrap, right);
  root.append(panel);

  let span: [number, number] = [0, 1];
  let startYear = 1340;
  const tAt = (clientX: number) => {
    const r = wrap.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return span[0] + u * (span[1] - span[0]);
  };
  wrap.addEventListener('click', (ev) => deps.onSeek(tAt(ev.clientX)));
  let pinned: string | null = null;
  wrap.addEventListener('pointermove', (ev) => {
    if (pinned) return;
    const r = wrap.getBoundingClientRect();
    show(hover, true);
    hover.style.left = `${ev.clientX - r.left}px`;
    hover.textContent = String(startYear + Math.floor(tAt(ev.clientX) / 4));
  });
  wrap.addEventListener('pointerleave', () => {
    pinned = null;
    show(hover, false);
  });

  let pinKey = '';
  return {
    update(s: Store) {
      span = [s.firstT, Math.max(s.firstT + 1, s.lastT)];
      startYear = s.startYear;
      left.textContent = String(startYear + Math.floor(span[0] / 4));
      right.textContent = String(startYear + Math.floor(span[1] / 4));
      const pct = (t: number) => `${((t - span[0]) / (span[1] - span[0])) * 100}%`;
      const key = `${s.moments.length}:${s.end ? s.end.t : -1}:${span[1]}`;
      if (key !== pinKey) {
        pinKey = key;
        clear(wrap);
        wrap.append(line, playhead, hover);
        for (const m of s.moments) {
          const pin = el('div', 'pin');
          if (m.ok === true) pin.classList.add('ok');
          else if (m.ok === false) pin.classList.add('fail');
          pin.style.left = pct(m.t);
          const label = `${startYear + Math.floor(m.t / 4)} · ${m.who}`;
          pin.addEventListener('pointerenter', () => {
            pinned = label;
            hover.textContent = label;
            hover.style.left = pct(m.t);
            show(hover, true);
          });
          pin.addEventListener('pointerleave', () => {
            pinned = null;
          });
          wrap.append(pin);
        }
        if (s.end) {
          const death = el('div', 'pin death');
          death.style.left = pct(s.end.t);
          death.title = `died ${startYear + Math.floor(s.end.t / 4)} · ${s.end.cause}`;
          wrap.append(death);
        }
      }
      playhead.style.left = pct(s.cursor);
    },
  };
}
