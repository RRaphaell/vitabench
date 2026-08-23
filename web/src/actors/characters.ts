import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Box3,
  Color,
  Group,
  LoadingManager,
  LoopOnce,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const DIR = '/assets/chars/Models/GLB format/';

export const CHARACTER_MODELS = [
  'male-a', 'male-b', 'male-c', 'male-d', 'male-e', 'male-f',
  'female-a', 'female-b', 'female-c', 'female-d', 'female-e', 'female-f',
] as const;

export type CharacterModel = (typeof CHARACTER_MODELS)[number];
export type ClipName = 'idle' | 'walk' | 'sprint' | 'sit' | 'die';
export type AccentClass = 'noble' | 'merchant' | 'clergy' | 'poor' | 'hero' | 'commoner';

export const ACCENT: Record<AccentClass, number> = {
  noble: 0xa8283a,
  merchant: 0x3f6fc4,
  clergy: 0x2a2d34,
  poor: 0x7c5a38,
  hero: 0xd9a441,
  commoner: 0xb8a893,
};

export function accentClass(raw: string | undefined): AccentClass {
  const key = (raw ?? '').toLowerCase();
  if (key in ACCENT) return key as AccentClass;
  if (key.includes('noble') || key.includes('patrician')) return 'noble';
  if (key.includes('merchant') || key.includes('trade')) return 'merchant';
  if (key.includes('priest') || key.includes('clergy') || key.includes('friar')) return 'clergy';
  if (key.includes('poor') || key.includes('fish') || key.includes('labour')) return 'poor';
  return 'commoner';
}

export function normalizeModel(raw: string | undefined, fallbackIndex: number): CharacterModel {
  const key = (raw ?? '').toLowerCase().replace(/^character[-_]/, '').replace(/_/g, '-');
  const hit = CHARACTER_MODELS.find((m) => m === key);
  if (hit) return hit;
  const idx = ((fallbackIndex % CHARACTER_MODELS.length) + CHARACTER_MODELS.length) % CHARACTER_MODELS.length;
  return CHARACTER_MODELS[idx] as CharacterModel;
}

export interface Character {
  root: Group;
  mixer: AnimationMixer;
  height: number;
  playClip(name: ClipName, fade?: number): void;
  current(): ClipName;
  dispose(): void;
}

export interface CharacterLibrary {
  create(model: CharacterModel, accent: AccentClass, targetHeight: number): Character;
  clipNames: string[];
  dispose(): void;
}

interface Source {
  scene: Group;
  clips: AnimationClip[];
  height: number;
}

function tintedMaterial(source: MeshStandardMaterial, accent: number): MeshStandardMaterial {
  const material = source.clone();
  material.color = new Color(accent).lerp(new Color(0xffffff), 0.32);
  material.roughness = 0.85;
  material.metalness = 0;
  material.name = `accent-${accent.toString(16)}`;
  return material;
}

function firstMaterial(root: Group): MeshStandardMaterial | null {
  const found: MeshStandardMaterial[] = [];
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (material instanceof MeshStandardMaterial) found.push(material);
  });
  return found[0] ?? null;
}

let shared: Promise<CharacterLibrary> | null = null;

export function sharedCharacters(manager?: LoadingManager): Promise<CharacterLibrary> {
  if (!shared) shared = loadCharacters(manager);
  return shared;
}

export async function loadCharacters(manager?: LoadingManager): Promise<CharacterLibrary> {
  const loader = new GLTFLoader(manager);
  const sources = new Map<CharacterModel, Source>();
  let clipNames: string[] = [];

  const loaded = await Promise.all(
    CHARACTER_MODELS.map(async (model) => {
      const gltf = await loader.loadAsync(`${DIR}character-${model}.glb`);
      return { model, gltf };
    }),
  );

  for (const { model, gltf } of loaded) {
    const scene = gltf.scene as Group;
    const box = new Box3().setFromObject(scene);
    const size = box.getSize(new Vector3());
    sources.set(model, { scene, clips: gltf.animations, height: size.y || 1 });
    if (clipNames.length === 0 && gltf.animations.length > 0) {
      clipNames = gltf.animations.map((clip) => clip.name);
      console.info('[actors] character clips:', clipNames.join(', '));
    }
  }

  const base = firstMaterial(sources.get('male-a')?.scene ?? new Group());
  const accents = new Map<AccentClass, MeshStandardMaterial>();
  const materialFor = (accent: AccentClass): MeshStandardMaterial | null => {
    if (!base) return null;
    const cached = accents.get(accent);
    if (cached) return cached;
    const made = tintedMaterial(base, ACCENT[accent]);
    accents.set(accent, made);
    return made;
  };

  const create = (model: CharacterModel, accent: AccentClass, targetHeight: number): Character => {
    const source = sources.get(model) ?? sources.get('male-a');
    if (!source) throw new Error('characters: no model loaded');
    const root = cloneSkeleton(source.scene) as Group;
    const scale = targetHeight / source.height;
    root.scale.setScalar(scale);
    const material = materialFor(accent);
    root.traverse((node) => {
      const mesh = node as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
      if (material) mesh.material = material;
    });

    const mixer = new AnimationMixer(root);
    const actions = new Map<string, AnimationAction>();
    const actionFor = (name: ClipName): AnimationAction | null => {
      const cached = actions.get(name);
      if (cached) return cached;
      const clip = source.clips.find((c) => c.name === name) ?? source.clips.find((c) => c.name === 'idle');
      if (!clip) return null;
      const action = mixer.clipAction(clip);
      if (name === 'die') {
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      actions.set(name, action);
      return action;
    };

    let current: ClipName = 'idle';
    let active: AnimationAction | null = null;

    const playClip = (name: ClipName, fade = 0.25) => {
      if (name === current && active) return;
      const next = actionFor(name);
      if (!next) return;
      next.reset();
      next.enabled = true;
      next.setEffectiveTimeScale(name === 'walk' ? 1.15 : 1);
      next.setEffectiveWeight(1);
      next.play();
      if (active && active !== next) active.crossFadeTo(next, fade, false);
      active = next;
      current = name;
    };

    playClip('idle', 0);

    return {
      root,
      mixer,
      height: targetHeight,
      playClip,
      current: () => current,
      dispose: () => {
        mixer.stopAllAction();
        mixer.uncacheRoot(root);
        root.removeFromParent();
      },
    };
  };

  return {
    create,
    clipNames,
    dispose: () => {
      for (const material of accents.values()) material.dispose();
      accents.clear();
    },
  };
}
