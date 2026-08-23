import {
  BoxGeometry, CapsuleGeometry, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh,
  MeshLambertMaterial, OrthographicCamera, Scene, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { HelloFrame } from '../../state/schema';
import type { InterpFrame } from '../../state/store';

export interface Stage {
  scene: Scene;
  camera: OrthographicCamera;
  kit: boolean;
  update(dt: number, frame: InterpFrame | null, index: number): void;
  heroPosition(): Vector3;
  project(v: Vector3): { x: number; y: number };
  pick(ndc: Vector2): string | null;
  toggleCamera(): void;
  setSepia(on: boolean): void;
  highlight(personId: string | null): void;
  resize(width: number, height: number): void;
}

export function createFallbackStage(renderer: WebGLRenderer, hello: HelloFrame | null): Stage {
  const cols = hello?.scenario.size.cols ?? 24;
  const rows = hello?.scenario.size.rows ?? 18;
  const scene = new Scene();
  scene.background = new Color(0x0f1420);
  scene.fog = new Fog(0x0f1420, 70, 210);
  const sun = new DirectionalLight(0xfff0d0, 1.5);
  sun.position.set(24, 40, 16);
  scene.add(new HemisphereLight(0xcfe4ff, 0x4a4030, 1.1), sun);

  const tile = (x: number, z: number) => new Vector3(x - (cols - 1) / 2, 0, z - (rows - 1) / 2);
  const ground = new Mesh(new BoxGeometry(cols, 1.2, rows), new MeshLambertMaterial({ color: 0x6f7a5a }));
  ground.position.y = -0.6;
  scene.add(ground);
  for (const p of hello?.scenario.places ?? []) {
    const h = p.kind === 'church' ? 3.2 : 1.8;
    const box = new Mesh(new BoxGeometry(0.9, h, 0.9), new MeshLambertMaterial({ color: 0xb98a63 }));
    const at = tile(p.xz[0], p.xz[1]);
    box.position.set(at.x, h / 2, at.z);
    scene.add(box);
  }

  const span = Math.max(cols, rows) * 1.15;
  const camera = new OrthographicCamera(-span, span, span / 2, -span / 2, -300, 800);
  camera.position.set(40, 40, 40);
  camera.lookAt(0, 0, 0);

  const hero = new Mesh(new CapsuleGeometry(0.28, 0.7, 4, 10), new MeshLambertMaterial({ color: 0xd9a441 }));
  scene.add(hero);
  const crowd = new Group();
  scene.add(crowd);
  const pegs = new Map<string, Mesh>();
  const pegGeometry = new CapsuleGeometry(0.2, 0.5, 4, 8);
  const pegMaterial = new MeshLambertMaterial({ color: 0x9aa3b8 });
  const size = new Vector2();

  return {
    scene,
    camera,
    kit: false,
    update(_dt, frame) {
      if (!frame) return;
      const at = tile(frame.hero.xz[0], frame.hero.xz[1]);
      hero.position.set(at.x, 0.85, at.z);
      for (const p of frame.people) {
        let peg = pegs.get(p.id);
        if (!peg) {
          peg = new Mesh(pegGeometry, pegMaterial);
          pegs.set(p.id, peg);
          crowd.add(peg);
        }
        const w = tile(p.xz[0], p.xz[1]);
        peg.position.set(w.x, 0.7, w.z);
        peg.visible = p.alive;
      }
    },
    heroPosition: () => hero.position,
    project(v) {
      const p = v.clone().project(camera);
      renderer.getSize(size);
      return { x: ((p.x + 1) / 2) * size.x, y: ((1 - p.y) / 2) * size.y };
    },
    pick: () => null,
    toggleCamera: () => {},
    setSepia: (on) => document.body.classList.toggle('vb-sepia', on),
    highlight: () => {},
    resize(width, height) {
      const aspect = width / Math.max(1, height);
      camera.left = -span * aspect * 0.5;
      camera.right = span * aspect * 0.5;
      camera.top = span * 0.5;
      camera.bottom = -span * 0.5;
      camera.updateProjectionMatrix();
    },
  };
}
