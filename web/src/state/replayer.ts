import type { AnyFrame, MomentFrame } from './schema';
import { SPEEDS, Store } from './store';

const key = (m: MomentFrame) => `${m.probe_id}@${m.t}`;

export class Replayer {
  private shown = new Set<string>();

  constructor(private store: Store) {}

  async loadFromUrl(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return false;
      const data: unknown = await res.json();
      const frames = Array.isArray(data)
        ? data
        : data && typeof data === 'object' && Array.isArray((data as { frames?: unknown }).frames)
          ? (data as { frames: unknown[] }).frames
          : null;
      if (!frames || !frames.length) return false;
      this.load(frames as AnyFrame[]);
      return true;
    } catch {
      return false;
    }
  }

  load(frames: AnyFrame[]): void {
    this.store.reset();
    this.store.applyAll(frames);
    this.shown.clear();
    this.store.cursor = this.store.firstT;
    this.store.touch();
  }

  tick(dt: number): void {
    const s = this.store;
    if (s.paused || s.activeMoment || s.endOpen || !s.frames.length) return;
    const target = s.cursor + dt * s.speed;
    const due = this.dueMoment(s.cursor, target);
    if (due) {
      s.cursor = due.t;
      this.openMoment(due);
      return;
    }
    const last = s.lastT;
    if (target >= last) {
      s.cursor = last;
      if (s.end) {
        s.endOpen = true;
        s.paused = true;
      } else if (!s.live) s.paused = true;
      s.touch();
      return;
    }
    s.cursor = target;
    s.touch();
  }

  private dueMoment(from: number, to: number): MomentFrame | null {
    for (const m of this.store.moments) {
      if (m.kind === 'plant') continue;
      if (m.t > from + 1e-6 && m.t <= to && !this.shown.has(key(m))) return m;
    }
    return null;
  }

  openMoment(m: MomentFrame): void {
    this.shown.add(key(m));
    this.store.activeMoment = m;
    this.store.paused = true;
    this.store.touch();
  }

  continueMoment(): void {
    const s = this.store;
    if (s.endOpen) return;
    if (!s.activeMoment) return;
    s.activeMoment = null;
    s.cursor += 0.02;
    s.paused = false;
    s.touch();
  }

  setPaused(paused: boolean): void {
    this.store.paused = paused;
    this.store.touch();
  }

  togglePaused(): void {
    if (this.store.activeMoment) {
      this.continueMoment();
      return;
    }
    this.setPaused(!this.store.paused);
  }

  setSpeedIndex(i: number): void {
    const v = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i))];
    if (v === undefined) return;
    this.store.speed = v;
    this.store.paused = false;
    this.store.touch();
  }

  seek(t: number, pause = false): void {
    const s = this.store;
    const at = Math.max(s.firstT, Math.min(s.lastT, t));
    s.cursor = at;
    s.activeMoment = null;
    s.endOpen = false;
    this.shown.clear();
    for (const m of s.moments) if (m.t <= at - 1e-6) this.shown.add(key(m));
    if (pause) s.paused = true;
    const here = s.momentAt(at);
    if (here) this.openMoment(here);
    else if (s.end && at >= s.end.t - 1e-6) {
      s.endOpen = true;
      s.paused = true;
    }
    s.touch();
  }

  jumpToNextMoment(): void {
    const s = this.store;
    let m = s.nextMomentAfter(s.cursor);
    while (m && m.kind === 'plant') m = s.nextMomentAfter(m.t);
    if (!m) {
      if (s.end) this.seek(s.end.t);
      return;
    }
    s.cursor = m.t;
    s.activeMoment = null;
    this.openMoment(m);
  }
}
