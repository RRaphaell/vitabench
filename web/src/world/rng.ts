export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length] as T;
}

export function hash2(a: number, b: number, seed: number): number {
  return (Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663) ^ Math.imul(seed + 1, 83492791)) >>> 0;
}
