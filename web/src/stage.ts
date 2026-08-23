import {
  Color, Fog, GreaterDepth, type Light, MeshBasicMaterial, OrthographicCamera, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import { CAMERA_RADIUS } from './world/constants';
import { createCamera } from './actors/camera';
import { createEffects } from './actors/effects';
import { HERO_LAYER, createHero } from './actors/hero';
import { createPeople } from './actors/people';
import type { Frame, HelloFrame, MapSpec } from './state/schema';
import type { InterpFrame } from './state/store';
import { buildWorld, preloadWorld } from './world/citygen';

export interface Stage {
  scene: Scene;
  camera: OrthographicCamera;
  update(dt: number, frame: InterpFrame | null, index: number): void;
  render(renderer: WebGLRenderer): void;
  heroPosition(): Vector3;
  project(v: Vector3): { x: number; y: number };
  pick(ndc: Vector2): string | null;
  toggleCamera(): void;
  setCameraMode(mode: 'follow' | 'overview'): void;
  pushOverview(seconds: number): void;
  focusOn(personId: string | null): void;
  highlight(personId: string | null): void;
  talkingBubble(): { id: string; at: Vector3 } | null;
  setSepia(on: boolean): void;
}

function envOf(frame: InterpFrame | null): { season: number; plague: boolean; war: boolean } {
  const active = frame?.events.filter((e) => e.active) ?? [];
  return {
    season: frame ? Math.floor(frame.t) % 4 : 0,
    plague: active.some((e) => e.kind === 'plague'),
    war: active.some((e) => e.kind === 'war'),
  };
}

function plagueZone(map: MapSpec, toWorld: (xz: [number, number]) => Vector3) {
  const market = map.places.find((p) => p.kind === 'market');
  const district = map.districts.find((d) => d.id === market?.district) ?? map.districts[0];
  if (!district) return null;
  const [a, b] = district.tiles;
  const centre = toWorld([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  const corner = toWorld([b[0], b[1]]);
  return { centre, radius: Math.max(3, centre.distanceTo(corner) * 0.8) };
}

export async function createStage(renderer: WebGLRenderer, hello: HelloFrame): Promise<Stage> {
  await preloadWorld();
  const scene = new Scene();
  scene.background = new Color(0x101826);
  scene.fog = new Fog(0x101826, 80, 260);
  const world = buildWorld(scene, hello.scenario, hello.seed ?? 0);
  const rig = createCamera(renderer, world);
  const hero = createHero(scene, world, hello.persona);
  const people = createPeople(scene, world, hello.roster);
  const effects = createEffects(scene, world);
  // the hero renders in a second pass over a cleared depth buffer, so he is never lost behind a facade;
  // lights must see both layers or that pass comes out black.
  scene.traverse((node) => {
    if ((node as Light).isLight) node.layers.enableAll();
  });

  const span = Math.max(world.grid.cols, world.grid.rows);
  const zone = plagueZone(hello.scenario, (xz) => world.tileToWorld(xz));
  const ghost = new MeshBasicMaterial({
    color: 0xd9a441,
    transparent: true,
    opacity: 0.5,
    depthFunc: GreaterDepth,
    depthWrite: false,
    fog: false,
  });
  const focusPoint = new Vector3();
  let focusId: string | null = null;
  let plagueOn = false;
  let lastIndex = -1;

  return {
    scene,
    camera: rig.camera,
    update(dt, frame, index) {
      if (frame && index !== lastIndex) {
        lastIndex = index;
        hero.applyFrame(frame.hero);
        people.applyFrame({ type: 'frame', ...frame } as Frame);
      }
      const env = envOf(frame);
      world.update(dt, env);
      if (zone && env.plague !== plagueOn) {
        plagueOn = env.plague;
        effects.setPlague(env.plague ? zone : null);
      }
      // world/lighting.ts ranges the fog from CAMERA_RADIUS; the orbit rig sits further out, so without
      // this shift the whole diorama sits past fog.far and renders as a flat sheet of fog colour.
      const fog = scene.fog as Fog | null;
      if (fog) {
        const shift = rig.distanceToTarget() - CAMERA_RADIUS;
        if (shift > 0) {
          fog.near += shift + (env.plague || env.war ? 0 : span * 0.7);
          fog.far += shift;
        }
      }
      hero.update(dt);
      people.update(dt);
      effects.update(dt);
      rig.follow(hero.position());
      if (focusId) {
        const at = people.positionOf(focusId);
        focusPoint.copy(at ?? hero.position()).lerp(hero.position(), at ? 0.4 : 0);
        rig.focus(focusPoint);
      }
      rig.update(dt);
    },
    render(renderer) {
      renderer.autoClear = true;
      renderer.shadowMap.autoUpdate = true;
      rig.camera.layers.set(0);
      renderer.render(scene, rig.camera);
      // second pass: the hero's occluded fragments only (GreaterDepth), so he never disappears behind a
      // facade. A scene background forces a colour clear on every render call, so this pass has to drop it.
      const background = scene.background;
      scene.background = null;
      scene.overrideMaterial = ghost;
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      rig.camera.layers.set(HERO_LAYER);
      renderer.render(scene, rig.camera);
      scene.overrideMaterial = null;
      scene.background = background;
      renderer.autoClear = true;
      rig.camera.layers.set(0);
    },
    heroPosition: () => hero.position(),
    project: (v: Vector3) => rig.project(v),
    pick: (ndc: Vector2) => people.pick(ndc, rig.camera),
    toggleCamera: () => rig.toggle(),
    setCameraMode: (mode) => rig.setMode(mode),
    pushOverview: (seconds: number) => rig.pushOverview(seconds),
    focusOn(personId) {
      focusId = personId;
      if (!personId) rig.focus(null);
    },
    highlight(personId) {
      if (!personId) {
        effects.clearHighlight();
        return;
      }
      effects.highlight(() => people.positionOf(personId), () => hero.position(), 6);
    },
    talkingBubble: () => people.talkingAnchor(),
    setSepia: (on: boolean) => effects.setSepia(on),
  };
}
