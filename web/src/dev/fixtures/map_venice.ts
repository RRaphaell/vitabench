import type { MapSpec } from '../../state/schema';

export const DEMO_MAP: MapSpec = {
  size: { cols: 24, rows: 18 },
  water: [
    { kind: 'canal', axis: 'x', at: 7 },
    { kind: 'canal', axis: 'x', at: 16 },
    { kind: 'canal', axis: 'z', at: 5 },
    { kind: 'canal', axis: 'z', at: 12 },
  ],
  districts: [
    { id: 'castello', name: 'Castello', tiles: [[0, 0], [11, 8]] },
    { id: 'san_polo', name: 'San Polo', tiles: [[12, 0], [23, 8]] },
    { id: 'dorsoduro', name: 'Dorsoduro', tiles: [[0, 9], [11, 17]] },
    { id: 'cannaregio', name: 'Cannaregio', tiles: [[12, 9], [23, 17]] },
  ],
  places: [
    { id: 'home_marco', kind: 'home', district: 'castello', xz: [2, 1], name: "Marco's house", price_mult: 1 },
    { id: 'home_ziani', kind: 'home', district: 'dorsoduro', xz: [8, 11], name: 'Ca’ Ziani', price_mult: 1 },
    { id: 'home_ferrer', kind: 'home', district: 'san_polo', xz: [17, 4], name: 'Ferrer house', price_mult: 1 },
    { id: 'rialto', kind: 'market', district: 'san_polo', xz: [13, 8], name: 'Rialto market', price_mult: 1 },
    { id: 'market_castello', kind: 'market', district: 'dorsoduro', xz: [4, 14], name: 'Campo market', price_mult: 1.1 },
    { id: 'san_marco', kind: 'church', district: 'dorsoduro', xz: [11, 10], name: 'San Marco', price_mult: 1 },
    { id: 'zanipolo', kind: 'church', district: 'cannaregio', xz: [19, 10], name: 'Zanipolo', price_mult: 1 },
    { id: 'tavern_moro', kind: 'tavern', district: 'castello', xz: [5, 4], name: 'Osteria del Moro', price_mult: 1 },
    { id: 'tavern_dock', kind: 'tavern', district: 'san_polo', xz: [22, 1], name: 'Sailor’s tavern', price_mult: 0.9 },
    { id: 'dock', kind: 'dock', district: 'san_polo', xz: [20, 2], name: 'Riva dock', price_mult: 1 },
    { id: 'arsenale', kind: 'work', district: 'cannaregio', xz: [22, 16], name: 'Arsenale', price_mult: 1 },
    { id: 'murano', kind: 'work', district: 'dorsoduro', xz: [1, 16], name: 'Murano furnace', price_mult: 1 },
    { id: 'notary', kind: 'notary', district: 'cannaregio', xz: [14, 13], name: 'Notary', price_mult: 1 },
    { id: 'hills', kind: 'hills', district: 'dorsoduro', xz: [10, 17], name: 'Terraferma road', price_mult: 1 },
  ],
  landmarks: [
    { id: 'basilica', kind: 'basilica', xz: [10, 8] },
    { id: 'campanile', kind: 'campanile', xz: [11, 7] },
    { id: 'rialto_bridge', kind: 'bridge', xz: [7, 8] },
    { id: 'arsenale_gate', kind: 'arsenale', xz: [21, 16] },
    { id: 'murano_furnace', kind: 'furnace', xz: [2, 16] },
    { id: 'campo_fountain', kind: 'fountain', xz: [13, 4] },
  ],
};
