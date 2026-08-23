import {
  Color, DirectionalLight, DoubleSide, Fog, HemisphereLight, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, Vector3,
} from 'three';
import {
  CAMERA_RADIUS, DAY_SECONDS, NIGHT_FOG, NIGHT_SKY, PLAGUE_FOG, SEASON_FOG, SEASON_SKY, SEASON_SUN, WAR_FOG,
} from './constants';
import type { WorldEnv } from './types';

export interface LightingOpts {
  cols: number;
  rows: number;
  plagueRect?: { x: number; z: number; w: number; d: number };
}

export interface LightingHandle {
  sunDirection: Vector3;
  sun: DirectionalLight;
  update(dt: number, env: WorldEnv): void;
  setEnvironment(env: WorldEnv): void;
  dispose(): void;
}

const dayColor = new Color();
const fogColor = new Color();
const sunColor = new Color();

export function createLighting(scene: Scene, opts: LightingOpts): LightingHandle {
  const span = Math.max(opts.cols, opts.rows);
  const hemi = new HemisphereLight(0xdff0ff, 0xa89273, 0.75);
  hemi.position.set(0, 40, 0);
  scene.add(hemi);

  const sun = new DirectionalLight(0xfff0d4, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const d = span * 0.72 + 8;
  sun.shadow.camera.left = -d;
  sun.shadow.camera.right = d;
  sun.shadow.camera.top = d;
  sun.shadow.camera.bottom = -d;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = span * 4.5;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  const fog = new Fog(SEASON_FOG[0]!, CAMERA_RADIUS + span * 0.3, CAMERA_RADIUS + span * 4);
  scene.fog = fog;
  scene.background = new Color(SEASON_SKY[0]!);

  const rect = opts.plagueRect;
  const decal = new Mesh(
    new PlaneGeometry(rect?.w ?? 6, rect?.d ?? 6),
    new MeshBasicMaterial({ color: 0xc8413b, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }),
  );
  decal.rotation.x = -Math.PI / 2;
  decal.position.set(rect?.x ?? 0, 0.03, rect?.z ?? 0);
  decal.name = 'plague_decal';
  scene.add(decal);

  const sunDirection = new Vector3(0.6, 0.9, 0.4).normalize();
  let clock = DAY_SECONDS * 0.3;
  let env: WorldEnv = { season: 0, plague: false, war: false };

  const apply = () => {
    const phase = (clock % DAY_SECONDS) / DAY_SECONDS;
    const angle = phase * Math.PI * 2 - Math.PI / 2;
    const elev = Math.sin(angle);
    const day = Math.max(0, Math.min(1, elev * 2.4 + 0.78));
    sunDirection.set(0.72 + Math.cos(angle) * 0.12, 0.52 + day * 0.34, -0.28 + Math.sin(angle) * 0.1).normalize();
    sun.position.copy(sunDirection).multiplyScalar(span * 1.8);
    sun.target.position.set(0, 0, 0);

    const season = ((env.season % 4) + 4) % 4;
    dayColor.set(SEASON_SKY[season]!);
    fogColor.set(SEASON_FOG[season]!);
    sunColor.set(SEASON_SUN[season]!);
    if (env.plague) {
      fogColor.lerp(new Color(PLAGUE_FOG), 0.65);
      dayColor.lerp(new Color(PLAGUE_FOG), 0.45);
    } else if (env.war) {
      fogColor.lerp(new Color(WAR_FOG), 0.5);
      dayColor.lerp(new Color(WAR_FOG), 0.3);
    }
    dayColor.lerp(new Color(NIGHT_SKY), 1 - day);
    fogColor.lerp(new Color(NIGHT_FOG), 1 - day);
    (scene.background as Color).copy(dayColor);
    fog.color.copy(fogColor);
    fog.near = CAMERA_RADIUS + span * (env.plague ? -0.85 : 0.3);
    fog.far = CAMERA_RADIUS + span * (env.plague ? 1.1 : 4);

    sun.color.copy(sunColor).lerp(new Color(0x7f9bd6), 1 - day);
    sun.intensity = 0.45 + day * 2.1 * (env.plague ? 0.6 : 1);
    hemi.intensity = 0.4 + day * 0.75;
    hemi.color.copy(dayColor).lerp(new Color(0xffffff), 0.35);

    const mat = decal.material as MeshBasicMaterial;
    mat.opacity = env.plague ? 0.18 + 0.14 * (0.5 + 0.5 * Math.sin(clock * 3.1)) : 0;
    decal.visible = env.plague;
  };

  apply();

  return {
    sunDirection,
    sun,
    update(dt, next) {
      clock += dt;
      env = next;
      apply();
    },
    setEnvironment(next) {
      env = next;
      apply();
    },
    dispose() {
      scene.remove(hemi, sun, sun.target, decal);
      decal.geometry.dispose();
      (decal.material as MeshBasicMaterial).dispose();
      hemi.dispose();
      sun.dispose();
    },
  };
}
