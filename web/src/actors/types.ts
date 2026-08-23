import type { Vector3 } from 'three';
import type { XZ } from '../state/schema';

export interface WalkGrid {
  cols: number;
  rows: number;
  walkable: boolean[][];
}

export interface WorldEnv {
  t?: number;
  daylight?: number;
  season?: number;
  plague?: boolean;
  war?: boolean;
}

export interface WorldHandles {
  tileToWorld(xz: XZ): Vector3;
  isWalkable(x: number, z: number): boolean;
  grid: WalkGrid;
  placeXZ(placeId: string): XZ;
  update(dt: number, env: WorldEnv): void;
  dispose(): void;
}

export function tileSizeOf(world: WorldHandles): number {
  const a = world.tileToWorld([0, 0]);
  const b = world.tileToWorld([1, 0]);
  const d = a.distanceTo(b);
  return d > 1e-4 ? d : 1;
}
