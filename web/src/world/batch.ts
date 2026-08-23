import {
  BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Euler, InstancedMesh, Matrix4, Mesh,
  MeshLambertMaterial, Object3D, Quaternion, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hasPiece, kitTexture, pieceGeometries } from './assets';
import type { KitName, Placement } from './types';

interface InstanceJob {
  kit: KitName;
  piece: string;
  matrices: Matrix4[];
  colors: Color[];
}

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
  private merged = new Map<KitName, BufferGeometry[]>();
  private instanced: InstanceJob[] = [];

  add(p: Placement): void {
    if (!hasPiece(p.kit, p.piece)) return;
    const matrix = matrixOf(p);
    const color = new Color(p.color);
    const bucket = this.merged.get(p.kit) ?? [];
    for (const geometry of pieceGeometries(p.kit, p.piece)) bucket.push(colored(geometry, matrix, color));
    this.merged.set(p.kit, bucket);
  }

  addAll(list: readonly Placement[]): void {
    for (const p of list) this.add(p);
  }

  addInstanced(kit: KitName, piece: string, placements: readonly Placement[]): void {
    if (placements.length === 0 || !hasPiece(kit, piece)) return;
    if (placements.length <= 20) {
      this.addAll(placements.map((p) => ({ ...p, kit, piece })));
      return;
    }
    this.instanced.push({
      kit,
      piece,
      matrices: placements.map((p) => matrixOf({ ...p, kit, piece })),
      colors: placements.map((p) => new Color(p.color)),
    });
  }

  build(parent: Object3D): void {
    for (const [kit, list] of this.merged) {
      if (list.length === 0) continue;
      const geometry = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (!geometry) continue;
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, new MeshLambertMaterial({ map: kitTexture(kit), vertexColors: true }));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = `kit_${kit}`;
      parent.add(mesh);
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
    }
    this.instanced = [];
  }
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
