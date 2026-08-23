import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { createCamera } from '../actors/camera';
import { createEffects } from '../actors/effects';
import { createHero } from '../actors/hero';
import { createPeople } from '../actors/people';
import type { WorldHandles } from '../actors/types';
import type { Frame, MapSpec, Persona, PersonFrame, RosterEntry, XZ } from '../state/schema';

const COLS = 24;
const ROWS = 18;
const TILE = 2.4;
const SEASON_MS = 2200;

const NAMES = ['Marco', 'Andrea', 'Pietro', 'Giovanni', 'Tomaso', 'Nicolò', 'Caterina', 'Lucia', 'Ines', 'Agnese'];
const FAMILIES = ['Dandolo', 'Ziani', 'Ferrer', 'Morosini', 'Contarini', 'Gritti', 'Foscari', 'Vialli'];
const ROLES = [
  ['merchant', 'merchant'], ['noble', 'noble'], ['priest', 'clergy'],
  ['fishwife', 'poor'], ['cooper', 'commoner'], ['moneylender', 'merchant'],
] as const;

const PLACES: { id: string; kind: string; xz: XZ }[] = [
  { id: 'home_marco', kind: 'home', xz: [4, 4] }, { id: 'rialto', kind: 'market', xz: [12, 8] },
  { id: 'arsenale', kind: 'work', xz: [20, 14] }, { id: 'san_marco', kind: 'church', xz: [12, 4] },
  { id: 'tavern_moro', kind: 'tavern', xz: [7, 12] }, { id: 'dock', kind: 'dock', xz: [3, 15] },
];

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mapSpec(): MapSpec {
  return {
    size: { cols: COLS, rows: ROWS },
    water: [{ kind: 'canal', axis: 'x', at: 9 }],
    districts: [{ id: 'castello', name: 'Castello', tiles: [[0, 0], [COLS - 1, ROWS - 1]] }],
    places: PLACES.map((p) => ({ id: p.id, kind: p.kind as never, district: 'castello', xz: p.xz, name: p.id, price_mult: 1 })),
    landmarks: [{ id: 'campanile', kind: 'campanile', xz: [13, 6] }],
  };
}

function roster(count: number): RosterEntry[] {
  const random = rng(7);
  const routine = PLACES.map((place) => place.id);
  return Array.from({ length: count }, (_, i) => {
    const [role, klass] = ROLES[i % ROLES.length] as readonly [string, string];
    const name = NAMES[Math.floor(random() * NAMES.length)] as string;
    const family = FAMILIES[Math.floor(random() * FAMILIES.length)] as string;
    const home = (PLACES[i % PLACES.length] as { id: string }).id;
    return { id: `npc_${i}`, name: `${name} ${family}`, role, class: klass, model: '', home, routine };
  });
}

function persona(): Persona {
  return {
    id: 'marco', name: 'Marco Dandolo', born: 1318, sex: 'male', job: 'ropemaker', home: 'home_marco',
    district: 'castello', money: 60, health: 92, energy: 80, hunger: 70,
    goals: [{ id: 'warehouse', text: 'own a warehouse on the Rialto' }],
    traits: { ambition: 0.8 }, backstory: 'Son of a rope-maker.',
  };
}

function flatWorld(scene: Scene): WorldHandles {
  const walkable: boolean[][] = Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => true));
  const random = rng(11);
  const blocks: XZ[] = [];
  for (let x = 0; x < COLS; x += 1) {
    for (let z = 0; z < ROWS; z += 1) {
      const nearPlace = PLACES.some((place) => Math.abs(place.xz[0] - x) + Math.abs(place.xz[1] - z) < 3);
      if (!nearPlace && random() < 0.13) {
        (walkable[x] as boolean[])[z] = false;
        blocks.push([x, z]);
      }
    }
  }

  const tileToWorld = (xz: XZ) => new Vector3((xz[0] - COLS / 2) * TILE, 0, (xz[1] - ROWS / 2) * TILE);

  const dummy = new Object3D();
  const color = new Color();
  const slab = (w: number, h: number, count: number) =>
    new InstancedMesh(new BoxGeometry(w, h, w), new MeshStandardMaterial({ roughness: 1, metalness: 0 }), count);
  const put = (mesh: InstancedMesh, at: number, xz: XZ, y: number, hex: number) => {
    const world = tileToWorld(xz);
    dummy.position.set(world.x, y, world.z);
    dummy.updateMatrix();
    mesh.setMatrixAt(at, dummy.matrix);
    mesh.setColorAt(at, color.set(hex));
  };

  const ground = slab(TILE, TILE * 0.25, COLS * ROWS);
  ground.receiveShadow = true;
  for (let x = 0; x < COLS; x += 1) {
    for (let z = 0; z < ROWS; z += 1) {
      put(ground, x * ROWS + z, [x, z], -TILE * 0.125, (x + z) % 2 === 0 ? 0x9c9276 : 0x8d8469);
    }
  }

  const houses = slab(TILE * 0.86, TILE * 1.6, Math.max(1, blocks.length));
  houses.castShadow = true;
  houses.receiveShadow = true;
  blocks.forEach((xz, at) => put(houses, at, xz, TILE * 0.8, [0xc08457, 0xb4573f, 0xd9c9a8, 0xa9705c][at % 4] as number));
  scene.add(ground, houses);

  return {
    tileToWorld,
    isWalkable: (x, z) => walkable[x]?.[z] === true,
    grid: { cols: COLS, rows: ROWS, walkable },
    placeXZ: (placeId) => (PLACES.find((place) => place.id === placeId)?.xz ?? [COLS / 2, ROWS / 2]) as XZ,
    update: () => undefined,
    dispose: () => {
      ground.geometry.dispose();
      houses.geometry.dispose();
      scene.remove(ground, houses);
    },
  };
}

async function tryBuildWorld(scene: Scene, spec: MapSpec): Promise<WorldHandles | null> {
  const modules = import.meta.glob('../world/*.ts');
  const names = ['citygen', 'index', 'build', 'world', 'scene'];
  const rank = (path: string) => {
    const at = names.findIndex((name) => path.includes(name));
    return at < 0 ? names.length : at;
  };
  const paths = Object.keys(modules).sort((a, b) => rank(a) - rank(b));
  for (const path of paths) {
    try {
      const loader = modules[path];
      if (!loader) continue;
      const mod = (await loader()) as Record<string, unknown>;
      const build = mod.buildWorld;
      if (typeof build !== 'function') continue;
      if (typeof mod.preloadWorld === 'function') await (mod.preloadWorld as () => Promise<void>)();
      const handles = (await build(scene, spec, 7)) as WorldHandles;
      if (handles && typeof handles.tileToWorld === 'function' && handles.grid) return handles;
    } catch (error) {
      console.warn('[actors-demo] world module not usable', path, error);
    }
  }
  return null;
}

export interface ActorsDemoOptions { world?: 'auto' | 'flat' }

export async function mountActorsDemo(root: HTMLElement, options: ActorsDemoOptions = {}): Promise<() => void> {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(root.clientWidth || innerWidth, root.clientHeight || innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.domElement.style.display = 'block';
  root.appendChild(renderer.domElement);

  const style = document.createElement('style');
  style.textContent = '.vb-sepia canvas { filter: sepia(0.75) contrast(1.05) brightness(0.9); }';
  document.head.appendChild(style);

  const scene = new Scene();
  const spec = mapSpec();
  const mode = options.world ?? (new URLSearchParams(location.search).get('world') === 'flat' ? 'flat' : 'auto');
  const built = mode === 'flat' ? null : await tryBuildWorld(scene, spec);
  const world = built ?? flatWorld(scene);
  if (!built) {
    scene.background = new Color(0x8fb6c8);
    scene.fog = new Fog(0x8fb6c8, 90, 260);
    const sun = new DirectionalLight(0xfff0d4, 2.4);
    sun.position.set(40, 70, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60 });
    scene.add(sun, new HemisphereLight(0xcfe4ef, 0x6b6350, 1.5));
  }
  const cast = roster(30);
  const people = createPeople(scene, world, cast);
  const hero = createHero(scene, world, persona());
  const rig = createCamera(renderer, world);
  const effects = createEffects(scene, world);
  rig.setMode('follow');

  const random = rng(3);
  const walkableTile = (): XZ => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const x = Math.floor(random() * world.grid.cols);
      const z = Math.floor(random() * world.grid.rows);
      if (world.isWalkable(x, z)) return [x, z];
    }
    return world.placeXZ(PLACES[0]?.id ?? 'rialto');
  };

  let t = 0;
  const dead = new Set<string>();
  const nextFrame = (): Frame => {
    t += 1;
    if (t > 8 && t % 7 === 0) {
      const victim = cast[Math.floor(random() * cast.length)];
      if (victim) dead.add(victim.id);
    }
    const crowd: PersonFrame[] = cast.map((entry) => ({
      id: entry.id, xz: walkableTile(), to: null, alive: !dead.has(entry.id), talking: random() < 0.08,
    }));
    const icons = ['🔨', '🚶', '🛏', '🥖'];
    return {
      type: 'frame', t, date: `Season ${t}`,
      hero: {
        xz: walkableTile(), to: null, age: 22 + Math.floor(t / 4), money: 60 + t * 3,
        health: 92, energy: 70, activity: { icon: icons[t % icons.length] as string, text: 'living' }, alive: true,
      },
      people: crowd,
      events: [], news: '', memory: { wrote: [], retrieved: [] }, relations: [],
    };
  };

  const step = () => {
    const frame = nextFrame();
    people.applyFrame(frame);
    hero.applyFrame(frame.hero);
    if (t % 5 === 0) {
      const who = cast[Math.floor(random() * cast.length)];
      if (who) effects.highlight(() => people.positionOf(who.id), () => hero.position(), 4);
    }
    effects.setSepia(t > 24);
  };
  step();
  const timer = window.setInterval(step, SEASON_MS);

  const ndc = new Vector2();
  const onClick = (event: MouseEvent) => {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const id = people.pick(ndc, rig.camera);
    if (id) console.info('[actors-demo] picked', cast.find((entry) => entry.id === id)?.name ?? id);
  };
  renderer.domElement.addEventListener('click', onClick);
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    rig.toggle();
  };
  window.addEventListener('keydown', onKey);

  let last = performance.now();
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    people.update(dt);
    hero.update(dt);
    effects.update(dt);
    rig.follow(hero.position());
    rig.update(dt);
    world.update(dt, { t, season: t % 4, plague: false, war: false });
    renderer.render(scene, rig.camera);
    const crowd = scene.getObjectByName('people');
    document.body.dataset.actorsDemo = crowd && crowd.children.length > 1 ? 'ready' : 'loading';
  };
  loop();

  const onResize = () => renderer.setSize(root.clientWidth || innerWidth, root.clientHeight || innerHeight);
  window.addEventListener('resize', onResize);

  return () => {
    cancelAnimationFrame(raf);
    window.clearInterval(timer);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    renderer.domElement.removeEventListener('click', onClick);
    effects.dispose();
    hero.dispose();
    people.dispose();
    rig.dispose();
    world.dispose();
    renderer.dispose();
    style.remove();
    renderer.domElement.remove();
  };
}
