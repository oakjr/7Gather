import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Phaser module - must provide Math.Between on the default export
// since SpaceBackground imports via `import Phaser from 'phaser'`
vi.mock('phaser', () => {
  const phaserMock = {
    Scene: class {},
    Math: {
      Between: (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min,
    },
    GameObjects: {
      Graphics: class {},
      Rectangle: class {},
    },
    Tilemaps: {
      Tilemap: class {},
      TilemapLayer: class {},
    },
    Time: {
      TimerEvent: class {},
    },
    Tweens: {
      Tween: class {},
    },
    Types: {},
  };

  return {
    default: phaserMock,
    ...phaserMock,
  };
});

import { SpaceBackground } from './SpaceBackground';

/**
 * Creates a mock Phaser scene with all APIs needed by SpaceBackground.
 */
function createMockScene() {
  const tweensAdded: Array<{ targets: unknown; onComplete?: () => void }> = [];
  const timersAdded: Array<{ delay: number; callback: () => void; callbackScope: unknown }> = [];

  const mockScene = {
    add: {
      rectangle: vi.fn((_x: number, _y: number, _w: number, _h: number, _color: number) => ({
        setDepth: vi.fn().mockReturnThis(),
        setOrigin: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      })),
      graphics: vi.fn(() => ({
        fillStyle: vi.fn().mockReturnThis(),
        fillRect: vi.fn().mockReturnThis(),
        fillCircle: vi.fn().mockReturnThis(),
        setDepth: vi.fn().mockReturnThis(),
        setPosition: vi.fn().mockReturnThis(),
        setOrigin: vi.fn().mockReturnThis(),
        alpha: 1,
        destroy: vi.fn(),
      })),
    },
    time: {
      addEvent: vi.fn((config: { delay: number; callback: () => void; callbackScope: unknown }) => {
        timersAdded.push(config);
        return { destroy: vi.fn() };
      }),
    },
    tweens: {
      add: vi.fn((config: { targets: unknown; alpha?: number; duration?: number; yoyo?: boolean; onComplete?: () => void; x?: number; y?: number }) => {
        tweensAdded.push(config);
        return { stop: vi.fn() };
      }),
    },
  };

  return { mockScene, tweensAdded, timersAdded };
}

describe('SpaceBackground', () => {
  let background: SpaceBackground;
  let mockScene: ReturnType<typeof createMockScene>['mockScene'];
  let tweensAdded: ReturnType<typeof createMockScene>['tweensAdded'];
  let timersAdded: ReturnType<typeof createMockScene>['timersAdded'];

  beforeEach(() => {
    vi.clearAllMocks();
    const mocks = createMockScene();
    mockScene = mocks.mockScene;
    tweensAdded = mocks.tweensAdded;
    timersAdded = mocks.timersAdded;
    background = new SpaceBackground(mockScene as unknown as Phaser.Scene, 1600, 1280);
  });

  describe('constructor', () => {
    it('should create a SpaceBackground instance', () => {
      expect(background).toBeDefined();
    });
  });

  describe('create()', () => {
    it('should create a dark background rectangle', () => {
      background.create();
      expect(mockScene.add.rectangle).toHaveBeenCalledTimes(1);
      // Check the color parameter (5th arg) is 0x0a0a19 (RGB: 10,10,25)
      const callArgs = mockScene.add.rectangle.mock.calls[0];
      expect(callArgs[4]).toBe(0x0a0a19);
    });

    it('should create background centered on the map', () => {
      background.create();
      const callArgs = mockScene.add.rectangle.mock.calls[0];
      // Center: mapWidth/2 = 800, mapHeight/2 = 640
      expect(callArgs[0]).toBe(800);
      expect(callArgs[1]).toBe(640);
    });

    it('should create background extending beyond map bounds', () => {
      background.create();
      const callArgs = mockScene.add.rectangle.mock.calls[0];
      // Width should be mapWidth + 2*PADDING = 1600 + 4000 = 5600
      expect(callArgs[2]).toBeGreaterThan(1600);
      expect(callArgs[3]).toBeGreaterThan(1280);
    });

    it('should scatter between 40 and 120 stars', () => {
      background.create();
      const starCount = background.getStars().length;
      expect(starCount).toBeGreaterThanOrEqual(40);
      expect(starCount).toBeLessThanOrEqual(120);
    });

    it('should create stars using graphics objects', () => {
      background.create();
      // One call for the background rect, then one per star for graphics
      const starCount = background.getStars().length;
      expect(mockScene.add.graphics).toHaveBeenCalledTimes(starCount);
    });

    it('should start twinkle timer on create', () => {
      background.create();
      // At minimum the twinkle timer should have been scheduled
      expect(mockScene.time.addEvent).toHaveBeenCalled();
    });

    it('should start comet timer on create', () => {
      background.create();
      // At least 2 timers: one for twinkle, one for comet
      expect(mockScene.time.addEvent.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('twinkle animation', () => {
    it('should trigger a twinkle tween when timer fires', () => {
      background.create();
      // Find and trigger the first timer callback (twinkle)
      expect(timersAdded.length).toBeGreaterThanOrEqual(1);
      const twinkleTimerConfig = timersAdded[0];
      twinkleTimerConfig.callback.call(twinkleTimerConfig.callbackScope);

      // Should have created a tween for the twinkle
      expect(tweensAdded.length).toBeGreaterThanOrEqual(1);
    });

    it('should increment activeTwinkles when a twinkle starts', () => {
      background.create();
      expect(background.getActiveTwinkles()).toBe(0);

      // Trigger twinkle timer
      const twinkleTimerConfig = timersAdded[0];
      twinkleTimerConfig.callback.call(twinkleTimerConfig.callbackScope);

      expect(background.getActiveTwinkles()).toBe(1);
    });

    it('should decrement activeTwinkles when twinkle completes', () => {
      background.create();

      // Trigger twinkle timer
      const twinkleTimerConfig = timersAdded[0];
      twinkleTimerConfig.callback.call(twinkleTimerConfig.callbackScope);

      expect(background.getActiveTwinkles()).toBe(1);

      // Complete the tween
      const twinkleTween = tweensAdded[0];
      if (twinkleTween.onComplete) {
        twinkleTween.onComplete();
      }

      expect(background.getActiveTwinkles()).toBe(0);
    });

    it('should not exceed MAX_CONCURRENT_TWINKLES (3)', () => {
      background.create();

      const twinkleTimerConfig = timersAdded[0];

      // Trigger 4 twinkles — only 3 should activate
      twinkleTimerConfig.callback.call(twinkleTimerConfig.callbackScope);
      // The timer reschedules, so grab the latest one each time
      timersAdded[timersAdded.length - 1].callback.call(timersAdded[timersAdded.length - 1].callbackScope);
      timersAdded[timersAdded.length - 1].callback.call(timersAdded[timersAdded.length - 1].callbackScope);
      timersAdded[timersAdded.length - 1].callback.call(timersAdded[timersAdded.length - 1].callbackScope);

      // Max 3 concurrent
      expect(background.getActiveTwinkles()).toBe(3);
    });

    it('should allow new twinkle after one completes', () => {
      background.create();

      const twinkleTimerConfig = timersAdded[0];

      // Trigger 3 twinkles to fill up
      twinkleTimerConfig.callback.call(twinkleTimerConfig.callbackScope);
      timersAdded[timersAdded.length - 1].callback.call(timersAdded[timersAdded.length - 1].callbackScope);
      timersAdded[timersAdded.length - 1].callback.call(timersAdded[timersAdded.length - 1].callbackScope);

      expect(background.getActiveTwinkles()).toBe(3);

      // Complete the first twinkle
      tweensAdded[0].onComplete!();

      expect(background.getActiveTwinkles()).toBe(2);

      // Now another twinkle can start
      timersAdded[timersAdded.length - 1].callback.call(timersAdded[timersAdded.length - 1].callbackScope);
      expect(background.getActiveTwinkles()).toBe(3);
    });
  });

  describe('comet animation', () => {
    it('should spawn a comet when comet timer fires', () => {
      background.create();
      // The second timer added should be the comet timer
      // (first is twinkle, second is comet)
      const cometTimerConfig = timersAdded[1];
      cometTimerConfig.callback.call(cometTimerConfig.callbackScope);

      // A graphics object should be created for the comet (beyond the star graphics)
      const starCount = background.getStars().length;
      // 1 call per star + 1 for the comet
      expect(mockScene.add.graphics.mock.calls.length).toBe(starCount + 1);
    });

    it('should create a comet tween for diagonal movement', () => {
      background.create();
      const initialTweenCount = tweensAdded.length;

      // Trigger comet timer
      const cometTimerConfig = timersAdded[1];
      cometTimerConfig.callback.call(cometTimerConfig.callbackScope);

      // Should have added a tween for the comet movement (with x, y targets)
      expect(tweensAdded.length).toBeGreaterThan(initialTweenCount);
      const cometTween = tweensAdded[tweensAdded.length - 1];
      expect(cometTween).toHaveProperty('x');
      expect(cometTween).toHaveProperty('y');
    });
  });

  describe('update()', () => {
    it('should not throw when called', () => {
      background.create();
      expect(() => background.update(0, 16)).not.toThrow();
    });
  });

  describe('destroy()', () => {
    it('should clean up all star graphics', () => {
      background.create();
      const stars = background.getStars();
      const destroySpies = stars.map(s => vi.spyOn(s.graphics, 'destroy'));

      background.destroy();

      for (const spy of destroySpies) {
        expect(spy).toHaveBeenCalled();
      }
    });

    it('should reset star array to empty', () => {
      background.create();
      expect(background.getStars().length).toBeGreaterThan(0);

      background.destroy();
      expect(background.getStars().length).toBe(0);
    });

    it('should reset activeTwinkles to 0', () => {
      background.create();
      // Trigger a twinkle
      const twinkleTimerConfig = timersAdded[0];
      twinkleTimerConfig.callback.call(twinkleTimerConfig.callbackScope);
      expect(background.getActiveTwinkles()).toBe(1);

      background.destroy();
      expect(background.getActiveTwinkles()).toBe(0);
    });

    it('should not throw when called before create', () => {
      expect(() => background.destroy()).not.toThrow();
    });

    it('should not throw when called multiple times', () => {
      background.create();
      background.destroy();
      expect(() => background.destroy()).not.toThrow();
    });
  });

  describe('background depth', () => {
    it('should set background rectangle depth to 0', () => {
      background.create();
      const rect = mockScene.add.rectangle.mock.results[0].value;
      expect(rect.setDepth).toHaveBeenCalledWith(0);
    });

    it('should set star graphics depth to 0', () => {
      background.create();
      const stars = background.getStars();
      for (const star of stars) {
        expect(star.graphics.setDepth).toHaveBeenCalledWith(0);
      }
    });
  });

  describe('star properties', () => {
    it('should create stars with size between 1 and 3 pixels', () => {
      background.create();
      for (const star of background.getStars()) {
        expect(star.size).toBeGreaterThanOrEqual(1);
        expect(star.size).toBeLessThanOrEqual(3);
      }
    });

    it('should create stars with white or light-blue tints', () => {
      background.create();
      const validTints = [0xffffff, 0xccddff, 0xaaccff, 0xddeeff];
      for (const star of background.getStars()) {
        expect(validTints).toContain(star.tint);
      }
    });
  });
});
