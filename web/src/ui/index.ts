import { Replayer } from '../state/replayer';
import { Store } from '../state/store';
import { mountBanner } from './banner';
import { type Card, mountBringCard, mountTitleCard } from './cards';
import { mountHero } from './hero';
import { type Chapter, mountHud } from './hud';
import { mountInspector } from './inspector';
import { mountLeaderboard } from './leaderboard';
import { mountMemory } from './memory';
import { mountMoments } from './moments';
import { mountTimeline } from './timeline';

export interface Ui {
  frame(bubble: { x: number; y: number } | null, talk: { x: number; y: number } | null): void;
  openInspector(id: string, at: { x: number; y: number }): void;
  closeInspector(): void;
}

export interface CameraControl {
  toggle(): void;
  follow(): void;
}

function chapterT(store: Store, chapter: Chapter): number | null {
  if (chapter === 'end') return store.end?.t ?? store.lastT;
  if (chapter === 'war') {
    const chioggia = store.frames.find((f) => f.events.some((e) => e.active && e.id === 'chioggia'));
    if (chioggia) return chioggia.t;
  }
  for (const f of store.frames) if (f.events.some((e) => e.active && e.kind === chapter)) return f.t;
  return null;
}

export function mountUi(
  root: HTMLElement,
  store: Store,
  replayer: Replayer,
  camera: CameraControl,
  withTitle = false,
): Ui {
  const hud = mountHud(root, {
    onTogglePause: () => replayer.togglePaused(),
    onSpeed: (i) => replayer.setSpeedIndex(i),
    onNextMoment: () => replayer.jumpToNextMoment(),
    onCamera: () => camera.toggle(),
    onChapter: (chapter) => {
      const t = chapterT(store, chapter);
      if (t !== null) replayer.seek(t, true);
    },
  });
  const hero = mountHero(root);
  const memory = mountMemory(root);
  const timeline = mountTimeline(root, { onSeek: (t) => replayer.seek(t) });
  const banner = mountBanner(root);
  const inspector = mountInspector(root);
  const leaderboard = mountLeaderboard(root, store);
  const moments = mountMoments(root, {
    onContinue: () => replayer.continueMoment(),
    onLeaderboard: () => leaderboard.toggle(),
  });
  const bring = mountBringCard(root);

  let title: Card | null = null;
  if (withTitle) {
    replayer.setPaused(true);
    title = mountTitleCard(root, () => {
      camera.follow();
      replayer.setSpeedIndex(0);
    });
  }

  window.addEventListener(
    'keydown',
    (ev) => {
      if (title?.open) {
        ev.preventDefault();
        ev.stopPropagation();
        title.close();
        return;
      }
      if (ev.code !== 'Space') return;
      if (bring.open) {
        ev.preventDefault();
        ev.stopPropagation();
        bring.close();
        return;
      }
      if (!store.endOpen) return;
      ev.preventDefault();
      ev.stopPropagation();
      bring.toggle();
    },
    true,
  );

  let last = performance.now();
  store.subscribe((s) => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    hud.update(s);
    hero.update(s);
    memory.update(s);
    timeline.update(s);
    moments.update(s);
    banner.update(s, dt);
  });

  return {
    frame: (bubble, talk) => {
      const busy = store.endOpen || !!store.activeMoment || !!title?.open;
      hero.setBubble(busy ? null : bubble);
      hero.setTalkBubble(busy ? null : talk);
    },
    openInspector: (id, at) => inspector.open(id, store, at),
    closeInspector: () => inspector.close(),
  };
}
