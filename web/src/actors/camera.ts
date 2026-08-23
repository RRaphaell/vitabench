import { MathUtils, OrthographicCamera, Vector3, WebGLRenderer } from 'three';
import type { WorldHandles } from './types';

export type CameraMode = 'follow' | 'overview';

const FOLLOW_HALF = 9;
const OVERVIEW_HALF = 14;
const MIN_HALF = 6;
const MAX_HALF = 40;
const FOLLOW_PITCH = MathUtils.degToRad(42);
const OVERVIEW_PITCH = MathUtils.degToRad(35);
const MIN_PITCH = MathUtils.degToRad(25);
const MAX_PITCH = MathUtils.degToRad(70);
const DISTANCE = 160;

export interface CameraRig {
  camera: OrthographicCamera;
  update(dt: number): void;
  setMode(mode: CameraMode): void;
  toggle(): void;
  follow(target: Vector3): void;
  focus(point: Vector3 | null): void;
  pushOverview(seconds: number): void;
  distanceToTarget(): number;
  mode(): CameraMode;
  project(v: Vector3): { x: number; y: number };
  dispose(): void;
}

export function createCamera(renderer: WebGLRenderer, world: WorldHandles): CameraRig {
  const canvas = renderer.domElement;
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 600);

  const centre = world.tileToWorld([
    Math.floor(world.grid.cols / 2),
    Math.floor(world.grid.rows / 2),
  ]).clone();

  let yaw = Math.PI / 4;
  let pitch = FOLLOW_PITCH;
  let manualPitch = false;
  let half = FOLLOW_HALF;
  let halfTarget = FOLLOW_HALF;
  let manualZoom = false;
  let mode: CameraMode = 'follow';
  let overviewHold = 0;
  const target = centre.clone();
  const desired = centre.clone();
  const heroTarget = centre.clone();
  let focusPoint: Vector3 | null = null;

  const applyFrustum = () => {
    const width = canvas.clientWidth || canvas.width || 1;
    const height = canvas.clientHeight || canvas.height || 1;
    const aspect = width / height;
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
  };

  const place = () => {
    const cos = Math.cos(pitch);
    camera.position.set(
      target.x + Math.sin(yaw) * cos * DISTANCE,
      target.y + Math.sin(pitch) * DISTANCE,
      target.z + Math.cos(yaw) * cos * DISTANCE,
    );
    camera.lookAt(target);
  };

  applyFrustum();
  place();

  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging) return;
    yaw -= (event.clientX - lastX) * 0.006;
    if (event.clientY !== lastY) manualPitch = true;
    pitch = MathUtils.clamp(pitch + (event.clientY - lastY) * 0.004, MIN_PITCH, MAX_PITCH);
    lastX = event.clientX;
    lastY = event.clientY;
  };

  const onPointerUp = (event: PointerEvent) => {
    dragging = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    manualZoom = true;
    halfTarget = MathUtils.clamp(halfTarget * (1 + Math.sign(event.deltaY) * 0.12), MIN_HALF, MAX_HALF);
  };

  const onResize = () => applyFrustum();

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', onResize);

  let lastWidth = canvas.clientWidth;
  let lastHeight = canvas.clientHeight;

  const update = (dt: number) => {
    if (canvas.clientWidth !== lastWidth || canvas.clientHeight !== lastHeight) {
      lastWidth = canvas.clientWidth;
      lastHeight = canvas.clientHeight;
      applyFrustum();
    }
    if (overviewHold > 0) overviewHold -= dt;
    const showing: CameraMode = overviewHold > 0 ? 'overview' : mode;
    if (focusPoint) desired.copy(focusPoint);
    else desired.copy(showing === 'follow' ? heroTarget : centre);
    const close = !!focusPoint || showing === 'follow';
    if (!manualZoom) halfTarget = close ? FOLLOW_HALF : OVERVIEW_HALF;
    if (!manualPitch) {
      const wanted = close ? FOLLOW_PITCH : OVERVIEW_PITCH;
      if (Math.abs(wanted - pitch) > 1e-4) pitch += (wanted - pitch) * Math.min(1, dt * 3);
    }
    target.lerp(desired, Math.min(1, dt * 2.4));
    if (Math.abs(halfTarget - half) > 0.01) {
      half += (halfTarget - half) * Math.min(1, dt * 3.2);
      applyFrustum();
    }
    place();
  };

  return {
    camera,
    update,
    setMode: (next) => {
      mode = next;
      manualZoom = false;
      manualPitch = false;
      overviewHold = 0;
    },
    toggle: () => {
      mode = mode === 'follow' ? 'overview' : 'follow';
      manualZoom = false;
      manualPitch = false;
      overviewHold = 0;
    },
    follow: (position) => {
      heroTarget.copy(position);
    },
    focus: (point) => {
      focusPoint = point ? point.clone() : null;
      manualZoom = false;
    },
    pushOverview: (seconds) => {
      overviewHold = Math.max(overviewHold, seconds);
    },
    distanceToTarget: () => camera.position.distanceTo(target),
    mode: () => (overviewHold > 0 ? 'overview' : mode),
    project: (v) => {
      const projected = v.clone().project(camera);
      const width = canvas.clientWidth || 1;
      const height = canvas.clientHeight || 1;
      return { x: (projected.x * 0.5 + 0.5) * width, y: (-projected.y * 0.5 + 0.5) * height };
    },
    dispose: () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    },
  };
}
