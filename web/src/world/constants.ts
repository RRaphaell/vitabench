export const TILE = 1;
export const FLOOR_H = 1;
export const ISLAND_TOP = 0;
export const PAVING_H = 0.34;
export const ISLAND_DEPTH = 2.1;
export const CANAL_BED_Y = -1.6;
export const WATER_Y = -0.95;
export const CANAL_Y = -0.5;
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

export const SEASON_SKY = [0x9ed3d8, 0xbfe0ea, 0xdcb681, 0xcdd8e6];
export const SEASON_FOG = [0xc4e2d8, 0xd8ecf2, 0xe6c08c, 0xdde6ef];
export const SEASON_SUN = [0xf6ffe0, 0xfff2c8, 0xffcf8a, 0xe6f0ff];
export const SEASON_GROUND = [0xf2f0e2, 0xfff7e4, 0xf6e2c2, 0xe4ecf6];
export const SEASON_ROOF = [0xffffff, 0xfff4e2, 0xffe6c4, 0xeef4ff];
export const SEASON_ROOF_MIX = [0.12, 0.1, 0.34, 0.34];
export const SEASON_LEAF = [0x7cd45c, 0x4f9a46, 0xe2952f, 0x9a8c72];
export const SEASON_SUN_POWER = [1, 1.12, 0.92, 0.7];
export const NIGHT_SKY = 0x121a2b;
export const NIGHT_FOG = 0x18223a;
export const PLAGUE_FOG = 0x6f7a5c;
export const WAR_FOG = 0x7a6a63;

export const GONDOLA_SCALE = 0.36;
export const SHIP_SCALE = 0.34;
export const BOAT_SPEED = 0.55;

export const GONDOLAS_PER_CANAL = 4;
export const CARGO_BOATS = 3;
export const GALLEYS = 4;
export const CROWD = 96;
export const CROWD_CLASS_TINTS = [0xa8283a, 0x3f6fc4, 0x2a2d34, 0x7c5a38, 0xb8a893, 0x6f8f5c];
export const SNOW = 0xf2f7ff;
export const FLOOD_TINT = 0x3d7f86;
export const SMOKE_TINT = 0x8b8f96;
export const FIRE_TINT = 0xff8a3d;
