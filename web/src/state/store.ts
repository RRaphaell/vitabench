import type { AnyFrame, Frame, HelloFrame, MomentFrame, PersonFrame, XZ } from './schema';

export const SPEEDS = [0.5, 2, 6];
export const SPEED_LABELS = ['1x', '4x', '12x'];

export type InterpFrame = Omit<Frame, 'type'>;
export type Listener = (s: Store) => void;

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const clamp01 = (u: number) => (u < 0 ? 0 : u > 1 ? 1 : u);

export class Store {
  hello: HelloFrame | null = null;
  frames: Frame[] = [];
  moments: MomentFrame[] = [];
  end: import('./schema').EndFrame | null = null;
  cursor = 0;
  speed = SPEEDS[1] as number;
  paused = false;
  live = false;
  connected = false;
  activeMoment: MomentFrame | null = null;
  endOpen = false;
  private listeners = new Set<Listener>();
  private dirty = true;
  private timer: ReturnType<typeof setInterval> | null = null;
  private arrivals: number[] = [];

  reset(): void {
    this.hello = null;
    this.frames = [];
    this.moments = [];
    this.end = null;
    this.arrivals = [];
    this.cursor = 0;
    this.activeMoment = null;
    this.endOpen = false;
    this.dirty = true;
  }

  applyFrame(frame: AnyFrame): void {
    if (frame.type === 'hello') this.hello = frame;
    else if (frame.type === 'frame') this.putFrame(frame);
    else if (frame.type === 'moment') this.putMoment(frame);
    else if (frame.type === 'end') this.end = frame;
    else return;
    this.dirty = true;
  }

  applyAll(frames: AnyFrame[]): void {
    for (const f of frames) this.applyFrame(f);
  }

  private putFrame(f: Frame): void {
    const i = this.upper(this.frames, f.t);
    const prev = this.frames[i - 1];
    if (prev && prev.t === f.t) {
      this.frames[i - 1] = f;
      this.arrivals[i - 1] = performance.now();
      return;
    }
    this.frames.splice(i, 0, f);
    this.arrivals.splice(i, 0, performance.now());
  }

  private putMoment(m: MomentFrame): void {
    const i = this.upper(this.moments, m.t);
    const prev = this.moments[i - 1];
    if (prev && prev.t === m.t && prev.probe_id === m.probe_id) {
      this.moments[i - 1] = m;
      return;
    }
    this.moments.splice(i, 0, m);
  }

  private upper(arr: { t: number }[], t: number): number {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const item = arr[mid];
      if (item && item.t <= t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  trimOlderThan(ms: number): void {
    const cut = performance.now() - ms;
    let drop = 0;
    while (drop < this.arrivals.length - 2 && (this.arrivals[drop] as number) < cut) drop++;
    if (drop > 0) {
      this.frames.splice(0, drop);
      this.arrivals.splice(0, drop);
      this.dirty = true;
    }
  }

  get startYear(): number {
    return this.hello?.start_year ?? 1340;
  }

  get firstT(): number {
    return this.frames[0]?.t ?? 0;
  }

  get lastT(): number {
    const f = this.frames[this.frames.length - 1];
    return Math.max(f?.t ?? 0, this.end?.t ?? 0);
  }

  indexAt(t: number): number {
    const i = this.upper(this.frames, t) - 1;
    return i < 0 ? 0 : i;
  }

  frameAt(t: number): InterpFrame | null {
    if (!this.frames.length) return null;
    const a = this.frames[this.indexAt(t)] as Frame;
    const b = this.frames[this.indexAt(t) + 1];
    if (!b || t <= a.t) return a;
    const u = clamp01((t - a.t) / (b.t - a.t));
    const next = new Map<string, PersonFrame>();
    for (const p of b.people) next.set(p.id, p);
    const hero = {
      ...a.hero,
      xz: [lerp(a.hero.xz[0], b.hero.xz[0], u), lerp(a.hero.xz[1], b.hero.xz[1], u)] as XZ,
      money: Math.round(lerp(a.hero.money, b.hero.money, u)),
      health: Math.round(lerp(a.hero.health, b.hero.health, u)),
      energy: Math.round(lerp(a.hero.energy, b.hero.energy, u)),
    };
    const people = a.people.map((p) => {
      const q = next.get(p.id);
      if (!q || !p.alive || !q.alive) return p;
      return { ...p, xz: [lerp(p.xz[0], q.xz[0], u), lerp(p.xz[1], q.xz[1], u)] as XZ };
    });
    return { t, date: a.date, hero, people, events: a.events, news: a.news, memory: a.memory, relations: a.relations };
  }

  nextMomentAfter(t: number): MomentFrame | null {
    for (const m of this.moments) if (m.t > t + 1e-6) return m;
    return null;
  }

  momentAt(t: number, tol = 0.45): MomentFrame | null {
    for (const m of this.moments) if (Math.abs(m.t - t) <= tol && m.kind !== 'plant') return m;
    return null;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    if (!this.timer) this.timer = setInterval(() => this.flush(), 100);
    listener(this);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  touch(): void {
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    for (const l of this.listeners) l(this);
  }
}

export const store = new Store();
