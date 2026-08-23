import {
  CapsuleGeometry, Color, DoubleSide, DynamicDrawUsage, Group, InstancedMesh, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, Object3D, PlaneGeometry, type Vector3,
} from 'three';
import { disposeTree, instancedPiece } from './batch';
import {
  CANAL_Y, CARGO_BOATS, GALLEYS, GONDOLAS_PER_CANAL, GONDOLA_SCALE, PALETTE, SHIP_SCALE, WATER_Y,
} from './constants';
import type { Rng } from './rng';
import type { SceneEnv } from './types';

export interface BoatsCtx {
  cols: number;
  rows: number;
  ox: number;
  oz: number;
  rng: Rng;
  toWorld(x: number, z: number): Vector3;
  canals: { axis: 'x' | 'z'; at: number }[];
  dock: [number, number] | null;
}

export interface BoatsHandle {
  update(dt: number, env: SceneEnv): void;
  dispose(): void;
}

interface Gondola {
  axis: 'x' | 'z';
  at: number;
  pos: number;
  dir: number;
  speed: number;
  yaw: number;
  turn: number;
}

interface Cargo {
  along: number;
  dir: number;
  dwell: number;
  loaded: number;
  lane: number;
}

const WINTER = 3;

function lerpAngle(from: number, to: number, k: number): number {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + d * k;
}

export function buildBoats(parent: Object3D, ctx: BoatsCtx): BoatsHandle {
  const { rng, toWorld, ox, oz } = ctx;
  const group = new Group();
  group.name = 'boats';
  parent.add(group);

  const dummy = new Object3D();
  const hide = (mesh: InstancedMesh | null, i: number) => {
    if (!mesh) return;
    dummy.position.set(0, -400, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.0001);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  const place = (mesh: InstancedMesh | null, i: number, x: number, y: number, z: number, yaw: number, roll: number, scale: number) => {
    if (!mesh) return;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, yaw, roll);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };

  const gondolas: Gondola[] = [];
  for (const canal of ctx.canals) {
    const span = canal.axis === 'x' ? ctx.rows : ctx.cols;
    for (let i = 0; i < GONDOLAS_PER_CANAL; i++) {
      gondolas.push({
        axis: canal.axis,
        at: canal.at,
        pos: (span / GONDOLAS_PER_CANAL) * i + rng() * 1.5,
        dir: i % 2 ? -1 : 1,
        speed: 0.5 + rng() * 0.85,
        yaw: 0,
        turn: 0,
      });
    }
  }

  const gondolaMesh = instancedPiece('pirate', 'boat-row-small', Math.max(1, gondolas.length));
  if (gondolaMesh) {
    const c = new Color(0x6a4f39);
    for (let i = 0; i < gondolas.length; i++) gondolaMesh.setColorAt(i, c);
    if (gondolaMesh.instanceColor) gondolaMesh.instanceColor.needsUpdate = true;
    group.add(gondolaMesh);
  }

  const rowerGeometry = new CapsuleGeometry(0.1, 0.34, 3, 6);
  const rowers = new InstancedMesh(
    rowerGeometry,
    new MeshLambertMaterial({ color: 0xe8dcc4 }),
    Math.max(1, gondolas.length),
  );
  rowers.instanceMatrix.setUsage(DynamicDrawUsage);
  rowers.frustumCulled = false;
  rowers.castShadow = true;
  rowers.name = 'gondoliers';
  group.add(rowers);

  const cargo: Cargo[] = [];
  for (let i = 0; i < CARGO_BOATS; i++) {
    cargo.push({ along: rng() * 6, dir: 1, dwell: 0, loaded: 0, lane: i - (CARGO_BOATS - 1) / 2 });
  }
  const cargoMesh = instancedPiece('pirate', 'boat-row-large', CARGO_BOATS);
  if (cargoMesh) {
    const c = new Color(PALETTE.umber);
    for (let i = 0; i < CARGO_BOATS; i++) cargoMesh.setColorAt(i, c);
    if (cargoMesh.instanceColor) cargoMesh.instanceColor.needsUpdate = true;
    group.add(cargoMesh);
  }
  const crateMesh = instancedPiece('pirate', 'crate', CARGO_BOATS * 2);
  if (crateMesh) {
    const c = new Color(PALETTE.sand);
    for (let i = 0; i < CARGO_BOATS * 2; i++) crateMesh.setColorAt(i, c);
    if (crateMesh.instanceColor) crateMesh.instanceColor.needsUpdate = true;
    group.add(crateMesh);
  }

  const galleyMesh = instancedPiece('pirate', 'ship-medium', GALLEYS + 1);
  if (galleyMesh) {
    const war = new Color(PALETTE.sand);
    for (let i = 0; i < GALLEYS; i++) galleyMesh.setColorAt(i, war);
    galleyMesh.setColorAt(GALLEYS, new Color(PALETTE.cream));
    if (galleyMesh.instanceColor) galleyMesh.instanceColor.needsUpdate = true;
    group.add(galleyMesh);
  }

  const letter = new Mesh(
    new PlaneGeometry(0.55, 0.4),
    new MeshBasicMaterial({ color: 0xfff6e0, side: DoubleSide, transparent: true, opacity: 0.95 }),
  );
  letter.name = 'letter';
  letter.visible = false;
  group.add(letter);

  const dockTile = ctx.dock ?? [Math.floor(ctx.cols / 2), ctx.rows - 2];
  const shore = toWorld(dockTile[0], ctx.rows + 0.2);
  const offshore = toWorld(dockTile[0], ctx.rows + 11);
  const centre = toWorld((ctx.cols - 1) / 2, (ctx.rows - 1) / 2);
  const ring = Math.max(ctx.cols, ctx.rows) * 0.62 + 6;

  let clock = 0;
  let arrival = -1;
  let arrivalT = 0;
  let lastSeason = -1;

  const update = (dt: number, env: SceneEnv) => {
    clock += dt;
    const winter = env.season === WINTER;

    for (let i = 0; i < gondolas.length; i++) {
      const g = gondolas[i]!;
      const span = g.axis === 'x' ? ctx.rows : ctx.cols;
      if (g.turn > 0) {
        g.turn -= dt;
        g.pos += g.dir * g.speed * dt * 0.15;
      } else {
        g.pos += g.dir * g.speed * dt;
        if (g.pos > span - 0.6 || g.pos < -0.4) {
          g.dir *= -1;
          g.turn = 1.4;
        }
      }
      const base = g.axis === 'x' ? 0 : Math.PI / 2;
      const wanted = base + (g.dir > 0 ? 0 : Math.PI);
      g.yaw = lerpAngle(g.yaw, wanted, Math.min(1, dt * 2.4));
      const px = (g.axis === 'x' ? g.at : g.pos) - ox;
      const pz = (g.axis === 'x' ? g.pos : g.at) - oz;
      const bob = Math.sin(clock * 1.6 + i) * 0.025;
      place(gondolaMesh, i, px, CANAL_Y + bob, pz, g.yaw, Math.sin(clock * 1.2 + i) * 0.04, GONDOLA_SCALE);
      dummy.position.set(px - Math.sin(g.yaw) * 0.25, CANAL_Y + bob + 0.26, pz - Math.cos(g.yaw) * 0.25);
      dummy.rotation.set(Math.sin(clock * 3 + i) * 0.16, g.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      rowers.setMatrixAt(i, dummy.matrix);
    }
    if (gondolaMesh) gondolaMesh.instanceMatrix.needsUpdate = true;
    rowers.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < cargo.length; i++) {
      const c = cargo[i]!;
      if (winter) {
        hide(cargoMesh, i);
        hide(crateMesh, i * 2);
        hide(crateMesh, i * 2 + 1);
        continue;
      }
      if (c.dwell > 0) {
        c.dwell -= dt;
        c.loaded = Math.min(1, c.loaded + dt * 0.5);
        if (c.dwell <= 0) c.dir = -1;
      } else {
        c.along += c.dir * dt * 0.9;
        if (c.along <= 0.05 && c.dir < 0) {
          c.along = 0;
          c.dir = 1;
        }
        if (c.along >= 1 && c.dir > 0) {
          c.along = 1;
          c.dwell = 5 + i * 2;
          c.loaded = 0;
        }
      }
      const t = c.along;
      const x = offshore.x + (shore.x - offshore.x) * t + c.lane * 1.6;
      const z = offshore.z + (shore.z - offshore.z) * t;
      const yaw = c.dir > 0 ? Math.PI : 0;
      place(cargoMesh, i, x, WATER_Y + Math.sin(clock * 1.1 + i) * 0.03, z, yaw, 0, 0.42);
      const stacked = c.dwell > 0 ? 1 - c.loaded : t;
      for (let k = 0; k < 2; k++) {
        if (stacked < 0.15) hide(crateMesh, i * 2 + k);
        else place(crateMesh, i * 2 + k, x + (k - 0.5) * 0.5, WATER_Y + 0.2 + k * 0.02, z, yaw, 0, 0.34 * stacked);
      }
    }
    if (cargoMesh) cargoMesh.instanceMatrix.needsUpdate = true;
    if (crateMesh) crateMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < GALLEYS; i++) {
      if (!env.war) {
        hide(galleyMesh, i);
        continue;
      }
      const a = clock * 0.045 + (i * Math.PI * 2) / GALLEYS;
      const x = centre.x + Math.cos(a) * ring;
      const z = centre.z + Math.sin(a) * ring * 0.8;
      place(galleyMesh, i, x, WATER_Y + Math.sin(clock * 0.8 + i) * 0.05, z, -a + Math.PI, Math.sin(clock * 0.7 + i) * 0.02, SHIP_SCALE);
    }

    if (env.season !== lastSeason || (arrival < 0 && arrivalT === 0)) {
      lastSeason = env.season;
      if (!winter && arrival < 0) {
        arrival = 0;
        arrivalT = 0;
      }
    }
    if (arrival < 0 || winter) {
      hide(galleyMesh, GALLEYS);
      letter.visible = false;
    } else {
      arrivalT += dt;
      const inbound = Math.min(1, arrivalT / 9);
      const outbound = Math.max(0, (arrivalT - 20) / 9);
      const t = outbound > 0 ? Math.min(1, 1 - outbound) : inbound;
      if (outbound >= 1) arrival = -1;
      const x = offshore.x + (shore.x - offshore.x) * t + 3.2;
      const z = offshore.z + (shore.z - offshore.z) * t;
      place(galleyMesh, GALLEYS, x, WATER_Y + Math.sin(clock * 0.9) * 0.04, z, Math.PI, Math.sin(clock * 0.6) * 0.02, SHIP_SCALE);
      letter.visible = env.visitor && t > 0.45;
      letter.position.set(x, WATER_Y + 2.5, z);
      letter.rotation.set(0, clock * 0.6, Math.sin(clock * 2.2) * 0.18);
    }
    if (galleyMesh) galleyMesh.instanceMatrix.needsUpdate = true;
  };

  return {
    update,
    dispose() {
      rowerGeometry.dispose();
      disposeTree(group);
    },
  };
}
