import { AdditiveBlending, Group, Mesh, MeshBasicMaterial, RingGeometry, Scene, Vector3 } from 'three';
import type { HeroFrame, Persona, XZ } from '../state/schema';
import type { Character } from './characters';
import { sharedCharacters } from './characters';
import { PathFollower } from './path';
import type { WorldHandles } from './types';
import { tileSizeOf } from './types';

const SLEEP_ICON = '🛏';
export const HERO_LAYER = 1;
const GOLD = 0xd9a441;

export interface Hero {
  applyFrame(hero: HeroFrame): void;
  update(dt: number): void;
  position(): Vector3;
  dispose(): void;
}

function startTile(world: WorldHandles, persona: Persona): XZ {
  try {
    const xz = world.placeXZ(persona.home);
    if (Array.isArray(xz)) return [xz[0], xz[1]];
  } catch {
    // persona home may be missing from a partial map; start at the grid centre
  }
  return [Math.floor(world.grid.cols / 2), Math.floor(world.grid.rows / 2)];
}

export function createHero(scene: Scene, world: WorldHandles, persona: Persona): Hero {
  const group = new Group();
  group.name = 'hero';
  group.layers.enable(HERO_LAYER);
  scene.add(group);

  const tile = tileSizeOf(world);
  const bodyHeight = tile * 0.92;
  const follower = new PathFollower(world, startTile(world, persona), 1.05);

  const ringGeometry = new RingGeometry(tile * 0.38, tile * 0.56, 40);
  const ringMaterial = new MeshBasicMaterial({
    color: GOLD,
    transparent: true,
    opacity: 0.7,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const ring = new Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 5;
  ring.layers.enable(HERO_LAYER);
  group.add(ring);

  const body = new Group();
  group.add(body);

  let character: Character | null = null;
  let sleeping = false;
  let alive = true;
  let pulse = 0;

  void sharedCharacters()
    .then((library) => {
      character = library.create(persona.sex === 'female' ? 'female-e' : 'male-e', 'hero', bodyHeight);
      character.root.scale.multiplyScalar(1.3);
      body.add(character.root);
      group.traverse((node) => node.layers.enable(HERO_LAYER));
    })
    .catch((error) => console.warn('[actors] hero model unavailable', error));

  const applyFrame = (frame: HeroFrame) => {
    sleeping = frame.activity?.icon === SLEEP_ICON;
    if (!frame.alive && alive) {
      alive = false;
      character?.playClip('die', 0.2);
    }
    if (frame.alive && !alive) {
      alive = true;
      follower.teleport(frame.xz);
    }
    if (alive) follower.setTarget(frame.xz);
  };

  const update = (dt: number) => {
    if (alive) follower.update(dt);
    body.position.copy(follower.position);
    body.rotation.y = follower.heading;
    ring.position.set(follower.position.x, follower.position.y + 0.02 * tile, follower.position.z);
    pulse += dt;
    const wave = 0.86 + Math.sin(pulse * 2.2) * 0.08;
    ring.scale.setScalar(wave);
    ringMaterial.opacity = alive ? 0.5 + Math.sin(pulse * 2.2) * 0.16 : 0.15;
    if (character) {
      if (alive) character.playClip(follower.moving ? 'walk' : sleeping ? 'sit' : 'idle');
      character.mixer.update(dt);
    }
  };

  return {
    applyFrame,
    update,
    position: () => follower.position.clone(),
    dispose: () => {
      character?.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      group.removeFromParent();
    },
  };
}
