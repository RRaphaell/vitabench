import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'fixtures/demo_frames.json');
const START_YEAR = 1340;
const LAST_T = 172;
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

let seed = 0x5eed1340;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const date = (t) => `${SEASONS[t % 4]} ${START_YEAR + Math.floor(t / 4)}`;

const places = [
  { id: 'home_marco', kind: 'home', district: 'castello', xz: [3, 3], name: "Marco's house" },
  { id: 'home_agnese', kind: 'home', district: 'castello', xz: [5, 1], name: "Agnese's house" },
  { id: 'tavern_moro', kind: 'tavern', district: 'castello', xz: [2, 4], name: 'Osteria al Moro' },
  { id: 'san_marco', kind: 'church', district: 'san_marco', xz: [12, 3], name: 'San Marco' },
  { id: 'notary_office', kind: 'notary', district: 'san_marco', xz: [10, 2], name: 'Notary Barbaro' },
  { id: 'rialto', kind: 'market', district: 'san_polo', xz: [12, 8], name: 'Rialto market' },
  { id: 'fondaco', kind: 'market', district: 'san_polo', xz: [14, 10], name: 'Fondaco dei Tedeschi' },
  { id: 'church_frari', kind: 'church', district: 'san_polo', xz: [9, 11], name: 'Frari' },
  { id: 'arsenale', kind: 'work', district: 'arsenale', xz: [21, 3], name: 'Arsenale' },
  { id: 'dock', kind: 'dock', district: 'arsenale', xz: [19, 1], name: 'Riva degli Schiavoni' },
  { id: 'tavern_leon', kind: 'tavern', district: 'arsenale', xz: [18, 10], name: 'Osteria al Leon' },
  { id: 'campo_santi', kind: 'market', district: 'cannaregio', xz: [3, 8], name: 'Campo Santi Apostoli' },
  { id: 'murano', kind: 'work', district: 'dorsoduro', xz: [2, 14], name: 'Murano furnace' },
  { id: 'squero', kind: 'work', district: 'dorsoduro', xz: [4, 17], name: 'Squero San Trovaso' },
];
const priceMult = { rialto: 1.0, fondaco: 1.1, campo_santi: 0.9 };
for (const p of places) p.price_mult = priceMult[p.id] ?? 1.0;

const mapSpec = {
  size: { cols: 24, rows: 18 },
  water: [
    { kind: 'canal', axis: 'x', at: 7 },
    { kind: 'canal', axis: 'x', at: 16 },
    { kind: 'canal', axis: 'z', at: 5 },
    { kind: 'canal', axis: 'z', at: 12 },
  ],
  districts: [
    { id: 'castello', name: 'Castello', tiles: [[0, 0], [6, 4]] },
    { id: 'san_marco', name: 'San Marco', tiles: [[8, 0], [15, 4]] },
    { id: 'arsenale', name: 'Arsenale', tiles: [[17, 0], [23, 11]] },
    { id: 'cannaregio', name: 'Cannaregio', tiles: [[0, 6], [6, 11]] },
    { id: 'san_polo', name: 'San Polo', tiles: [[8, 6], [15, 11]] },
    { id: 'dorsoduro', name: 'Dorsoduro', tiles: [[0, 13], [15, 17]] },
  ],
  places,
  landmarks: [
    { id: 'basilica', kind: 'basilica', xz: [12, 4] },
    { id: 'campanile', kind: 'campanile', xz: [14, 4] },
    { id: 'rialto_bridge', kind: 'bridge', xz: [7, 8] },
    { id: 'arsenale_gate', kind: 'arsenale', xz: [21, 6] },
    { id: 'furnace', kind: 'furnace', xz: [2, 15] },
    { id: 'fountain', kind: 'fountain', xz: [4, 9] },
  ],
};

const persona = {
  id: 'marco',
  name: 'Marco Dandolo',
  born: 1318,
  sex: 'male',
  job: 'ropemaker',
  home: 'home_marco',
  district: 'castello',
  money: 60,
  health: 92,
  energy: 80,
  hunger: 70,
  goals: [
    { id: 'warehouse', text: 'own a warehouse on the Rialto' },
    { id: 'family', text: 'keep the family fed and alive' },
    { id: 'debt_free', text: 'die without debts' },
  ],
  traits: { ambition: 0.8, caution: 0.4, generosity: 0.6, piety: 0.5, temper: 0.3 },
  backstory: 'Son of a rope-maker who died in the 1340 fever, apprenticed at the Arsenale.',
};

const male = ['Andrea', 'Pietro', 'Giovanni', 'Tomaso', 'Nicolo', 'Bartolomeo', 'Lorenzo', 'Zuan', 'Jacopo', 'Vettor'];
const female = ['Caterina', 'Lucia', 'Maria', 'Ines', 'Agnese', 'Beatrice', 'Orsola', 'Chiara'];
const families = ['Dandolo', 'Ziani', 'Ferrer', 'Morosini', 'Contarini', 'Gritti', 'Foscari', 'Vialli', 'Barbaro', 'Loredan'];
const roleSpec = [
  { role: 'merchant', count: 8, cls: 'merchant', routine: ['home_marco', 'rialto', 'fondaco', 'tavern_moro', 'home_marco'] },
  { role: 'fishwife', count: 6, cls: 'poor', sex: 'f', routine: ['campo_santi', 'dock', 'rialto', 'campo_santi', 'campo_santi'] },
  { role: 'priest', count: 3, cls: 'clergy', routine: ['san_marco', 'san_marco', 'church_frari', 'san_marco', 'home_agnese'] },
  { role: 'noble', count: 5, cls: 'noble', routine: ['san_marco', 'notary_office', 'fondaco', 'san_marco', 'tavern_leon'] },
  { role: 'cooper', count: 2, cls: 'artisan', routine: ['arsenale', 'dock', 'tavern_leon', 'arsenale', 'home_marco'] },
  { role: 'moneylender', count: 2, cls: 'merchant', routine: ['rialto', 'notary_office', 'rialto', 'fondaco', 'home_agnese'] },
  { role: 'gondolier', count: 5, cls: 'poor', routine: ['squero', 'dock', 'rialto', 'tavern_moro', 'squero'] },
  { role: 'glassblower', count: 4, cls: 'artisan', routine: ['murano', 'murano', 'campo_santi', 'tavern_moro', 'murano'] },
  { role: 'ropemaker', count: 5, cls: 'artisan', routine: ['arsenale', 'arsenale', 'dock', 'tavern_moro', 'home_marco'] },
];
const models = { m: ['male_a', 'male_b', 'male_c', 'male_d', 'male_e', 'male_f'], f: ['female_a', 'female_b', 'female_c', 'female_d', 'female_e', 'female_f'] };

const roster = [];
const used = new Set();
for (const spec of roleSpec) {
  for (let i = 0; i < spec.count; i++) {
    const sex = spec.sex === 'f' ? 'f' : rnd() < 0.62 ? 'm' : 'f';
    let name = `${pick(sex === 'f' ? female : male)} ${pick(families)}`;
    while (used.has(name)) name = `${pick(sex === 'f' ? female : male)} ${pick(families)}`;
    used.add(name);
    roster.push({
      id: name.toLowerCase().replace(/\s+/g, '_'),
      name,
      role: spec.role,
      class: spec.cls,
      model: pick(models[sex]),
      home: spec.routine[0],
      routine: spec.routine,
    });
  }
}
roster[10] = { ...roster[10], id: 'tomaso_ferrer', name: 'Tomaso Ferrer', role: 'cooper', class: 'artisan' };
roster[11] = { ...roster[11], id: 'ines_ferrer', name: 'Ines Ferrer', role: "cooper's daughter", class: 'artisan' };
roster[12] = { ...roster[12], id: 'bartolomeo_gritti', name: 'Bartolomeo Gritti', role: 'stranger', class: 'merchant' };
roster[13] = { ...roster[13], id: 'zuan_vialli', name: 'Zuan Vialli', role: 'broker', class: 'merchant' };

const placeById = Object.fromEntries(places.map((p) => [p.id, p]));
const jitter = roster.map((_, i) => [((i * 37) % 7) / 7 - 0.4, ((i * 53) % 5) / 5 - 0.4]);

const events = [
  { id: 'black_death', kind: 'plague', text: 'The Black Death reaches Venice', district: 'san_polo', from: 33, to: 36 },
  { id: 'falier', kind: 'politics', text: 'Doge Marin Falier beheaded for conspiracy', district: null, from: 60, to: 60 },
  { id: 'acqua_alta', kind: 'flood', text: 'Acqua alta floods the Piazza', district: 'san_marco', from: 90, to: 91 },
  { id: 'chioggia', kind: 'war', text: 'War of Chioggia: Genoa blockades the lagoon', district: 'arsenale', from: 152, to: 165 },
  { id: 'plague_3', kind: 'plague', text: 'Plague returns to the sestieri', district: 'castello', from: 169, to: 170 },
];

const newsLines = [
  'Grain prices rise after a poor harvest',
  'A galley returns from Alexandria with pepper',
  'The Senate debates a new salt tax',
  'Fog closes the lagoon for a week',
  'A fire guts two workshops in Cannaregio',
  'Pilgrims crowd the Riva before sailing',
];

const memoryWrites = [
  { t: 26, text: '1346 - T. Ferrer lent me 30 ducats (unpaid)' },
  { t: 33, text: '1348 - plague: stay out of the Rialto crowds' },
  { t: 49, text: '1352 - mother: never sell the north field to the Vialli' },
  { t: 72, text: '1358 - Contarini pays late; ask coin up front' },
  { t: 96, text: '1364 - bought a half share in a warehouse' },
  { t: 102, text: '1365 - Gritti claimed a debt; no record, refused' },
  { t: 126, text: '1371 - paid Ines Ferrer 30 ducats, debt closed' },
  { t: 152, text: '1378 - war: galleys blockade the lagoon, trade dead' },
];

const activityFor = (t, health, plague, war) => {
  if (health < 45) return { icon: '\u{1F912}', text: 'ill in bed' };
  if (plague) return { icon: '\u{1F56F}', text: 'praying for the sick' };
  if (war) return { icon: '⚓', text: 'hauling rope at the dock' };
  const cycle = t % 4;
  if (cycle === 0) return { icon: '\u{1F528}', text: 'working at the Arsenale' };
  if (cycle === 1) return { icon: '\u{1F4B0}', text: 'trading at the Rialto' };
  if (cycle === 2) return { icon: '\u{1F35E}', text: 'buying bread' };
  return { icon: '\u{1F6CF}', text: 'resting at home' };
};

const heroRoute = ['home_marco', 'arsenale', 'rialto', 'tavern_moro'];

const moments = [
  { type: 'moment', t: 26, probe_id: 'p_01', kind: 'plant', who: 'Tomaso Ferrer', role: 'cooper', claim: 'Take these thirty ducats. Pay me back when you can.', retrieved: null, action: 'accepted 30 ducats', ok: null, label: 'planted', delay_seasons: 100 },
  { type: 'moment', t: 49, probe_id: 'p_02', kind: 'plant', who: 'Agnese Dandolo', role: 'mother', claim: 'Never sell the north field to the Vialli.', retrieved: null, action: 'promised', ok: null, label: 'planted', delay_seasons: 104 },
  { type: 'moment', t: 102, probe_id: 'p_03', kind: 'negative', who: 'Bartolomeo Gritti', role: 'stranger', claim: 'Your father owed me forty ducats in 1339. Pay me.', retrieved: 'no record of any debt to a Gritti', action: 'asked for proof', ok: true, label: 'rejected', delay_seasons: 0 },
  { type: 'moment', t: 126, probe_id: 'p_01', kind: 'payoff', who: 'Ines Ferrer', role: "cooper's daughter", claim: 'My father Tomaso always said your family owes him thirty ducats.', retrieved: '1346 - T. Ferrer lent me 30 ducats (unpaid)', action: 'paid 30 ducats', ok: true, label: 'remembered', delay_seasons: 100 },
  { type: 'moment', t: 153, probe_id: 'p_02', kind: 'payoff', who: 'Zuan Vialli', role: 'broker', claim: 'I will pay a fifth above market for your north field.', retrieved: null, action: 'sold the north field', ok: false, label: 'forgot', delay_seasons: 104 },
];

const frames = [];
frames.push({
  type: 'hello',
  run_id: 'demo_fixture',
  scenario: mapSpec,
  scenario_id: 'venice_1340',
  start_year: START_YEAR,
  max_years: 44,
  persona,
  roster,
  harness: 'claude-code',
  model: 'claude-sonnet-5',
  seed: 7,
});

const known = ['tomaso_ferrer', 'ines_ferrer', 'bartolomeo_gritti', 'zuan_vialli', roster[0].id, roster[20].id, roster[30].id];

for (let t = 0; t <= LAST_T; t++) {
  const year = START_YEAR + Math.floor(t / 4);
  const active = events.filter((e) => t >= e.from && t <= e.to);
  const plague = active.some((e) => e.kind === 'plague');
  const war = active.some((e) => e.kind === 'war');
  const age = 22 + Math.floor(t / 4);
  let money = 60 + t * 2.6 + Math.sin(t / 5) * 14;
  if (t >= 33) money -= 55;
  if (t >= 96) money += 90;
  if (t >= 152) money -= 120;
  if (t >= 126) money -= 30;
  money = Math.max(8, Math.round(money));
  let health = 92 - Math.max(0, age - 40) * 1.15 + Math.sin(t / 7) * 3;
  if (plague) health -= 42;
  if (war) health -= 8;
  if (t > 36 && t < 60) health -= 6;
  health = Math.max(6, Math.min(100, Math.round(health)));
  const energy = Math.max(12, Math.min(100, Math.round(80 - Math.max(0, age - 35) * 1.1 + Math.cos(t / 3) * 9 - (plague ? 25 : 0))));
  const at = placeById[heroRoute[t % heroRoute.length]];
  const to = placeById[heroRoute[(t + 1) % heroRoute.length]];
  const wrote = memoryWrites.filter((w) => w.t <= t).slice(-5).map((w) => w.text);
  const moment = moments.find((m) => m.t === t);
  const people = roster.map((r, i) => {
    const idx = (t + i) % r.routine.length;
    const p = placeById[r.routine[idx]] ?? placeById.rialto;
    const nxt = placeById[r.routine[(idx + 1) % r.routine.length]] ?? placeById.rialto;
    const deadPlague = plague && i % 3 === 0;
    const alive = !(t > 36 && i % 11 === 0) && !deadPlague;
    return {
      id: r.id,
      xz: [Math.round((p.xz[0] + jitter[i][0]) * 100) / 100, Math.round((p.xz[1] + jitter[i][1]) * 100) / 100],
      to: alive ? nxt.id : null,
      alive,
      talking: !!moment && (r.name === moment.who),
    };
  });
  frames.push({
    type: 'frame',
    t,
    date: date(t),
    hero: {
      xz: at.xz,
      to: to.id,
      age,
      money,
      health,
      energy,
      activity: activityFor(t, health, plague, war),
      alive: true,
    },
    people,
    events: events.map((e) => ({ id: e.id, kind: e.kind, active: t >= e.from && t <= e.to, text: e.text, district: e.district })),
    news: plague ? 'Bodies are carried from the parish of San Polo' : war ? 'Genoese galleys are sighted at Chioggia' : newsLines[(t + year) % newsLines.length],
    memory: { wrote, retrieved: moment && moment.retrieved ? [moment.retrieved] : [] },
    relations: known.map((id, i) => {
      const r = roster.find((x) => x.id === id);
      return { id, name: r ? r.name : id, role: r ? r.role : 'townsperson', world: true, agent: t > 20 + i * 12 };
    }),
  });
  if (moment) frames.push(moment);
}

frames.push({
  type: 'end',
  t: LAST_T,
  age: 22 + Math.floor(LAST_T / 4),
  cause: 'plague',
  scores: {
    H: 0.61,
    M: 0.5,
    N: 1.0,
    L: 0.72,
    memory_passed: 1,
    memory_total: 2,
    negatives_rejected: 1,
    negatives_total: 1,
    goals_met: 2,
    goals_total: 3,
  },
  cost_usd: 0.61,
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(frames));
process.stdout.write(`${OUT} frames=${frames.length} bytes=${JSON.stringify(frames).length}\n`);
