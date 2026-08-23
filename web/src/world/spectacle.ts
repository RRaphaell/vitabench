import {
  Color, DoubleSide, DynamicDrawUsage, Group, InstancedMesh, Mesh, MeshLambertMaterial, Object3D, PlaneGeometry,
  SphereGeometry,
} from 'three';
import type { LayerMeshes } from './batch';
import { disposeTree, instancedPiece } from './batch';
import {
  FIRE_TINT, FLOOD_TINT, PALETTE, SEASON_LEAF, SEASON_ROOF, SEASON_ROOF_MIX, SMOKE_TINT,
} from './constants';
import type { Rng } from './rng';
import type { SceneEnv } from './types';

const COLUMNS = 4;
const PUFFS = 16;
const CARTS = 3;
const FLAGS = 14;

export interface SpectacleCtx {
  cols: number;
  rows: number;
  ox: number;
  oz: number;
  rng: Rng;
  buildings: [number, number][];
  campos: [number, number][];
  streets: [number, number][];
  open: [number, number][];
  layers: LayerMeshes;
  island: Mesh | null;
}

export interface SpectacleHandle {
  update(dt: number, env: SceneEnv): void;
  dispose(): void;
}

interface Column {
  x: number;
  z: number;
  top: number;
  on: number;
}

interface Cart {
  at: number;
  route: [number, number][];
  yaw: number;
}

function tintMaterial(list: Mesh[] | undefined, colour: Color): void {
  for (const mesh of list ?? []) {
    const material = mesh.material as MeshLambertMaterial;
    material.color.copy(colour);
  }
}

export function buildSpectacle(parent: Object3D, ctx: SpectacleCtx): SpectacleHandle {
  const { rng, ox, oz } = ctx;
  const group = new Group();
  group.name = 'spectacle';
  parent.add(group);

  const dummy = new Object3D();
  const hidden = new Object3D();
  hidden.position.set(0, -400, 0);
  hidden.scale.setScalar(0.0001);
  hidden.updateMatrix();

  const smokeGeometry = new SphereGeometry(0.3, 7, 5);
  const smoke = new InstancedMesh(
    smokeGeometry,
    new MeshLambertMaterial({ color: SMOKE_TINT, transparent: true, opacity: 0.62, depthWrite: false }),
    COLUMNS * PUFFS,
  );
  smoke.instanceMatrix.setUsage(DynamicDrawUsage);
  smoke.frustumCulled = false;
  smoke.name = 'smoke';
  group.add(smoke);
  const ember = new Color(FIRE_TINT);
  const ash = new Color(SMOKE_TINT).lerp(new Color(0xffffff), 0.4);
  for (let c = 0; c < COLUMNS; c++) {
    for (let k = 0; k < PUFFS; k++) smoke.setColorAt(c * PUFFS + k, k < 2 ? ember : ash);
  }
  if (smoke.instanceColor) smoke.instanceColor.needsUpdate = true;

  const columns: Column[] = [];
  for (let i = 0; i < COLUMNS; i++) {
    const tile = ctx.buildings[Math.floor(rng() * ctx.buildings.length) % Math.max(1, ctx.buildings.length)] ?? [0, 0];
    columns.push({ x: tile[0], z: tile[1], top: 3.4 + rng(), on: 0 });
  }

  const flood = new Mesh(
    new PlaneGeometry(ctx.cols + 0.8, ctx.rows + 0.8),
    new MeshLambertMaterial({
      color: FLOOD_TINT, transparent: true, opacity: 0.66, depthWrite: false, side: DoubleSide,
    }),
  );
  flood.rotation.x = -Math.PI / 2;
  flood.position.y = -0.5;
  flood.visible = false;
  flood.name = 'flood';
  group.add(flood);

  const cartMesh = instancedPiece('town', 'cart', CARTS);
  if (cartMesh) {
    const c = new Color(0x6b5a48);
    for (let i = 0; i < CARTS; i++) cartMesh.setColorAt(i, c);
    if (cartMesh.instanceColor) cartMesh.instanceColor.needsUpdate = true;
    group.add(cartMesh);
  }
  const carts: Cart[] = [];
  const anyStreet = (): [number, number] =>
    ctx.streets[Math.floor(rng() * ctx.streets.length) % Math.max(1, ctx.streets.length)] ?? [0, 0];
  for (let i = 0; i < CARTS; i++) {
    const route: [number, number][] = [anyStreet()];
    for (let k = 1; k < 6; k++) {
      const from = route[k - 1]!;
      let best = anyStreet();
      let far = Infinity;
      for (let tries = 0; tries < 12; tries++) {
        const cand = anyStreet();
        const d = Math.hypot(cand[0] - from[0], cand[1] - from[1]);
        if (d > 1.5 && d < far) {
          far = d;
          best = cand;
        }
      }
      route.push(best);
    }
    carts.push({ at: rng() * route.length, route, yaw: 0 });
  }

  const flagMesh = instancedPiece('castle', 'flag-banner-long', FLAGS, true);
  const flagAt: [number, number][] = [];
  if (flagMesh) {
    const anchor = ctx.campos[0] ?? [Math.floor(ctx.cols / 2), Math.floor(ctx.rows / 2)];
    const ranked = [...ctx.open].sort(
      (a, b) => Math.hypot(a[0] - anchor[0], a[1] - anchor[1]) - Math.hypot(b[0] - anchor[0], b[1] - anchor[1]),
    );
    for (let i = 0; i < FLAGS; i++) flagAt.push(ranked[i] ?? anchor);
    group.add(flagMesh);
  }
  const flagColour = new Color();
  let flagMode = '';

  const seasonRoof = new Color();
  const seasonLeaf = new Color();
  const groundBase = ctx.island ? (ctx.island.material as MeshLambertMaterial).color.clone() : new Color(0xffffff);
  let lastSeason = -1;
  let lastCrash: boolean | null = null;
  let clock = 0;
  let floodLevel = 0;
  let firing = false;

  const update = (dt: number, env: SceneEnv) => {
    clock += dt;

    if (env.season !== lastSeason) {
      lastSeason = env.season;
      const s = ((env.season % 4) + 4) % 4;
      seasonRoof.set(0xffffff).lerp(new Color(SEASON_ROOF[s]!), SEASON_ROOF_MIX[s]!);
      tintMaterial(ctx.layers.get('roof'), seasonRoof);
      seasonLeaf.set(SEASON_LEAF[s]!);
      tintMaterial(ctx.layers.get('foliage'), seasonLeaf);
      for (const mesh of ctx.layers.get('snow') ?? []) mesh.visible = s === 3;
      if (ctx.island) {
        (ctx.island.material as MeshLambertMaterial).color.copy(groundBase)
          .lerp(new Color(0xe8f0ff), s === 3 ? 0.55 : 0);
      }
    }

    if (env.crash !== lastCrash) {
      lastCrash = env.crash;
      for (const mesh of ctx.layers.get('stall') ?? []) mesh.visible = !env.crash;
    }

    const mode = env.war ? 'war' : env.festival ? 'festival' : env.politics ? 'politics' : '';
    if (mode !== flagMode) {
      flagMode = mode;
      if (flagMesh) {
        flagColour.set(mode === 'war' ? 0xb3352f : mode === 'festival' ? PALETTE.ochre : 0x3f6fc4);
        for (let i = 0; i < FLAGS; i++) flagMesh.setColorAt(i, flagColour);
        if (flagMesh.instanceColor) flagMesh.instanceColor.needsUpdate = true;
      }
    }
    if (flagMesh) {
      for (let i = 0; i < FLAGS; i++) {
        if (!mode) {
          flagMesh.setMatrixAt(i, hidden.matrix);
          continue;
        }
        const at = flagAt[i]!;
        dummy.position.set(at[0] - ox, 0, at[1] - oz);
        dummy.rotation.set(0, i * 0.7 + Math.sin(clock * 1.4 + i) * 0.12, 0);
        dummy.scale.setScalar(1.15);
        dummy.updateMatrix();
        flagMesh.setMatrixAt(i, dummy.matrix);
      }
      flagMesh.instanceMatrix.needsUpdate = true;
    }

    if (env.fire !== firing) {
      firing = env.fire;
      if (firing) {
        const tile = ctx.buildings[Math.floor(rng() * ctx.buildings.length) % Math.max(1, ctx.buildings.length)];
        const last = columns[COLUMNS - 1]!;
        if (tile) {
          last.x = tile[0];
          last.z = tile[1];
        }
      }
    }
    const burning = env.war ? 3 : 0;
    for (let c = 0; c < COLUMNS; c++) {
      const col = columns[c]!;
      const wanted = c < burning || (env.fire && c === COLUMNS - 1) ? 1 : 0;
      col.on += (wanted - col.on) * Math.min(1, dt * 0.8);
      for (let k = 0; k < PUFFS; k++) {
        const i = c * PUFFS + k;
        if (col.on < 0.03) {
          smoke.setMatrixAt(i, hidden.matrix);
          continue;
        }
        const life = ((clock * 0.22 + k / PUFFS + c * 0.13) % 1);
        const y = 1.4 + life * col.top;
        const drift = life * life * 1.7;
        const size = (0.25 + life * 1.05) * col.on * (k < 2 ? 0.55 : 1);
        dummy.position.set(
          col.x - ox + Math.sin(clock * 0.6 + k) * drift * 0.35 + drift * 0.4,
          y,
          col.z - oz + Math.cos(clock * 0.5 + k) * drift * 0.35,
        );
        dummy.rotation.set(0, life * 3, 0);
        dummy.scale.setScalar(size * (1 - life * 0.25));
        dummy.updateMatrix();
        smoke.setMatrixAt(i, dummy.matrix);
      }
    }
    smoke.instanceMatrix.needsUpdate = true;

    const floodWanted = env.flood ? 1 : 0;
    floodLevel += (floodWanted - floodLevel) * Math.min(1, dt * 0.5);
    flood.visible = floodLevel > 0.02;
    flood.position.y = -0.5 + floodLevel * 0.62 + Math.sin(clock * 0.8) * 0.01 * floodLevel;

    for (let i = 0; i < CARTS; i++) {
      if (!cartMesh) break;
      if (!env.plague) {
        cartMesh.setMatrixAt(i, hidden.matrix);
        continue;
      }
      const cart = carts[i]!;
      cart.at = (cart.at + dt * 0.16) % cart.route.length;
      const a = cart.route[Math.floor(cart.at)]!;
      const b = cart.route[(Math.floor(cart.at) + 1) % cart.route.length]!;
      const f = cart.at % 1;
      const x = a[0] + (b[0] - a[0]) * f;
      const z = a[1] + (b[1] - a[1]) * f;
      cart.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
      dummy.position.set(x - ox, 0, z - oz);
      dummy.rotation.set(0, cart.yaw, 0);
      dummy.scale.setScalar(0.8);
      dummy.updateMatrix();
      cartMesh.setMatrixAt(i, dummy.matrix);
    }
    if (cartMesh) cartMesh.instanceMatrix.needsUpdate = true;
  };

  return {
    update,
    dispose() {
      smokeGeometry.dispose();
      disposeTree(group);
    },
  };
}
