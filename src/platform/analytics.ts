/**
 * Analytics (§11): funnel events, session timing, exit point.
 * In the prototype events are kept in a ring buffer (visible via admin_log /
 * the Settings debug panel) and mirrored to console in dev mode.
 * A real backend plugs in at `flush` without touching call sites.
 */

export interface AnalyticsEvent {
  name: string;
  at: number;
  props?: Record<string, string | number | boolean>;
}

const BUFFER_LIMIT = 200;
const buffer: AnalyticsEvent[] = [];
let sessionStart = Date.now();
let firstOpened = false;
void 0;

export function track(name: string, props?: Record<string, string | number | boolean>): void {
  const ev: AnalyticsEvent = { name, at: Date.now(), props };
  buffer.push(ev);
  if (buffer.length > BUFFER_LIMIT) buffer.shift();
  if (import.meta.env.DEV) console.debug('[analytics]', name, props ?? '');
}

export function trackOnce(name: string, props?: Record<string, string | number | boolean>): void {
  if (buffer.some((e) => e.name === name)) return;
  track(name, props);
}

export function markOpen(): void {
  if (firstOpened) return;
  firstOpened = true;
  sessionStart = Date.now();
  track('app_open');
}

export function sessionDurationMs(): number {
  return Date.now() - sessionStart;
}

export function recentEvents(n = 20): AnalyticsEvent[] {
  return buffer.slice(-n);
}

export function flush(): void {
  // Prototype: no-op sink. Production: POST batch to the game server.
}
