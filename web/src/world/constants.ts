export const TILE = 1;
export const FLOOR_H = 1;
export const ISLAND_TOP = 0;
export const PAVING_H = 0.34;
export const ISLAND_DEPTH = 2.1;
export const CANAL_BED_Y = -1.6;
export const WATER_Y = -0.95;
export const LAGOON = 120;
export const DAY_SECONDS = 45;
export const CAMERA_RADIUS = 90;

export const PALETTE = {
  ochre: 0xf2cf9a,
  terracotta: 0xe8ab8c,
  rose: 0xefc3bc,
  cream: 0xf7eeda,
  brick: 0xd9a08f,
  sand: 0xeeddba,
  plaster: 0xf4e3cd,
  umber: 0xd6b48a,
} as const;

export const FACADE_TINTS = [
  PALETTE.ochre,
  PALETTE.terracotta,
  PALETTE.rose,
  PALETTE.cream,
  PALETTE.brick,
  PALETTE.sand,
  PALETTE.plaster,
  PALETTE.umber,
];

export const ROOF_TINTS = [0xd9705a, 0xbb6248, 0xe08a63, 0xc07a55, 0xa85f45];

export const STONE = 0xdcd4c0;
export const STONE_DARK = 0xc3bba6;
export const EARTH = 0xa9805a;
export const EARTH_DARK = 0x5c4128;
export const WATER_TINT = 0x1d6f74;
export const CANAL_TINT = 0x2f8f92;
export const CANAL_BED = 0x2c4a48;
export const GOLD = 0xd9a441;

export const SEASON_SKY = [0x9fc7e8, 0xbcd9ea, 0xd9c3a0, 0xc3cdd8];
export const SEASON_FOG = [0xbcd6e6, 0xd3e3ee, 0xe2cfae, 0xd2dae2];
export const SEASON_SUN = [0xfff0d4, 0xfff4dd, 0xffe2b0, 0xeef2ff];
export const NIGHT_SKY = 0x121a2b;
export const NIGHT_FOG = 0x18223a;
export const PLAGUE_FOG = 0x6f7a5c;
export const WAR_FOG = 0x7a6a63;

export const GONDOLA_SCALE = 0.3;
export const SHIP_SCALE = 0.34;
export const BOAT_SPEED = 0.55;
