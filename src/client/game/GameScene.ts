import Phaser from 'phaser';
import { Direction } from '../../shared/types';
import { TILE_SIZE, FLOOR_COLORS } from '../../shared/constants';
import { TiledMapManager, PrivateZone } from './TiledMapManager';
import { PlayerAvatar, RemoteAvatar } from './PlayerAvatar';
import { FollowSystem } from './FollowSystem';
import { DoorAnimationSystem } from './DoorAnimationSystem';
import { SpaceBackground } from './SpaceBackground';
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
 * - Local avatar input (arrow keys) and movement
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
  private doorAnimationSystem!: DoorAnimationSystem;
  private spaceBackground!: SpaceBackground;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private escapeKey!: Phaser.Input.Keyboard.Key;
  private shiftKey!: Phaser.Input.Keyboard.Key;

  private currentZone: PrivateZone | null = null;
  private lastTileX: number = -1;
  private lastTileY: number = -1;
  private navigationTarget: { x: number; y: number } | null = null;
  private navigationPath: { x: number; y: number }[] = [];

  /** Lock indicator graphics keyed by zoneId */
  private lockIndicators: Map<string, Phaser.GameObjects.Graphics[]> = new Map();

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

    // Determine map dimensions for background
    const mapWidth = mapConfig.json.width * TILE_SIZE;
    const mapHeight = mapConfig.json.height * TILE_SIZE;

    // Create SpaceBackground at depth 0 (below all tile layers)
    this.spaceBackground = new SpaceBackground(this, mapWidth, mapHeight);
    this.spaceBackground.create();

    // Create DoorAnimationSystem after map loading
    const objectsTileLayer = this.mapManager.getObjectsTileLayer();
    if (objectsTileLayer) {
      this.doorAnimationSystem = new DoorAnimationSystem(this.mapManager, objectsTileLayer);
    }

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

    // No camera bounds constraint — allows viewing space background beyond map edges

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
      // Meeting room interior: bigIx=19, bigIy=17, bigW=12, bigH=8
      const logoX = (19 + 6) * TILE_SIZE;
      const logoY = (17 + 4) * TILE_SIZE;
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
    // Update space background animations
    this.spaceBackground?.update(_time, delta);

    // Update door animation system with all avatar positions
    if (this.doorAnimationSystem) {
      const remotePositions = new Map<string, { tileX: number; tileY: number }>();
      for (const [sessionId, remoteAvatar] of this.remotePlayers) {
        const tileX = Math.floor(remoteAvatar.x / TILE_SIZE);
        const tileY = Math.floor(remoteAvatar.y / TILE_SIZE);
        remotePositions.set(sessionId, { tileX, tileY });
      }
      this.doorAnimationSystem.update(this.avatar.tileX, this.avatar.tileY, remotePositions);
    }

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

  // === Room State Binding ===

  /**
   * Bind to Colyseus room state to listen for zone state changes (lock + floor color).
   * Called by the network layer once a Colyseus room is joined and state is available.
   *
   * Listens for ZoneStateSchema changes on the room state `zones` map:
   * - isLocked: display/remove lock indicator on doorway tiles
   * - floorColorIndex: apply/clear floor tint for affected zone
   *
   * Also applies initial state for zones with non-default floorColorIndex.
   *
   * @param room - The Colyseus room instance with synchronized state
   */
  bindRoomState(room: any): void {
    if (!room || !room.state || !room.state.zones) {
      return;
    }

    const zones = room.state.zones;

    // Listen for new zone states being added
    zones.onAdd((zoneState: any, zoneId: string) => {
      // Apply initial state
      this.applyZoneLockState(zoneId, zoneState.isLocked);
      this.applyZoneFloorColor(zoneId, zoneState.floorColorIndex);

      // Listen for changes on this zone state
      zoneState.onChange(() => {
        this.applyZoneLockState(zoneId, zoneState.isLocked);
        this.applyZoneFloorColor(zoneId, zoneState.floorColorIndex);
      });
    });

    // Handle zone states that are removed (unlikely but handle gracefully)
    zones.onRemove((_zoneState: any, zoneId: string) => {
      this.removeLockIndicator(zoneId);
      this.clearZoneFloorColor(zoneId);
    });
  }

  /**
   * Apply or remove lock indicator for a zone based on its locked state.
   */
  private applyZoneLockState(zoneId: string, isLocked: boolean): void {
    if (isLocked) {
      this.showLockIndicator(zoneId);
    } else {
      this.removeLockIndicator(zoneId);
    }
  }

  /**
   * Apply or clear floor tint for a zone based on its floorColorIndex.
   */
  private applyZoneFloorColor(zoneId: string, floorColorIndex: number): void {
    const zone = this.findPrivateZoneById(zoneId);
    if (!zone) return;

    if (floorColorIndex >= 0 && floorColorIndex < FLOOR_COLORS.length) {
      // Convert hex string to number (e.g., '#2D1B69' → 0x2D1B69)
      const hexString = FLOOR_COLORS[floorColorIndex];
      const colorNumber = parseInt(hexString.replace('#', ''), 16);
      this.mapManager.applyFloorTint(zone, colorNumber);
    } else {
      // -1 or invalid index means no tint (default appearance)
      this.mapManager.clearFloorTint(zone);
    }
  }

  /**
   * Clear floor tint for a zone (called when zone state is removed).
   */
  private clearZoneFloorColor(zoneId: string): void {
    const zone = this.findPrivateZoneById(zoneId);
    if (!zone) return;
    this.mapManager.clearFloorTint(zone);
  }

  /**
   * Display red padlock overlay graphics on the doorway tiles of a locked zone.
   */
  private showLockIndicator(zoneId: string): void {
    // Remove existing indicators for this zone first
    this.removeLockIndicator(zoneId);

    const zone = this.findPrivateZoneById(zoneId);
    if (!zone) return;

    // Find door tiles adjacent to this zone's bounds
    const doorTilesForZone = this.findDoorTilesForZone(zone);
    if (doorTilesForZone.length === 0) return;

    const indicators: Phaser.GameObjects.Graphics[] = [];

    for (const doorPos of doorTilesForZone) {
      const graphics = this.add.graphics();
      graphics.setDepth(6); // UI overlays depth

      const pixelX = doorPos.tileX * TILE_SIZE;
      const pixelY = doorPos.tileY * TILE_SIZE;

      // Draw semi-transparent red overlay on the door tile
      graphics.fillStyle(0xFF4444, 0.4);
      graphics.fillRect(pixelX, pixelY, TILE_SIZE, TILE_SIZE);

      // Draw a small padlock shape (simplified)
      const centerX = pixelX + TILE_SIZE / 2;
      const centerY = pixelY + TILE_SIZE / 2;

      // Padlock body (red rectangle)
      graphics.fillStyle(0xFF4444, 0.9);
      graphics.fillRect(centerX - 5, centerY - 2, 10, 8);

      // Padlock shackle (arc/rectangle on top)
      graphics.lineStyle(2, 0xFF4444, 0.9);
      graphics.strokeRect(centerX - 3, centerY - 7, 6, 6);

      indicators.push(graphics);
    }

    this.lockIndicators.set(zoneId, indicators);
  }

  /**
   * Remove lock indicator graphics for a zone.
   */
  private removeLockIndicator(zoneId: string): void {
    const indicators = this.lockIndicators.get(zoneId);
    if (indicators) {
      for (const gfx of indicators) {
        gfx.destroy();
      }
      this.lockIndicators.delete(zoneId);
    }
  }

  /**
   * Find door tiles that are adjacent to (within 1 tile of) a zone's bounds.
   * Door tiles are on the wall line bordering the zone interior.
   */
  private findDoorTilesForZone(zone: PrivateZone): { tileX: number; tileY: number }[] {
    const doors = this.mapManager.getDoorTiles();
    const result: { tileX: number; tileY: number }[] = [];

    // Zone bounds in tile coordinates
    const zoneTileX = Math.floor(zone.bounds.x / TILE_SIZE);
    const zoneTileY = Math.floor(zone.bounds.y / TILE_SIZE);
    const zoneTileW = Math.floor(zone.bounds.width / TILE_SIZE);
    const zoneTileH = Math.floor(zone.bounds.height / TILE_SIZE);

    for (const door of doors) {
      // Check if the door tile is on the perimeter or within 1 tile of the zone bounds
      const isAdjacentX = door.tileX >= zoneTileX - 1 && door.tileX <= zoneTileX + zoneTileW;
      const isAdjacentY = door.tileY >= zoneTileY - 1 && door.tileY <= zoneTileY + zoneTileH;

      if (isAdjacentX && isAdjacentY) {
        // Additional check: the door should be on the edge (not deep inside)
        const isOnXEdge = door.tileX === zoneTileX - 1 || door.tileX === zoneTileX + zoneTileW;
        const isOnYEdge = door.tileY === zoneTileY - 1 || door.tileY === zoneTileY + zoneTileH;
        const isWithinX = door.tileX >= zoneTileX && door.tileX < zoneTileX + zoneTileW;
        const isWithinY = door.tileY >= zoneTileY && door.tileY < zoneTileY + zoneTileH;

        if ((isOnXEdge && isWithinY) || (isOnYEdge && isWithinX)) {
          result.push({ tileX: door.tileX, tileY: door.tileY });
        }
      }
    }

    return result;
  }

  /**
   * Find a PrivateZone by its ID.
   */
  private findPrivateZoneById(zoneId: string): PrivateZone | null {
    const zones = this.mapManager.getPrivateZones();
    return zones.find(z => z.id === zoneId) ?? null;
  }

  // === Private Methods ===

  /**
   * Set up keyboard input for arrow keys.
   */
  private setupInput(): void {
    if (!this.input.keyboard) {
      return;
    }

    this.cursors = this.input.keyboard.createCursorKeys();

    this.escapeKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  /**
   * Read current input and return the movement direction, or null if no input.
   * Uses arrow keys only. Priority: up > down > left > right.
   */
  private getInputDirection(): Direction | null {
    // Don't capture keyboard input when a text field is focused
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
      return null;
    }

    const up = this.cursors?.up?.isDown;
    const down = this.cursors?.down?.isDown;
    const left = this.cursors?.left?.isDown;
    const right = this.cursors?.right?.isDown;

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
