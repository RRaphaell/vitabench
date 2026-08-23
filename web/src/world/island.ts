import {
  BoxGeometry, BufferAttribute, BufferGeometry, Color, Mesh, MeshLambertMaterial, Object3D, PlaneGeometry,
  RepeatWrapping, TextureLoader, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Water } from 'three/addons/objects/Water.js';
import {
  CANAL_BED, CANAL_BED_Y, CANAL_TINT, CANAL_Y, EARTH, EARTH_DARK, ISLAND_DEPTH, LAGOON, PAVING_H, STONE,
  STONE_DARK, WATER_TINT, WATER_Y,
} from './constants';
import { manager } from './assets';
import type { KitBatcher } from './batch';
import type { Rng } from './rng';

export interface WaterHandle {
  object: Object3D;
  update(dt: number): void;
}

function box(w: number, h: number, d: number, cx: number, cy: number, cz: number, color: Color): BufferGeometry {
  const g = new BoxGeometry(w, h, d).toNonIndexed();
  g.translate(cx, cy, cz);
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

export interface IslandOpts {
  cols: number;
  rows: number;
  isCanal(x: number, z: number): boolean;
  toWorld(x: number, z: number): Vector3;
  rng: Rng;
}

export function buildIsland(parent: Object3D, batcher: KitBatcher, opts: IslandOpts): Mesh {
  const canalQuads: BufferGeometry[] = [];
  const { cols, rows, isCanal, toWorld, rng } = opts;
  const parts: BufferGeometry[] = [];
  const paving = new Color(STONE);
  const pavingAlt = new Color(STONE_DARK);
  const earth = new Color(EARTH);
  const bed = new Color(CANAL_BED);
  for (let x = 0; x < cols; x++) {
    for (let z = 0; z < rows; z++) {
      const p = toWorld(x, z);
      if (isCanal(x, z)) {
        parts.push(box(1, ISLAND_DEPTH, 1, p.x, CANAL_BED_Y - ISLAND_DEPTH / 2, p.z, bed));
        const quad = new PlaneGeometry(1.001, 1.001).toNonIndexed();
        quad.rotateX(-Math.PI / 2);
        quad.translate(p.x, CANAL_Y, p.z);
        canalQuads.push(quad);
        continue;
      }
      const top = rng() < 0.22 ? pavingAlt : paving;
      parts.push(box(1, PAVING_H, 1, p.x, -PAVING_H / 2, p.z, top));
      parts.push(box(1, ISLAND_DEPTH - PAVING_H, 1, p.x, -PAVING_H - (ISLAND_DEPTH - PAVING_H) / 2, p.z, earth));
    }
  }
  const w = cols;
  const d = rows;
  parts.push(box(w - 1.5, 1.3, d - 1.5, 0, -ISLAND_DEPTH - 0.65, 0, earth.clone().multiplyScalar(0.85)));
  parts.push(box(w - 5, 1.2, d - 5, 0, -ISLAND_DEPTH - 1.9, 0, new Color(EARTH_DARK)));
  parts.push(box(w - 10, 1.0, d - 10, 0, -ISLAND_DEPTH - 2.9, 0, new Color(EARTH_DARK).multiplyScalar(0.8)));

  const geometry = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  const mesh = new Mesh(geometry!, new MeshLambertMaterial({ vertexColors: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'island';
  parent.add(mesh);

  if (canalQuads.length > 0) {
    const canal = mergeGeometries(canalQuads, false);
    canalQuads.forEach((g) => g.dispose());
    const canalMesh = new Mesh(canal!, new MeshLambertMaterial({ color: CANAL_TINT }));
    canalMesh.receiveShadow = true;
    canalMesh.name = 'canal_water';
    parent.add(canalMesh);
  }

  for (let x = -1; x <= cols; x++) {
    for (let z = -1; z <= rows; z++) {
      const rim = x === -1 || z === -1 || x === cols || z === rows;
      if (!rim || rng() < 0.45) continue;
      const p = toWorld(x, z);
      batcher.add({
        kit: 'castle',
        piece: rng() < 0.5 ? 'rocks-large' : 'rocks-small',
        x: p.x + (rng() - 0.5) * 0.4,
        y: -PAVING_H - rng() * 0.7,
        z: p.z + (rng() - 0.5) * 0.4,
        rotY: rng() * Math.PI * 2,
        scale: 0.8 + rng() * 0.7,
        color: EARTH,
      });
    }
  }
  return mesh;
}

export function buildWater(parent: Object3D, sunDirection: Vector3): WaterHandle {
  const geometry = new PlaneGeometry(LAGOON, LAGOON);
  try {
    const normals = new TextureLoader(manager).load('/assets/waternormals.jpg', (t) => {
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
    });
    const water = new Water(geometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: sunDirection.clone().normalize(),
      sunColor: 0xffffff,
      waterColor: WATER_TINT,
      distortionScale: 0.7,
      fog: true,
    });
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    water.name = 'water';
    parent.add(water);
    const uniforms = water.material.uniforms as { time: { value: number }; sunDirection: { value: Vector3 } };
    return {
      object: water,
      update(dt: number) {
        uniforms.time.value += dt * 0.35;
        uniforms.sunDirection.value.copy(sunDirection).normalize();
      },
    };
  } catch {
    const plane = new Mesh(geometry, new MeshLambertMaterial({ color: WATER_TINT }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = WATER_Y;
    plane.receiveShadow = true;
    plane.name = 'water_fallback';
    parent.add(plane);
    return { object: plane, update: () => undefined };
  }
}
