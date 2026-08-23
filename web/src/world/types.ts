import type { Vector3 } from 'three';

export type KitName = 'town' | 'castle' | 'pirate';

export interface WorldEnv {
  season: number;
  plague: boolean;
  war: boolean;
}

export interface Placement {
  kit: KitName;
  piece: string;
  x: number;
  y: number;
  z: number;
  rotY?: number;
  scale?: number;
  color: number;
}

export interface WorldGrid {
  cols: number;
  rows: number;
  walkable: boolean[][];
}

export interface WorldHandles {
  tileToWorld(xz: [number, number]): Vector3;
  isWalkable(x: number, z: number): boolean;
  grid: WorldGrid;
  placeXZ(placeId: string): [number, number];
  update(dt: number, env: WorldEnv): void;
  dispose(): void;
}

export type TileKind = 'canal' | 'street' | 'walkway' | 'bridge' | 'place' | 'landmark' | 'building' | 'yard';
