import { el, show } from './dom';

const ADAPTER = `from vitabench.adapters.base import Agent

class MyAgent(Agent):
    def on_birth(self, persona, brief): ...   # new session
    def act(self, observation) -> Plan: ...   # your loop, your memory
    def on_death(self, summary): ...          # last save`;

const COMMAND = 'vitabench run --scenario venice_1340 --agent my_agent.py';
const REPO = 'github.com/RRaphaell/vitabench';

export interface Card {
  readonly open: boolean;
  close(): void;
}

export function mountTitleCard(root: HTMLElement, onStart: () => void): Card {
  const scrim = el('div', 'scrim titlecard');
  const inner = el('div', 'title-inner');
  inner.append(
    el('div', 'title-line', 'Every agent dies when its session ends.'),
    el('div', 'title-name', 'VitaBench — the benchmark for what survives.'),
    el('div', 'title-hint', 'press space'),
  );
  scrim.append(inner);
  root.append(scrim);

  let open = true;
  const close = () => {
    if (!open) return;
    open = false;
    scrim.classList.add('gone');
    setTimeout(() => scrim.remove(), 500);
    onStart();
  };

  scrim.addEventListener('click', close);

  return {
    get open() {
      return open;
    },
    close,
  };
}

export function mountBringCard(root: HTMLElement): Card & { toggle(): void } {
  const scrim = el('div', 'scrim bringcard hidden');
  const card = el('div', 'panel bring');
  const head = el('h2', '', 'Bring your agent');
  const sub = el('div', 'bring-sub', 'three functions — your loop, your memory');
  const code = el('pre', 'code', ADAPTER);
  const cmd = el('pre', 'code cmd', COMMAND);
  const repo = el('div', 'bring-repo', REPO);
  const hint = el('div', 'hint', 'space to go back');
  card.append(head, sub, code, cmd, repo, hint);
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
    close: () => set(false),
    toggle: () => set(!open),
  };
}
