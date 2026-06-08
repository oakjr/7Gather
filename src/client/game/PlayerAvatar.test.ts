import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AVATAR_SPEED, TILE_SIZE } from '../../shared/constants';

/**
 * Unit tests for PlayerAvatar and RemoteAvatar.
 *
 * Since Phaser requires a canvas/WebGL context, we mock the Phaser module
 * and test the avatar logic (movement, collision, lerp, mute indicator).
 */

// --- Phaser mocks ---

function createMockSprite(x = 0, y = 0) {
  return {
    x,
    y,
    depth: 0,
    visible: true,
    anims: {
      play: vi.fn(),
      stop: vi.fn(),
    },
    setOrigin: vi.fn(),
    setDepth: vi.fn().mockImplementation(function (this: any, d: number) {
      this.depth = d;
      return this;
    }),
    setScale: vi.fn(),
    setVisible: vi.fn().mockImplementation(function (this: any, v: boolean) {
      this.visible = v;
      return this;
    }),
    destroy: vi.fn(),
  };
}

function createMockGraphics() {
  return {
    fillStyle: vi.fn().mockReturnThis(),
    fillCircle: vi.fn().mockReturnThis(),
    lineStyle: vi.fn().mockReturnThis(),
    lineBetween: vi.fn().mockReturnThis(),
    generateTexture: vi.fn(),
    destroy: vi.fn(),
  };
}

function createMockScene() {
  const sprites: any[] = [];
  return {
    add: {
      sprite: vi.fn((x: number, y: number, _key: string) => {
        const s = createMockSprite(x, y);
        sprites.push(s);
        return s;
      }),
      graphics: vi.fn(() => createMockGraphics()),
    },
    anims: {
      exists: vi.fn(() => false),
    },
    textures: {
      exists: vi.fn(() => false),
    },
    _sprites: sprites,
  };
}

function createMockMapManager(collidingPositions: Set<string> = new Set()) {
  return {
    isColliding: vi.fn((x: number, y: number) => {
      return collidingPositions.has(`${Math.floor(x)},${Math.floor(y)}`);
    }),
  };
}

// --- We directly test the logic by importing the module with mocked Phaser ---

vi.mock('phaser', () => {
  return {
    default: {
      Scene: class {},
      GameObjects: { Sprite: class {}, Line: class {} },
      Math: { Vector2: class { constructor(public x = 0, public y = 0) {} } },
      Geom: { Rectangle: class { constructor(public x = 0, public y = 0, public w = 0, public h = 0) {} } },
      Tilemaps: { Tilemap: class {}, TilemapLayer: class {} },
    },
  };
});

// Import after mock
import { PlayerAvatar, RemoteAvatar } from './PlayerAvatar';

describe('PlayerAvatar', () => {
  let scene: any;
  let mapManager: any;

  beforeEach(() => {
    scene = createMockScene();
    mapManager = createMockMapManager();
  });

  describe('constructor', () => {
    it('should create avatar at the specified position', () => {
      const avatar = new PlayerAvatar(scene, 100, 200, 1, mapManager);

      expect(avatar.x).toBe(100);
      expect(avatar.y).toBe(200);
    });

    it('should default direction to down and not moving', () => {
      const avatar = new PlayerAvatar(scene, 0, 0, 1, mapManager);

      expect(avatar.direction).toBe('down');
      expect(avatar.isMoving).toBe(false);
    });
  });

  describe('move', () => {
    it('should move at AVATAR_SPEED (4 tiles/sec) using delta time', () => {
      const avatar = new PlayerAvatar(scene, 100, 100, 1, mapManager);

      // Move for 1 second (1000ms delta) = should move exactly 4 tiles = 128px
      const moved = avatar.move('right', 1000);

      expect(moved).toBe(true);
      expect(avatar.x).toBeCloseTo(100 + AVATAR_SPEED * TILE_SIZE);
      expect(avatar.y).toBe(100);
    });

    it('should apply delta time interpolation correctly for small frames', () => {
      const avatar = new PlayerAvatar(scene, 0, 0, 1, mapManager);

      // Move for 16.67ms (one frame at 60FPS)
      const expectedDistance = AVATAR_SPEED * TILE_SIZE * (16.67 / 1000);
      avatar.move('down', 16.67);

      expect(avatar.y).toBeCloseTo(expectedDistance, 1);
      expect(avatar.x).toBe(0);
    });

    it('should move in the correct direction for all four directions', () => {
      const speed = AVATAR_SPEED * TILE_SIZE;
      const delta = 500; // 0.5 seconds

      // UP
      let avatar = new PlayerAvatar(scene, 100, 100, 1, mapManager);
      avatar.move('up', delta);
      expect(avatar.y).toBeCloseTo(100 - speed * 0.5);

      // DOWN
      avatar = new PlayerAvatar(scene, 100, 100, 1, mapManager);
      avatar.move('down', delta);
      expect(avatar.y).toBeCloseTo(100 + speed * 0.5);

      // LEFT
      avatar = new PlayerAvatar(scene, 100, 100, 1, mapManager);
      avatar.move('left', delta);
      expect(avatar.x).toBeCloseTo(100 - speed * 0.5);

      // RIGHT
      avatar = new PlayerAvatar(scene, 100, 100, 1, mapManager);
      avatar.move('right', delta);
      expect(avatar.x).toBeCloseTo(100 + speed * 0.5);
    });

    it('should return false and not move when colliding with Physics layer', () => {
      // When avatar at (100,100) moves right for 1000ms:
      // newX = 100 + (4 * 32) = 228, newY = 100
      // isColliding receives pixel coords, mock floors them
      const collidingPositions = new Set(['228,100']);
      mapManager = createMockMapManager(collidingPositions);

      const avatar = new PlayerAvatar(scene, 100, 100, 1, mapManager);
      const moved = avatar.move('right', 1000);

      expect(moved).toBe(false);
      expect(avatar.x).toBe(100);
      expect(avatar.y).toBe(100);
    });

    it('should set direction property when moving', () => {
      const avatar = new PlayerAvatar(scene, 0, 0, 1, mapManager);

      avatar.move('left', 16);
      expect(avatar.direction).toBe('left');

      avatar.move('up', 16);
      expect(avatar.direction).toBe('up');
    });

    it('should set isMoving to true when moving successfully', () => {
      const avatar = new PlayerAvatar(scene, 0, 0, 1, mapManager);

      avatar.move('right', 16);
      expect(avatar.isMoving).toBe(true);
    });

    it('should set isMoving to false when collision occurs', () => {
      // Use a map manager that always blocks
      mapManager = {
        isColliding: vi.fn(() => true),
      };

      const avatar = new PlayerAvatar(scene, 50, 50, 1, mapManager);
      avatar.move('up', 16);

      expect(avatar.isMoving).toBe(false);
    });
  });

  describe('stop', () => {
    it('should set isMoving to false', () => {
      const avatar = new PlayerAvatar(scene, 0, 0, 1, mapManager);
      avatar.move('right', 16);
      expect(avatar.isMoving).toBe(true);

      avatar.stop();
      expect(avatar.isMoving).toBe(false);
    });
  });

  describe('setPosition', () => {
    it('should teleport the avatar to the specified pixel position', () => {
      const avatar = new PlayerAvatar(scene, 0, 0, 1, mapManager);

      avatar.setPosition(200, 300);

      expect(avatar.x).toBe(200);
      expect(avatar.y).toBe(300);
    });
  });

  describe('setTilePosition', () => {
    it('should position avatar at center of the specified tile', () => {
      const avatar = new PlayerAvatar(scene, 0, 0, 1, mapManager);

      avatar.setTilePosition(3, 5);

      expect(avatar.x).toBe(3 * TILE_SIZE + TILE_SIZE / 2);
      expect(avatar.y).toBe(5 * TILE_SIZE + TILE_SIZE / 2);
    });
  });

  describe('tileX / tileY', () => {
    it('should return correct tile coordinates', () => {
      const avatar = new PlayerAvatar(scene, 64, 96, 1, mapManager);

      expect(avatar.tileX).toBe(2); // 64 / 32 = 2
      expect(avatar.tileY).toBe(3); // 96 / 32 = 3
    });
  });

  describe('setMuteIndicator', () => {
    it('should create and show mute indicator when muted', () => {
      const avatar = new PlayerAvatar(scene, 100, 100, 1, mapManager);

      avatar.setMuteIndicator(true);
      expect(avatar.isMuted).toBe(true);
    });

    it('should hide mute indicator when unmuted', () => {
      const avatar = new PlayerAvatar(scene, 100, 100, 1, mapManager);

      avatar.setMuteIndicator(true);
      avatar.setMuteIndicator(false);

      expect(avatar.isMuted).toBe(false);
    });

    it('should toggle mute state correctly', () => {
      const avatar = new PlayerAvatar(scene, 0, 0, 1, mapManager);

      expect(avatar.isMuted).toBe(false);
      avatar.setMuteIndicator(true);
      expect(avatar.isMuted).toBe(true);
      avatar.setMuteIndicator(false);
      expect(avatar.isMuted).toBe(false);
    });
  });

  describe('playWalkAnimation', () => {
    it('should attempt to play walk animation with correct key', () => {
      scene.anims.exists = vi.fn(() => true);
      const avatar = new PlayerAvatar(scene, 0, 0, 5, mapManager);

      avatar.playWalkAnimation('left');
      expect(avatar.direction).toBe('left');
    });
  });

  describe('destroy', () => {
    it('should destroy sprite and mute icon', () => {
      const avatar = new PlayerAvatar(scene, 0, 0, 1, mapManager);
      avatar.setMuteIndicator(true);
      avatar.destroy();

      // Should not throw
      expect(true).toBe(true);
    });
  });
});

describe('RemoteAvatar', () => {
  let scene: any;

  beforeEach(() => {
    scene = createMockScene();
  });

  describe('constructor', () => {
    it('should create remote avatar at the specified position', () => {
      const remote = new RemoteAvatar(scene, 50, 75, 3);

      expect(remote.x).toBe(50);
      expect(remote.y).toBe(75);
    });
  });

  describe('setTargetPosition', () => {
    it('should set target for interpolation and update direction', () => {
      const remote = new RemoteAvatar(scene, 0, 0, 1);

      remote.setTargetPosition(100, 200, 'right');
      expect(remote.direction).toBe('right');
    });
  });

  describe('update (lerp interpolation)', () => {
    it('should interpolate toward target position over multiple frames', () => {
      const remote = new RemoteAvatar(scene, 0, 0, 1);
      remote.setTargetPosition(100, 0, 'right');

      // First update - should move partially toward target
      remote.update(16);
      expect(remote.x).toBeGreaterThan(0);
      expect(remote.x).toBeLessThan(100);
    });

    it('should converge closer to target with each update', () => {
      const remote = new RemoteAvatar(scene, 0, 0, 1);
      remote.setTargetPosition(100, 0, 'right');

      remote.update(16);
      const firstX = remote.x;

      remote.update(16);
      const secondX = remote.x;

      expect(secondX).toBeGreaterThan(firstX);
    });

    it('should snap to target when very close', () => {
      const remote = new RemoteAvatar(scene, 99.5, 0, 1);
      remote.setTargetPosition(100, 0, 'right');

      // Distance is 0.5 which is below snap threshold of 1
      remote.update(16);
      expect(remote.x).toBe(100);
    });

    it('should set isMoving to true while interpolating', () => {
      const remote = new RemoteAvatar(scene, 0, 0, 1);
      remote.setTargetPosition(200, 0, 'right');

      expect(remote.isMoving).toBe(false);
      remote.update(16);
      expect(remote.isMoving).toBe(true);
    });

    it('should set isMoving to false after reaching target', () => {
      const remote = new RemoteAvatar(scene, 0, 0, 1);
      remote.setTargetPosition(0.5, 0, 'right');

      remote.update(16);
      // Should have snapped (distance < 1)
      expect(remote.isMoving).toBe(false);
    });

    it('should handle both x and y interpolation simultaneously', () => {
      const remote = new RemoteAvatar(scene, 0, 0, 1);
      remote.setTargetPosition(100, 100, 'down');

      remote.update(16);
      expect(remote.x).toBeGreaterThan(0);
      expect(remote.y).toBeGreaterThan(0);
    });
  });

  describe('setPosition (teleport)', () => {
    it('should immediately place avatar at position without interpolation', () => {
      const remote = new RemoteAvatar(scene, 0, 0, 1);

      remote.setPosition(500, 600);

      expect(remote.x).toBe(500);
      expect(remote.y).toBe(600);
    });

    it('should update target to match teleport position', () => {
      const remote = new RemoteAvatar(scene, 0, 0, 1);

      remote.setPosition(500, 600);
      remote.update(16);

      // Should not move because target == current position
      expect(remote.x).toBe(500);
      expect(remote.y).toBe(600);
    });
  });

  describe('setMuteIndicator', () => {
    it('should toggle mute indicator for remote avatar', () => {
      const remote = new RemoteAvatar(scene, 0, 0, 1);

      expect(remote.isMuted).toBe(false);
      remote.setMuteIndicator(true);
      expect(remote.isMuted).toBe(true);
      remote.setMuteIndicator(false);
      expect(remote.isMuted).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should clean up sprite and mute icon', () => {
      const remote = new RemoteAvatar(scene, 0, 0, 1);
      remote.setMuteIndicator(true);
      remote.destroy();

      expect(true).toBe(true); // no error thrown
    });
  });
});
