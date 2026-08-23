import { Box3, BufferGeometry, Color, LoadingManager, Mesh, MeshStandardMaterial, Object3D, Texture, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { KitName } from './types';

const KIT_DIR: Record<KitName, string> = {
  town: '/assets/town/Models/GLB format/',
  castle: '/assets/castle/Models/GLB format/',
  pirate: '/assets/pirate/Models/GLB format/',
};

export const MANIFEST: Record<KitName, readonly string[]> = {
  town: [
    'wall', 'wall-window-shutters', 'wall-window-round', 'wall-window-small', 'wall-window-glass', 'wall-door',
    'wall-arch', 'wall-arch-top', 'wall-arch-top-detail', 'wall-corner-diagonal', 'wall-half', 'wall-rounded', 'balcony-wall',
    'balcony-wall-fence', 'wall-wood', 'wall-wood-window-small', 'wall-wood-window-shutters', 'wall-wood-door', 'wall-wood-window-round',
    'wall-wood-detail-cross', 'wall-wood-detail-diagonal', 'wall-detail-horizontal', 'wall-block',
    'roof', 'roof-gable', 'roof-gable-end', 'roof-high', 'roof-high-gable', 'roof-window', 'roof-high-window',
    'roof-flat', 'roof-point', 'roof-high-point', 'chimney', 'chimney-top',
    'stall', 'stall-red', 'stall-green', 'stall-bench', 'cart', 'cart-high', 'lantern', 'pillar-stone',
    'tree', 'tree-high', 'tree-crooked', 'hedge', 'hedge-large', 'fence', 'fence-curved',
    'banner-red', 'banner-green', 'fountain-round', 'fountain-round-detail', 'watermill', 'road', 'planks',
    'rock-small', 'rock-wide',
  ],
  castle: [
    'wall', 'wall-half', 'wall-corner', 'wall-doorway', 'gate', 'bridge-straight', 'bridge-straight-pillar',
    'tower-square-base', 'tower-square-mid', 'tower-square-mid-windows', 'tower-square-top', 'tower-square-roof',
    'tower-hexagon-base', 'tower-hexagon-mid', 'tower-hexagon-roof', 'tower-hexagon-roof-secondary',
    'ground', 'ground-hills', 'rocks-large', 'rocks-small', 'flag-pennant', 'flag-banner-long', 'tree-small',
  ],
  pirate: ['boat-row-small', 'boat-row-large', 'ship-small', 'ship-medium', 'barrel', 'crate', 'castle-wall', 'castle-gate', 'platform-planks'],
};

export const manager = new LoadingManager();
const loader = new GLTFLoader(manager);
const roots = new Map<string, Object3D>();
const geoms = new Map<string, BufferGeometry[]>();
const textures = new Map<KitName, Texture>();

const key = (kit: KitName, piece: string) => `${kit}/${piece}`;

function harvest(kit: KitName, piece: string, root: Object3D): void {
  root.updateMatrixWorld(true);
  const list: BufferGeometry[] = [];
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as MeshStandardMaterial;
    if (Array.isArray(mesh.material) || !mat.map) return;
    if (!textures.has(kit)) textures.set(kit, mat.map);
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld).toNonIndexed();
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    list.push(g);
  });
  geoms.set(key(kit, piece), list);
}

async function loadPiece(kit: KitName, piece: string): Promise<void> {
  if (roots.has(key(kit, piece))) return;
  const gltf = await loader.loadAsync(encodeURI(KIT_DIR[kit] + piece + '.glb'));
  const root = gltf.scene;
  roots.set(key(kit, piece), root);
  harvest(kit, piece, root);
}

export async function loadKit(kit: KitName, pieces: readonly string[] = MANIFEST[kit]): Promise<void> {
  await Promise.all(pieces.map((p) => loadPiece(kit, p)));
}

export function loadedPieces(): string[] {
  return [...geoms.keys()].sort();
}

export function getPiece(kit: KitName, piece: string): Object3D {
  const root = roots.get(key(kit, piece));
  if (!root) throw new Error(`piece not loaded: ${key(kit, piece)}`);
  const clone = root.clone(true);
  clone.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return clone;
}

export function hasPiece(kit: KitName, piece: string): boolean {
  return geoms.has(key(kit, piece));
}

export function pieceGeometries(kit: KitName, piece: string): BufferGeometry[] {
  const list = geoms.get(key(kit, piece));
  if (!list) throw new Error(`piece not loaded: ${key(kit, piece)}`);
  return list;
}

export function kitTexture(kit: KitName): Texture | null {
  return textures.get(kit) ?? null;
}

export function pieceSize(kit: KitName, piece: string): Vector3 {
  const box = new Box3();
  for (const g of pieceGeometries(kit, piece)) {
    g.computeBoundingBox();
    if (g.boundingBox) box.union(g.boundingBox);
  }
  return box.isEmpty() ? new Vector3() : box.getSize(new Vector3());
}

export function tint(obj: Object3D, color: number): Object3D {
  const c = new Color(color);
  obj.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const mat = (mesh.material as MeshStandardMaterial).clone();
    mat.color.multiply(c);
    mesh.material = mat;
  });
  return obj;
}

export function disposeAssets(): void {
  for (const list of geoms.values()) list.forEach((g) => g.dispose());
  geoms.clear();
  roots.clear();
  textures.clear();
}
