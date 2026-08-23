import type { Vector3 } from 'three';
import type { KitBatcher } from './batch';
import { PALETTE, STONE } from './constants';
import { pick, type Rng } from './rng';
import type { Placement } from './types';

export interface PropsCtx {
  cols: number;
  rows: number;
  rng: Rng;
  toWorld(x: number, z: number): Vector3;
  isCanal(x: number, z: number): boolean;
  isStreet(x: number, z: number): boolean;
  isOpen(x: number, z: number): boolean;
  markets: [number, number][];
  campos: [number, number][];
  yards: [number, number][];
  dock: [number, number] | null;
}

const STALL_PIECES = ['stall-red', 'stall-green', 'stall', 'cart', 'cart-high'];
const TREES = ['tree', 'tree-high', 'tree-crooked'];

export function buildProps(batcher: KitBatcher, ctx: PropsCtx): void {
  const { rng, toWorld } = ctx;
  const lanterns: Placement[] = [];
  const fences: Placement[] = [];
  const trees: Placement[] = [];
  const hedges: Placement[] = [];
  const crates: Placement[] = [];
  const roads: Placement[] = [];

  for (let x = 0; x < ctx.cols; x++) {
    for (let z = 0; z < ctx.rows; z++) {
      if (ctx.isCanal(x, z)) continue;
      const p = toWorld(x, z);
      if (ctx.isStreet(x, z)) roads.push({ kit: 'town', piece: 'road', x: p.x, y: 0.001, z: p.z, color: STONE });
      const corner = ctx.isStreet(x, z) && x % 3 === 0 && z % 3 === 0;
      if (corner && rng() < 0.55) {
        lanterns.push({ kit: 'town', piece: 'lantern', x: p.x + 0.32, y: 0, z: p.z + 0.32, rotY: rng() * 6.28, scale: 0.75, color: PALETTE.umber });
      }
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (!ctx.isCanal(x + dx, z + dz)) continue;
        if (rng() < 0.55) continue;
        fences.push({
          kit: 'town', piece: 'fence', x: p.x, y: 0, z: p.z,
          rotY: dx === 1 ? 0 : dx === -1 ? Math.PI : dz === 1 ? -Math.PI / 2 : Math.PI / 2,
          color: PALETTE.umber,
        });
      }
    }
  }

  for (const [x, z] of ctx.markets) {
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1]] as const) {
      if (!ctx.isOpen(x + dx, z + dz)) continue;
      const p = toWorld(x + dx, z + dz);
      batcher.add({
        kit: 'town', piece: pick(rng, STALL_PIECES), x: p.x + (rng() - 0.5) * 0.2, y: 0,
        z: p.z + (rng() - 0.5) * 0.2, rotY: Math.floor(rng() * 4) * (Math.PI / 2), scale: 0.85,
        color: pick(rng, [PALETTE.terracotta, PALETTE.ochre, PALETTE.cream]), layer: 'stall',
      });
      if (rng() < 0.4) crates.push({ kit: 'pirate', piece: 'crate', x: p.x + 0.3, y: 0, z: p.z - 0.3, rotY: rng() * 6.28, scale: 0.32, color: PALETTE.umber });
    }
  }

  for (const [x, z] of ctx.campos) {
    const p = toWorld(x, z);
    for (let i = 0; i < 3; i++) {
      batcher.add({
        kit: 'town', piece: i % 2 === 0 ? 'banner-red' : 'banner-green', x: p.x + (i - 1) * 0.9, y: 0.9,
        z: p.z - 0.4, rotY: Math.PI, scale: 0.9, color: i % 2 === 0 ? PALETTE.brick : 0x4f7f6a, layer: 'banner',
      });
      batcher.add({ kit: 'town', piece: 'pillar-stone', x: p.x + (i - 1) * 0.9, y: 0, z: p.z - 0.4, color: STONE });
    }
  }

  for (const [x, z] of ctx.yards) {
    const p = toWorld(x, z);
    if (rng() < 0.6) trees.push({ kit: 'town', piece: pick(rng, TREES), x: p.x + (rng() - 0.5) * 0.4, y: 0, z: p.z + (rng() - 0.5) * 0.4, rotY: rng() * 6.28, scale: 0.5 + rng() * 0.25, color: 0xffffff, layer: 'foliage' });
    else hedges.push({ kit: 'town', piece: rng() < 0.5 ? 'hedge' : 'hedge-large', x: p.x, y: 0, z: p.z, rotY: Math.floor(rng() * 4) * (Math.PI / 2), color: 0xffffff, layer: 'foliage' });
  }

  if (ctx.dock) {
    const d = toWorld(ctx.dock[0], ctx.dock[1]);
    for (let i = 0; i < 6; i++) {
      crates.push({ kit: 'pirate', piece: i % 2 ? 'crate' : 'barrel', x: d.x + (rng() - 0.5) * 1.8, y: 0, z: d.z + (rng() - 0.5) * 1.8, rotY: rng() * 6.28, scale: 0.3, color: PALETTE.umber });
    }
  }

  batcher.addAll(roads);
  batcher.addInstanced('town', 'lantern', lanterns);
  batcher.addInstanced('town', 'fence', fences);
  batcher.addAll(trees);
  batcher.addAll(hedges);
  batcher.addAll(crates);
}
