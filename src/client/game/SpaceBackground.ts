import Phaser from 'phaser';

/**
 * SpaceBackground renders a deep-space background behind the tile map,
 * featuring scattered stars with twinkle animations and occasional comets.
 *
 * - Background: dark rectangle at depth 0, extending beyond map bounds
 * - Stars: 40-120 small graphics at random world positions (1-3px, white/light-blue)
 * - Twinkle: individual stars pulse opacity 100% → 20% → 100% over 400-800ms
 *   triggered at random intervals (500-3000ms), max 3 concurrent twinkles
 * - Comet: 4-8px sprite moving diagonally, interval 8-20s, duration 2-4s
 * - All elements fixed in world coordinates (not camera-relative)
 */
export class SpaceBackground {
  private scene: Phaser.Scene;
  private mapWidth: number;
  private mapHeight: number;

  private background: Phaser.GameObjects.Rectangle | null = null;
  private stars: StarData[] = [];
  private activeTwinkles: number = 0;
  private twinkleTimer: Phaser.Time.TimerEvent | null = null;
  private cometTimer: Phaser.Time.TimerEvent | null = null;
  private comet: Phaser.GameObjects.Graphics | null = null;
  private cometTween: Phaser.Tweens.Tween | null = null;

  /** Padding around the map for background area (in pixels) */
  private static readonly PADDING = 2000;
  /** Maximum concurrent twinkle animations */
  private static readonly MAX_CONCURRENT_TWINKLES = 3;
  /** Star count range */
  private static readonly MIN_STARS = 40;
  private static readonly MAX_STARS = 120;
  /** Twinkle interval range in milliseconds */
  private static readonly MIN_TWINKLE_INTERVAL = 500;
  private static readonly MAX_TWINKLE_INTERVAL = 3000;
  /** Twinkle duration range in milliseconds */
  private static readonly MIN_TWINKLE_DURATION = 400;
  private static readonly MAX_TWINKLE_DURATION = 800;
  /** Comet interval range in milliseconds */
  private static readonly MIN_COMET_INTERVAL = 8000;
  private static readonly MAX_COMET_INTERVAL = 20000;
  /** Comet traverse duration range in milliseconds */
  private static readonly MIN_COMET_DURATION = 2000;
  private static readonly MAX_COMET_DURATION = 4000;

  constructor(scene: Phaser.Scene, mapWidth: number, mapHeight: number) {
    this.scene = scene;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
  }

  /**
   * Create background fill, scatter stars, and start animation timers.
   */
  create(): void {
    this.createBackground();
    this.createStars();
    this.startTwinkleTimer();
    this.startCometTimer();
  }

  /**
   * Update loop — currently animations are timer-driven so this is a no-op.
   * Provided for consistent interface with GameScene update cycle.
   */
  update(_time: number, _delta: number): void {
    // Animations are driven by Phaser timers and tweens, no per-frame work needed.
  }

  /**
   * Clean up all game objects, timers, and tweens.
   */
  destroy(): void {
    if (this.twinkleTimer) {
      this.twinkleTimer.destroy();
      this.twinkleTimer = null;
    }
    if (this.cometTimer) {
      this.cometTimer.destroy();
      this.cometTimer = null;
    }
    if (this.cometTween) {
      this.cometTween.stop();
      this.cometTween = null;
    }
    if (this.comet) {
      this.comet.destroy();
      this.comet = null;
    }
    if (this.background) {
      this.background.destroy();
      this.background = null;
    }
    for (const star of this.stars) {
      star.graphics.destroy();
    }
    this.stars = [];
    this.activeTwinkles = 0;
  }

  /**
   * Returns the current number of active twinkle animations.
   * Exposed for testing purposes.
   */
  getActiveTwinkles(): number {
    return this.activeTwinkles;
  }

  /**
   * Returns the star data array. Exposed for testing purposes.
   */
  getStars(): StarData[] {
    return this.stars;
  }

  // --- Private methods ---

  private createBackground(): void {
    const padding = SpaceBackground.PADDING;
    const width = this.mapWidth + padding * 2;
    const height = this.mapHeight + padding * 2;
    const centerX = this.mapWidth / 2;
    const centerY = this.mapHeight / 2;

    // RGB(10, 10, 25) — dark space color within spec limit (R≤15, G≤15, B≤30)
    const color = 0x0a0a19;

    this.background = this.scene.add.rectangle(centerX, centerY, width, height, color);
    this.background.setDepth(0);
    this.background.setOrigin(0.5, 0.5);
  }

  private createStars(): void {
    const padding = SpaceBackground.PADDING;
    const starCount = Phaser.Math.Between(
      SpaceBackground.MIN_STARS,
      SpaceBackground.MAX_STARS
    );

    const minX = -padding;
    const maxX = this.mapWidth + padding;
    const minY = -padding;
    const maxY = this.mapHeight + padding;

    // Star tint colors: white and light-blue variants
    const tintColors = [0xffffff, 0xccddff, 0xaaccff, 0xddeeff];

    for (let i = 0; i < starCount; i++) {
      const x = Phaser.Math.Between(minX, maxX);
      const y = Phaser.Math.Between(minY, maxY);
      const size = Phaser.Math.Between(1, 3);
      const tint = tintColors[Phaser.Math.Between(0, tintColors.length - 1)];

      const graphics = this.scene.add.graphics();
      graphics.fillStyle(tint, 1);
      graphics.fillRect(x, y, size, size);
      graphics.setDepth(0);

      this.stars.push({ x, y, size, tint, graphics });
    }
  }

  private startTwinkleTimer(): void {
    const scheduleNext = () => {
      const delay = Phaser.Math.Between(
        SpaceBackground.MIN_TWINKLE_INTERVAL,
        SpaceBackground.MAX_TWINKLE_INTERVAL
      );

      this.twinkleTimer = this.scene.time.addEvent({
        delay,
        callback: () => {
          this.triggerTwinkle();
          scheduleNext();
        },
        callbackScope: this,
      });
    };

    scheduleNext();
  }

  private triggerTwinkle(): void {
    // Enforce max 3 concurrent twinkles
    if (this.activeTwinkles >= SpaceBackground.MAX_CONCURRENT_TWINKLES) {
      return;
    }

    if (this.stars.length === 0) {
      return;
    }

    // Pick a random star
    const starIndex = Phaser.Math.Between(0, this.stars.length - 1);
    const star = this.stars[starIndex];

    const duration = Phaser.Math.Between(
      SpaceBackground.MIN_TWINKLE_DURATION,
      SpaceBackground.MAX_TWINKLE_DURATION
    );

    this.activeTwinkles++;

    // Pulse opacity: 100% → 20% → 100%
    this.scene.tweens.add({
      targets: star.graphics,
      alpha: 0.2,
      duration: duration / 2,
      yoyo: true,
      onComplete: () => {
        this.activeTwinkles--;
      },
    });
  }

  private startCometTimer(): void {
    const scheduleComet = () => {
      const delay = Phaser.Math.Between(
        SpaceBackground.MIN_COMET_INTERVAL,
        SpaceBackground.MAX_COMET_INTERVAL
      );

      this.cometTimer = this.scene.time.addEvent({
        delay,
        callback: () => {
          this.spawnComet();
          scheduleComet();
        },
        callbackScope: this,
      });
    };

    scheduleComet();
  }

  private spawnComet(): void {
    const padding = SpaceBackground.PADDING;
    const totalWidth = this.mapWidth + padding * 2;
    const totalHeight = this.mapHeight + padding * 2;

    // Comet size: 4-8 pixels
    const cometSize = Phaser.Math.Between(4, 8);

    // Start from a random edge position (top or left)
    const startX = -padding + Phaser.Math.Between(0, Math.floor(totalWidth * 0.3));
    const startY = -padding + Phaser.Math.Between(0, Math.floor(totalHeight * 0.3));

    // End on opposite side (diagonal movement)
    const endX = startX + totalWidth * 0.7;
    const endY = startY + totalHeight * 0.7;

    // Create comet graphic
    if (this.comet) {
      this.comet.destroy();
    }

    this.comet = this.scene.add.graphics();
    this.comet.fillStyle(0xffffff, 1);
    this.comet.fillRect(0, 0, cometSize, Math.max(1, Math.floor(cometSize / 2)));
    this.comet.setPosition(startX, startY);
    this.comet.setDepth(0);

    const duration = Phaser.Math.Between(
      SpaceBackground.MIN_COMET_DURATION,
      SpaceBackground.MAX_COMET_DURATION
    );

    // Stop any existing comet tween
    if (this.cometTween) {
      this.cometTween.stop();
    }

    this.cometTween = this.scene.tweens.add({
      targets: this.comet,
      x: endX,
      y: endY,
      duration,
      onComplete: () => {
        if (this.comet) {
          this.comet.destroy();
          this.comet = null;
        }
      },
    });
  }
}

/**
 * Data structure for a single star in the background.
 */
export interface StarData {
  x: number;
  y: number;
  size: number;
  tint: number;
  graphics: Phaser.GameObjects.Graphics;
}
