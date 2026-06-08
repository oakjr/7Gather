import Phaser from 'phaser';
import { Direction } from '../../shared/types';
import { TILE_SIZE } from '../../shared/constants';
import { TiledMapManager } from './TiledMapManager';
import { PlayerAvatar, RemoteAvatar } from './PlayerAvatar';

/**
 * Events emitted by the FollowSystem.
 */
export const FollowSystemEvents = {
  /** Emitted when follow is cancelled because target disconnected. Payload: { targetSessionId } */
  FOLLOW_TARGET_DISCONNECTED: 'follow_target_disconnected',
  /** Emitted when follow is cancelled because target entered a private zone. Payload: { targetSessionId, zoneId } */
  FOLLOW_TARGET_IN_ZONE: 'follow_target_in_zone',
  /** Emitted when follow is cancelled by user input. */
  FOLLOW_CANCELLED: 'follow_cancelled',
} as const;

/**
 * Manages the Follow and Locate Line features.
 *
 * - Follow: auto-moves the local avatar toward a target remote avatar,
 *   stopping 1 tile away.
 * - Locate Line: draws a line from local avatar to target, updated in real-time.
 */
export class FollowSystem {
  private scene: Phaser.Scene;
  private localAvatar: PlayerAvatar;
  private remotePlayers: Map<string, RemoteAvatar>;
  private mapManager: TiledMapManager;

  /** The session ID of the target being followed, or null */
  private followTargetId: string | null = null;

  /** The locate line graphic, or null */
  private locateLine: Phaser.GameObjects.Graphics | null = null;

  /** The session ID of the locate line target, or null */
  private locateTargetId: string | null = null;

  constructor(
    scene: Phaser.Scene,
    localAvatar: PlayerAvatar,
    remotePlayers: Map<string, RemoteAvatar>,
    mapManager: TiledMapManager
  ) {
    this.scene = scene;
    this.localAvatar = localAvatar;
    this.remotePlayers = remotePlayers;
    this.mapManager = mapManager;
  }

  // === Follow System ===

  /**
   * Start following a target player. The local avatar will auto-move toward
   * the target, stopping 1 tile away.
   *
   * Also hides the locate line if visible.
   *
   * @param targetSessionId - Session ID of the player to follow
   */
  startFollow(targetSessionId: string): void {
    const target = this.remotePlayers.get(targetSessionId);
    if (!target) {
      return;
    }

    this.followTargetId = targetSessionId;

    // Hide locate line when follow is activated (requirement 5.1)
    this.hideLocateLine();
  }

  /**
   * Stop following the current target. Called when the user presses a
   * directional key or explicitly cancels.
   */
  stopFollow(): void {
    if (this.followTargetId) {
      this.followTargetId = null;
      this.localAvatar.stop();
      this.scene.events.emit(FollowSystemEvents.FOLLOW_CANCELLED);
    }
  }

  /**
   * Returns whether follow mode is currently active.
   */
  isFollowing(): boolean {
    return this.followTargetId !== null;
  }

  /**
   * Get the current follow target session ID.
   */
  getFollowTargetId(): string | null {
    return this.followTargetId;
  }

  /**
   * Update the follow system each frame. Should be called from scene update.
   * Handles auto-movement toward target and edge-case cancellation.
   *
   * @param delta - Frame delta in milliseconds
   * @returns The direction the avatar moved, or null if no movement happened
   */
  updateFollow(delta: number): Direction | null {
    if (!this.followTargetId) {
      return null;
    }

    const target = this.remotePlayers.get(this.followTargetId);

    // Cancel if target disconnected (requirement 5.4)
    if (!target) {
      const disconnectedId = this.followTargetId;
      this.followTargetId = null;
      this.localAvatar.stop();
      this.scene.events.emit(FollowSystemEvents.FOLLOW_TARGET_DISCONNECTED, {
        targetSessionId: disconnectedId,
      });
      return null;
    }

    // Check if target is in a private zone (requirement 5.5)
    const targetTileX = target.tileX;
    const targetTileY = target.tileY;
    const targetZone = this.mapManager.getPrivateZoneAt(targetTileX, targetTileY);

    if (targetZone) {
      // Check if we are NOT in the same zone
      const localTileX = this.localAvatar.tileX;
      const localTileY = this.localAvatar.tileY;
      const localZone = this.mapManager.getPrivateZoneAt(localTileX, localTileY);

      if (!localZone || localZone.id !== targetZone.id) {
        // Stop at the boundary - cancel follow
        const zoneTargetId = this.followTargetId;
        this.followTargetId = null;
        this.localAvatar.stop();
        this.scene.events.emit(FollowSystemEvents.FOLLOW_TARGET_IN_ZONE, {
          targetSessionId: zoneTargetId,
          zoneId: targetZone.id,
        });
        return null;
      }
    }

    // Calculate distance to target (in pixels)
    const dx = target.x - this.localAvatar.x;
    const dy = target.y - this.localAvatar.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Stop if within 1 tile distance
    const stopDistance = TILE_SIZE;
    if (distance <= stopDistance) {
      this.localAvatar.stop();
      return null;
    }

    // Determine primary direction (axis-aligned movement like the avatar normally does)
    const direction = this.getDirectionToward(dx, dy);

    // Move in that direction
    this.localAvatar.move(direction, delta);

    return direction;
  }

  // === Locate Line ===

  /**
   * Show a line connecting the local avatar to a target player.
   * The line updates in real-time as both avatars move.
   *
   * Hides any existing locate line first.
   *
   * @param targetSessionId - Session ID of the player to locate
   */
  showLocateLine(targetSessionId: string): void {
    const target = this.remotePlayers.get(targetSessionId);
    if (!target) {
      return;
    }

    // Hide previous line if any (requirement 5.1 - new search removes old line)
    this.hideLocateLine();

    this.locateTargetId = targetSessionId;

    // Create graphics object for the line
    this.locateLine = this.scene.add.graphics();
    this.locateLine.setDepth(5);

    // Draw initial line
    this.drawLocateLine();
  }

  /**
   * Hide/remove the locate line.
   * Called when: follow is activated, new search is started, or Escape is pressed.
   */
  hideLocateLine(): void {
    if (this.locateLine) {
      this.locateLine.destroy();
      this.locateLine = null;
    }
    this.locateTargetId = null;
  }

  /**
   * Returns whether a locate line is currently visible.
   */
  isLocateLineVisible(): boolean {
    return this.locateLine !== null && this.locateTargetId !== null;
  }

  /**
   * Get the locate line target session ID.
   */
  getLocateTargetId(): string | null {
    return this.locateTargetId;
  }

  /**
   * Update the locate line position each frame. Should be called from scene update.
   */
  updateLocateLine(): void {
    if (!this.locateLine || !this.locateTargetId) {
      return;
    }

    const target = this.remotePlayers.get(this.locateTargetId);
    if (!target) {
      // Target disconnected, remove line
      this.hideLocateLine();
      return;
    }

    this.drawLocateLine();
  }

  /**
   * Handle the Escape key - hides locate line.
   */
  handleEscape(): void {
    this.hideLocateLine();
  }

  /**
   * Notify the system that a remote player has been removed.
   * Cancels follow or removes locate line if they were targeting that player.
   *
   * @param sessionId - The session ID of the disconnected player
   */
  onRemotePlayerRemoved(sessionId: string): void {
    if (this.followTargetId === sessionId) {
      this.followTargetId = null;
      this.localAvatar.stop();
      this.scene.events.emit(FollowSystemEvents.FOLLOW_TARGET_DISCONNECTED, {
        targetSessionId: sessionId,
      });
    }

    if (this.locateTargetId === sessionId) {
      this.hideLocateLine();
    }
  }

  /**
   * Clean up all resources.
   */
  destroy(): void {
    this.hideLocateLine();
    this.followTargetId = null;
  }

  // === Private Helpers ===

  /**
   * Draw the locate line from local avatar to target.
   */
  private drawLocateLine(): void {
    if (!this.locateLine || !this.locateTargetId) {
      return;
    }

    const target = this.remotePlayers.get(this.locateTargetId);
    if (!target) {
      return;
    }

    this.locateLine.clear();

    // Draw a dashed-style line with partial transparency
    this.locateLine.lineStyle(2, 0x00ff88, 0.7);
    this.locateLine.beginPath();
    this.locateLine.moveTo(this.localAvatar.x, this.localAvatar.y);
    this.locateLine.lineTo(target.x, target.y);
    this.locateLine.strokePath();
  }

  /**
   * Determine the best axis-aligned direction to move toward a target offset.
   * Prefers the axis with the greater distance.
   */
  private getDirectionToward(dx: number, dy: number): Direction {
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx >= absDy) {
      return dx > 0 ? 'right' : 'left';
    } else {
      return dy > 0 ? 'down' : 'up';
    }
  }
}
