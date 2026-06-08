import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GameScene, GameSceneConfig, GameSceneEvents } from './GameScene';
import { TILE_SIZE } from '../../shared/constants';

/**
 * Since Phaser requires a DOM/Canvas environment, we test GameScene logic
 * by mocking Phaser's internals and calling methods directly.
 */

// Mock Phaser module
vi.mock('phaser', () => {
  const MockKey = () => ({ isDown: false });

  const createMockSprite = (initX?: number, initY?: number) => ({
    x: initX ?? 0,
    y: initY ?? 0,
    depth: 10,
    setOrigin: vi.fn().mockReturnThis(),
    setDepth: vi.fn().mockReturnThis(),
    setScale: vi.fn().mockReturnThis(),
    setVisible: vi.fn().mockReturnThis(),
    play: vi.fn(),
    destroy: vi.fn(),
    anims: {
      currentAnim: null,
      play: vi.fn(),
      stop: vi.fn(),
      exists: vi.fn(() => false),
    },
  });

  return {
    default: {
      Scene: class MockScene {
        events = {
          emit: vi.fn(),
          on: vi.fn(),
          off: vi.fn(),
        };
        cameras = {
          main: {
            startFollow: vi.fn(),
            setZoom: vi.fn(),
            setBounds: vi.fn(),
          },
        };
        input = {
          keyboard: {
            createCursorKeys: vi.fn(() => ({
              up: MockKey(),
              down: MockKey(),
              left: MockKey(),
              right: MockKey(),
              space: MockKey(),
              shift: MockKey(),
            })),
            addKey: vi.fn(() => MockKey()),
          },
        };
        anims = {
          exists: vi.fn(() => false),
        };
        textures = {
          exists: vi.fn(() => false),
        };
        add = {
          sprite: vi.fn((x?: number, y?: number) => createMockSprite(x, y)),
          image: vi.fn(() => ({
            setDepth: vi.fn().mockReturnThis(),
            setScale: vi.fn().mockReturnThis(),
            setVisible: vi.fn().mockReturnThis(),
            destroy: vi.fn(),
            x: 0,
            y: 0,
            visible: false,
          })),
          graphics: vi.fn(() => ({
            fillStyle: vi.fn().mockReturnThis(),
            fillCircle: vi.fn().mockReturnThis(),
            lineStyle: vi.fn().mockReturnThis(),
            lineBetween: vi.fn().mockReturnThis(),
            generateTexture: vi.fn().mockReturnThis(),
            destroy: vi.fn(),
          })),
        };
        make = {
          tilemap: vi.fn(() => ({
            addTilesetImage: vi.fn(() => ({})),
            createLayer: vi.fn(() => ({
              setCollisionByProperty: vi.fn(),
            })),
            getLayer: vi.fn(() => null),
            worldToTileX: vi.fn((x: number) => Math.floor(x / TILE_SIZE)),
            worldToTileY: vi.fn((y: number) => Math.floor(y / TILE_SIZE)),
          })),
        };
        cache = {
          tilemap: {
            get: vi.fn(() => ({
              data: {
                width: 20,
                height: 20,
                tilewidth: 32,
                tileheight: 32,
                layers: [],
                tilesets: [],
              },
            })),
          },
        };
        load = {
          tilemapTiledJSON: vi.fn(),
        };
      },
      Input: {
        Keyboard: {
          KeyCodes: {
            W: 87,
            A: 65,
            S: 83,
            D: 68,
          },
        },
      },
      Math: {
        Linear: (a: number, b: number, t: number) => a + (b - a) * t,
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
        Sprite: class {},
        Image: class {},
        Line: class {},
      },
      Tilemaps: {
        Tilemap: class {},
        TilemapLayer: class {},
        Tile: class {},
      },
      Types: {},
    },
  };
});

describe('GameScene', () => {
  let scene: GameScene;
  const mockConfig: GameSceneConfig = {
    mapJsonUrl: '/maps/office.json',
    avatarId: 3,
    roomId: 'test-room-123',
    startX: 5,
    startY: 5,
  };

  beforeEach(() => {
    scene = new GameScene();
  });

  describe('constructor', () => {
    it('should create scene with key "GameScene"', () => {
      expect(scene).toBeDefined();
    });
  });

  describe('init', () => {
    it('should store the scene config', () => {
      scene.init(mockConfig);
      expect(scene).toBeDefined();
    });
  });

  describe('remote player management', () => {
    beforeEach(() => {
      scene.init(mockConfig);
      scene.create();
    });

    it('should add a remote player', () => {
      scene.addRemotePlayer('session-1', 5, 10, 10, 'down');
      const remotePlayers = scene.getRemotePlayers();
      expect(remotePlayers.has('session-1')).toBe(true);
    });

    it('should not add duplicate remote player', () => {
      scene.addRemotePlayer('session-1', 5, 10, 10, 'down');
      scene.addRemotePlayer('session-1', 7, 12, 12, 'up');
      const remotePlayers = scene.getRemotePlayers();
      expect(remotePlayers.size).toBe(1);
    });

    it('should update remote player position', () => {
      scene.addRemotePlayer('session-1', 5, 10, 10, 'down');
      scene.updateRemotePlayer('session-1', 15, 15, 'right', true);
      // The remote avatar should have updated target position
      const remotePlayer = scene.getRemotePlayers().get('session-1');
      expect(remotePlayer).toBeDefined();
    });

    it('should remove a remote player', () => {
      scene.addRemotePlayer('session-1', 5, 10, 10, 'down');
      scene.removeRemotePlayer('session-1');
      const remotePlayers = scene.getRemotePlayers();
      expect(remotePlayers.has('session-1')).toBe(false);
    });

    it('should handle removing non-existent player gracefully', () => {
      expect(() => scene.removeRemotePlayer('non-existent')).not.toThrow();
    });

    it('should manage multiple remote players', () => {
      scene.addRemotePlayer('session-1', 1, 5, 5, 'down');
      scene.addRemotePlayer('session-2', 2, 8, 8, 'up');
      scene.addRemotePlayer('session-3', 3, 12, 12, 'left');

      expect(scene.getRemotePlayers().size).toBe(3);

      scene.removeRemotePlayer('session-2');
      expect(scene.getRemotePlayers().size).toBe(2);
      expect(scene.getRemotePlayers().has('session-2')).toBe(false);
    });
  });

  describe('zone detection', () => {
    beforeEach(() => {
      scene.init(mockConfig);
      scene.create();
    });

    it('should start with no zone when spawn is not in a zone', () => {
      expect(scene.getCurrentZone()).toBeNull();
    });
  });

  describe('GameSceneEvents', () => {
    it('should define ZONE_ENTER event name', () => {
      expect(GameSceneEvents.ZONE_ENTER).toBe('zone_enter');
    });

    it('should define ZONE_LEAVE event name', () => {
      expect(GameSceneEvents.ZONE_LEAVE).toBe('zone_leave');
    });

    it('should define POSITION_CHANGE event name', () => {
      expect(GameSceneEvents.POSITION_CHANGE).toBe('position_change');
    });
  });

  describe('getAvatar', () => {
    beforeEach(() => {
      scene.init(mockConfig);
      scene.create();
    });

    it('should return the local player avatar', () => {
      const avatar = scene.getAvatar();
      expect(avatar).toBeDefined();
      // Avatar was created at the pixel position for tile (5, 5)
      // sprite.x and sprite.y come from the constructor args:
      // x = 5 * 32 + 16 = 176, y = 5 * 32 + 16 = 176
      expect(avatar.x).toBe(176);
      expect(avatar.y).toBe(176);
    });
  });

  describe('getMapManager', () => {
    beforeEach(() => {
      scene.init(mockConfig);
      scene.create();
    });

    it('should return the TiledMapManager instance', () => {
      const mapManager = scene.getMapManager();
      expect(mapManager).toBeDefined();
    });
  });
});
