import type { Frame, MomentFrame } from '../state/schema';
import { Store } from '../state/store';
import { clear, el } from './dom';
import {
  buyText,
  deltasOf,
  delayText,
  eatText,
  personName,
  planOf,
  quote,
  signed,
  talkText,
  workText,
  yearOf,
} from './plan';

const MAX_ENTRIES = 420;
const WROTE_MAX = 64;

function line(cls: string, head: string, rest: (string | HTMLElement)[]): HTMLElement {
  const row = el('div', `ce ${cls}`);
  row.append(el('b', 'ce-when', head));
  for (const part of rest) row.append(typeof part === 'string' ? document.createTextNode(part) : part);
  return row;
}

function testLine(s: Store, m: MomentFrame): HTMLElement | null {
  const year = String(yearOf(s, m.t));
  const delay = delayText(m.delay_seasons);
  if (m.kind === 'plant') {
    return line('ce-plant', `◇ ${year}`, [` · fact planted · ${personName(s, m.who)}`]);
  }
  if (m.kind === 'negative') {
    return m.ok
      ? line('ce-ok', `✔ ${year}`, [` · false claim refused · ${delay}`])
      : line('ce-fail', `✘ ${year}`, [` · believed a false claim · ${delay}`]);
  }
  if (m.ok === null) return null;
  return m.ok
    ? line('ce-ok', `✔ ${year}`, [` · remembered · ${delay}`])
    : line('ce-fail', `✘ ${year}`, [` · forgot · ${delay}`]);
}

function seasonLine(s: Store, frame: Frame): HTMLElement | null {
  const plan = planOf(frame);
  if (!plan) return null;
  const bits: string[] = [];
  const work = workText(plan, false);
  if (work) bits.push(work);
  bits.push(eatText(plan, true));
  const talk = talkText(s, plan, true);
  if (talk) bits.push(talk);
  const buy = buyText(plan);
  if (buy) bits.push(buy);
  const row = line('ce-season', `${yearOf(s, frame.t)} · ${frame.date.split(' ')[0] ?? ''}`, [
    ` — ${bits.join(' · ')}`,
  ]);
  const d = deltasOf(frame);
  if (d?.money) row.append(el('span', `ce-d ${d.money > 0 ? 'up' : 'down'}`, ` \u{1F4B0} ${signed(d.money)}`));
  if (d?.health) row.append(el('span', `ce-d ${d.health > 0 ? 'up' : 'down'}`, ` ❤ ${signed(d.health)}`));
  return row;
}

export function mountChronicle(host: HTMLElement): { update(s: Store): void } {
  const panel = el('div', 'panel chronicle');
  const head = el('div', 'ch-head');
  head.append(el('h3', '', 'life chronicle'), el('span', 'ch-sub', 'newest first'));
  const list = el('div', 'ch-list');
  panel.append(head, list);
  host.append(panel);

  let runKey = '';
  let doneUpTo = -1;

  const entriesFor = (s: Store, frame: Frame, prevNews: string): HTMLElement[] => {
    const out: HTMLElement[] = [];
    if (frame.news && frame.news !== prevNews) {
      out.push(line('ce-news', `\u{1F4DC} ${yearOf(s, frame.t)}`, [` · ${frame.news}`]));
    }
    const season = seasonLine(s, frame);
    if (season) out.push(season);
    for (const m of s.moments) {
      if (Math.round(m.t) !== frame.t) continue;
      const row = testLine(s, m);
      if (row) out.push(row);
    }
    const wrote = frame.memory.wrote[frame.memory.wrote.length - 1];
    if (wrote) out.push(line('ce-wrote', '✍', [` ${quote(wrote, WROTE_MAX)}`]));
    return out.reverse();
  };

  const paint = (s: Store, from: number, to: number, fade: boolean) => {
    for (let i = from; i <= to; i++) {
      const frame = s.frames[i];
      if (!frame) continue;
      const prev = i > 0 ? (s.frames[i - 1]?.news ?? '') : '';
      for (const row of entriesFor(s, frame, prev)) {
        if (fade) row.classList.add('ce-new');
        list.prepend(row);
      }
    }
    while (list.childElementCount > MAX_ENTRIES) list.lastElementChild?.remove();
  };

  return {
    update(s: Store) {
      const key = `${s.hello?.run_id ?? ''}:${s.frames.length ? s.frames[0]?.t : -1}`;
      const target = s.indexAt(s.cursor);
      if (key !== runKey || target < doneUpTo) {
        runKey = key;
        doneUpTo = -1;
        clear(list);
        paint(s, 0, target, false);
        doneUpTo = target;
        return;
      }
      if (target === doneUpTo) return;
      paint(s, doneUpTo + 1, target, target - doneUpTo <= 3);
      doneUpTo = target;
      list.scrollTop = 0;
    },
  };
}
