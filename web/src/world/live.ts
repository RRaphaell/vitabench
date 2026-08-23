import { Vector3 } from 'three';
import type { Frame, MapSpec, XZ } from '../state/schema';

export type EventKind =
  | 'plague' | 'war' | 'flood' | 'fire' | 'festival' | 'politics'
  | 'market' | 'famine' | 'illness' | 'theft' | 'price_shock';

let map: MapSpec | null = null;
let frame: Frame | null = null;
let stamp = 0;
const active = new Set<string>();
const started = new Map<string, number>();

const heroAt = new Vector3();
let heroTalks = false;
const talk = { id: '', hero: new Vector3(), npc: new Vector3() };
let talking = false;

let doorstep: ((xz: XZ) => XZ) | null = null;

export function publishMap(next: MapSpec | null): void {
  map = next;
  started.clear();
}

export function publishDoorstep(fn: ((xz: XZ) => XZ) | null): void {
  doorstep = fn;
}

export function doorstepOf(xz: XZ): XZ {
  return doorstep ? doorstep(xz) : xz;
}

export function liveMap(): MapSpec | null {
  return map;
}

export function publishFrame(next: Frame): void {
  frame = next;
  stamp += 1;
  active.clear();
  for (const e of next.events) {
    if (!e.active) continue;
    active.add(e.kind);
    if (!started.has(e.id)) started.set(e.id, next.t);
  }
  for (const [id, t] of started) {
    if (next.t - t > 24) started.delete(id);
  }
}

export function liveFrame(): Frame | null {
  return frame;
}

export function liveStamp(): number {
  return stamp;
}

export function hasEvent(kind: EventKind): boolean {
  return active.has(kind);
}

export function publishHeroAt(v: Vector3): void {
  heroAt.copy(v);
}

export function heroAnchor(): Vector3 {
  return heroAt;
}

export function publishHeroMood(talks: boolean): void {
  heroTalks = talks;
}

export function heroTalking(): boolean {
  return heroTalks;
}

export function publishTalk(id: string | null, npc: Vector3 | null, height: number): void {
  talking = !!id && !!npc;
  if (!talking || !npc) {
    talk.id = '';
    return;
  }
  talk.id = id as string;
  talk.npc.copy(npc);
  talk.npc.y += height;
  talk.hero.copy(heroAt);
  talk.hero.y += height;
}

export function talkTarget(): { id: string; hero: Vector3; npc: Vector3 } | null {
  return talking ? talk : null;
}

export function resetLive(): void {
  map = null;
  frame = null;
  doorstep = null;
  active.clear();
  started.clear();
  talking = false;
  heroTalks = false;
}
