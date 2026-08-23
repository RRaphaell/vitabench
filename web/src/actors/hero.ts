import {
  AdditiveBlending, BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PointLight, RingGeometry,
  Scene, TorusGeometry, Vector3,
} from 'three';
import type { HeroFrame, Persona, PlaceKind, XZ } from '../state/schema';
import { doorstepOf, liveMap, publishHeroAt, publishHeroMood, talkTarget } from '../world/live';
import type { Character } from './characters';
import { sharedCharacters } from './characters';
import { PathFollower } from './path';
import type { WorldHandles } from './types';
import { tileSizeOf } from './types';

const SLEEP_ICON = '🛏';
const REST_ICON = '😴';
const WORK_ICON = '🔨';
const TALK_ICON = '🗣';
const FEAST_ICON = '🍷';
const PRAY_ICON = '🙏';
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

function namedPlace(text: string, kind: PlaceKind, from: XZ): XZ | null {
  const map = liveMap();
  if (!map) return null;
  const lower = text.toLowerCase();
  let nearest: XZ | null = null;
  let best = Infinity;
  for (const place of map.places) {
    if (place.kind !== kind) continue;
    if (lower.includes(place.name.toLowerCase())) return place.xz;
    const d = Math.hypot(place.xz[0] - from[0], place.xz[1] - from[1]);
    if (d < best) {
      best = d;
      nearest = place.xz;
    }
  }
  return nearest;
}

export function createHero(scene: Scene, world: WorldHandles, persona: Persona): Hero {
  const group = new Group();
  group.name = 'hero';
  group.layers.enable(HERO_LAYER);
  scene.add(group);

  const tile = tileSizeOf(world);
  const bodyHeight = tile * 0.92;
  const home = startTile(world, persona);
  const follower = new PathFollower(world, home, 1.45);

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

  const props = new Group();
  props.name = 'hero_props';
  props.visible = false;
  scene.add(props);
  const anvilGeometry = new BoxGeometry(tile * 0.34, tile * 0.18, tile * 0.2);
  const anvil = new Mesh(anvilGeometry, new MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.8 }));
  anvil.position.y = tile * 0.16;
  anvil.castShadow = true;
  props.add(anvil);
  const hammer = new Group();
  const handleGeometry = new BoxGeometry(tile * 0.05, tile * 0.34, tile * 0.05);
  const handle = new Mesh(handleGeometry, new MeshStandardMaterial({ color: 0x8a6440, roughness: 0.9 }));
  handle.position.y = tile * 0.17;
  hammer.add(handle);
  const headGeometry = new BoxGeometry(tile * 0.16, tile * 0.11, tile * 0.11);
  const head = new Mesh(headGeometry, new MeshStandardMaterial({ color: 0x6b7078, roughness: 0.7 }));
  head.position.y = tile * 0.36;
  hammer.add(head);
  hammer.position.set(tile * 0.16, tile * 0.24, 0);
  props.add(hammer);
  const coilGeometry = new TorusGeometry(tile * 0.17, tile * 0.05, 6, 14);
  const coil = new Mesh(coilGeometry, new MeshStandardMaterial({ color: 0xc7a06a, roughness: 1 }));
  coil.rotation.x = -Math.PI / 2;
  coil.position.set(-tile * 0.34, tile * 0.06, tile * 0.1);
  coil.castShadow = true;
  props.add(coil);

  const lamp = new PointLight(0xffc271, 0, tile * 5.5, 1.6);
  lamp.name = 'hearth';
  scene.add(lamp);
  const homeAt = world.tileToWorld(home);
  lamp.position.set(homeAt.x, tile * 1.1, homeAt.z);

  let character: Character | null = null;
  let icon = '';
  let alive = true;
  let pulse = 0;
  let working = 0;

  void sharedCharacters()
    .then((library) => {
      character = library.create(persona.sex === 'female' ? 'female-e' : 'male-e', 'hero', bodyHeight);
      character.root.scale.multiplyScalar(1.3);
      body.add(character.root);
      group.traverse((node) => node.layers.enable(HERO_LAYER));
    })
    .catch((error) => console.warn('[actors] hero model unavailable', error));

  const destination = (frame: HeroFrame): XZ => {
    const text = frame.activity?.text ?? '';
    if (icon === WORK_ICON) return doorstepOf(namedPlace(text, 'work', home) ?? frame.xz);
    if (icon === FEAST_ICON) return doorstepOf(namedPlace(text, 'tavern', home) ?? frame.xz);
    if (icon === PRAY_ICON) return doorstepOf(namedPlace(text, 'church', home) ?? frame.xz);
    if (icon === TALK_ICON || icon === SLEEP_ICON || icon === REST_ICON) return doorstepOf(home);
    return doorstepOf(frame.xz);
  };

  const applyFrame = (frame: HeroFrame) => {
    icon = frame.activity?.icon ?? '';
    if (!frame.alive && alive) {
      alive = false;
      character?.playClip('die', 0.2);
    }
    if (frame.alive && !alive) {
      alive = true;
      follower.teleport(frame.xz);
    }
    if (alive) follower.setTarget(destination(frame));
  };

  const facing = new Vector3();
  const update = (dt: number) => {
    if (alive) follower.update(dt);
    body.position.copy(follower.position);
    ring.position.set(follower.position.x, follower.position.y + 0.02 * tile, follower.position.z);
    pulse += dt;
    const wave = 0.86 + Math.sin(pulse * 2.2) * 0.08;
    ring.scale.setScalar(wave);
    ringMaterial.opacity = alive ? 0.5 + Math.sin(pulse * 2.2) * 0.16 : 0.15;

    const sleeping = icon === SLEEP_ICON || icon === REST_ICON;
    const atWork = icon === WORK_ICON && !follower.moving && alive;
    working += ((atWork ? 1 : 0) - working) * Math.min(1, dt * 3);
    props.visible = working > 0.05;
    if (props.visible) {
      props.position.copy(follower.position);
      props.rotation.y = follower.heading;
      props.scale.setScalar(working);
      hammer.rotation.z = -0.9 + Math.abs(Math.sin(pulse * 3.4)) * 1.2;
      coil.rotation.z += dt * 0.9;
    }
    lamp.intensity = sleeping && alive ? 2.4 + Math.sin(pulse * 1.4) * 0.5 : 0;

    const talk = talkTarget();
    if (talk && !follower.moving && alive) {
      facing.copy(talk.npc).sub(follower.position);
      if (facing.lengthSq() > 1e-4) follower.heading = Math.atan2(facing.x, facing.z);
    }
    body.rotation.y = follower.heading;

    publishHeroAt(follower.position);
    publishHeroMood(icon === TALK_ICON);

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
      anvilGeometry.dispose();
      handleGeometry.dispose();
      headGeometry.dispose();
      coilGeometry.dispose();
      props.removeFromParent();
      lamp.removeFromParent();
      group.removeFromParent();
    },
  };
}
