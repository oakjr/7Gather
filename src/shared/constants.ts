/**
 * Shared constants for the 7Gather spatial collaboration platform.
 * Used by both client and server.
 */

/** Avatar movement speed in tiles per second */
export const AVATAR_SPEED = 4;

/** Tile size in pixels */
export const TILE_SIZE = 32;

/** Maximum number of avatars (concurrent users) per room */
export const MAX_AVATARS = 20;

/** Maximum number of simultaneous rooms */
export const MAX_ROOMS = 50;

/** State synchronization rate in updates per second */
export const SYNC_RATE = 20;

/** Maximum acceptable latency in milliseconds for state sync */
export const MAX_LATENCY_MS = 200;

/** Timeout in milliseconds before treating a disconnection as permanent */
export const RECONNECT_TIMEOUT_MS = 5000;
