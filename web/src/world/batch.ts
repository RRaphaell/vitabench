import {
  BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, Mesh,
  MeshLambertMaterial, Object3D, Quaternion, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hasPiece, kitTexture, pieceGeometries } from './assets';
import type { KitName, LayerName, Placement } from './types';

interface InstanceJob {
  kit: KitName;
  piece: string;
  layer: LayerName;
  matrices: Matrix4[];
  colors: Color[];
}

export type LayerMeshes = Map<string, Mesh[]>;

const BASE: LayerName = 'base';

const scratchQ = new Quaternion();
const scratchE = new Euler();
const scratchS = new Vector3();
const scratchP = new Vector3();

function matrixOf(p: Placement): Matrix4 {
  scratchP.set(p.x, p.y, p.z);
  scratchQ.setFromEuler(scratchE.set(0, p.rotY ?? 0, 0));
  const s = p.scale ?? 1;
  scratchS.set(s, s, s);
  return new Matrix4().compose(scratchP, scratchQ, scratchS);
}

function colored(geometry: BufferGeometry, matrix: Matrix4, color: Color): BufferGeometry {
  const g = geometry.clone().applyMatrix4(matrix);
  const count = g.attributes.position!.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = color.r;
    arr[i * 3 + 1] = color.g;
    arr[i * 3 + 2] = color.b;
  }
  g.setAttribute('color', new BufferAttribute(arr, 3));
  return g;
}

export class KitBatcher {
  private merged = new Map<string, BufferGeometry[]>();
  private instanced: InstanceJob[] = [];

  add(p: Placement): void {
    if (!hasPiece(p.kit, p.piece)) return;
    const matrix = matrixOf(p);
    const color = new Color(p.color);
    const slot = `${p.kit}|${p.layer ?? BASE}`;
    const bucket = this.merged.get(slot) ?? [];
    for (const geometry of pieceGeometries(p.kit, p.piece)) bucket.push(colored(geometry, matrix, color));
    this.merged.set(slot, bucket);
  }

  addAll(list: readonly Placement[]): void {
    for (const p of list) this.add(p);
  }

  addInstanced(kit: KitName, piece: string, placements: readonly Placement[], layer: LayerName = BASE): void {
    if (placements.length === 0 || !hasPiece(kit, piece)) return;
    if (placements.length <= 20) {
      this.addAll(placements.map((p) => ({ ...p, kit, piece, layer })));
      return;
    }
    this.instanced.push({
      kit,
      piece,
      layer,
      matrices: placements.map((p) => matrixOf({ ...p, kit, piece })),
      colors: placements.map((p) => new Color(p.color)),
    });
  }

  build(parent: Object3D): LayerMeshes {
    const layers: LayerMeshes = new Map();
    const record = (layer: string, mesh: Mesh) => {
      const list = layers.get(layer) ?? [];
      list.push(mesh);
      layers.set(layer, list);
    };
    for (const [slot, list] of this.merged) {
      if (list.length === 0) continue;
      const [kit, layer] = slot.split('|') as [KitName, LayerName];
      const geometry = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!geometry) continue;
      geometry.computeBoundingSphere();
      const flat = layer === 'snow' || layer === 'foliage';
      const material = flat
        ? new MeshLambertMaterial({ vertexColors: true })
        : new MeshLambertMaterial({ map: kitTexture(kit), vertexColors: true });
      const mesh = new Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `kit_${kit}_${layer}`;
      parent.add(mesh);
      record(layer, mesh);
    }
    this.merged.clear();
    for (const job of this.instanced) {
      const parts = pieceGeometries(job.kit, job.piece);
      const geometry = parts.length === 1 ? parts[0]!.clone() : mergeGeometries(parts.map((g) => g.clone()), false);
      if (!geometry) continue;
      const mesh = new InstancedMesh(
        geometry,
        new MeshLambertMaterial({ map: kitTexture(job.kit) }),
        job.matrices.length,
      );
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      job.matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
      job.colors.forEach((c, i) => mesh.setColorAt(i, c));
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `inst_${job.kit}_${job.piece}`;
      parent.add(mesh);
      record(job.layer, mesh);
    }
    this.instanced = [];
    return layers;
  }
}

export function instancedPiece(kit: KitName, piece: string, count: number, flat = false): InstancedMesh | null {
  if (!hasPiece(kit, piece) || count <= 0) return null;
  const parts = pieceGeometries(kit, piece);
  const geometry = parts.length === 1 ? parts[0]!.clone() : mergeGeometries(parts.map((g) => g.clone()), false);
  if (!geometry) return null;
  const material = flat ? new MeshLambertMaterial({}) : new MeshLambertMaterial({ map: kitTexture(kit) });
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = `moving_${kit}_${piece}`;
  return mesh;
}

export function disposeTree(root: Object3D): void {
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => m.dispose());
  });
  root.removeFromParent();
}
