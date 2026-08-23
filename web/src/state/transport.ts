import type { AnyFrame } from './schema';
import { Store } from './store';

const RING_MS = 5 * 60 * 1000;

export class Transport {
  private ws: WebSocket | null = null;
  private closed = false;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private url: string,
    private store: Store,
    private onFrame?: (f: AnyFrame) => void,
  ) {}

  open(): void {
    this.closed = false;
    this.store.live = true;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retries = 0;
      this.store.connected = true;
      this.store.touch();
    };
    ws.onmessage = (ev) => this.receive(ev.data);
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      this.store.connected = false;
      this.store.touch();
      this.scheduleRetry();
    };
  }

  private receive(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of items) {
      if (!item || typeof item !== 'object' || typeof (item as { type?: unknown }).type !== 'string') continue;
      const frame = item as AnyFrame;
      this.store.applyFrame(frame);
      this.onFrame?.(frame);
    }
    this.store.trimOlderThan(RING_MS);
  }

  private scheduleRetry(): void {
    if (this.closed || this.retryTimer) return;
    const wait = Math.min(8000, 500 * 2 ** this.retries);
    this.retries += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.closed) this.open();
    }, wait);
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.ws?.close();
    this.ws = null;
    this.store.live = false;
    this.store.connected = false;
  }
}
