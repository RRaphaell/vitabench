import { Store } from '../state/store';
import { clear, el, show } from './dom';
import { buyText, deltasOf, eatText, planOf, quote, rawFrame, seasonLabelOf, signed, talkText, workText } from './plan';

const DIARY_MAX = 96;

interface Part {
  node: HTMLElement;
  drop: number;
}

export function mountSeason(root: HTMLElement): { update(s: Store): void } {
  const panel = el('div', 'panel seasoncard hidden');
  const label = el('span', 'sc-when', '');
  const line = el('span', 'sc-line');
  panel.append(label, line);
  root.append(panel);

  let key = '';
  return {
    update(s: Store) {
      if (s.endOpen) {
        show(panel, false);
        return;
      }
      const frame = rawFrame(s, s.cursor);
      const plan = planOf(frame);
      if (!frame || !plan) {
        show(panel, false);
        return;
      }
      const next = `${frame.t}`;
      if (next === key) return;
      key = next;
      show(panel, true);
      label.textContent = seasonLabelOf(s, frame.t);

      const parts: Part[] = [];
      const push = (text: string | null, cls: string, drop: number) => {
        if (!text) return;
        parts.push({ node: el('span', `sc-part ${cls}`, text), drop });
      };
      push(workText(plan, true), 'sc-do', 5);
      push(eatText(plan, false), 'sc-do', 3);
      push(talkText(s, plan, false), 'sc-do', 4);
      push(buyText(plan), 'sc-do', 2);
      const deltas = deltasOf(frame);
      if (deltas?.money) push(`\u{1F4B0} ${signed(deltas.money)}`, deltas.money > 0 ? 'up' : 'down', 6);
      if (deltas?.health) push(`❤ ${signed(deltas.health)}`, deltas.health > 0 ? 'up' : 'down', 6);
      const diary = plan.diary ? el('span', 'sc-part sc-diary', `✍ ${quote(plan.diary, DIARY_MAX)}`) : null;

      clear(line);
      for (const p of parts) line.append(p.node);
      if (diary) line.append(diary);

      const fits = () => panel.scrollWidth <= panel.clientWidth + 1;
      if (diary && !fits()) {
        const words = plan.diary.replace(/\s+/g, ' ').trim().split(' ');
        const at = (n: number) =>
          n >= words.length ? quote(plan.diary, DIARY_MAX) : `“${words.slice(0, n).join(' ').replace(/[\s.,;:·—–-]+$/, '')}…”`;
        let lo = 0;
        let hi = words.length;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          diary.textContent = `✍ ${at(mid)}`;
          if (fits()) lo = mid;
          else hi = mid - 1;
        }
        if (lo < 3) diary.remove();
        else diary.textContent = `✍ ${at(lo)}`;
      }
      const ordered = parts.slice().sort((a, b) => a.drop - b.drop);
      for (const p of ordered) {
        if (fits()) break;
        p.node.remove();
      }
    },
  };
}
