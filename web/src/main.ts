import * as THREE from 'three';
import { createStage, type Stage } from './dev/fixtures/stage';
import { Replayer } from './state/replayer';
import { Transport } from './state/transport';
import { store } from './state/store';
import { mountUi } from './ui';

const ENGINE = 'http://localhost:8700';
const devModules = import.meta.glob(['./dev/*.ts']);

async function loadFixture(replayer: Replayer): Promise<void> {
  try {
    const mod = (await import('./dev/fixtures/demo_frames.json')) as { default: unknown[] };
    replayer.load(mod.default as never[]);
  } catch (err) {
    console.error('[vitabench] dev fixture missing', err);
  }
}

async function pickSource(params: URLSearchParams, replayer: Replayer): Promise<Transport | null> {
  const ws = params.get('ws');
  if (ws) {
    const transport = new Transport(ws, store);
    transport.open();
    return transport;
  }
  const run = params.get('run');
  if (run && run !== 'fixture') {
    for (const url of [`${ENGINE}/runs/${run}/frames`, `/runs/${run}/frames.json`, `${ENGINE}/runs/${run}/frames.json`]) {
      if (await replayer.loadFromUrl(url)) return null;
    }
  } else if (!run) {
    if (await replayer.loadFromUrl('/runs/demo/frames.json')) return null;
    if (await replayer.loadFromUrl(`${ENGINE}/runs/demo/frames`)) return null;
  }
  await loadFixture(replayer);
  return null;
}

async function runDevMount(name: string, root: HTMLElement): Promise<boolean> {
  const key = Object.keys(devModules).find((k) => k.includes(`/${name}`));
  if (!key) return false;
  const mod = (await (devModules[key] as () => Promise<Record<string, unknown>>)()) as Record<string, unknown>;
  const entry = Object.values(mod).find((v) => typeof v === 'function');
  if (!entry) return false;
  (entry as (el: HTMLElement) => void)(root);
  return true;
}

function personIdFor(name: string): string | null {
  const match = store.hello?.roster.find((r) => r.name === name);
  return match ? match.id : null;
}

async function boot(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;
  const params = new URLSearchParams(location.search);
  const dev = params.get('dev');
  if (dev && (await runDevMount(dev, root))) return;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.append(renderer.domElement);

  const replayer = new Replayer(store);
  const transport = await pickSource(params, replayer);
  if (transport) {
    const deadline = performance.now() + 4000;
    while (!store.hello && performance.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  }

  const stage: Stage = await createStage(renderer, store);
  const ui = mountUi(root, store, replayer, () => stage.toggleCamera());

  const seekTo = params.get('t');
  if (seekTo !== null && Number.isFinite(Number(seekTo))) replayer.seek(Number(seekTo), true);
  else store.touch();

  const ndc = new THREE.Vector2();
  renderer.domElement.addEventListener('click', (ev) => {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
    const id = stage.pick(ndc);
    if (id) ui.openInspector(id, { x: ev.clientX, y: ev.clientY });
    else ui.closeInspector();
  });

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    stage.resize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', resize);
  resize();

  const bubble = new THREE.Vector3();
  const painted = window as unknown as { vitabenchFrames: number };
  painted.vitabenchFrames = 0;
  const clock = new THREE.Clock();
  let shownMoment: string | null = null;
  let sepia = false;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(0.1, clock.getDelta());
    replayer.tick(dt);
    const frame = store.frameAt(store.cursor);
    stage.update(dt, frame, store.indexAt(store.cursor));
    const moment = store.activeMoment;
    const key = moment ? `${moment.probe_id}@${moment.t}` : null;
    if (key !== shownMoment) {
      shownMoment = key;
      stage.highlight(moment ? personIdFor(moment.who) : null);
    }
    if (sepia !== store.endOpen) {
      sepia = store.endOpen;
      stage.setSepia(sepia);
    }
    bubble.copy(stage.heroPosition()).setY(stage.heroPosition().y + 1.6);
    ui.frame(stage.project(bubble));
    renderer.render(stage.scene, stage.camera);
    painted.vitabenchFrames += 1;
  });
}

void boot();
