import Phaser from 'phaser';
import { Direction } from '../../shared/types';
import { AVATAR_SPEED, TILE_SIZE } from '../../shared/constants';
import { TiledMapManager } from './TiledMapManager';

/**
 * Local player avatar with keyboard-driven movement, collision detection,
 * directional animations, and a mute indicator overlay.
 */
export class PlayerAvatar {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Sprite;
  private nameLabel: Phaser.GameObjects.Text | null = null;
  private muteIcon: Phaser.GameObjects.Sprite | null = null;
  private mapManager: TiledMapManager;
  private _direction: Direction = 'down';
  private _isMoving: boolean = false;
  private _isMuted: boolean = false;
  private avatarId: number;

  /** Speed in pixels per second (4 tiles/sec * 32 px/tile = 128 px/s) */
  private readonly speed: number = AVATAR_SPEED * TILE_SIZE;
  /** Sprint multiplier */
  private readonly sprintMultiplier: number = 3.5;
  private _isSprinting: boolean = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    avatarId: number,
    mapManager: TiledMapManager,
    textureKey?: string,
    displayName?: string
  ) {
    this.scene = scene;
    this.avatarId = avatarId;
    this.mapManager = mapManager;

    const key = textureKey ?? `avatar_${avatarId}`;
    this.sprite = scene.add.sprite(x, y, key);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setDepth(10);
    this.sprite.setScale(0.55);

    // Show display name above avatar
    if (displayName) {
      this.nameLabel = scene.add.text(x, y - 20, displayName, {
        fontSize: '18px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
      });
      this.nameLabel.setOrigin(0.5, 1);
      this.nameLabel.setDepth(11);
    }
  }

  // --- Public accessors ---

  get direction(): Direction {
    return this._direction;
  }

  get isMoving(): boolean {
    return this._isMoving;
  }

  get isMuted(): boolean {
    return this._isMuted;
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  /** Tile X coordinate */
  get tileX(): number {
    return Math.floor(this.sprite.x / TILE_SIZE);
  }

  /** Tile Y coordinate */
  get tileY(): number {
    return Math.floor(this.sprite.y / TILE_SIZE);
  }

  getSprite(): Phaser.GameObjects.Sprite {
    return this.sprite;
  }

  /** Set sprinting state (Shift held) */
  setSprinting(sprinting: boolean): void {
    this._isSprinting = sprinting;
  }

  /** Teleport avatar instantly to a tile position */
  teleportTo(tileX: number, tileY: number): void {
    this.sprite.x = tileX * TILE_SIZE + TILE_SIZE / 2;
    this.sprite.y = tileY * TILE_SIZE + TILE_SIZE / 2;
    this.updateNameLabelPosition();
    this.updateMuteIconPosition();
  }

  /** Adjust name label scale to be zoom-independent */
  setNameScale(zoom: number): void {
    if (this.nameLabel && zoom > 0) {
      this.nameLabel.setScale(1 / zoom);
    }
  }

  // --- Movement ---

  /**
   * Move the avatar in the given direction, applying delta-time interpolation.
   * Checks collision against the Physics layer only.
   *
   * @param direction - The direction to move
   * @param delta - Frame delta in milliseconds (from Phaser update loop)
   * @returns true if the avatar moved, false if blocked by collision
   */
  move(direction: Direction, delta: number): boolean {
    this._direction = direction;

    const deltaSeconds = delta / 1000;
    const currentSpeed = this._isSprinting ? this.speed * this.sprintMultiplier : this.speed;
    const distance = currentSpeed * deltaSeconds;

    let newX = this.sprite.x;
    let newY = this.sprite.y;

    switch (direction) {
      case 'up':
        newY -= distance;
        break;
      case 'down':
        newY += distance;
        break;
      case 'left':
        newX -= distance;
        break;
      case 'right':
        newX += distance;
        break;
    }

    // Check collision at the target position
    if (this.mapManager.isColliding(newX, newY)) {
      this._isMoving = false;
      this.playIdleAnimation();
      return false;
    }

    this.sprite.x = newX;
    this.sprite.y = newY;
    this._isMoving = true;
    this.playWalkAnimation(direction);
    this.updateMuteIconPosition();
    this.updateNameLabelPosition();

    return true;
  }

  /**
   * Stop movement and switch to idle animation.
   */
  stop(): void {
    this._isMoving = false;
    this.playIdleAnimation();
  }

  // --- Position ---

  /**
   * Teleport the avatar to a specific pixel position.
   */
  setPosition(x: number, y: number): void {
    this.sprite.x = x;
    this.sprite.y = y;
    this.updateMuteIconPosition();
  }

  /**
   * Set position using tile coordinates.
   */
  setTilePosition(tileX: number, tileY: number): void {
    this.sprite.x = tileX * TILE_SIZE + TILE_SIZE / 2;
    this.sprite.y = tileY * TILE_SIZE + TILE_SIZE / 2;
    this.updateMuteIconPosition();
  }

  // --- Animations ---

  /**
   * Play walk animation for the given direction.
   * Animation key format: `avatar_{id}_walk_{direction}`
   */
  playWalkAnimation(direction: Direction): void {
    this._direction = direction;
    const animKey = `avatar_${this.avatarId}_walk_${direction}`;

    if (this.sprite.anims && this.scene.anims.exists(animKey)) {
      this.sprite.anims.play(animKey, true);
    }
  }

  /**
   * Play idle animation for the current direction.
   * Animation key format: `avatar_{id}_idle_{direction}`
   * Falls back to `avatar_{id}_idle` if directional idle doesn't exist.
   */
  playIdleAnimation(): void {
    const directionalKey = `avatar_${this.avatarId}_idle_${this._direction}`;
    const genericKey = `avatar_${this.avatarId}_idle`;

    if (this.sprite.anims) {
      if (this.scene.anims.exists(directionalKey)) {
        this.sprite.anims.play(directionalKey, true);
      } else if (this.scene.anims.exists(genericKey)) {
        this.sprite.anims.play(genericKey, true);
      } else {
        this.sprite.anims.stop();
      }
    }
  }

  // --- Mute Indicator ---

  /**
   * Show or hide the mute indicator on the avatar sprite.
   * Renders a small icon above the avatar when muted.
   */
  setMuteIndicator(muted: boolean): void {
    this._isMuted = muted;

    if (muted) {
      if (!this.muteIcon) {
        const muteKey = 'mute_icon';
        if (this.scene.textures.exists(muteKey)) {
          this.muteIcon = this.scene.add.sprite(
            this.sprite.x,
            this.sprite.y - TILE_SIZE * 0.75,
            muteKey
          );
        } else {
          // Fallback: draw a simple red circle with an X using graphics rendered to texture
          this.muteIcon = this.createFallbackMuteIcon();
        }
        if (this.muteIcon) {
          this.muteIcon.setDepth(this.sprite.depth + 1);
          this.muteIcon.setScale(0.5);
        }
      }
      if (this.muteIcon) {
        this.muteIcon.setVisible(true);
      }
    } else {
      if (this.muteIcon) {
        this.muteIcon.setVisible(false);
      }
    }
  }

  /**
   * Destroy the avatar and clean up resources.
   */
  destroy(): void {
    if (this.muteIcon) {
      this.muteIcon.destroy();
      this.muteIcon = null;
    }
    this.sprite.destroy();
  }

  // --- Private helpers ---

  private updateMuteIconPosition(): void {
    if (this.muteIcon && this.muteIcon.visible) {
      this.muteIcon.x = this.sprite.x;
      this.muteIcon.y = this.sprite.y - TILE_SIZE * 0.75;
    }
  }

  private updateNameLabelPosition(): void {
    if (this.nameLabel) {
      this.nameLabel.x = this.sprite.x;
      this.nameLabel.y = this.sprite.y - 24;
    }
  }

  private createFallbackMuteIcon(): Phaser.GameObjects.Sprite | null {
    const key = 'mute_icon_generated';

    if (!this.scene.textures.exists(key)) {
      const graphics = this.scene.add.graphics();
      graphics.fillStyle(0xff0000, 0.8);
      graphics.fillCircle(8, 8, 8);
      graphics.lineStyle(2, 0xffffff, 1);
      graphics.lineBetween(4, 4, 12, 12);
      graphics.lineBetween(12, 4, 4, 12);
      graphics.generateTexture(key, 16, 16);
      graphics.destroy();
    }

    return this.scene.add.sprite(
      this.sprite.x,
      this.sprite.y - TILE_SIZE * 0.75,
      key
    );
  }
}


/**
 * Remote avatar with smooth position interpolation (lerp) for displaying
 * other players' positions received from the server.
 */
export class RemoteAvatar {
  private scene: Phaser.Scene;
  private sprite: Phaser.GameObjects.Sprite;
  private nameLabel: Phaser.GameObjects.Text | null = null;
  private muteIcon: Phaser.GameObjects.Sprite | null = null;
  private _direction: Direction = 'down';
  private _isMoving: boolean = false;
  private _isMuted: boolean = false;
  private avatarId: number;

  /** Target position for interpolation (in pixels) */
  private targetX: number;
  private targetY: number;

  /** Interpolation factor (0-1). Higher = snappier, lower = smoother */
  private readonly lerpFactor: number = 0.15;

  /** Threshold in pixels below which we snap to target */
  private readonly snapThreshold: number = 1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    avatarId: number,
    textureKey?: string,
    displayName?: string
  ) {
    this.scene = scene;
    this.avatarId = avatarId;
    this.targetX = x;
    this.targetY = y;

    const key = textureKey ?? `avatar_${avatarId}`;
    this.sprite = scene.add.sprite(x, y, key);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setDepth(10);
    this.sprite.setScale(0.55);

    // Show display name above avatar
    if (displayName) {
      this.nameLabel = scene.add.text(x, y - 20, displayName, {
        fontSize: '16px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
      });
      this.nameLabel.setOrigin(0.5, 1);
      this.nameLabel.setDepth(11);
    }
  }

  // --- Public accessors ---

  get direction(): Direction {
    return this._direction;
  }

  get isMoving(): boolean {
    return this._isMoving;
  }

  get isMuted(): boolean {
    return this._isMuted;
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get tileX(): number {
    return Math.floor(this.sprite.x / TILE_SIZE);
  }

  get tileY(): number {
    return Math.floor(this.sprite.y / TILE_SIZE);
  }

  getSprite(): Phaser.GameObjects.Sprite {
    return this.sprite;
  }

  /** Adjust name label scale to be zoom-independent */
  setNameScale(zoom: number): void {
    if (this.nameLabel && zoom > 0) {
      this.nameLabel.setScale(1 / zoom);
    }
  }

  // --- Server state updates ---

  /**
   * Set the target position received from the server.
   * The avatar will smoothly interpolate toward this position.
   */
  setTargetPosition(x: number, y: number, direction: Direction): void {
    this.targetX = x;
    this.targetY = y;
    this._direction = direction;
  }

  /**
   * Teleport immediately to position (used for initial placement or large corrections).
   */
  setPosition(x: number, y: number): void {
    this.sprite.x = x;
    this.sprite.y = y;
    this.targetX = x;
    this.targetY = y;
    this.updateMuteIconPosition();
  }

  /**
   * Update method to be called each frame for smooth interpolation.
   * Uses linear interpolation (lerp) to smoothly transition to target position.
   *
   * @param _delta - Frame delta in milliseconds (available for time-based lerp if needed)
   */
  update(_delta: number): void {
    const dx = this.targetX - this.sprite.x;
    const dy = this.targetY - this.sprite.y;
    const distSq = dx * dx + dy * dy;

    if (distSq < this.snapThreshold * this.snapThreshold) {
      // Close enough — snap to target
      this.sprite.x = this.targetX;
      this.sprite.y = this.targetY;

      if (this._isMoving) {
        this._isMoving = false;
        this.playIdleAnimation();
      }
    } else {
      // Interpolate toward target
      this.sprite.x += dx * this.lerpFactor;
      this.sprite.y += dy * this.lerpFactor;

      if (!this._isMoving) {
        this._isMoving = true;
      }
      this.playWalkAnimation(this._direction);
    }

    this.updateMuteIconPosition();
    this.updateNameLabelPosition();
  }

  // --- Animations ---

  /**
   * Play walk animation for the given direction.
   */
  playWalkAnimation(direction: Direction): void {
    this._direction = direction;
    const animKey = `avatar_${this.avatarId}_walk_${direction}`;

    if (this.sprite.anims && this.scene.anims.exists(animKey)) {
      this.sprite.anims.play(animKey, true);
    }
  }

  /**
   * Play idle animation for the current direction.
   */
  playIdleAnimation(): void {
    const directionalKey = `avatar_${this.avatarId}_idle_${this._direction}`;
    const genericKey = `avatar_${this.avatarId}_idle`;

    if (this.sprite.anims) {
      if (this.scene.anims.exists(directionalKey)) {
        this.sprite.anims.play(directionalKey, true);
      } else if (this.scene.anims.exists(genericKey)) {
        this.sprite.anims.play(genericKey, true);
      } else {
        this.sprite.anims.stop();
      }
    }
  }

  // --- Mute Indicator ---

  /**
   * Show or hide the mute indicator on the remote avatar sprite.
   */
  setMuteIndicator(muted: boolean): void {
    this._isMuted = muted;

    if (muted) {
      if (!this.muteIcon) {
        const muteKey = 'mute_icon_generated';

        if (!this.scene.textures.exists(muteKey)) {
          const graphics = this.scene.add.graphics();
          graphics.fillStyle(0xff0000, 0.8);
          graphics.fillCircle(8, 8, 8);
          graphics.lineStyle(2, 0xffffff, 1);
          graphics.lineBetween(4, 4, 12, 12);
          graphics.lineBetween(12, 4, 4, 12);
          graphics.generateTexture(muteKey, 16, 16);
          graphics.destroy();
        }

        this.muteIcon = this.scene.add.sprite(
          this.sprite.x,
          this.sprite.y - TILE_SIZE * 0.75,
          muteKey
        );
        this.muteIcon.setDepth(this.sprite.depth + 1);
        this.muteIcon.setScale(0.5);
      }
      this.muteIcon.setVisible(true);
    } else {
      if (this.muteIcon) {
        this.muteIcon.setVisible(false);
      }
    }
  }

  /**
   * Destroy the remote avatar and clean up resources.
   */
  destroy(): void {
    if (this.muteIcon) {
      this.muteIcon.destroy();
      this.muteIcon = null;
    }
    if (this.nameLabel) {
      this.nameLabel.destroy();
      this.nameLabel = null;
    }
    this.sprite.destroy();
  }

  // --- Private helpers ---

  private updateMuteIconPosition(): void {
    if (this.muteIcon && this.muteIcon.visible) {
      this.muteIcon.x = this.sprite.x;
      this.muteIcon.y = this.sprite.y - TILE_SIZE * 0.75;
    }
  }

  private updateNameLabelPosition(): void {
    if (this.nameLabel) {
      this.nameLabel.x = this.sprite.x;
      this.nameLabel.y = this.sprite.y - 24;
    }
  }
}
