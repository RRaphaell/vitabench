import { Store } from '../state/store';
import { clear, el, show } from './dom';

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
      const world = el('div', 'kv');
      world.append(el('span', '', 'world knows'), el('span', rel?.world ? 'yes' : 'no', rel?.world ? 'yes' : 'no'));
      const agent = el('div', 'kv');
      agent.append(el('span', '', 'harness remembers'), el('span', rel?.agent ? 'yes' : 'no', rel?.agent ? 'yes' : 'no'));
      panel.append(world, agent);
      panel.style.left = `${Math.min(at.x + 12, window.innerWidth - 280)}px`;
      panel.style.top = `${Math.min(at.y + 12, window.innerHeight - 160)}px`;
      show(panel, true);
    },
    close() {
      show(panel, false);
    },
  };
}
