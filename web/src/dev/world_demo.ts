import { OrthographicCamera, PCFShadowMap, Scene, Vector3, WebGLRenderer } from 'three';
import { CAMERA_RADIUS } from '../world/constants';
import { buildWorld } from '../world/citygen';
import type { WorldEnv, WorldHandles } from '../world/types';
import { DEMO_MAP } from './fixtures/map_venice';

const ISO_PITCH = Math.atan(1 / Math.SQRT2);

export interface WorldDemo {
  world: WorldHandles;
  renderer: WebGLRenderer;
  dispose(): void;
}

function envFromQuery(): WorldEnv {
  const q = new URLSearchParams(location.search);
  return {
    season: Number(q.get('season') ?? 0) % 4,
    plague: q.get('plague') === '1',
    war: q.get('war') === '1',
  };
}

export function mountWorldDemo(root: HTMLElement): WorldDemo {
  const q = new URLSearchParams(location.search);
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  root.appendChild(renderer.domElement);

  const scene = new Scene();
  const world = buildWorld(scene, DEMO_MAP, Number(q.get('seed') ?? 7));

  let yaw = Math.PI / 4;
  let view = Number(q.get('zoom') ?? 20);
  const target = new Vector3(0, 0, 0);
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 400);

  const place = () => {
    const aspect = innerWidth / innerHeight;
    camera.left = (-view * aspect) / 2;
    camera.right = (view * aspect) / 2;
    camera.top = view / 2;
    camera.bottom = -view / 2;
    const r = CAMERA_RADIUS;
    camera.position.set(
      target.x + Math.cos(yaw) * Math.cos(ISO_PITCH) * r,
      target.y + Math.sin(ISO_PITCH) * r,
      target.z + Math.sin(yaw) * Math.cos(ISO_PITCH) * r,
    );
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  };
  place();

  const onResize = () => {
    renderer.setSize(innerWidth, innerHeight);
    place();
  };
  addEventListener('resize', onResize);

  let dragging = false;
  let lastX = 0;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
  });
  addEventListener('pointerup', () => {
    dragging = false;
  });
  addEventListener('pointermove', (e) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.006;
    lastX = e.clientX;
    place();
  });
  renderer.domElement.addEventListener('wheel', (e) => {
    view = Math.max(8, Math.min(40, view + e.deltaY * 0.02));
    place();
  }, { passive: true });

  const env = envFromQuery();
  addEventListener('keydown', (e) => {
    if (e.key === 'p') env.plague = !env.plague;
    if (e.key === 'w') env.war = !env.war;
    if (e.key === 's') env.season = (env.season + 1) % 4;
  });

  let last = performance.now();
  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    world.update(dt, env);
    renderer.render(scene, camera);
  };
  tick();

  return {
    world,
    renderer,
    dispose() {
      cancelAnimationFrame(raf);
      removeEventListener('resize', onResize);
      world.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('dev') === 'world') {
  mountWorldDemo(document.getElementById('app') ?? document.body);
}
