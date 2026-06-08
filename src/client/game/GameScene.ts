import Phaser from 'phaser';
import { Direction } from '../../shared/types';
import { TILE_SIZE } from '../../shared/constants';
import { TiledMapManager, PrivateZone } from './TiledMapManager';
import { PlayerAvatar, RemoteAvatar } from './PlayerAvatar';
import { FollowSystem } from './FollowSystem';

/**
 * Configuration passed to GameScene on creation.
 */
export interface GameSceneConfig {
  mapJsonUrl: string;
  avatarId: number;       // 1-20
  roomId: string;
  displayName?: string;
  tilesetKey?: string;
  tilesetName?: string;
  tilesetImageUrl?: string;
  startX?: number;
  startY?: number;
}

/**
 * Events emitted by GameScene for integration with network/audio modules.
 */
export const GameSceneEvents = {
  /** Emitted when the local player enters a private zone. Payload: { zoneId: string } */
  ZONE_ENTER: 'zone_enter',
  /** Emitted when the local player leaves a private zone. Payload: { zoneId: string } */
  ZONE_LEAVE: 'zone_leave',
  /** Emitted when the local player's position changes. Payload: { x, y, direction } */
  POSITION_CHANGE: 'position_change',
} as const;

/**
 * Main game scene that handles:
 * - Map loading via TiledMapManager
 * - Local avatar input (arrows + WASD) and movement
 * - Camera following the local player
 * - Remote avatar management (add/update/remove)
 * - Private zone enter/leave detection with event emission
 */
export class GameScene extends Phaser.Scene {
  private avatar!: PlayerAvatar;
  private remotePlayers: Map<string, RemoteAvatar> = new Map();
  private mapManager!: TiledMapManager;
  private config!: GameSceneConfig;
  private followSystem!: FollowSystem;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private escapeKey!: Phaser.Input.Keyboard.Key;

  private currentZone: PrivateZone | null = null;
  private lastTileX: number = -1;
  private lastTileY: number = -1;

  constructor() {
    super({ key: 'GameScene' });
  }

  /**
   * Initialize scene data before create.
   */
  init(data: GameSceneConfig): void {
    this.config = data;
  }

  /**
   * Load map assets. The map JSON URL is provided via config.
   */
  preload(): void {
    this.load.tilemapTiledJSON('map', this.config.mapJsonUrl);
    // Load tileset image
    this.load.image('tileset', this.config.tilesetImageUrl || '/maps/tileset.png');
    // Load avatar sprites (1-20)
    for (let i = 1; i <= 20; i++) {
      this.load.image(`avatar_${i}`, `/sprites/avatar_${i}.png`);
    }
  }

  /**
   * Set up the scene: load map, create local avatar, configure camera and input.
   */
  create(): void {
    // Initialize the tiled map manager
    this.mapManager = new TiledMapManager(this);

    const tilesetKey = this.config.tilesetKey || 'tileset';
    const tilesetName = this.config.tilesetName || 'tileset';

    // Load the map using the TiledMapManager
    const mapConfig = this.mapManager.loadMap('map', tilesetKey, tilesetName);

    // Determine starting position (in pixels, centered on tile)
    const startTileX = this.config.startX ?? 5;
    const startTileY = this.config.startY ?? 5;
    const startPixelX = startTileX * TILE_SIZE + TILE_SIZE / 2;
    const startPixelY = startTileY * TILE_SIZE + TILE_SIZE / 2;

    // Create the local player avatar using the actual PlayerAvatar constructor:
    // (scene, x, y, avatarId, mapManager, textureKey, displayName)
    this.avatar = new PlayerAvatar(
      this,
      startPixelX,
      startPixelY,
      this.config.avatarId,
      this.mapManager,
      undefined,
      this.config.displayName
    );

    // Configure camera to follow the local avatar
    this.cameras.main.startFollow(this.avatar.getSprite(), true, 0.1, 0.1);
    this.cameras.main.setZoom(1);

    // Set camera bounds to the map size
    const mapWidth = mapConfig.json.width * TILE_SIZE;
    const mapHeight = mapConfig.json.height * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);

    // Initialize the follow system
    this.followSystem = new FollowSystem(
      this,
      this.avatar,
      this.remotePlayers,
      this.mapManager
    );

    // Set up keyboard input
    this.setupInput();

    // Initialize last tile position tracking
    this.lastTileX = this.avatar.tileX;
    this.lastTileY = this.avatar.tileY;

    // Check if avatar starts inside a private zone
    this.currentZone = this.mapManager.getPrivateZoneAt(startTileX, startTileY);
    if (this.currentZone) {
      this.events.emit(GameSceneEvents.ZONE_ENTER, { zoneId: this.currentZone.id });
    }
  }

  /**
   * Main update loop: process input, update positions, detect zone transitions.
   */
  update(_time: number, delta: number): void {
    // Check for Escape key to hide locate line
    if (this.escapeKey && this.escapeKey.isDown) {
      this.followSystem.handleEscape();
    }

    // Process keyboard input for local avatar movement
    const direction = this.getInputDirection();

    if (direction) {
      // User pressed a directional key - cancel follow if active (requirement 5.3)
      if (this.followSystem.isFollowing()) {
        this.followSystem.stopFollow();
      }

      const moved = this.avatar.move(direction, delta);

      if (moved) {
        this.handleAvatarMoved();
      }
    } else if (this.followSystem.isFollowing()) {
      // No manual input but follow is active - auto-move
      const followDir = this.followSystem.updateFollow(delta);

      if (followDir) {
        this.handleAvatarMoved();
      }
    } else {
      // No input - stop avatar
      this.avatar.stop();
    }

    // Update locate line position each frame
    this.followSystem.updateLocateLine();

    // Update all remote avatars (smooth interpolation)
    for (const remoteAvatar of this.remotePlayers.values()) {
      remoteAvatar.update(delta);
    }
  }

  // === Remote Avatar Management ===

  /**
   * Add a remote player avatar to the scene.
   *
   * @param sessionId - The session ID of the remote player
   * @param avatarId - The avatar sprite ID (1-20)
   * @param tileX - Starting tile X position
   * @param tileY - Starting tile Y position
   * @param direction - Initial facing direction
   */
  addRemotePlayer(
    sessionId: string,
    avatarId: number,
    tileX: number,
    tileY: number,
    direction: Direction = 'down',
    displayName?: string
  ): void {
    if (this.remotePlayers.has(sessionId)) {
      return; // Already exists
    }

    const pixelX = tileX * TILE_SIZE + TILE_SIZE / 2;
    const pixelY = tileY * TILE_SIZE + TILE_SIZE / 2;

    const remoteAvatar = new RemoteAvatar(this, pixelX, pixelY, avatarId, undefined, displayName);
    remoteAvatar.setTargetPosition(pixelX, pixelY, direction);
    this.remotePlayers.set(sessionId, remoteAvatar);
  }

  /**
   * Update a remote player's position and state.
   *
   * @param sessionId - The session ID of the remote player
   * @param tileX - New tile X position
   * @param tileY - New tile Y position
   * @param direction - Facing direction
   * @param isMoving - Whether the player is currently moving (used for animation hint)
   */
  updateRemotePlayer(
    sessionId: string,
    tileX: number,
    tileY: number,
    direction: Direction,
    _isMoving: boolean
  ): void {
    const remoteAvatar = this.remotePlayers.get(sessionId);
    if (remoteAvatar) {
      const pixelX = tileX * TILE_SIZE + TILE_SIZE / 2;
      const pixelY = tileY * TILE_SIZE + TILE_SIZE / 2;
      remoteAvatar.setTargetPosition(pixelX, pixelY, direction);
    }
  }

  /**
   * Remove a remote player avatar from the scene.
   *
   * @param sessionId - The session ID of the player to remove
   */
  removeRemotePlayer(sessionId: string): void {
    const remoteAvatar = this.remotePlayers.get(sessionId);
    if (remoteAvatar) {
      remoteAvatar.destroy();
      this.remotePlayers.delete(sessionId);

      // Notify follow system about the disconnection
      this.followSystem.onRemotePlayerRemoved(sessionId);
    }
  }

  /**
   * Update the mute indicator for a remote player.
   *
   * @param sessionId - The session ID of the remote player
   * @param muted - Whether the player is muted
   */
  setRemotePlayerMuted(sessionId: string, muted: boolean): void {
    const remoteAvatar = this.remotePlayers.get(sessionId);
    if (remoteAvatar) {
      remoteAvatar.setMuteIndicator(muted);
    }
  }

  // === Follow and Locate ===

  /**
   * Start following a target player. The local avatar auto-moves toward
   * the target, stopping 1 tile away.
   *
   * @param targetSessionId - The session ID of the player to follow
   */
  startFollow(targetSessionId: string): void {
    this.followSystem.startFollow(targetSessionId);
  }

  /**
   * Stop following the current target.
   */
  stopFollow(): void {
    this.followSystem.stopFollow();
  }

  /**
   * Show a line connecting the local avatar to a target player.
   * The line updates in real-time.
   *
   * @param targetSessionId - The session ID of the player to locate
   */
  showLocateLine(targetSessionId: string): void {
    this.followSystem.showLocateLine(targetSessionId);
  }

  /**
   * Hide/remove the locate line.
   */
  hideLocateLine(): void {
    this.followSystem.hideLocateLine();
  }

  // === Getters ===

  /** Get the local player avatar instance */
  getAvatar(): PlayerAvatar {
    return this.avatar;
  }

  /** Get the map manager instance */
  getMapManager(): TiledMapManager {
    return this.mapManager;
  }

  /** Get the current private zone the local player is in, or null */
  getCurrentZone(): PrivateZone | null {
    return this.currentZone;
  }

  /** Get the map of remote players */
  getRemotePlayers(): Map<string, RemoteAvatar> {
    return this.remotePlayers;
  }

  /** Get the follow system instance */
  getFollowSystem(): FollowSystem {
    return this.followSystem;
  }

  // === Private Methods ===

  /**
   * Set up keyboard input for arrows and WASD.
   */
  private setupInput(): void {
    if (!this.input.keyboard) {
      return;
    }

    this.cursors = this.input.keyboard.createCursorKeys();

    this.wasdKeys = {
      W: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    this.escapeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
  }

  /**
   * Read current input and return the movement direction, or null if no input.
   * Supports both arrow keys and WASD. Priority: up > down > left > right.
   */
  private getInputDirection(): Direction | null {
    const up = this.cursors?.up?.isDown || this.wasdKeys?.W?.isDown;
    const down = this.cursors?.down?.isDown || this.wasdKeys?.S?.isDown;
    const left = this.cursors?.left?.isDown || this.wasdKeys?.A?.isDown;
    const right = this.cursors?.right?.isDown || this.wasdKeys?.D?.isDown;

    if (up) return 'up';
    if (down) return 'down';
    if (left) return 'left';
    if (right) return 'right';

    return null;
  }

  /**
   * Handle avatar movement: detect tile changes, check zones, emit events.
   */
  private handleAvatarMoved(): void {
    const newTileX = this.avatar.tileX;
    const newTileY = this.avatar.tileY;

    if (newTileX !== this.lastTileX || newTileY !== this.lastTileY) {
      this.lastTileX = newTileX;
      this.lastTileY = newTileY;

      // Check for private zone transitions
      this.checkZoneTransition(newTileX, newTileY);

      // Emit position change event for network sync
      this.events.emit(GameSceneEvents.POSITION_CHANGE, {
        x: newTileX,
        y: newTileY,
        direction: this.avatar.direction,
      });
    }
  }

  /**
   * Check if the player has transitioned between private zones.
   * Emits ZONE_ENTER and ZONE_LEAVE events as appropriate.
   */
  private checkZoneTransition(tileX: number, tileY: number): void {
    const newZone = this.mapManager.getPrivateZoneAt(tileX, tileY);

    if (this.currentZone && !newZone) {
      // Left a private zone → back to general area
      this.events.emit(GameSceneEvents.ZONE_LEAVE, { zoneId: this.currentZone.id });
      this.currentZone = null;
    } else if (!this.currentZone && newZone) {
      // Entered a private zone from general area
      this.currentZone = newZone;
      this.events.emit(GameSceneEvents.ZONE_ENTER, { zoneId: newZone.id });
    } else if (this.currentZone && newZone && this.currentZone.id !== newZone.id) {
      // Moved from one private zone to another
      this.events.emit(GameSceneEvents.ZONE_LEAVE, { zoneId: this.currentZone.id });
      this.currentZone = newZone;
      this.events.emit(GameSceneEvents.ZONE_ENTER, { zoneId: newZone.id });
    }
  }
}
