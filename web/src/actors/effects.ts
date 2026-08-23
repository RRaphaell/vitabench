import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  Scene,
  Vector3,
} from 'three';
import type { WorldHandles } from './types';
import { tileSizeOf } from './types';

const HIGHLIGHT_COLOR = 0xd9a441;
const PLAGUE_COLOR = 0xc8413b;
export const SEPIA_CLASS = 'vb-sepia';

type PointSource = () => Vector3 | null;

export interface PlagueZone {
  centre: Vector3;
  radius: number;
}

export interface Effects {
  highlight(person: PointSource, hero: PointSource, seconds?: number): void;
  clearHighlight(): void;
  setPlague(zone: PlagueZone | null): void;
  setSepia(on: boolean): void;
  update(dt: number): void;
  dispose(): void;
}

export function createEffects(scene: Scene, world: WorldHandles): Effects {
  const tile = tileSizeOf(world);

  const ringGeometry = new RingGeometry(tile * 0.42, tile * 0.6, 44);
  const ringMaterial = new MeshBasicMaterial({
    color: HIGHLIGHT_COLOR,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const ring = new Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 3;
  ring.visible = false;
  scene.add(ring);

  const linePositions = new Float32Array(6);
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', new BufferAttribute(linePositions, 3));
  const lineMaterial = new LineBasicMaterial({
    color: HIGHLIGHT_COLOR,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const line = new Line(lineGeometry, lineMaterial);
  line.frustumCulled = false;
  line.renderOrder = 3;
  line.visible = false;
  scene.add(line);

  const zoneGeometry = new RingGeometry(0.78, 1, 64);
  const zoneMaterial = new MeshBasicMaterial({
    color: PLAGUE_COLOR,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const zone = new Mesh(zoneGeometry, zoneMaterial);
  zone.rotation.x = -Math.PI / 2;
  zone.renderOrder = 4;
  zone.visible = false;
  scene.add(zone);

  let plague: PlagueZone | null = null;
  let plagueClock = 0;
  let remaining = 0;
  let elapsed = 0;
  let person: PointSource = () => null;
  let hero: PointSource = () => null;

  const highlight: Effects['highlight'] = (nextPerson, nextHero, seconds = 4) => {
    person = nextPerson;
    hero = nextHero;
    remaining = seconds;
    elapsed = 0;
    ring.visible = true;
    line.visible = true;
  };

  const clearHighlight = () => {
    remaining = 0;
    ring.visible = false;
    line.visible = false;
    ringMaterial.opacity = 0;
    lineMaterial.opacity = 0;
  };

  const setPlague = (next: PlagueZone | null) => {
    plague = next;
    zone.visible = !!next;
    if (!next) {
      zoneMaterial.opacity = 0;
      return;
    }
    zone.position.set(next.centre.x, next.centre.y + tile * 0.2, next.centre.z);
    zone.scale.setScalar(next.radius);
  };

  const update = (dt: number) => {
    if (plague) {
      plagueClock += dt;
      const wave = 0.5 + 0.5 * Math.sin(plagueClock * 1.8);
      zoneMaterial.opacity = 0.26 + wave * 0.34;
      zone.scale.setScalar(plague.radius * (0.72 + wave * 0.05));
    }
    if (remaining <= 0) return;
    remaining -= dt;
    elapsed += dt;
    if (remaining <= 0) {
      clearHighlight();
      return;
    }
    const at = person();
    if (!at) {
      clearHighlight();
      return;
    }
    const fade = Math.min(1, remaining / 0.6) * Math.min(1, elapsed / 0.2);
    const wave = 0.9 + Math.sin(elapsed * 5) * 0.12;
    ring.position.set(at.x, at.y + tile * 0.03, at.z);
    ring.scale.setScalar(wave);
    ringMaterial.opacity = 0.55 * fade + 0.2 * Math.abs(Math.sin(elapsed * 5)) * fade;

    const from = hero();
    if (from) {
      linePositions[0] = from.x;
      linePositions[1] = from.y + tile * 0.75;
      linePositions[2] = from.z;
      linePositions[3] = at.x;
      linePositions[4] = at.y + tile * 0.75;
      linePositions[5] = at.z;
      lineGeometry.getAttribute('position').needsUpdate = true;
      lineGeometry.computeBoundingSphere();
      lineMaterial.opacity = 0.5 * fade;
      line.visible = true;
    } else {
      line.visible = false;
    }
  };

  const setSepia = (on: boolean) => {
    document.body.classList.toggle(SEPIA_CLASS, on);
  };

  return {
    highlight,
    clearHighlight,
    setPlague,
    setSepia,
    update,
    dispose: () => {
      document.body.classList.remove(SEPIA_CLASS);
      ringGeometry.dispose();
      ringMaterial.dispose();
      zoneGeometry.dispose();
      zoneMaterial.dispose();
      zone.removeFromParent();
      lineGeometry.dispose();
      lineMaterial.dispose();
      ring.removeFromParent();
      line.removeFromParent();
    },
  };
}
