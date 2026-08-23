import * as THREE from 'three';
import { createStage, type Stage } from './stage';
import { Replayer } from './state/replayer';
import { Transport } from './state/transport';
import { store } from './state/store';
import { mountUi } from './ui';

const ENGINE = 'http://localhost:8700';
const BANNER_KINDS = new Set(['plague', 'war', 'flood', 'politics']);
const devModules = import.meta.glob(['./dev/*.ts']);

async function runNames(): Promise<string[]> {
  try {
    const res = await fetch('/runs/index.json', { cache: 'no-store' });
    if (!res.ok) return ['demo'];
    const rows = (await res.json()) as { name: string }[];
    const names = rows.map((r) => r.name);
    return ['demo', ...names.filter((n) => n !== 'demo')];
  } catch {
    return ['demo'];
  }
}

async function pickSource(params: URLSearchParams, replayer: Replayer): Promise<Transport | null> {
  const ws = params.get('ws');
  if (ws) {
    const transport = new Transport(ws, store);
    transport.open();
    return transport;
  }
  const named = params.get('run');
  for (const run of named ? [named] : await runNames()) {
    for (const url of [`/runs/${run}/frames.json`, `${ENGINE}/runs/${run}/frames`]) {
      if (await replayer.loadFromUrl(url)) return null;
    }
  }
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

function bigEvent(): string | null {
  const frame = store.frameAt(store.cursor);
  const hit = frame?.events.find((e) => e.active && BANNER_KINDS.has(e.kind));
  return hit ? hit.id : null;
}

function fail(root: HTMLElement, message: string): void {
  const panel = document.createElement('div');
  panel.className = 'panel loadfail';
  panel.textContent = message;
  root.append(panel);
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
  if (!store.hello) {
    fail(root, 'no run loaded — pass ?run=<name> or start the engine on :8700');
    return;
  }

  const stage: Stage = await createStage(renderer, store.hello);
  const ui = mountUi(root, store, replayer, () => stage.toggleCamera());

  if (params.get('view') === 'overview') stage.setCameraMode('overview');

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

  const resize = () => renderer.setSize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize);
  resize();

  const bubble = new THREE.Vector3();
  const painted = window as unknown as { vitabenchFrames: number };
  painted.vitabenchFrames = 0;
  const clock = new THREE.Clock();
  let shownMoment: string | null = null;
  let shownEvent: string | null = null;
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
      const who = moment ? personIdFor(moment.who) : null;
      stage.highlight(who);
      stage.focusOn(moment ? who : null);
    }
    const event = bigEvent();
    if (event !== shownEvent) {
      shownEvent = event;
      if (event && !moment) stage.pushOverview(4);
    }
    if (sepia !== store.endOpen) {
      sepia = store.endOpen;
      stage.setSepia(sepia);
      if (sepia) stage.focusOn(null);
    }
    bubble.copy(stage.heroPosition()).setY(stage.heroPosition().y + 1.6);
    const talking = stage.talkingBubble();
    ui.frame(stage.project(bubble), talking ? stage.project(talking.at) : null);
    stage.render(renderer);
    painted.vitabenchFrames += 1;
  });
}

void boot();
