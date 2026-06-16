/**
 * Shared constants for the 7Gather spatial collaboration platform.
 * Used by both client and server.
 */

/** Avatar movement speed in tiles per second */
export const AVATAR_SPEED = 6;

/** Tile size in pixels */
export const TILE_SIZE = 32;

/** Maximum number of avatars (concurrent users) per room */
export const MAX_AVATARS = 18;

/** Maximum number of simultaneous rooms */
export const MAX_ROOMS = 50;

/** State synchronization rate in updates per second */
export const SYNC_RATE = 20;

/** Maximum acceptable latency in milliseconds for state sync */
export const MAX_LATENCY_MS = 200;

/** Timeout in milliseconds before treating a disconnection as permanent */
export const RECONNECT_TIMEOUT_MS = 5000;

/** Predefined floor color palette for space-themed room decoration */
export const FLOOR_COLORS: readonly string[] = [
  '#2D1B69', // 0: deep purple
  '#00E5FF', // 1: cyan glow
  '#39FF14', // 2: neon green
  '#8B0000', // 3: dark red
  '#1A237E', // 4: blue nebula
  '#7C4DFF', // 5: violet
  '#FF00FF', // 6: magenta
  '#008080', // 7: teal
  '#FF6D00', // 8: dark orange
  '#0D47A1', // 9: cosmic blue
  '#00C853', // 10: emerald
  '#DC143C', // 11: crimson
  '#3F00FF', // 12: indigo
  '#FFD700', // 13: gold
  '#C0C0C0', // 14: silver
  '#00CED1', // 15: turquoise
  '#B388FF', // 16: lavender
  '#FF007F', // 17: rose
] as const;

/** Total number of predefined floor colors */
export const FLOOR_COLOR_COUNT = 18;

// === Status Indicator Colors (Phaser hex format) ===

/** Color map for user status indicators on avatars */
export const STATUS_COLORS: Record<string, number> = {
  available: 0x4cdf8b,
  busy: 0xffb347,
  dnd: 0xff6b6b,
};

// === Call System ===

/** Time in ms before a call notification auto-dismisses */
export const CALL_TIMEOUT_MS = 60_000;

/** Maximum number of visible call notifications at once */
export const MAX_VISIBLE_CALLS = 3;

// === Screen Share ===

/** Width in pixels for the minimized screen share thumbnail */
export const SCREEN_SHARE_THUMBNAIL_WIDTH = 120;

/** Height in pixels for the minimized screen share thumbnail */
export const SCREEN_SHARE_THUMBNAIL_HEIGHT = 80;
