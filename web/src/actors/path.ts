import { Vector3 } from 'three';
import type { XZ } from '../state/schema';
import type { WalkGrid, WorldHandles } from './types';
import { tileSizeOf } from './types';

const NEIGHBORS: XZ[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const CACHE_LIMIT = 1200;
const cache = new Map<string, XZ[]>();

const key = (from: XZ, to: XZ) => `${from[0]},${from[1]}>${to[0]},${to[1]}`;

function walkable(grid: WalkGrid, x: number, z: number): boolean {
  if (x < 0 || z < 0 || x >= grid.cols || z >= grid.rows) return false;
  return grid.walkable[x]?.[z] === true;
}

function nearestWalkable(grid: WalkGrid, target: XZ): XZ | null {
  if (walkable(grid, target[0], target[1])) return target;
  for (let r = 1; r <= 6; r += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      for (let dz = -r; dz <= r; dz += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = target[0] + dx;
        const z = target[1] + dz;
        if (walkable(grid, x, z)) return [x, z];
      }
    }
  }
  return null;
}

export function findPath(grid: WalkGrid, from: XZ, to: XZ): XZ[] {
  const goal = nearestWalkable(grid, to);
  const start = nearestWalkable(grid, from);
  if (!goal || !start) return [];
  if (start[0] === goal[0] && start[1] === goal[1]) return [goal];

  const cached = cache.get(key(start, goal));
  if (cached) return cached;

  const width = grid.cols;
  const index = (x: number, z: number) => z * width + x;
  const open: number[] = [index(start[0], start[1])];
  const cameFrom = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();
  const h = (x: number, z: number) => Math.abs(x - goal[0]) + Math.abs(z - goal[1]);
  gScore.set(open[0] as number, 0);
  fScore.set(open[0] as number, h(start[0], start[1]));

  let guard = grid.cols * grid.rows * 8;
  while (open.length > 0 && guard-- > 0) {
    let bestAt = 0;
    for (let i = 1; i < open.length; i += 1) {
      const a = fScore.get(open[i] as number) ?? Infinity;
      const b = fScore.get(open[bestAt] as number) ?? Infinity;
      if (a < b) bestAt = i;
    }
    const currentIdx = open.splice(bestAt, 1)[0] as number;
    const cx = currentIdx % width;
    const cz = Math.floor(currentIdx / width);
    if (cx === goal[0] && cz === goal[1]) {
      const path: XZ[] = [[cx, cz]];
      let node = currentIdx;
      while (cameFrom.has(node)) {
        node = cameFrom.get(node) as number;
        path.push([node % width, Math.floor(node / width)]);
      }
      path.reverse();
      if (cache.size > CACHE_LIMIT) cache.clear();
      cache.set(key(start, goal), path);
      return path;
    }
    for (const [dx, dz] of NEIGHBORS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (!walkable(grid, nx, nz)) continue;
      if (dx !== 0 && dz !== 0 && (!walkable(grid, cx + dx, cz) || !walkable(grid, cx, cz + dz))) continue;
      const step = dx !== 0 && dz !== 0 ? 1.414 : 1;
      const tentative = (gScore.get(currentIdx) ?? Infinity) + step;
      const nIdx = index(nx, nz);
      if (tentative >= (gScore.get(nIdx) ?? Infinity)) continue;
      cameFrom.set(nIdx, currentIdx);
      gScore.set(nIdx, tentative);
      fScore.set(nIdx, tentative + h(nx, nz));
      if (!open.includes(nIdx)) open.push(nIdx);
    }
  }
  return [start];
}

export function clearPathCache(): void {
  cache.clear();
}

export class PathFollower {
  readonly position = new Vector3();
  heading = 0;
  moving = false;
  private waypoints: Vector3[] = [];
  private target: XZ;
  private tile: XZ;
  private readonly speed: number;

  constructor(private readonly world: WorldHandles, start: XZ, tilesPerSecond = 0.9) {
    this.tile = [start[0], start[1]];
    this.target = [start[0], start[1]];
    this.position.copy(world.tileToWorld(start));
    this.speed = tilesPerSecond * tileSizeOf(world);
  }

  get currentTile(): XZ {
    return [this.tile[0], this.tile[1]];
  }

  setTarget(xz: XZ): void {
    if (xz[0] === this.target[0] && xz[1] === this.target[1]) return;
    this.target = [xz[0], xz[1]];
    const path = findPath(this.world.grid, this.tile, this.target);
    this.waypoints = path.slice(1).map((step) => this.world.tileToWorld(step));
    if (this.waypoints.length === 0) this.waypoints = [this.world.tileToWorld(this.target)];
  }

  teleport(xz: XZ): void {
    this.tile = [xz[0], xz[1]];
    this.target = [xz[0], xz[1]];
    this.waypoints = [];
    this.position.copy(this.world.tileToWorld(xz));
  }

  update(dt: number): void {
    const next = this.waypoints[0];
    if (!next) {
      this.moving = false;
      return;
    }
    this.moving = true;
    const dx = next.x - this.position.x;
    const dz = next.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const step = this.speed * dt;
    if (dist <= step || dist < 1e-4) {
      this.position.set(next.x, next.y, next.z);
      this.waypoints.shift();
      if (this.waypoints.length === 0) this.tile = [this.target[0], this.target[1]];
      return;
    }
    this.position.x += (dx / dist) * step;
    this.position.z += (dz / dist) * step;
    this.position.y += (next.y - this.position.y) * Math.min(1, dt * 6);
    const wanted = Math.atan2(dx, dz);
    let delta = wanted - this.heading;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.heading += delta * Math.min(1, dt * 8);
  }
}
