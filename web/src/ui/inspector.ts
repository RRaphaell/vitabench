import { Store } from '../state/store';
import { clear, el, show } from './dom';

function metYear(s: Store, id: string): number | null {
  for (const frame of s.frames) {
    if (frame.relations.some((r) => r.id === id && r.world)) return s.startYear + Math.floor(frame.t / 4);
  }
  return null;
}

export interface Inspector {
  open(id: string, s: Store, at: { x: number; y: number }): void;
  close(): void;
}

export function mountInspector(root: HTMLElement): Inspector {
  const panel = el('div', 'panel inspector hidden');
  root.append(panel);
  panel.addEventListener('click', (ev) => ev.stopPropagation());
  return {
    open(id, s, at) {
      const person = s.hello?.roster.find((r) => r.id === id);
      const rel = s.frameAt(s.cursor)?.relations.find((r) => r.id === id);
      if (!person && !rel) {
        show(panel, false);
        return;
      }
      clear(panel);
      panel.append(el('div', 'who', person?.name ?? rel?.name ?? id));
      panel.append(el('div', 'role', person?.role ?? rel?.role ?? ''));
      const year = metYear(s, id);
      const line = el('div', 'kv');
      const met = rel?.world ? `world: met in ${year ?? '—'}` : 'world: stranger';
      line.append(el('span', rel?.world ? 'yes' : 'no', met));
      line.append(el('span', rel?.agent ? 'yes' : 'no', rel?.agent ? 'agent: remembers' : 'agent: no note'));
      panel.append(line);
      panel.style.left = `${Math.min(at.x + 12, window.innerWidth - 280)}px`;
      panel.style.top = `${Math.min(at.y + 12, window.innerHeight - 160)}px`;
      show(panel, true);
    },
    close() {
      show(panel, false);
    },
  };
}
