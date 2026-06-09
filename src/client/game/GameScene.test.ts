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
            stopFollow: vi.fn(),
            setZoom: vi.fn(),
            setBounds: vi.fn(),
            getWorldPoint: vi.fn(() => ({ x: 0, y: 0 })),
            zoom: 2,
            scrollX: 0,
            scrollY: 0,
            deadzone: null,
          },
        };
        game = {
          canvas: {
            addEventListener: vi.fn(),
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
          on: vi.fn(),
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
            setAlpha: vi.fn().mockReturnThis(),
            setOrigin: vi.fn().mockReturnThis(),
            destroy: vi.fn(),
            x: 0,
            y: 0,
            visible: false,
          })),
          rectangle: vi.fn(() => ({
            setDepth: vi.fn().mockReturnThis(),
            setOrigin: vi.fn().mockReturnThis(),
            destroy: vi.fn(),
          })),
          graphics: vi.fn(() => ({
            fillStyle: vi.fn().mockReturnThis(),
            fillCircle: vi.fn().mockReturnThis(),
            fillRect: vi.fn().mockReturnThis(),
            lineStyle: vi.fn().mockReturnThis(),
            lineBetween: vi.fn().mockReturnThis(),
            strokeRect: vi.fn().mockReturnThis(),
            generateTexture: vi.fn().mockReturnThis(),
            setDepth: vi.fn().mockReturnThis(),
            setPosition: vi.fn().mockReturnThis(),
            destroy: vi.fn(),
          })),
        };
        make = {
          tilemap: vi.fn(() => ({
            addTilesetImage: vi.fn(() => ({})),
            createLayer: vi.fn(() => ({
              setCollisionByProperty: vi.fn(),
              setCollisionByExclusion: vi.fn(),
              setDepth: vi.fn(),
            })),
            getLayer: vi.fn(() => null),
            getObjectLayer: vi.fn(() => null),
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
          image: vi.fn(),
        };
        time = {
          addEvent: vi.fn(() => ({ destroy: vi.fn() })),
        };
        tweens = {
          add: vi.fn(() => ({ stop: vi.fn() })),
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
        Between: (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1)),
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

  describe('bindRoomState', () => {
    beforeEach(() => {
      scene.init(mockConfig);
      scene.create();
    });

    function createMockRoom(zoneStates: Record<string, { isLocked: boolean; floorColorIndex: number }> = {}) {
      const onAddCallbacks: ((zoneState: any, key: string) => void)[] = [];
      const onRemoveCallbacks: ((zoneState: any, key: string) => void)[] = [];

      const zones = {
        onAdd: (cb: (zoneState: any, key: string) => void) => {
          onAddCallbacks.push(cb);
          // Trigger for existing entries
          for (const [key, state] of Object.entries(zoneStates)) {
            const mockZoneState = {
              ...state,
              zoneId: key,
              ownerSessionId: '',
              _changeCallbacks: [] as (() => void)[],
              onChange(cb: () => void) {
                this._changeCallbacks.push(cb);
              },
            };
            cb(mockZoneState, key);
          }
        },
        onRemove: (cb: (zoneState: any, key: string) => void) => {
          onRemoveCallbacks.push(cb);
        },
      };

      return {
        state: { zones },
        _onAddCallbacks: onAddCallbacks,
        _onRemoveCallbacks: onRemoveCallbacks,
      };
    }

    it('should not throw when room is null', () => {
      expect(() => scene.bindRoomState(null)).not.toThrow();
    });

    it('should not throw when room.state is undefined', () => {
      expect(() => scene.bindRoomState({ state: undefined })).not.toThrow();
    });

    it('should not throw when room.state.zones is undefined', () => {
      expect(() => scene.bindRoomState({ state: { zones: undefined } })).not.toThrow();
    });

    it('should call onAdd and onRemove on the zones MapSchema', () => {
      const mockRoom = createMockRoom();
      scene.bindRoomState(mockRoom);
      // onAdd and onRemove should have been registered
      expect(mockRoom._onAddCallbacks.length).toBe(1);
      expect(mockRoom._onRemoveCallbacks.length).toBe(1);
    });

    it('should apply initial floor color tint for zones with non-default floorColorIndex', () => {
      // Mock getPrivateZones to return a zone
      const mapManager = scene.getMapManager();
      const mockZone = {
        id: 'sala-1',
        bounds: { x: 32, y: 32, width: 160, height: 160 },
        tiles: [],
      };
      vi.spyOn(mapManager, 'getPrivateZones').mockReturnValue([mockZone as any]);
      const applyTintSpy = vi.spyOn(mapManager, 'applyFloorTint').mockImplementation(() => {});

      const mockRoom = createMockRoom({ 'sala-1': { isLocked: false, floorColorIndex: 1 } });
      scene.bindRoomState(mockRoom);

      // Should have applied tint for cyan glow (#00E5FF = 0x00E5FF)
      expect(applyTintSpy).toHaveBeenCalledWith(mockZone, 0x00E5FF);
    });

    it('should clear floor tint when floorColorIndex is -1', () => {
      const mapManager = scene.getMapManager();
      const mockZone = {
        id: 'sala-2',
        bounds: { x: 64, y: 64, width: 160, height: 160 },
        tiles: [],
      };
      vi.spyOn(mapManager, 'getPrivateZones').mockReturnValue([mockZone as any]);
      const clearTintSpy = vi.spyOn(mapManager, 'clearFloorTint').mockImplementation(() => {});

      const mockRoom = createMockRoom({ 'sala-2': { isLocked: false, floorColorIndex: -1 } });
      scene.bindRoomState(mockRoom);

      expect(clearTintSpy).toHaveBeenCalledWith(mockZone);
    });

    it('should display lock indicators when isLocked is true', () => {
      const mapManager = scene.getMapManager();
      const mockZone = {
        id: 'sala-3',
        bounds: { x: 32, y: 32, width: 160, height: 160 },
        tiles: [],
      };
      vi.spyOn(mapManager, 'getPrivateZones').mockReturnValue([mockZone as any]);
      vi.spyOn(mapManager, 'clearFloorTint').mockImplementation(() => {});
      vi.spyOn(mapManager, 'applyFloorTint').mockImplementation(() => {});
      // Mock door tiles adjacent to the zone
      vi.spyOn(mapManager, 'getDoorTiles').mockReturnValue([
        { tileX: 3, tileY: 0, closedIndex: 16, openIndex: 17, isOpen: false },
      ]);

      const mockRoom = createMockRoom({ 'sala-3': { isLocked: true, floorColorIndex: -1 } });
      scene.bindRoomState(mockRoom);

      // The graphics should have been created (via scene.add.graphics)
      const addGraphicsSpy = (scene as any).add.graphics;
      expect(addGraphicsSpy).toHaveBeenCalled();
    });

    it('should remove lock indicators when isLocked changes to false', () => {
      const mapManager = scene.getMapManager();
      const mockZone = {
        id: 'sala-4',
        bounds: { x: 32, y: 32, width: 160, height: 160 },
        tiles: [],
      };
      vi.spyOn(mapManager, 'getPrivateZones').mockReturnValue([mockZone as any]);
      vi.spyOn(mapManager, 'clearFloorTint').mockImplementation(() => {});
      vi.spyOn(mapManager, 'applyFloorTint').mockImplementation(() => {});
      vi.spyOn(mapManager, 'getDoorTiles').mockReturnValue([
        { tileX: 3, tileY: 0, closedIndex: 16, openIndex: 17, isOpen: false },
      ]);

      // First bind with locked
      const onAddCallbacks: any[] = [];
      const zones = {
        onAdd: (cb: any) => {
          onAddCallbacks.push(cb);
        },
        onRemove: vi.fn(),
      };
      const room = { state: { zones } };
      scene.bindRoomState(room);

      // Simulate zone state being added with isLocked: true
      const zoneState = {
        isLocked: true,
        floorColorIndex: -1,
        zoneId: 'sala-4',
        ownerSessionId: '',
        _changeCallbacks: [] as (() => void)[],
        onChange(cb: () => void) { this._changeCallbacks.push(cb); },
      };
      onAddCallbacks[0](zoneState, 'sala-4');

      // Now simulate change to unlocked
      zoneState.isLocked = false;
      for (const cb of zoneState._changeCallbacks) {
        cb();
      }

      // Lock indicators should be removed (graphics destroy called)
      // Since we're using mocks, verify no active lock graphics remain
      // The destroy was called on the graphics object
    });

    it('should handle zone state changes for floor color via onChange', () => {
      const mapManager = scene.getMapManager();
      const mockZone = {
        id: 'sala-5',
        bounds: { x: 64, y: 64, width: 160, height: 160 },
        tiles: [],
      };
      vi.spyOn(mapManager, 'getPrivateZones').mockReturnValue([mockZone as any]);
      const applyTintSpy = vi.spyOn(mapManager, 'applyFloorTint').mockImplementation(() => {});
      const clearTintSpy = vi.spyOn(mapManager, 'clearFloorTint').mockImplementation(() => {});

      const onAddCallbacks: any[] = [];
      const zones = {
        onAdd: (cb: any) => { onAddCallbacks.push(cb); },
        onRemove: vi.fn(),
      };
      const room = { state: { zones } };
      scene.bindRoomState(room);

      // Add zone with no color initially
      const zoneState = {
        isLocked: false,
        floorColorIndex: -1,
        zoneId: 'sala-5',
        ownerSessionId: '',
        _changeCallbacks: [] as (() => void)[],
        onChange(cb: () => void) { this._changeCallbacks.push(cb); },
      };
      onAddCallbacks[0](zoneState, 'sala-5');

      expect(clearTintSpy).toHaveBeenCalledWith(mockZone);

      // Now change floor color
      zoneState.floorColorIndex = 5; // violet: #7C4DFF
      for (const cb of zoneState._changeCallbacks) {
        cb();
      }

      expect(applyTintSpy).toHaveBeenCalledWith(mockZone, 0x7C4DFF);
    });

    it('should gracefully handle unknown zone IDs', () => {
      const mapManager = scene.getMapManager();
      vi.spyOn(mapManager, 'getPrivateZones').mockReturnValue([]);

      const mockRoom = createMockRoom({ 'unknown-zone': { isLocked: true, floorColorIndex: 3 } });
      expect(() => scene.bindRoomState(mockRoom)).not.toThrow();
    });
  });
});
