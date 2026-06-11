import { DoorTile, TiledMapManager } from './TiledMapManager';

/**
 * Manages automatic door opening/closing based on avatar proximity.
 * 
 * Doors open when any avatar (local or remote) is within Manhattan distance 1,
 * and close when all avatars are beyond Manhattan distance 2.
 * Tile swaps are immediate (single frame), well under the 300ms requirement.
 * 
 * Locked doors remain closed and do not respond to proximity.
 */
export class DoorAnimationSystem {
  private doors: DoorTile[];
  private mapManager: TiledMapManager;
  /** Set of zoneIds that are currently locked */
  private lockedZones: Set<string> = new Set();

  constructor(mapManager: TiledMapManager, _objectsLayer: Phaser.Tilemaps.TilemapLayer) {
    this.mapManager = mapManager;
    this.doors = mapManager.getDoorTiles();
  }

  /**
   * Set the locked state of a zone. Locked zone doors stay closed.
   */
  setZoneLocked(zoneId: string, locked: boolean): void {
    if (locked) {
      this.lockedZones.add(zoneId);
      // Force close all doors for this zone and mark as collision
      this.closeDoorsForZone(zoneId);
    } else {
      this.lockedZones.delete(zoneId);
      // Clear collision on doors for this zone
      this.clearLockedDoorsForZone(zoneId);
    }
  }

  /**
   * Force close all doors adjacent to a zone and mark positions as locked collision.
   */
  private closeDoorsForZone(zoneId: string): void {
    for (const door of this.doors) {
      if (this.isDoorAdjacentToZone(door, zoneId)) {
        if (door.isOpen) {
          this.mapManager.setDoorState(door.tileX, door.tileY, false);
        }
        this.mapManager.setLockedDoor(door.tileX, door.tileY);
      }
    }
  }

  /**
   * Clear locked collision on doors adjacent to a zone.
   */
  private clearLockedDoorsForZone(zoneId: string): void {
    for (const door of this.doors) {
      if (this.isDoorAdjacentToZone(door, zoneId)) {
        this.mapManager.clearLockedDoor(door.tileX, door.tileY);
      }
    }
  }

  /**
   * Check if a door tile is adjacent to a specific zone.
   */
  private isDoorAdjacentToZone(door: DoorTile, zoneId: string): boolean {
    const zones = this.mapManager.getPrivateZones();
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return false;

    const zoneTileX = Math.floor(zone.bounds.x / 32);
    const zoneTileY = Math.floor(zone.bounds.y / 32);
    const zoneTileW = Math.floor(zone.bounds.width / 32);
    const zoneTileH = Math.floor(zone.bounds.height / 32);

    const isAdjacentX = door.tileX >= zoneTileX - 1 && door.tileX <= zoneTileX + zoneTileW;
    const isAdjacentY = door.tileY >= zoneTileY - 1 && door.tileY <= zoneTileY + zoneTileH;

    if (isAdjacentX && isAdjacentY) {
      const isOnXEdge = door.tileX === zoneTileX - 1 || door.tileX === zoneTileX + zoneTileW;
      const isOnYEdge = door.tileY === zoneTileY - 1 || door.tileY === zoneTileY + zoneTileH;
      const isWithinX = door.tileX >= zoneTileX && door.tileX < zoneTileX + zoneTileW;
      const isWithinY = door.tileY >= zoneTileY && door.tileY < zoneTileY + zoneTileH;

      if ((isOnXEdge && isWithinY) || (isOnYEdge && isWithinX)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a door tile is adjacent to any locked zone.
   */
  private isDoorInLockedZone(door: DoorTile): boolean {
    if (this.lockedZones.size === 0) return false;

    const zones = this.mapManager.getPrivateZones();
    for (const zone of zones) {
      if (!this.lockedZones.has(zone.id)) continue;

      // Check if door is on the perimeter of this zone (within 1 tile of bounds)
      const zoneTileX = Math.floor(zone.bounds.x / 32);
      const zoneTileY = Math.floor(zone.bounds.y / 32);
      const zoneTileW = Math.floor(zone.bounds.width / 32);
      const zoneTileH = Math.floor(zone.bounds.height / 32);

      const isAdjacentX = door.tileX >= zoneTileX - 1 && door.tileX <= zoneTileX + zoneTileW;
      const isAdjacentY = door.tileY >= zoneTileY - 1 && door.tileY <= zoneTileY + zoneTileH;

      if (isAdjacentX && isAdjacentY) {
        const isOnXEdge = door.tileX === zoneTileX - 1 || door.tileX === zoneTileX + zoneTileW;
        const isOnYEdge = door.tileY === zoneTileY - 1 || door.tileY === zoneTileY + zoneTileH;
        const isWithinX = door.tileX >= zoneTileX && door.tileX < zoneTileX + zoneTileW;
        const isWithinY = door.tileY >= zoneTileY && door.tileY < zoneTileY + zoneTileH;

        if ((isOnXEdge && isWithinY) || (isOnYEdge && isWithinX)) {
          return true;
        }
      }
    }
    return false;
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
      // Skip doors that belong to a locked zone — they stay closed
      if (this.isDoorInLockedZone(door)) {
        if (door.isOpen) {
          this.mapManager.setDoorState(door.tileX, door.tileY, false);
        }
        continue;
      }

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
