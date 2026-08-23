import { Box3, Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadKit, loadedPieces, manager, pieceSize } from '../world/assets';
import type { KitName } from '../world/types';

const CHARACTERS = ['character-male-a', 'character-female-b'];

async function characterRows(): Promise<[string, Vector3][]> {
  const loader = new GLTFLoader(manager);
  const rows: [string, Vector3][] = [];
  for (const name of CHARACTERS) {
    const gltf = await loader.loadAsync(encodeURI(`/assets/chars/Models/GLB format/${name}.glb`));
    const obj: Object3D = gltf.scene;
    obj.updateMatrixWorld(true);
    rows.push([`chars/${name}`, new Box3().setFromObject(obj).getSize(new Vector3())]);
  }
  return rows;
}

export async function mountAssetsProbe(root: HTMLElement): Promise<void> {
  const pre = document.createElement('pre');
  pre.style.cssText = 'font:12px/1.5 monospace;color:#e9e5dc;background:#0b0d10;padding:16px;margin:0;min-height:100vh';
  pre.textContent = 'loading kits…';
  root.appendChild(pre);
  const kits: KitName[] = ['town', 'castle', 'pirate'];
  await Promise.all(kits.map((k) => loadKit(k)));
  const lines: string[] = [];
  for (const key of loadedPieces()) {
    const [kit, piece] = key.split('/') as [KitName, string];
    const s = pieceSize(kit, piece);
    lines.push(`${key.padEnd(38)} ${s.x.toFixed(3)} x ${s.y.toFixed(3)} x ${s.z.toFixed(3)}`);
  }
  for (const [name, s] of await characterRows()) {
    lines.push(`${name.padEnd(38)} ${s.x.toFixed(3)} x ${s.y.toFixed(3)} x ${s.z.toFixed(3)}`);
  }
  pre.textContent = `${lines.length} pieces (width x height x depth, world units; TILE = 1)\n\n${lines.join('\n')}`;
}

if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('probe') === '1') {
  void mountAssetsProbe(document.getElementById('app') ?? document.body);
}
