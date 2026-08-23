import { Color, Fog, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { CAMERA_RADIUS } from '../../world/constants';
import { createCamera } from '../../actors/camera';
import { createEffects } from '../../actors/effects';
import { createHero } from '../../actors/hero';
import { createPeople } from '../../actors/people';
import type { Frame, HelloFrame } from '../../state/schema';
import type { InterpFrame, Store } from '../../state/store';
import { buildWorld, preloadWorld } from '../../world/citygen';
import { createFallbackStage, type Stage } from './fallback_stage';

export type { Stage } from './fallback_stage';

function envOf(frame: InterpFrame | null): { season: number; plague: boolean; war: boolean } {
  const active = frame?.events.filter((e) => e.active) ?? [];
  return {
    season: frame ? Math.floor(frame.t) % 4 : 0,
    plague: active.some((e) => e.kind === 'plague'),
    war: active.some((e) => e.kind === 'war'),
  };
}

export async function createStage(renderer: WebGLRenderer, store: Store): Promise<Stage> {
  const hello: HelloFrame | null = store.hello;
  if (!hello) return createFallbackStage(renderer, null);
  try {
    await preloadWorld();
  } catch (err) {
    console.warn('[stage] kit assets unavailable', err);
  }
  let built;
  try {
    const scene = new Scene();
    scene.background = new Color(0x101826);
    scene.fog = new Fog(0x101826, 80, 260);
    const world = buildWorld(scene, hello.scenario, hello.seed ?? 0);
    const rig = createCamera(renderer, world);
    const hero = createHero(scene, world, hello.persona);
    const people = createPeople(scene, world, hello.roster);
    const effects = createEffects(scene, world);
    built = { scene, world, rig, hero, people, effects };
  } catch (err) {
    console.error('[stage] world build failed, falling back to primitives', err);
    return createFallbackStage(renderer, hello);
  }

  const { scene, world, rig, hero, people, effects } = built;
  const size = new Vector2();
  const centre = world.tileToWorld([Math.floor(world.grid.cols / 2), Math.floor(world.grid.rows / 2)]).clone();
  let lastIndex = -1;

  return {
    scene,
    camera: rig.camera,
    kit: true,
    update(dt, frame, index) {
      if (frame && index !== lastIndex) {
        lastIndex = index;
        hero.applyFrame(frame.hero);
        people.applyFrame({ type: 'frame', ...frame } as Frame);
      }
      world.update(dt, envOf(frame));
      // world/lighting.ts ranges the fog from CAMERA_RADIUS; the orbit rig actually sits further out,
      // so without this shift the whole diorama sits past fog.far and renders as flat fog.
      const fog = scene.fog as Fog | null;
      if (fog) {
        const shift = rig.camera.position.distanceTo(centre) - CAMERA_RADIUS;
        if (shift > 0) {
          fog.near += shift;
          fog.far += shift;
        }
      }
      hero.update(dt);
      people.update(dt);
      effects.update(dt);
      rig.follow(hero.position());
      rig.update(dt);
    },
    heroPosition: () => hero.position(),
    project: (v: Vector3) => rig.project(v),
    pick: (ndc: Vector2) => people.pick(ndc, rig.camera),
    toggleCamera: () => rig.toggle(),
    setSepia: (on: boolean) => effects.setSepia(on),
    highlight(personId) {
      if (!personId) {
        effects.clearHighlight();
        return;
      }
      effects.highlight(() => people.positionOf(personId), () => hero.position(), 6);
    },
    resize() {
      renderer.getSize(size);
    },
  };
}
