/**
 * Home Room system — allows a player to claim a private room as their own.
 * Persisted in localStorage. When claimed, the player spawns there on reload.
 * 
 * Rules:
 * - Only one room per player
 * - A room can only have one owner
 * - Player must be inside a free room to claim it
 * - Claiming shows their name at 50% opacity at the room entrance
 */

const HOME_ROOM_KEY = 'home_room';
const CLAIMED_ROOMS_KEY = 'claimed_rooms'; // JSON: { [zoneId]: ownerName }

export interface HomeRoomData {
  zoneId: string;
  ownerName: string;
  spawnTileX: number;
  spawnTileY: number;
}

/**
 * Get the current player's home room, or null if none claimed.
 */
export function getMyHomeRoom(): HomeRoomData | null {
  const stored = localStorage.getItem(HOME_ROOM_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

/**
 * Set (claim) a home room for the current player.
 */
export function setMyHomeRoom(data: HomeRoomData): void {
  localStorage.setItem(HOME_ROOM_KEY, JSON.stringify(data));
  // Also register in the global claimed rooms list
  const claimed = getClaimedRooms();
  claimed[data.zoneId] = data.ownerName;
  localStorage.setItem(CLAIMED_ROOMS_KEY, JSON.stringify(claimed));
}

/**
 * Remove (release) the current player's home room.
 */
export function clearMyHomeRoom(): void {
  const current = getMyHomeRoom();
  if (current) {
    const claimed = getClaimedRooms();
    delete claimed[current.zoneId];
    localStorage.setItem(CLAIMED_ROOMS_KEY, JSON.stringify(claimed));
  }
  localStorage.removeItem(HOME_ROOM_KEY);
}

/**
 * Get all claimed rooms (zoneId → ownerName mapping).
 */
export function getClaimedRooms(): Record<string, string> {
  const stored = localStorage.getItem(CLAIMED_ROOMS_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

/**
 * Check if a specific room is available (not claimed by anyone).
 */
export function isRoomAvailable(zoneId: string): boolean {
  const claimed = getClaimedRooms();
  return !claimed[zoneId];
}

/**
 * Check if a specific room belongs to the current player.
 */
export function isMyRoom(zoneId: string): boolean {
  const home = getMyHomeRoom();
  return home?.zoneId === zoneId;
}

/**
 * Get the owner name of a room, or null if unclaimed.
 */
export function getRoomOwner(zoneId: string): string | null {
  const claimed = getClaimedRooms();
  return claimed[zoneId] || null;
}

/**
 * Get spawn position. If player has a home room, spawn there.
 * Otherwise use default center position.
 */
export function getSpawnPosition(): { tileX: number; tileY: number } {
  const home = getMyHomeRoom();
  console.log('[homeRoom] getSpawnPosition, home:', home);
  if (home) {
    return { tileX: home.spawnTileX, tileY: home.spawnTileY };
  }
  // Default center of map
  return { tileX: 27, tileY: 15 };
}
