import type { EventFrame } from '../state/schema';
import { Store } from '../state/store';
import { el, show } from './dom';

const ICONS: Record<string, string> = { plague: '☠', war: '⚔', flood: '\u{1F30A}', politics: '\u{1F3DB}' };
const HOLD_MS = 3000;

export function mountBanner(root: HTMLElement): { update(s: Store, dt: number): void } {
  const panel = el('div', 'panel banner hidden');
  const icon = el('span', 'ico', '');
  const text = el('span', '', '');
  panel.append(icon, text);
  root.append(panel);

  let current: string | null = null;
  let elapsed = 0;
  return {
    update(s: Store, dt: number) {
      const f = s.frameAt(s.cursor);
      const active: EventFrame | undefined = s.endOpen
        ? undefined
        : f?.events.find((e) => e.active && e.kind in ICONS);
      if (active && active.id !== current) {
        current = active.id;
        elapsed = 0;
        icon.textContent = ICONS[active.kind] ?? '❗';
        text.textContent = active.text;
        show(panel, true);
      } else if (!active) {
        current = null;
        show(panel, false);
      } else if (!s.paused) {
        elapsed += dt;
        if (elapsed > HOLD_MS) show(panel, false);
      }
    },
  };
}
