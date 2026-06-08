import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FollowSystem, FollowSystemEvents } from './FollowSystem';
import { TILE_SIZE } from '../../shared/constants';

// Mock Phaser module
vi.mock('phaser', () => {
  return {
    default: {
      Scene: class MockScene {},
      Input: {
        Keyboard: {
          KeyCodes: { W: 87, A: 65, S: 83, D: 68, ESC: 27 },
        },
      },
      Math: {
        Vector2: class {
          x: number;
          y: number;
          constructor(x: number, y: number) {
            this.x = x;
            this.y = y;
          }
        },
      },
      Geom: {
        Rectangle: class {
          x: number;
          y: number;
          width: number;
          height: number;
          constructor(x: number, y: number, w: number, h: number) {
            this.x = x;
            this.y = y;
            this.width = w;
            this.height = h;
          }
        },
      },
      GameObjects: {
        Graphics: class {},
        Sprite: class {},
      },
    },
  };
});

// Helper to create a mock scene with events
function createMockScene() {
  return {
    events: {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    },
    add: {
      graphics: vi.fn(() => ({
        setDepth: vi.fn().mockReturnThis(),
        clear: vi.fn().mockReturnThis(),
        lineStyle: vi.fn().mockReturnThis(),
        beginPath: vi.fn().mockReturnThis(),
        moveTo: vi.fn().mockReturnThis(),
        lineTo: vi.fn().mockReturnThis(),
        strokePath: vi.fn().mockReturnThis(),
        destroy: vi.fn(),
      })),
    },
  } as any;
}

// Helper to create a mock local avatar
function createMockLocalAvatar(tileX: number, tileY: number) {
  const pixelX = tileX * TILE_SIZE + TILE_SIZE / 2;
  const pixelY = tileY * TILE_SIZE + TILE_SIZE / 2;
  return {
    x: pixelX,
    y: pixelY,
    tileX,
    tileY,
    move: vi.fn(() => true),
    stop: vi.fn(),
    direction: 'down' as const,
  } as any;
}

// Helper to create a mock remote avatar
function createMockRemoteAvatar(tileX: number, tileY: number) {
  const pixelX = tileX * TILE_SIZE + TILE_SIZE / 2;
  const pixelY = tileY * TILE_SIZE + TILE_SIZE / 2;
  return {
    x: pixelX,
    y: pixelY,
    tileX,
    tileY,
    getSprite: vi.fn(() => ({ x: pixelX, y: pixelY })),
  } as any;
}

// Helper to create a mock map manager
function createMockMapManager() {
  return {
    getPrivateZoneAt: vi.fn(() => null),
    isColliding: vi.fn(() => false),
  } as any;
}

describe('FollowSystem', () => {
  let scene: ReturnType<typeof createMockScene>;
  let localAvatar: ReturnType<typeof createMockLocalAvatar>;
  let remotePlayers: Map<string, any>;
  let mapManager: ReturnType<typeof createMockMapManager>;
  let followSystem: FollowSystem;

  beforeEach(() => {
    scene = createMockScene();
    localAvatar = createMockLocalAvatar(5, 5);
    remotePlayers = new Map();
    mapManager = createMockMapManager();
    followSystem = new FollowSystem(scene, localAvatar, remotePlayers, mapManager);
  });

  describe('startFollow', () => {
    it('should start following a valid target', () => {
      const target = createMockRemoteAvatar(10, 10);
      remotePlayers.set('target-1', target);

      followSystem.startFollow('target-1');

      expect(followSystem.isFollowing()).toBe(true);
      expect(followSystem.getFollowTargetId()).toBe('target-1');
    });

    it('should not start follow if target does not exist', () => {
      followSystem.startFollow('non-existent');

      expect(followSystem.isFollowing()).toBe(false);
      expect(followSystem.getFollowTargetId()).toBeNull();
    });

    it('should hide locate line when follow starts', () => {
      const target = createMockRemoteAvatar(10, 10);
      remotePlayers.set('target-1', target);

      followSystem.showLocateLine('target-1');
      expect(followSystem.isLocateLineVisible()).toBe(true);

      followSystem.startFollow('target-1');
      expect(followSystem.isLocateLineVisible()).toBe(false);
    });
  });

  describe('stopFollow', () => {
    it('should stop following and emit cancel event', () => {
      const target = createMockRemoteAvatar(10, 10);
      remotePlayers.set('target-1', target);

      followSystem.startFollow('target-1');
      followSystem.stopFollow();

      expect(followSystem.isFollowing()).toBe(false);
      expect(followSystem.getFollowTargetId()).toBeNull();
      expect(localAvatar.stop).toHaveBeenCalled();
      expect(scene.events.emit).toHaveBeenCalledWith(FollowSystemEvents.FOLLOW_CANCELLED);
    });

    it('should do nothing if not following', () => {
      followSystem.stopFollow();
      expect(scene.events.emit).not.toHaveBeenCalled();
    });
  });

  describe('updateFollow', () => {
    it('should move avatar toward target', () => {
      const target = createMockRemoteAvatar(10, 5);
      remotePlayers.set('target-1', target);

      followSystem.startFollow('target-1');
      const dir = followSystem.updateFollow(16);

      expect(dir).toBe('right');
      expect(localAvatar.move).toHaveBeenCalledWith('right', 16);
    });

    it('should stop when within 1 tile of target', () => {
      // Place target very close (within 1 tile)
      const target = createMockRemoteAvatar(5, 5);
      // Move target slightly - less than 1 tile away
      target.x = localAvatar.x + TILE_SIZE * 0.5;
      target.y = localAvatar.y;
      remotePlayers.set('target-1', target);

      followSystem.startFollow('target-1');
      const dir = followSystem.updateFollow(16);

      expect(dir).toBeNull();
      expect(localAvatar.stop).toHaveBeenCalled();
    });

    it('should cancel follow if target disconnects', () => {
      const target = createMockRemoteAvatar(10, 10);
      remotePlayers.set('target-1', target);

      followSystem.startFollow('target-1');

      // Remove target from map (simulating disconnect)
      remotePlayers.delete('target-1');
      const dir = followSystem.updateFollow(16);

      expect(dir).toBeNull();
      expect(followSystem.isFollowing()).toBe(false);
      expect(scene.events.emit).toHaveBeenCalledWith(
        FollowSystemEvents.FOLLOW_TARGET_DISCONNECTED,
        { targetSessionId: 'target-1' }
      );
    });

    it('should cancel follow if target enters a private zone', () => {
      const target = createMockRemoteAvatar(10, 10);
      remotePlayers.set('target-1', target);

      followSystem.startFollow('target-1');

      // Simulate target being in a private zone
      mapManager.getPrivateZoneAt.mockImplementation((tileX: number, tileY: number) => {
        if (tileX === 10 && tileY === 10) {
          return { id: 'zone-1', bounds: {}, tiles: [] };
        }
        return null;
      });

      const dir = followSystem.updateFollow(16);

      expect(dir).toBeNull();
      expect(followSystem.isFollowing()).toBe(false);
      expect(scene.events.emit).toHaveBeenCalledWith(
        FollowSystemEvents.FOLLOW_TARGET_IN_ZONE,
        { targetSessionId: 'target-1', zoneId: 'zone-1' }
      );
    });

    it('should continue follow if both are in the same private zone', () => {
      // Place target far enough away to trigger movement
      const target = createMockRemoteAvatar(10, 5);
      remotePlayers.set('target-1', target);

      followSystem.startFollow('target-1');

      // Both are in the same zone
      const zone = { id: 'zone-1', bounds: {}, tiles: [] };
      mapManager.getPrivateZoneAt.mockReturnValue(zone);

      const dir = followSystem.updateFollow(16);

      // Should still be following (both in same zone)
      expect(followSystem.isFollowing()).toBe(true);
      expect(dir).toBe('right');
    });

    it('should return null when not following', () => {
      const dir = followSystem.updateFollow(16);
      expect(dir).toBeNull();
    });

    it('should prefer horizontal direction when dx > dy', () => {
      const target = createMockRemoteAvatar(10, 6);
      remotePlayers.set('target-1', target);

      followSystem.startFollow('target-1');
      const dir = followSystem.updateFollow(16);

      expect(dir).toBe('right');
    });

    it('should prefer vertical direction when dy > dx', () => {
      const target = createMockRemoteAvatar(5, 10);
      remotePlayers.set('target-1', target);

      followSystem.startFollow('target-1');
      const dir = followSystem.updateFollow(16);

      expect(dir).toBe('down');
    });
  });

  describe('showLocateLine', () => {
    it('should create a locate line to valid target', () => {
      const target = createMockRemoteAvatar(10, 10);
      remotePlayers.set('target-1', target);

      followSystem.showLocateLine('target-1');

      expect(followSystem.isLocateLineVisible()).toBe(true);
      expect(followSystem.getLocateTargetId()).toBe('target-1');
      expect(scene.add.graphics).toHaveBeenCalled();
    });

    it('should not create line for non-existent target', () => {
      followSystem.showLocateLine('non-existent');

      expect(followSystem.isLocateLineVisible()).toBe(false);
    });

    it('should replace existing line when showing new one', () => {
      const target1 = createMockRemoteAvatar(10, 10);
      const target2 = createMockRemoteAvatar(15, 15);
      remotePlayers.set('target-1', target1);
      remotePlayers.set('target-2', target2);

      followSystem.showLocateLine('target-1');
      followSystem.showLocateLine('target-2');

      expect(followSystem.getLocateTargetId()).toBe('target-2');
    });
  });

  describe('hideLocateLine', () => {
    it('should hide the locate line', () => {
      const target = createMockRemoteAvatar(10, 10);
      remotePlayers.set('target-1', target);

      followSystem.showLocateLine('target-1');
      followSystem.hideLocateLine();

      expect(followSystem.isLocateLineVisible()).toBe(false);
      expect(followSystem.getLocateTargetId()).toBeNull();
    });

    it('should do nothing if no line visible', () => {
      expect(() => followSystem.hideLocateLine()).not.toThrow();
    });
  });

  describe('updateLocateLine', () => {
    it('should remove line if target disconnects', () => {
      const target = createMockRemoteAvatar(10, 10);
      remotePlayers.set('target-1', target);

      followSystem.showLocateLine('target-1');

      // Disconnect target
      remotePlayers.delete('target-1');
      followSystem.updateLocateLine();

      expect(followSystem.isLocateLineVisible()).toBe(false);
    });
  });

  describe('handleEscape', () => {
    it('should hide locate line on Escape', () => {
      const target = createMockRemoteAvatar(10, 10);
      remotePlayers.set('target-1', target);

      followSystem.showLocateLine('target-1');
      followSystem.handleEscape();

      expect(followSystem.isLocateLineVisible()).toBe(false);
    });
  });

  describe('onRemotePlayerRemoved', () => {
    it('should cancel follow when target is removed', () => {
      const target = createMockRemoteAvatar(10, 10);
      remotePlayers.set('target-1', target);

      followSystem.startFollow('target-1');
      followSystem.onRemotePlayerRemoved('target-1');

      expect(followSystem.isFollowing()).toBe(false);
      expect(scene.events.emit).toHaveBeenCalledWith(
        FollowSystemEvents.FOLLOW_TARGET_DISCONNECTED,
        { targetSessionId: 'target-1' }
      );
    });

    it('should hide locate line when target is removed', () => {
      const target = createMockRemoteAvatar(10, 10);
      remotePlayers.set('target-1', target);

      followSystem.showLocateLine('target-1');
      followSystem.onRemotePlayerRemoved('target-1');

      expect(followSystem.isLocateLineVisible()).toBe(false);
    });

    it('should not affect system when unrelated player is removed', () => {
      const target = createMockRemoteAvatar(10, 10);
      const other = createMockRemoteAvatar(15, 15);
      remotePlayers.set('target-1', target);
      remotePlayers.set('other-1', other);

      followSystem.startFollow('target-1');
      followSystem.onRemotePlayerRemoved('other-1');

      expect(followSystem.isFollowing()).toBe(true);
      expect(followSystem.getFollowTargetId()).toBe('target-1');
    });
  });

  describe('destroy', () => {
    it('should clean up all state', () => {
      const target = createMockRemoteAvatar(10, 10);
      remotePlayers.set('target-1', target);

      followSystem.startFollow('target-1');
      followSystem.showLocateLine('target-1');
      followSystem.destroy();

      expect(followSystem.isFollowing()).toBe(false);
      expect(followSystem.isLocateLineVisible()).toBe(false);
    });
  });
});
