import {
  CapsuleGeometry,
  Camera,
  Color,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Object3D,
  Scene,
  Vector2,
  Vector3,
} from 'three';
import type { Frame, PersonFrame, RosterEntry } from '../state/schema';
import type { AccentClass, Character } from './characters';
import { ACCENT, accentClass, normalizeModel, sharedCharacters } from './characters';
import { PathFollower } from './path';
import type { WorldHandles } from './types';
import { tileSizeOf } from './types';

const MAX_ANIMATED = 60;
const DEATH_HIDE_SECONDS = 4;

interface Person {
  id: string;
  index: number;
  accent: AccentClass;
  model: ReturnType<typeof normalizeModel>;
  follower: PathFollower;
  character: Character | null;
  alive: boolean;
  talking: boolean;
  deadFor: number;
}

export interface People {
  applyFrame(frame: Frame): void;
  update(dt: number): void;
  pick(ndc: Vector2, camera: Camera): string | null;
  positionOf(id: string): Vector3 | null;
  isTalking(id: string): boolean;
  dispose(): void;
}

function homeTile(world: WorldHandles, entry: RosterEntry, index: number): [number, number] {
  try {
    const xz = world.placeXZ(entry.home);
    if (Array.isArray(xz)) return [xz[0], xz[1]];
  } catch {
    // placeXZ may not know this id; fall through to a spread over the grid
  }
  const cols = Math.max(1, world.grid.cols);
  return [(index * 5 + 2) % cols, (index * 3 + 1) % Math.max(1, world.grid.rows)];
}

export function createPeople(scene: Scene, world: WorldHandles, roster: RosterEntry[]): People {
  const group = new Group();
  group.name = 'people';
  scene.add(group);

  const tile = tileSizeOf(world);
  const bodyHeight = tile * 0.8;
  const people: Person[] = roster.map((entry, index) => ({
    id: entry.id,
    index,
    accent: accentClass(entry.class || entry.role),
    model: normalizeModel(entry.model, index),
    follower: new PathFollower(world, homeTile(world, entry, index), 0.75 + ((index % 5) * 0.06)),
    character: null,
    alive: true,
    talking: false,
    deadFor: 0,
  }));
  const byId = new Map(people.map((person) => [person.id, person]));

  const pegGeometry = new CapsuleGeometry(tile * 0.16, bodyHeight * 0.55, 3, 6);
  const pegMaterial = new MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
  const pegs = new InstancedMesh(pegGeometry, pegMaterial, Math.max(1, people.length));
  pegs.instanceMatrix.setUsage(DynamicDrawUsage);
  pegs.castShadow = true;
  pegs.frustumCulled = false;
  pegs.name = 'people-pegs';
  const color = new Color();
  people.forEach((person, i) => pegs.setColorAt(i, color.set(ACCENT[person.accent])));
  if (pegs.instanceColor) pegs.instanceColor.needsUpdate = true;
  group.add(pegs);

  const dummy = new Object3D();
  const hidden = new Matrix4().makeScale(0, 0, 0);
  void sharedCharacters()
    .then((lib) => {
      for (const person of people.slice(0, MAX_ANIMATED)) {
        const character = lib.create(person.model, person.accent, bodyHeight);
        character.root.position.copy(person.follower.position);
        group.add(character.root);
        person.character = character;
      }
    })
    .catch((error) => console.warn('[actors] character models unavailable, using pegs', error));

  const applyPerson = (frame: PersonFrame) => {
    const person = byId.get(frame.id);
    if (!person) return;
    person.talking = frame.talking;
    if (!frame.alive && person.alive) {
      person.alive = false;
      person.deadFor = 0;
      person.character?.playClip('die', 0.15);
    }
    if (frame.alive && !person.alive) {
      person.alive = true;
      person.deadFor = 0;
      if (person.character) person.character.root.visible = true;
      person.follower.teleport(frame.xz);
    }
    if (person.alive) person.follower.setTarget(frame.xz);
  };

  const applyFrame = (frame: Frame) => {
    for (const entry of frame.people) applyPerson(entry);
  };

  const update = (dt: number) => {
    for (const person of people) {
      if (person.alive) person.follower.update(dt);
      else person.deadFor += dt;
      const character = person.character;
      if (character) {
        character.root.position.copy(person.follower.position);
        character.root.rotation.y = person.follower.heading;
        if (person.alive) character.playClip(person.follower.moving ? 'walk' : 'idle');
        else if (person.deadFor > DEATH_HIDE_SECONDS) character.root.visible = false;
        character.mixer.update(dt);
        pegs.setMatrixAt(person.index, hidden);
        continue;
      }
      if (!person.alive && person.deadFor > DEATH_HIDE_SECONDS) {
        pegs.setMatrixAt(person.index, hidden);
        continue;
      }
      dummy.position.copy(person.follower.position);
      dummy.position.y += bodyHeight * 0.45;
      dummy.rotation.set(person.alive ? 0 : Math.PI / 2, person.follower.heading, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      pegs.setMatrixAt(person.index, dummy.matrix);
    }
    pegs.instanceMatrix.needsUpdate = true;
  };

  const projected = new Vector3();
  const pick = (ndc: Vector2, camera: Camera): string | null => {
    let bestId: string | null = null;
    let bestDistance = 0.06;
    for (const person of people) {
      if (!person.alive && person.deadFor > DEATH_HIDE_SECONDS) continue;
      projected.copy(person.follower.position);
      projected.y += bodyHeight * 0.6;
      projected.project(camera);
      if (projected.z > 1) continue;
      const distance = Math.hypot(projected.x - ndc.x, projected.y - ndc.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestId = person.id;
      }
    }
    return bestId;
  };

  return {
    applyFrame,
    update,
    pick,
    positionOf: (id) => {
      const person = byId.get(id);
      return person ? person.follower.position.clone() : null;
    },
    isTalking: (id) => byId.get(id)?.talking === true,
    dispose: () => {
      for (const person of people) person.character?.dispose();
      pegGeometry.dispose();
      pegMaterial.dispose();
      pegs.dispose();
      group.removeFromParent();
    },
  };
}
