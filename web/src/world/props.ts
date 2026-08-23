import { Group, Object3D, Vector3 } from 'three';
import { getPiece, tint } from './assets';
import { disposeTree, type KitBatcher } from './batch';
import { BOAT_SPEED, GONDOLA_SCALE, PALETTE, SHIP_SCALE, STONE, WATER_Y } from './constants';
import { pick, type Rng } from './rng';
import type { Placement, WorldEnv } from './types';

export interface PropsCtx {
  cols: number;
  rows: number;
  rng: Rng;
  toWorld(x: number, z: number): Vector3;
  isCanal(x: number, z: number): boolean;
  isStreet(x: number, z: number): boolean;
  isOpen(x: number, z: number): boolean;
  canals: { axis: 'x' | 'z'; at: number }[];
  markets: [number, number][];
  campos: [number, number][];
  yards: [number, number][];
  dock: [number, number] | null;
}

export interface PropsHandle {
  update(dt: number, env: WorldEnv): void;
  dispose(): void;
}

const STALL_PIECES = ['stall-red', 'stall-green', 'stall', 'cart', 'cart-high'];
const TREES = ['tree', 'tree-high', 'tree-crooked'];

function boat(kit: 'pirate', piece: string, scale: number, color: number): Object3D {
  const obj = tint(getPiece(kit, piece), color);
  obj.scale.setScalar(scale);
  return obj;
}

export function buildProps(parent: Object3D, batcher: KitBatcher, ctx: PropsCtx): PropsHandle {
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
        color: pick(rng, [PALETTE.terracotta, PALETTE.ochre, PALETTE.cream]),
      });
      if (rng() < 0.4) crates.push({ kit: 'pirate', piece: 'crate', x: p.x + 0.3, y: 0, z: p.z - 0.3, rotY: rng() * 6.28, scale: 0.32, color: PALETTE.umber });
    }
  }

  for (const [x, z] of ctx.campos) {
    const p = toWorld(x, z);
    for (let i = 0; i < 3; i++) {
      batcher.add({
        kit: 'town', piece: i % 2 === 0 ? 'banner-red' : 'banner-green', x: p.x + (i - 1) * 0.9, y: 0.9,
        z: p.z - 0.4, rotY: Math.PI, scale: 0.9, color: i % 2 === 0 ? PALETTE.brick : 0x4f7f6a,
      });
      batcher.add({ kit: 'town', piece: 'pillar-stone', x: p.x + (i - 1) * 0.9, y: 0, z: p.z - 0.4, color: STONE });
    }
  }

  for (const [x, z] of ctx.yards) {
    const p = toWorld(x, z);
    if (rng() < 0.6) trees.push({ kit: 'town', piece: pick(rng, TREES), x: p.x + (rng() - 0.5) * 0.4, y: 0, z: p.z + (rng() - 0.5) * 0.4, rotY: rng() * 6.28, scale: 0.5 + rng() * 0.25, color: 0x5f8f52 });
    else hedges.push({ kit: 'town', piece: rng() < 0.5 ? 'hedge' : 'hedge-large', x: p.x, y: 0, z: p.z, rotY: Math.floor(rng() * 4) * (Math.PI / 2), color: 0x4f7f52 });
  }

  const moving = new Group();
  moving.name = 'props_dynamic';
  parent.add(moving);

  if (ctx.dock) {
    const d = toWorld(ctx.dock[0], ctx.dock[1]);
    for (let i = 0; i < 6; i++) {
      crates.push({ kit: 'pirate', piece: i % 2 ? 'crate' : 'barrel', x: d.x + (rng() - 0.5) * 1.8, y: 0, z: d.z + (rng() - 0.5) * 1.8, rotY: rng() * 6.28, scale: 0.3, color: PALETTE.umber });
    }
    const edge = toWorld(ctx.cols + 1.4, ctx.dock[1]);
    for (let i = 0; i < 2; i++) {
      const ship = boat('pirate', i === 0 ? 'ship-small' : 'ship-medium', SHIP_SCALE, PALETTE.cream);
      ship.position.set(edge.x + i * 3.4, WATER_Y, edge.z + (i === 0 ? -2.4 : 2.6));
      ship.rotation.y = Math.PI / 2 + (rng() - 0.5) * 0.3;
      moving.add(ship);
    }
  }

  batcher.addAll(roads);
  batcher.addInstanced('town', 'lantern', lanterns);
  batcher.addInstanced('town', 'fence', fences);
  batcher.addAll(trees);
  batcher.addAll(hedges);
  batcher.addAll(crates);

  const gondolas: { obj: Object3D; axis: 'x' | 'z'; at: number; t: number; dir: number }[] = [];
  for (const canal of ctx.canals) {
    const span = canal.axis === 'x' ? ctx.rows : ctx.cols;
    for (let i = 0; i < 3; i++) {
      const obj = boat('pirate', i === 2 ? 'boat-row-large' : 'boat-row-small', GONDOLA_SCALE, 0x2b2f36);
      moving.add(obj);
      gondolas.push({ obj, axis: canal.axis, at: canal.at, t: (span / 3) * i + rng() * 2, dir: i % 2 ? -1 : 1 });
    }
  }

  const galleys: Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    const g = boat('pirate', 'ship-medium', SHIP_SCALE, PALETTE.sand);
    const p = toWorld(-4 - i * 2.5, 3 + i * 5);
    g.position.set(p.x, WATER_Y, p.z);
    g.rotation.y = -Math.PI / 2;
    g.visible = false;
    moving.add(g);
    galleys.push(g);
  }

  let clock = 0;
  return {
    update(dt, env) {
      clock += dt;
      for (const g of gondolas) {
        const span = g.axis === 'x' ? ctx.rows : ctx.cols;
        g.t += g.dir * BOAT_SPEED * dt;
        if (g.t > span + 1) g.t = -1;
        if (g.t < -1) g.t = span + 1;
        const p = g.axis === 'x' ? toWorld(g.at, g.t) : toWorld(g.t, g.at);
        g.obj.position.set(p.x, WATER_Y + Math.sin(clock * 1.6 + g.t) * 0.02, p.z);
        g.obj.rotation.y = (g.axis === 'x' ? 0 : Math.PI / 2) + (g.dir > 0 ? 0 : Math.PI);
        g.obj.rotation.z = Math.sin(clock * 1.2 + g.t) * 0.03;
      }
      for (const [i, g] of galleys.entries()) {
        g.visible = env.war;
        g.position.y = WATER_Y + Math.sin(clock * 0.9 + i) * 0.05;
        g.rotation.z = Math.sin(clock * 0.7 + i) * 0.02;
      }
    },
    dispose() {
      disposeTree(moving);
    },
  };
}
