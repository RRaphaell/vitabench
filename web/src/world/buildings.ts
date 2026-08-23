import { FACADE_TINTS, FLOOR_H, PALETTE, ROOF_TINTS, STONE } from './constants';
import { mulberry32, pick, type Rng } from './rng';
import type { Placement } from './types';

export type BuildStyle = 'stone' | 'wood' | 'grand';

const GROUND_STONE = ['wall', 'wall-window-small', 'wall-arch-top', 'wall-detail-horizontal', 'wall-block'];
const GROUND_WOOD = ['wall-wood', 'wall-wood-window-small', 'wall-wood-detail-cross', 'wall-wood-detail-diagonal'];
const UPPER_STONE = ['wall-window-shutters', 'wall-window-round', 'wall-window-glass', 'wall', 'balcony-wall', 'balcony-wall-fence'];
const UPPER_WOOD = ['wall-wood-window-shutters', 'wall-wood-window-round', 'wall-wood', 'balcony-wall-fence'];
const ROOFS = ['roof', 'roof-gable', 'roof-high', 'roof-window', 'roof-high-gable'];

export interface BuildingSpot {
  x: number;
  z: number;
  doorSide: number;
}

function wallSet(style: BuildStyle, floor: number): readonly string[] {
  if (style === 'wood') return floor === 0 ? GROUND_WOOD : UPPER_WOOD;
  if (style === 'grand') return floor === 0 ? ['wall-arch-top', 'wall-arch-top-detail', 'wall-block'] : UPPER_STONE;
  return floor === 0 ? GROUND_STONE : UPPER_STONE;
}

export function buildBuilding(seed: number, floors: number, style: BuildStyle, spot: BuildingSpot): Placement[] {
  const rng: Rng = mulberry32(seed);
  const body = pick(rng, FACADE_TINTS);
  const trim = style === 'wood' ? PALETTE.umber : body;
  const out: Placement[] = [];
  for (let f = 0; f < floors; f++) {
    const set = wallSet(style, f);
    for (let side = 0; side < 4; side++) {
      let piece = pick(rng, set);
      if (f === 0 && side === spot.doorSide) piece = style === 'wood' ? 'wall-wood-door' : 'wall-door';
      if (f > 0 && side === spot.doorSide && rng() < 0.3) piece = 'balcony-wall-fence';
      out.push({
        kit: 'town',
        piece,
        x: spot.x,
        y: f * FLOOR_H,
        z: spot.z,
        rotY: (side * Math.PI) / 2,
        color: f === 0 ? trim : body,
      });
    }
  }
  const roofPiece = pick(rng, ROOFS);
  const roofRot = Math.floor(rng() * 4) * (Math.PI / 2);
  out.push({
    kit: 'town',
    piece: roofPiece,
    x: spot.x,
    y: floors * FLOOR_H,
    z: spot.z,
    rotY: roofRot,
    color: pick(rng, ROOF_TINTS),
    layer: 'roof',
  });
  if (rng() < 0.4) {
    const h = roofPiece.startsWith('roof-high') ? 1.0 : 0.5;
    out.push({
      kit: 'town',
      piece: 'chimney',
      x: spot.x + (rng() - 0.5) * 0.3,
      y: floors * FLOOR_H + h,
      z: spot.z + (rng() - 0.5) * 0.3,
      rotY: roofRot,
      scale: 0.55,
      color: PALETTE.brick,
    });
  }
  return out;
}

export type LandmarkKind = 'basilica' | 'campanile' | 'bridge' | 'arsenale' | 'furnace' | 'fountain';

export function buildLandmark(kind: LandmarkKind, x: number, z: number, rotY = 0): Placement[] {
  const out: Placement[] = [];
  const T = (p: Partial<Placement> & { kit: Placement['kit']; piece: string; color: number }): Placement => ({
    x, y: 0, z, rotY, ...p,
  });
  if (kind === 'basilica') {
    for (let f = 0; f < 2; f++) {
      for (let side = 0; side < 4; side++) {
        const piece = f === 0 && side === 0 ? 'wall-arch-top-detail' : f === 0 ? 'wall-arch-top' : 'wall-window-round';
        out.push(T({ kit: 'town', piece, y: f * FLOOR_H, rotY: (side * Math.PI) / 2, color: PALETTE.cream }));
      }
    }
    out.push(T({ kit: 'castle', piece: 'tower-hexagon-roof', y: 2 * FLOOR_H, scale: 1.15, color: PALETTE.sand }));
    for (const [dx, dz] of [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]] as const) {
      out.push(T({ kit: 'castle', piece: 'tower-hexagon-roof-secondary', x: x + dx, z: z + dz, y: 1.4, scale: 0.62, color: PALETTE.sand }));
    }
    out.push(T({ kit: 'town', piece: 'banner-red', y: 1.05, rotY: Math.PI, color: PALETTE.brick }));
    return out;
  }
  if (kind === 'campanile') {
    out.push(T({ kit: 'castle', piece: 'tower-square-base', color: PALETTE.brick }));
    for (let i = 1; i < 4; i++) {
      out.push(T({ kit: 'castle', piece: i === 3 ? 'tower-square-mid-windows' : 'tower-square-mid', y: i * 1.01, color: PALETTE.brick }));
    }
    out.push(T({ kit: 'castle', piece: 'tower-square-top', y: 4.04, color: PALETTE.cream }));
    out.push(T({ kit: 'castle', piece: 'tower-square-roof', y: 4.34, color: 0x4f7f6a }));
    out.push(T({ kit: 'castle', piece: 'flag-pennant', y: 6.2, scale: 0.9, color: PALETTE.ochre }));
    return out;
  }
  if (kind === 'bridge') {
    out.push(T({ kit: 'castle', piece: 'bridge-straight-pillar', y: -0.7, color: STONE }));
    return out;
  }
  if (kind === 'arsenale') {
    out.push(T({ kit: 'pirate', piece: 'castle-gate', scale: 0.5, color: PALETTE.brick }));
    out.push(T({ kit: 'pirate', piece: 'castle-wall', x: x - 1.6, scale: 0.5, color: PALETTE.brick }));
    out.push(T({ kit: 'pirate', piece: 'castle-wall', x: x + 1.6, scale: 0.5, color: PALETTE.brick }));
    out.push(T({ kit: 'castle', piece: 'flag-banner-long', x: x - 0.2, y: 2.2, scale: 0.8, color: PALETTE.brick }));
    return out;
  }
  if (kind === 'furnace') {
    out.push(T({ kit: 'town', piece: 'watermill', y: 0.9, scale: 0.9, color: PALETTE.umber }));
    out.push(T({ kit: 'town', piece: 'chimney', x: x + 0.35, y: 1.7, scale: 0.8, color: PALETTE.brick }));
    return out;
  }
  out.push(T({ kit: 'town', piece: 'fountain-round', scale: 0.72, color: STONE }));
  out.push(T({ kit: 'town', piece: 'fountain-round-detail', scale: 0.72, color: STONE }));
  return out;
}
