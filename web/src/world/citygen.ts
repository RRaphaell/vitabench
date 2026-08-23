import { Group, Scene, Vector3 } from 'three';
import type { MapSpec } from '../state/schema';
import { loadKit } from './assets';
import { KitBatcher, disposeTree } from './batch';
import { buildBuilding, buildLandmark, type BuildStyle, type LandmarkKind } from './buildings';
import { PALETTE, STONE } from './constants';
import { buildIsland, buildWater, type WaterHandle } from './island';
import { createLighting, type LightingHandle } from './lighting';
import { buildProps, type PropsHandle } from './props';
import { hash2, mulberry32, pick, type Rng } from './rng';
import type { WorldEnv, WorldGrid, WorldHandles } from './types';

const DIRS: [number, number, number][] = [[1, 0, 0], [0, -1, 1], [-1, 0, 2], [0, 1, 3]];

export async function preloadWorld(): Promise<void> {
  await Promise.all([loadKit('town'), loadKit('castle'), loadKit('pirate')]);
}

function canalTest(map: MapSpec) {
  const xs = new Set(map.water.filter((w) => w.axis === 'x').map((w) => w.at));
  const zs = new Set(map.water.filter((w) => w.axis === 'z').map((w) => w.at));
  return {
    isCanal: (x: number, z: number) => xs.has(x) || zs.has(z),
    crossing: (x: number, z: number) => (xs.has(x) && z % 3 === 0 && !zs.has(z)) || (zs.has(z) && x % 3 === 0 && !xs.has(x)),
    spansX: (x: number) => xs.has(x),
  };
}

export function buildWorld(scene: Scene, map: MapSpec, seed: number): WorldHandles {
  const { cols, rows } = map.size;
  const rng: Rng = mulberry32(seed * 7919 + 17);
  const root = new Group();
  root.name = 'world';
  scene.add(root);

  const toWorld = (x: number, z: number) => new Vector3(x - (cols - 1) / 2, 0, z - (rows - 1) / 2);
  const canals = canalTest(map);
  const isCanal = canals.isCanal;
  const inBounds = (x: number, z: number) => x >= 0 && z >= 0 && x < cols && z < rows;
  const isStreet = (x: number, z: number) => inBounds(x, z) && !isCanal(x, z) && (x % 3 === 0 || z % 3 === 0);
  const isBridge = (x: number, z: number) => inBounds(x, z) && canals.crossing(x, z);
  const nearCanal = (x: number, z: number) => DIRS.some(([dx, dz]) => isCanal(x + dx, z + dz) && inBounds(x + dx, z + dz));

  const occupied = new Map<string, string>();
  const key = (x: number, z: number) => `${x},${z}`;
  const plaza = new Set<string>();
  for (const l of map.landmarks) {
    if (l.kind !== 'basilica' && l.kind !== 'fountain' && l.kind !== 'campanile') continue;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) plaza.add(key(l.xz[0] + dx, l.xz[1] + dz));
  }
  for (const p of map.places) occupied.set(key(p.xz[0], p.xz[1]), p.kind);
  for (const l of map.landmarks) occupied.set(key(l.xz[0], l.xz[1]), `landmark:${l.kind}`);

  const walkable: boolean[][] = [];
  for (let x = 0; x < cols; x++) {
    const col: boolean[] = [];
    for (let z = 0; z < rows; z++) {
      const place = occupied.get(key(x, z));
      const open = isStreet(x, z) || (nearCanal(x, z) && !isCanal(x, z)) || (!!place && !isCanal(x, z))
        || isBridge(x, z) || (plaza.has(key(x, z)) && !isCanal(x, z));
      col.push(open);
    }
    walkable.push(col);
  }
  const grid: WorldGrid = { cols, rows, walkable };

  const lighting: LightingHandle = createLighting(scene, {
    cols, rows,
    plagueRect: districtRect(map, seed, toWorld),
  });
  const water: WaterHandle = buildWater(root, lighting.sunDirection);
  const batcher = new KitBatcher();
  let props: PropsHandle | null = null;
  let disposed = false;

  void preloadWorld().then(() => {
    if (disposed) return;
    buildIsland(root, batcher, { cols, rows, isCanal, toWorld, rng });
    populate(root, batcher, map, seed, { cols, rows, toWorld, isCanal, isStreet, isBridge, spansX: canals.spansX, occupied, key, rng, inBounds, plaza });
    props = buildProps(root, batcher, {
      cols, rows, rng, toWorld, isCanal, isStreet,
      isOpen: (x, z) => inBounds(x, z) && !isCanal(x, z) && !occupied.has(key(x, z)),
      canals: map.water.map((w) => ({ axis: w.axis, at: w.at })),
      markets: map.places.filter((p) => p.kind === 'market').map((p) => p.xz),
      campos: map.landmarks.filter((l) => l.kind === 'fountain' || l.kind === 'basilica').map((l) => l.xz),
      yards: yardTiles(cols, rows, isCanal, isStreet, occupied, key, rng),
      dock: map.places.find((p) => p.kind === 'dock')?.xz ?? null,
    });
    batcher.build(root);
  });

  const placeIndex = new Map<string, [number, number]>();
  for (const p of map.places) placeIndex.set(p.id, p.xz);
  for (const l of map.landmarks) placeIndex.set(l.id, l.xz);

  return {
    tileToWorld: (xz) => toWorld(xz[0], xz[1]),
    isWalkable: (x, z) => (inBounds(Math.round(x), Math.round(z)) ? walkable[Math.round(x)]![Math.round(z)]! : false),
    grid,
    placeXZ: (id) => placeIndex.get(id) ?? [Math.floor(cols / 2), Math.floor(rows / 2)],
    update(dt: number, env: WorldEnv) {
      lighting.update(dt, env);
      water.update(dt);
      props?.update(dt, env);
    },
    dispose() {
      disposed = true;
      props?.dispose();
      lighting.dispose();
      disposeTree(root);
    },
  };
}

function districtRect(map: MapSpec, seed: number, toWorld: (x: number, z: number) => Vector3) {
  const d = map.districts[seed % Math.max(1, map.districts.length)];
  if (!d) return undefined;
  const [a, b] = d.tiles;
  const p0 = toWorld(a[0], a[1]);
  const p1 = toWorld(b[0], b[1]);
  return { x: (p0.x + p1.x) / 2, z: (p0.z + p1.z) / 2, w: Math.abs(p1.x - p0.x) + 1, d: Math.abs(p1.z - p0.z) + 1 };
}

function yardTiles(
  cols: number, rows: number, isCanal: (x: number, z: number) => boolean,
  isStreet: (x: number, z: number) => boolean, occupied: Map<string, string>,
  key: (x: number, z: number) => string, rng: Rng,
): [number, number][] {
  const out: [number, number][] = [];
  for (let x = 0; x < cols; x++) {
    for (let z = 0; z < rows; z++) {
      if (isCanal(x, z) || isStreet(x, z) || occupied.has(key(x, z))) continue;
      if (rng() < 0.16) out.push([x, z]);
    }
  }
  return out;
}

interface PopCtx {
  cols: number;
  rows: number;
  toWorld(x: number, z: number): Vector3;
  isCanal(x: number, z: number): boolean;
  isStreet(x: number, z: number): boolean;
  isBridge(x: number, z: number): boolean;
  spansX(x: number): boolean;
  occupied: Map<string, string>;
  key(x: number, z: number): string;
  rng: Rng;
  inBounds(x: number, z: number): boolean;
  plaza: Set<string>;
}

function isFondamenta(x: number, z: number, ctx: PopCtx): boolean {
  return ctx.isCanal(x - 1, z) || ctx.isCanal(x, z - 1);
}

function doorSide(x: number, z: number, ctx: PopCtx): number {
  for (const [dx, dz, side] of DIRS) if (ctx.isStreet(x + dx, z + dz)) return side;
  return 0;
}

function styleFor(x: number, z: number, seed: number, ctx: PopCtx): BuildStyle {
  const r = mulberry32(hash2(x, z, seed))();
  if (ctx.isCanal(x + 1, z) || ctx.isCanal(x - 1, z) || ctx.isCanal(x, z + 1) || ctx.isCanal(x, z - 1)) {
    return r < 0.45 ? 'wood' : 'stone';
  }
  return r < 0.18 ? 'grand' : r < 0.34 ? 'wood' : 'stone';
}

function populate(root: Group, batcher: KitBatcher, map: MapSpec, seed: number, ctx: PopCtx): void {
  const yards = new Set(yardTiles(ctx.cols, ctx.rows, ctx.isCanal, ctx.isStreet, ctx.occupied, ctx.key, mulberry32(seed + 5)).map(([x, z]) => ctx.key(x, z)));
  for (let x = 0; x < ctx.cols; x++) {
    for (let z = 0; z < ctx.rows; z++) {
      const k = ctx.key(x, z);
      const kind = ctx.occupied.get(k);
      const p = ctx.toWorld(x, z);
      if (kind?.startsWith('landmark:')) {
        const lk = kind.slice(9) as LandmarkKind;
        batcher.addAll(buildLandmark(lk, p.x, p.z, lk === 'bridge' && !ctx.spansX(x) ? Math.PI / 2 : 0));
        continue;
      }
      if (ctx.isCanal(x, z)) {
        if (ctx.isBridge(x, z)) batcher.addAll(buildLandmark('bridge', p.x, p.z, ctx.spansX(x) ? 0 : Math.PI / 2));
        continue;
      }
      if (ctx.isStreet(x, z) || yards.has(k) || (ctx.plaza.has(k) && !kind)) continue;
      if (!kind && isFondamenta(x, z, ctx)) continue;
      if (kind === 'market' || kind === 'dock') {
        if (kind === 'dock') batcher.add({ kit: 'pirate', piece: 'platform-planks', x: p.x, y: 0.02, z: p.z, scale: 0.5, color: PALETTE.umber });
        continue;
      }
      const h = hash2(x, z, seed);
      const r = mulberry32(h);
      const roll = r();
      const lowered = ctx.isCanal(x + 1, z) || ctx.isCanal(x, z + 1);
      const floors = kind === 'church' ? 3 : lowered ? 1 + Math.round(roll * 0.6) : roll < 0.18 ? 3 : roll < 0.75 ? 2 : 1;
      const placements = buildBuilding(h, floors, styleFor(x, z, seed, ctx), { x: p.x, z: p.z, doorSide: doorSide(x, z, ctx) });
      batcher.addAll(placements);
      if (kind === 'tavern' || kind === 'church') {
        batcher.add({
          kit: 'town', piece: kind === 'tavern' ? 'banner-green' : 'banner-red',
          x: p.x, y: floors * 0.9, z: p.z, rotY: (doorSide(x, z, ctx) * Math.PI) / 2, color: kind === 'tavern' ? 0x4f7f6a : PALETTE.brick,
        });
      }
      if (kind === 'church') batcher.add({ kit: 'castle', piece: 'tower-hexagon-roof', x: p.x, y: floors, z: p.z, scale: 0.9, color: STONE });
    }
  }
  const centre = map.landmarks.find((l) => l.kind === 'fountain');
  if (!centre) return;
  const p = ctx.toWorld(centre.xz[0], centre.xz[1]);
  batcher.add({ kit: 'town', piece: 'lantern', x: p.x + 1.2, y: 0, z: p.z + 1.2, scale: 0.8, color: pick(ctx.rng, [PALETTE.umber]) });
}
