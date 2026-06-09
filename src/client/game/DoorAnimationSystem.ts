import { DoorTile, TiledMapManager } from './TiledMapManager';

/**
 * Manages automatic door opening/closing based on avatar proximity.
 * 
 * Doors open when any avatar (local or remote) is within Manhattan distance 1,
 * and close when all avatars are beyond Manhattan distance 2.
 * Tile swaps are immediate (single frame), well under the 300ms requirement.
 */
export class DoorAnimationSystem {
  private doors: DoorTile[];
  private mapManager: TiledMapManager;

  constructor(mapManager: TiledMapManager, _objectsLayer: Phaser.Tilemaps.TilemapLayer) {
    this.mapManager = mapManager;
    this.doors = mapManager.getDoorTiles();
  }

  /**
   * Evaluate proximity between all avatar positions and all door tiles,
   * opening or closing doors as needed. Called every frame from GameScene.update().
   *
   * @param localAvatarTileX - Local avatar's tile X coordinate
   * @param localAvatarTileY - Local avatar's tile Y coordinate
   * @param remotePositions - Map of remote player session IDs to their tile positions
   */
  update(
    localAvatarTileX: number,
    localAvatarTileY: number,
    remotePositions: Map<string, { tileX: number; tileY: number }>
  ): void {
    for (const door of this.doors) {
      if (!door.isOpen) {
        // Closed door: check if any avatar is within Manhattan distance ≤ 1
        if (this.isAnyAvatarWithinThreshold(door, localAvatarTileX, localAvatarTileY, remotePositions, 1)) {
          this.mapManager.setDoorState(door.tileX, door.tileY, true);
        }
      } else {
        // Open door: check if all avatars are beyond Manhattan distance > 2
        if (!this.isAnyAvatarWithinThreshold(door, localAvatarTileX, localAvatarTileY, remotePositions, 2)) {
          this.mapManager.setDoorState(door.tileX, door.tileY, false);
        }
      }
    }
  }

  /**
   * Check if any avatar (local or remote) is within the given Manhattan distance threshold
   * of the specified door.
   */
  private isAnyAvatarWithinThreshold(
    door: DoorTile,
    localAvatarTileX: number,
    localAvatarTileY: number,
    remotePositions: Map<string, { tileX: number; tileY: number }>,
    threshold: number
  ): boolean {
    // Check local avatar
    if (this.isWithinThreshold(door.tileX, door.tileY, localAvatarTileX, localAvatarTileY, threshold)) {
      return true;
    }

    // Check remote avatars
    for (const [, pos] of remotePositions) {
      if (this.isWithinThreshold(door.tileX, door.tileY, pos.tileX, pos.tileY, threshold)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compute Manhattan distance and check if it is within (≤) the threshold.
   * Manhattan distance = |doorX - avatarX| + |doorY - avatarY|
   */
  private isWithinThreshold(
    doorX: number,
    doorY: number,
    avatarX: number,
    avatarY: number,
    threshold: number
  ): boolean {
    const distance = Math.abs(doorX - avatarX) + Math.abs(doorY - avatarY);
    return distance <= threshold;
  }
}
