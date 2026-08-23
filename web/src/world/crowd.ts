import {
  CapsuleGeometry, Color, DynamicDrawUsage, InstancedMesh, MeshLambertMaterial, Object3D, SphereGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CROWD, CROWD_CLASS_TINTS } from './constants';
import type { Rng } from './rng';
import type { SceneEnv } from './types';

export interface CrowdCtx {
  cols: number;
  rows: number;
  ox: number;
  oz: number;
  rng: Rng;
  isWalkable(x: number, z: number): boolean;
  markets: [number, number][];
  campos: [number, number][];
  homes: [number, number][];
}

export interface CrowdHandle {
  update(dt: number, env: SceneEnv): void;
  dispose(): void;
}

type Role = 'street' | 'market' | 'campo';

interface Walker {
  x: number;
  z: number;
  tx: number;
  tz: number;
  dx: number;
  dz: number;
  yaw: number;
  speed: number;
  phase: number;
  dwell: number;
  role: Role;
  home: [number, number];
  anchor: [number, number];
  shown: number;
  fallen: number;
}

const STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function bodyGeometry(height: number) {
  const body = new CapsuleGeometry(height * 0.15, height * 0.46, 3, 6);
  body.translate(0, height * 0.38, 0);
  const head = new SphereGeometry(height * 0.17, 7, 5);
  head.translate(0, height * 0.78, 0);
  const merged = mergeGeometries([body, head], false);
  body.dispose();
  head.dispose();
  return merged ?? new CapsuleGeometry(height * 0.15, height * 0.46, 3, 6);
}

export function buildCrowd(parent: Object3D, ctx: CrowdCtx): CrowdHandle {
  const { rng, ox, oz } = ctx;
  const height = 0.78;
  const geometry = bodyGeometry(height);
  const mesh = new InstancedMesh(geometry, new MeshLambertMaterial({}), CROWD);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.name = 'crowd';
  parent.add(mesh);

  const open: [number, number][] = [];
  for (let x = 0; x < ctx.cols; x++) {
    for (let z = 0; z < ctx.rows; z++) if (ctx.isWalkable(x, z)) open.push([x, z]);
  }
  const spot = (): [number, number] => open[Math.floor(rng() * open.length) % Math.max(1, open.length)] ?? [0, 0];
  const near = (list: [number, number][], fallback: [number, number]): [number, number] =>
    list.length > 0 ? (list[Math.floor(rng() * list.length) % list.length] as [number, number]) : fallback;

  const walkers: Walker[] = [];
  const tint = new Color();
  for (let i = 0; i < CROWD; i++) {
    const role: Role = i % 5 === 0 ? 'market' : i % 7 === 0 ? 'campo' : 'street';
    const start = spot();
    const anchor = role === 'market' ? near(ctx.markets, start) : role === 'campo' ? near(ctx.campos, start) : start;
    walkers.push({
      x: start[0],
      z: start[1],
      tx: start[0],
      tz: start[1],
      dx: 1,
      dz: 0,
      yaw: rng() * Math.PI * 2,
      speed: 0.6 + rng() * 0.7,
      phase: rng() * 6.28,
      dwell: rng() * 2,
      role,
      home: near(ctx.homes, start),
      anchor,
      shown: 1,
      fallen: 0,
    });
    mesh.setColorAt(i, tint.set(CROWD_CLASS_TINTS[i % CROWD_CLASS_TINTS.length]!).lerp(new Color(0xffffff), 0.18));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  const dummy = new Object3D();
  const hidden = new Object3D();
  hidden.position.set(0, -400, 0);
  hidden.scale.setScalar(0.0001);
  hidden.updateMatrix();

  const stepAway = (w: Walker, toX: number, toZ: number) => {
    let bestX = 0;
    let bestZ = 0;
    let bestScore = -Infinity;
    for (const step of STEPS) {
      const sx = step[0];
      const sz = step[1];
      const nx = w.tx + sx;
      const nz = w.tz + sz;
      if (!ctx.isWalkable(nx, nz)) continue;
      const straight = sx === w.dx && sz === w.dz ? 1.1 : 0;
      const pull = -Math.hypot(nx - toX, nz - toZ) * 0.55;
      const score = straight + pull + rng() * 0.9;
      if (score > bestScore) {
        bestScore = score;
        bestX = sx;
        bestZ = sz;
      }
    }
    if (bestScore === -Infinity) return;
    w.dx = bestX;
    w.dz = bestZ;
    w.tx += bestX;
    w.tz += bestZ;
  };

  const update = (dt: number, env: SceneEnv) => {
    const day = env.daylight;
    const crowded = env.festival || env.politics ? 1 : day * 0.85 + 0.15;
    let want = Math.round(CROWD * Math.min(1, crowded));
    if (env.plague) want = Math.round(CROWD * 0.33);
    if (env.famine) want = Math.round(want * 0.8);

    for (let i = 0; i < CROWD; i++) {
      const w = walkers[i]!;
      const active = i < want;
      w.shown += ((active ? 1 : 0) - w.shown) * Math.min(1, dt * 1.6);
      if (env.plague && i % 11 === 3) w.fallen = Math.min(1, w.fallen + dt * 0.25);
      else w.fallen = Math.max(0, w.fallen - dt * 0.6);

      if (w.shown < 0.02) {
        mesh.setMatrixAt(i, hidden.matrix);
        continue;
      }

      const night = day < 0.35;
      const held = w.fallen > 0.5;
      const drawn = night ? w.home : w.anchor;
      const roam = !held && !night && !env.festival && !env.politics && w.role === 'street';
      const goalX = held ? w.tx : roam ? w.tx + w.dx * 3 : drawn[0];
      const goalZ = held ? w.tz : roam ? w.tz + w.dz * 3 : drawn[1];

      const gx = w.x - w.tx;
      const gz = w.z - w.tz;
      if (Math.hypot(gx, gz) < 0.08) {
        w.x = w.tx;
        w.z = w.tz;
        if (w.dwell > 0) w.dwell -= dt;
        else {
          const settled = w.role !== 'street' && !night
            && Math.hypot(w.tx - w.anchor[0], w.tz - w.anchor[1]) < 1.6;
          w.dwell = settled ? 1.5 + rng() * 3.5 : rng() * 0.5;
          if (!held) stepAway(w, goalX, goalZ);
        }
      } else {
        const step = w.speed * dt * (env.plague ? 0.7 : 1);
        const d = Math.hypot(gx, gz);
        w.x -= (gx / d) * Math.min(step, d);
        w.z -= (gz / d) * Math.min(step, d);
        w.yaw = Math.atan2(-gx, -gz);
        w.phase += dt * w.speed * 7;
      }

      const moving = Math.hypot(w.x - w.tx, w.z - w.tz) > 0.05;
      const bob = moving ? Math.abs(Math.sin(w.phase)) * 0.05 : 0;
      const scale = w.shown * (1 - w.fallen * 0.35);
      dummy.position.set(w.x - ox, bob - w.fallen * 0.18, w.z - oz);
      dummy.rotation.set(w.fallen * Math.PI * 0.48, w.yaw, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  return {
    update,
    dispose() {
      geometry.dispose();
      (mesh.material as MeshLambertMaterial).dispose();
      mesh.dispose();
      mesh.removeFromParent();
    },
  };
}
