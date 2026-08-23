import { Replayer } from '../state/replayer';
import { Store } from '../state/store';
import { mountBanner } from './banner';
import { mountHero } from './hero';
import { mountHud } from './hud';
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

export function mountUi(root: HTMLElement, store: Store, replayer: Replayer, onCamera: () => void): Ui {
  const hud = mountHud(root, {
    onTogglePause: () => replayer.togglePaused(),
    onSpeed: (i) => replayer.setSpeedIndex(i),
    onNextMoment: () => replayer.jumpToNextMoment(),
    onCamera,
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
      const busy = store.endOpen || !!store.activeMoment;
      hero.setBubble(busy ? null : bubble);
      hero.setTalkBubble(busy ? null : talk);
    },
    openInspector: (id, at) => inspector.open(id, store, at),
    closeInspector: () => inspector.close(),
  };
}
