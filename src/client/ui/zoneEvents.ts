/**
 * Simple global event bus for zone enter/leave events.
 * GameScene publishes, Overlay subscribes.
 */

type ZoneListener = (zoneId: string | null) => void;

const listeners: ZoneListener[] = [];

export function onZoneChange(listener: ZoneListener): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function emitZoneChange(zoneId: string | null): void {
  console.log('[ZoneEvent] Zone changed to:', zoneId);
  for (const listener of listeners) {
    listener(zoneId);
  }
}
