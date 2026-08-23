import { Store } from '../state/store';
import { el, show } from './dom';
import { deltasOf, rawFrame, signed } from './plan';

const METERS: [string, string, string, number][] = [
  ['\u{1F4B0}', 'money', 'money · ducats in hand', 500],
  ['❤', 'health', 'health · 0 means death', 100],
  ['⚡', 'energy', 'energy · how many weeks it can work', 100],
];
const COLORS = ['#d9a441', '#c8734b', '#7f9ec8', '#8f7fc8'];
const DELTA_MS = 1500;

export interface HeroPanel {
  update(s: Store): void;
  setBubble(p: { x: number; y: number } | null): void;
  setTalkBubble(p: { x: number; y: number } | null): void;
}

export function mountHero(root: HTMLElement, host: HTMLElement): HeroPanel {
  const panel = el('div', 'panel hero-card');
  const head = el('div', 'hero-head');
  const chip = el('div', 'chip', '?');
  const who = el('div');
  const name = el('div', 'hero-name', '—');
  const age = el('div', 'hero-age', '');
  who.append(name, age);
  head.append(chip, who);

  const meters = el('div', 'meters');
  const bars = METERS.map(([icon, key, label]) => {
    const row = el('div', 'meter');
    row.title = label;
    const fill = el('div', 'fill');
    const track = el('div', 'track');
    track.append(fill);
    const val = el('div', 'val', '0');
    row.append(el('span', 'ico', icon), track, val, el('span', 'mlabel', label));
    meters.append(row);
    return { fill, val, row, key };
  });

  const activity = el('div', 'activity');
  const actIcon = el('span', 'ico', '');
  const actText = el('span', '', '');
  activity.append(actIcon, actText);
  panel.append(head, meters, activity);

  const bubble = el('div', 'bubble hidden');
  const bubbleIcon = el('span', '', '');
  const bubbleText = el('span', '', '');
  bubble.append(bubbleIcon, ' ', bubbleText);
  const talk = el('div', 'bubble talk hidden', '\u{1F4AC}');
  host.append(panel);
  root.append(bubble, talk);

  let deltaKey = -1;
  const floatDeltas = (s: Store) => {
    const frame = rawFrame(s, s.cursor);
    if (!frame || frame.t === deltaKey) return;
    const first = deltaKey < 0;
    deltaKey = frame.t;
    if (first) return;
    const d = deltasOf(frame);
    if (!d) return;
    for (const bar of bars) {
      const v = d[bar.key as 'money' | 'health' | 'energy'];
      if (!v) continue;
      const chipEl = el('span', `mdelta ${v > 0 ? 'up' : 'down'}`, signed(v));
      bar.row.append(chipEl);
      setTimeout(() => chipEl.remove(), DELTA_MS);
    }
  };

  return {
    update(s: Store) {
      const persona = s.hello?.persona;
      const f = s.frameAt(s.cursor);
      if (persona) {
        chip.textContent = persona.name.slice(0, 1);
        chip.style.background = COLORS[persona.name.charCodeAt(0) % COLORS.length] as string;
        name.textContent = persona.name;
      }
      if (!f) return;
      age.textContent = `age ${f.hero.age} · played by ${s.hello?.harness ?? 'an agent'}`;
      const values = [f.hero.money, f.hero.health, f.hero.energy];
      bars.forEach((bar, i) => {
        const spec = METERS[i];
        const v = values[i] ?? 0;
        if (!spec) return;
        bar.fill.style.width = `${Math.max(2, Math.min(100, (v / spec[3]) * 100))}%`;
        bar.val.textContent = String(v);
      });
      actIcon.textContent = f.hero.activity.icon;
      actText.textContent = f.hero.activity.text;
      bubbleIcon.textContent = f.hero.activity.icon;
      bubbleText.textContent = f.hero.activity.text.split(/\s+/).slice(0, 4).join(' ');
      floatDeltas(s);
    },
    setBubble(p) {
      show(bubble, !!p);
      if (!p) return;
      bubble.style.left = `${p.x}px`;
      bubble.style.top = `${p.y}px`;
    },
    setTalkBubble(p) {
      show(talk, !!p);
      if (!p) return;
      talk.style.left = `${p.x}px`;
      talk.style.top = `${p.y}px`;
    },
  };
}
