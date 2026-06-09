import Phaser from 'phaser';
import { Direction } from '../../shared/types';
import { TILE_SIZE } from '../../shared/constants';
import { TiledMapManager, PrivateZone } from './TiledMapManager';
import { PlayerAvatar, RemoteAvatar } from './PlayerAvatar';
import { FollowSystem } from './FollowSystem';
import { getSpawnPosition, getMyHomeRoom } from '../ui/homeRoom';
import { emitZoneChange } from '../ui/zoneEvents';
import { setAvatarPosition } from '../ui/avatarPosition';

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
  private shiftKey!: Phaser.Input.Keyboard.Key;

  private currentZone: PrivateZone | null = null;
  private lastTileX: number = -1;
  private lastTileY: number = -1;
  private navigationTarget: { x: number; y: number } | null = null;
  private navigationPath: { x: number; y: number }[] = [];

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
    // Load avatar sprites (1-18)
    for (let i = 1; i <= 18; i++) {
      this.load.image(`avatar_${i}`, `/sprites/avatar_${i}.png`);
    }
    // Load logo for meeting room floor and sidebar
    this.load.image('logo', '/logo.png');
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

    // Determine starting position (use home room if set, else config/default)
    const spawn = getSpawnPosition();
    const startTileX = this.config.startX ?? spawn.tileX;
    const startTileY = this.config.startY ?? spawn.tileY;
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
    this.cameras.main.setZoom(2);

    // Set camera bounds to the map size
    const mapWidth = mapConfig.json.width * TILE_SIZE;
    const mapHeight = mapConfig.json.height * TILE_SIZE;
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);

    // Enable mouse wheel zoom (min 0.5x, max 4x)
    this.input.on('wheel', (_pointer: any, _gameObjects: any, _deltaX: number, deltaY: number) => {
      const zoomStep = 0.1;
      const currentZoom = this.cameras.main.zoom;
      const newZoom = deltaY > 0
        ? Math.max(0.5, currentZoom - zoomStep)
        : Math.min(4, currentZoom + zoomStep);
      this.cameras.main.setZoom(newZoom);
    });

    // Enable camera drag to pan with LEFT mouse button
    // Double-click teleports to that position
    // Ctrl+D returns to home room
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let camStartX = 0;
    let camStartY = 0;
    let pointerDownTime = 0;
    const DRAG_THRESHOLD = 5; // pixels moved before considered a drag
    let hasMoved = false;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown()) {
        isDragging = true;
        hasMoved = false;
        dragStartX = pointer.x;
        dragStartY = pointer.y;
        camStartX = this.cameras.main.scrollX;
        camStartY = this.cameras.main.scrollY;
        pointerDownTime = Date.now();
        this.cameras.main.stopFollow();
      }
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (isDragging) {
        const dx = dragStartX - pointer.x;
        const dy = dragStartY - pointer.y;
        if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
          hasMoved = true;
        }
        if (hasMoved) {
          this.cameras.main.scrollX = camStartX + dx / this.cameras.main.zoom;
          this.cameras.main.scrollY = camStartY + dy / this.cameras.main.zoom;
        }
      }
    });

    // Double-click: navigate avatar to that tile (walking fast)
    let lastClickTime = 0;
    let lastClickX = 0;
    let lastClickY = 0;

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (isDragging) {
        isDragging = false;
        if (!hasMoved) {
          const now = Date.now();
          const dx = Math.abs(pointer.x - lastClickX);
          const dy = Math.abs(pointer.y - lastClickY);
          if (now - lastClickTime < 350 && dx < 10 && dy < 10) {
            // Double-click: navigate to target via pathfinding
            const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const targetTileX = Math.floor(worldPoint.x / TILE_SIZE);
            const targetTileY = Math.floor(worldPoint.y / TILE_SIZE);
            if (!this.mapManager.isColliding(targetTileX * TILE_SIZE + TILE_SIZE / 2, targetTileY * TILE_SIZE + TILE_SIZE / 2)) {
              this.navigateTo(targetTileX, targetTileY);
            }
            lastClickTime = 0;
          } else {
            lastClickTime = now;
            lastClickX = pointer.x;
            lastClickY = pointer.y;
            this.cameras.main.startFollow(this.avatar.getSprite(), true, 0.1, 0.1);
          }
        }
      }
    });

    // Disable right-click context menu on the canvas
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Ctrl+D: navigate to home room
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        const home = getMyHomeRoom();
        console.log('[GameScene] Ctrl+D pressed, home:', home);
        if (home) {
          this.navigateTo(home.spawnTileX, home.spawnTileY);
        }
      }
    });

    // Add logo to meeting room floor (centered, 50% opacity)
    if (this.textures.exists('logo')) {
      // Meeting room interior: x=21-32, y=20-27 (from generate-map.js: bigIx=21, bigIy=20, bigW=12, bigH=8)
      const logoX = (21 + 6) * TILE_SIZE; // center of 12-wide room
      const logoY = (20 + 4) * TILE_SIZE; // center of 8-tall room
      const logo = this.add.image(logoX, logoY, 'logo');
      logo.setAlpha(0.5);
      logo.setDepth(2); // Above ground, below avatars
      // Scale to fill most of the room floor (room is 12*32=384px wide)
      const roomPixelW = 12 * TILE_SIZE;
      const logoScale = roomPixelW / logo.width * 0.67;
      logo.setScale(logoScale);
    }

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

    // Sprint: Shift key held = run faster
    const isSprinting = this.shiftKey?.isDown ?? false;
    this.avatar.setSprinting(isSprinting);

    // Keep name labels at constant size regardless of zoom
    const zoom = this.cameras.main.zoom;
    this.avatar.setNameScale(zoom);
    for (const remoteAvatar of this.remotePlayers.values()) {
      remoteAvatar.setNameScale(zoom);
    }

    // Process keyboard input for local avatar movement
    const direction = this.getInputDirection();

    if (direction) {
      // User pressed a directional key - cancel follow if active (requirement 5.3)
      if (this.followSystem.isFollowing()) {
        this.followSystem.stopFollow();
      }
      // Cancel navigation on manual input
      this.navigationTarget = null;
      this.navigationPath = [];
      // Re-center camera on avatar when moving
      if (!this.cameras.main.deadzone) {
        this.cameras.main.startFollow(this.avatar.getSprite(), true, 0.1, 0.1);
      }

      this.avatar.setSprinting(isSprinting);
      const moved = this.avatar.move(direction, delta);

      if (moved) {
        this.handleAvatarMoved();
      }
    } else if (this.navigationTarget && this.navigationPath.length > 0) {
      // Auto-navigate following the pre-calculated path at sprint speed
      this.avatar.setSprinting(true);
      const nextWaypoint = this.navigationPath[0];
      const targetPixelX = nextWaypoint.x * TILE_SIZE + TILE_SIZE / 2;
      const targetPixelY = nextWaypoint.y * TILE_SIZE + TILE_SIZE / 2;
      const dx = targetPixelX - this.avatar.x;
      const dy = targetPixelY - this.avatar.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < TILE_SIZE * 0.3) {
        // Reached waypoint, move to next
        this.navigationPath.shift();
        if (this.navigationPath.length === 0) {
          // Arrived at final destination
          this.navigationTarget = null;
          this.avatar.setSprinting(false);
          this.avatar.stop();
        }
        this.handleAvatarMoved();
      } else {
        // Move toward current waypoint
        let navDir: Direction;
        if (Math.abs(dx) > Math.abs(dy)) {
          navDir = dx > 0 ? 'right' : 'left';
        } else {
          navDir = dy > 0 ? 'down' : 'up';
        }
        const moved = this.avatar.move(navDir, delta);
        if (moved) {
          this.handleAvatarMoved();
        } else {
          // Stuck (shouldn't happen with BFS path) — cancel
          this.navigationTarget = null;
          this.navigationPath = [];
          this.avatar.setSprinting(false);
        }
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

  /** Start path-based navigation to a target tile */
  navigateTo(targetX: number, targetY: number): void {
    const path = this.mapManager.findPath(
      this.avatar.tileX, this.avatar.tileY,
      targetX, targetY, true
    );
    if (path && path.length > 0) {
      this.navigationPath = path;
      this.navigationTarget = { x: targetX, y: targetY };
      this.cameras.main.startFollow(this.avatar.getSprite(), true, 0.1, 0.1);
    }
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
    this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
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

      // Update global position tracker
      setAvatarPosition(newTileX, newTileY);

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

    // Debug: log zone detection
    if (newZone && !this.currentZone) {
      console.log('[GameScene] Entering zone:', newZone.id, 'at tile', tileX, tileY);
    }

    if (this.currentZone && !newZone) {
      this.events.emit(GameSceneEvents.ZONE_LEAVE, { zoneId: this.currentZone.id });
      emitZoneChange(null);
      this.currentZone = null;
    } else if (!this.currentZone && newZone) {
      this.currentZone = newZone;
      this.events.emit(GameSceneEvents.ZONE_ENTER, { zoneId: newZone.id });
      emitZoneChange(newZone.id);
    } else if (this.currentZone && newZone && this.currentZone.id !== newZone.id) {
      this.events.emit(GameSceneEvents.ZONE_LEAVE, { zoneId: this.currentZone.id });
      this.currentZone = newZone;
      this.events.emit(GameSceneEvents.ZONE_ENTER, { zoneId: newZone.id });
      emitZoneChange(newZone.id);
    }
  }
}
