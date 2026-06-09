/**
 * Global avatar position tracker.
 * Updated by GameScene, read by overlay components.
 */

let currentTileX = 27;
let currentTileY = 15;

export function setAvatarPosition(tileX: number, tileY: number): void {
  currentTileX = tileX;
  currentTileY = tileY;
}

export function getAvatarPosition(): { tileX: number; tileY: number } {
  return { tileX: currentTileX, tileY: currentTileY };
}
