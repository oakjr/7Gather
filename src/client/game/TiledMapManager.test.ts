import { describe, it, expect, vi } from 'vitest';
import { validateMapFile } from '../../shared/mapValidation';
import { TiledJSON } from '../../shared/types';

// Mock Phaser module before importing TiledMapManager
vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Geom: {
      Rectangle: class {
        x: number; y: number; width: number; height: number;
        constructor(x: number, y: number, w: number, h: number) {
          this.x = x; this.y = y; this.width = w; this.height = h;
        }
      },
    },
    Math: {
      Vector2: class {
        x: number; y: number;
        constructor(x: number, y: number) { this.x = x; this.y = y; }
      },
    },
    Tilemaps: { Tilemap: class {}, TilemapLayer: class {} },
    GameObjects: { Line: class {} },
    Types: { Input: { Keyboard: {} } },
  },
  Scene: class {},
  Geom: {
    Rectangle: class {
      x: number; y: number; width: number; height: number;
      constructor(x: number, y: number, w: number, h: number) {
        this.x = x; this.y = y; this.width = w; this.height = h;
      }
    },
  },
  Math: {
    Vector2: class {
      x: number; y: number;
      constructor(x: number, y: number) { this.x = x; this.y = y; }
    },
  },
}));

import { TiledMapManager } from './TiledMapManager';

/**
 * Creates a valid minimal TiledJSON map for testing.
 */
function createValidMapJson(overrides?: Partial<TiledJSON>): TiledJSON {
  return {
    width: 10,
    height: 10,
    tilewidth: 32,
    tileheight: 32,
    layers: [
      { name: 'Ground', type: 'tilelayer', data: new Array(100).fill(1) },
      { name: 'Physics', type: 'tilelayer', data: new Array(100).fill(0) },
      { name: 'Objects', type: 'tilelayer', data: new Array(100).fill(0) },
      { name: 'Top', type: 'tilelayer', data: new Array(100).fill(0) },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'tileset',
        tilewidth: 32,
        tileheight: 32,
        tilecount: 100,
        columns: 10,
        image: 'tileset.png',
        imagewidth: 320,
        imageheight: 320,
      },
    ],
    ...overrides,
  };
}

describe('TiledMapManager.validateMapFile', () => {
  it('should validate a correct map file', () => {
    const json = createValidMapJson();
    const result = validateMapFile(json);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.layersFound).toContain('Ground');
    expect(result.layersFound).toContain('Physics');
    expect(result.layersFound).toContain('Objects');
    expect(result.layersFound).toContain('Top');
  });

  it('should reject a file exceeding 5MB', () => {
    const json = createValidMapJson();
    const result = validateMapFile(json, 6 * 1024 * 1024);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeds maximum'))).toBe(true);
    expect(result.fileSizeBytes).toBe(6 * 1024 * 1024);
  });

  it('should reject a non-object input', () => {
    const result = validateMapFile(null);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not a valid JSON object'))).toBe(true);
  });

  it('should reject when missing required layers', () => {
    const json = {
      width: 10,
      height: 10,
      tilewidth: 32,
      tileheight: 32,
      layers: [
        { name: 'Ground', type: 'tilelayer', data: [] },
        { name: 'Physics', type: 'tilelayer', data: [] },
      ],
      tilesets: [{ firstgid: 1, name: 'test', tilewidth: 32, tileheight: 32, tilecount: 1, columns: 1, image: 'test.png', imagewidth: 32, imageheight: 32 }],
    };
    const result = validateMapFile(json);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Objects'))).toBe(true);
    expect(result.errors.some((e) => e.includes('Top'))).toBe(true);
    expect(result.layersFound).toContain('Ground');
    expect(result.layersFound).toContain('Physics');
    expect(result.layersFound).not.toContain('Objects');
    expect(result.layersFound).not.toContain('Top');
  });

  it('should reject when missing width/height fields', () => {
    const json = {
      tilewidth: 32,
      tileheight: 32,
      layers: [
        { name: 'Ground', type: 'tilelayer', data: [] },
        { name: 'Physics', type: 'tilelayer', data: [] },
        { name: 'Objects', type: 'tilelayer', data: [] },
        { name: 'Top', type: 'tilelayer', data: [] },
      ],
      tilesets: [{ firstgid: 1, name: 'test', tilewidth: 32, tileheight: 32, tilecount: 1, columns: 1, image: 'test.png', imagewidth: 32, imageheight: 32 }],
    };
    const result = validateMapFile(json);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"width"'))).toBe(true);
    expect(result.errors.some((e) => e.includes('"height"'))).toBe(true);
  });

  it('should reject when layers field is missing', () => {
    const json = {
      width: 10,
      height: 10,
      tilewidth: 32,
      tileheight: 32,
      tilesets: [{ firstgid: 1, name: 'test', tilewidth: 32, tileheight: 32, tilecount: 1, columns: 1, image: 'test.png', imagewidth: 32, imageheight: 32 }],
    };
    const result = validateMapFile(json);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"layers"'))).toBe(true);
  });

  it('should reject when tilesets is empty', () => {
    const json = createValidMapJson({ tilesets: [] });
    const result = validateMapFile(json);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"tilesets"'))).toBe(true);
  });

  it('should detect private zones from tileset tile properties', () => {
    const json = {
      width: 10,
      height: 10,
      tilewidth: 32,
      tileheight: 32,
      layers: [
        { name: 'Ground', type: 'tilelayer', data: new Array(100).fill(1) },
        { name: 'Physics', type: 'tilelayer', data: new Array(100).fill(0) },
        { name: 'Objects', type: 'tilelayer', data: new Array(100).fill(0) },
        { name: 'Top', type: 'tilelayer', data: new Array(100).fill(0) },
      ],
      tilesets: [
        {
          firstgid: 1,
          name: 'tileset',
          tilewidth: 32,
          tileheight: 32,
          tilecount: 100,
          columns: 10,
          image: 'tileset.png',
          imagewidth: 320,
          imageheight: 320,
          tiles: [
            {
              id: 5,
              properties: [
                { name: 'jitsiRoom', type: 'string', value: 'meeting-room-1' },
              ],
            },
            {
              id: 10,
              properties: [
                { name: 'jitsiRoom', type: 'string', value: 'meeting-room-2' },
              ],
            },
          ],
        },
      ],
    };
    const result = validateMapFile(json);

    expect(result.valid).toBe(true);
    expect(result.privateZonesDetected).toBe(2);
    expect(result.warnings.every((w) => !w.includes('No private zones'))).toBe(true);
  });

  it('should warn when no private zones are found', () => {
    const json = createValidMapJson();
    const result = validateMapFile(json);

    expect(result.warnings.some((w) => w.includes('No private zones'))).toBe(true);
    expect(result.privateZonesDetected).toBe(0);
  });

  it('should warn when Physics layer has no collision data', () => {
    const json = createValidMapJson();
    const result = validateMapFile(json);

    expect(result.warnings.some((w) => w.includes('no tile data'))).toBe(true);
  });

  it('should accept file exactly at 5MB', () => {
    const json = createValidMapJson();
    const result = validateMapFile(json, 5 * 1024 * 1024);

    // Exactly 5MB should not trigger the size error
    expect(result.errors.some((e) => e.includes('exceeds maximum'))).toBe(false);
  });

  it('should report correct fileSizeBytes', () => {
    const json = createValidMapJson();
    const result = validateMapFile(json, 1234);

    expect(result.fileSizeBytes).toBe(1234);
  });

  it('should calculate fileSizeBytes from JSON when not provided', () => {
    const json = createValidMapJson();
    const result = validateMapFile(json);

    expect(result.fileSizeBytes).toBeGreaterThan(0);
    expect(result.fileSizeBytes).toBe(JSON.stringify(json).length);
  });
});


// --- Phaser mocks for TiledMapManager instance methods ---

/**
 * Creates a mock Phaser scene and tilemap for testing isColliding and getPrivateZoneAt.
 */
function createMockTiledMapManager(options: {
  mapWidth?: number;
  mapHeight?: number;
  physicsLayerTiles?: Array<{ x: number; y: number; properties?: Record<string, unknown>; collides?: boolean }>;
  privateZoneTiles?: Array<{ x: number; y: number; jitsiRoom: string }>;
}) {
  const { mapWidth = 10, mapHeight = 10, physicsLayerTiles = [], privateZoneTiles = [] } = options;

  // Build physics layer tile lookup
  const physicsTileMap = new Map<string, { properties: Record<string, unknown>; collides: boolean }>();
  for (const t of physicsLayerTiles) {
    physicsTileMap.set(`${t.x},${t.y}`, {
      properties: t.properties ?? { collide: true },
      collides: t.collides ?? true,
    });
  }

  // Build private zone tile lookup for all layers
  const privateZoneTileMap = new Map<string, string>();
  for (const t of privateZoneTiles) {
    privateZoneTileMap.set(`${t.x},${t.y}`, t.jitsiRoom);
  }

  // Mock physics layer
  const mockPhysicsLayer = {
    getTileAt: vi.fn((tileX: number, tileY: number) => {
      const key = `${tileX},${tileY}`;
      const entry = physicsTileMap.get(key);
      if (!entry) return null;
      return { properties: entry.properties, collides: entry.collides };
    }),
    setCollisionByProperty: vi.fn(),
  };

  // Mock tilemap
  const mockTilemap = {
    worldToTileX: vi.fn((x: number) => {
      const tileX = Math.floor(x / 32);
      if (tileX < 0 || tileX >= mapWidth) return null;
      return tileX;
    }),
    worldToTileY: vi.fn((y: number) => {
      const tileY = Math.floor(y / 32);
      if (tileY < 0 || tileY >= mapHeight) return null;
      return tileY;
    }),
    getLayer: vi.fn((name: string) => {
      // Build layer data with tiles
      const layerData: unknown[][] = [];
      for (let row = 0; row < mapHeight; row++) {
        layerData[row] = [];
        for (let col = 0; col < mapWidth; col++) {
          const key = `${col},${row}`;
          const jitsiRoom = privateZoneTileMap.get(key);
          if (jitsiRoom) {
            layerData[row][col] = {
              index: 1,
              properties: { jitsiRoom },
            };
          } else {
            layerData[row][col] = { index: -1, properties: {} };
          }
        }
      }
      return { height: mapHeight, width: mapWidth, data: layerData };
    }),
  };

  // We'll use the actual class but set its private fields directly
  const mockScene = {
    make: { tilemap: vi.fn() },
    cache: { tilemap: { get: vi.fn() } },
  } as unknown;

  const manager = new TiledMapManager(mockScene as Phaser.Scene);

  // Inject mocked tilemap and physicsLayer using private field access
  (manager as unknown as { tilemap: unknown }).tilemap = mockTilemap;
  (manager as unknown as { physicsLayer: unknown }).physicsLayer = mockPhysicsLayer;

  // Detect private zones using the mock tilemap
  const zones = (manager as unknown as { detectPrivateZones: (tilemap: unknown) => unknown[] }).detectPrivateZones(mockTilemap);
  (manager as unknown as { privateZones: unknown[] }).privateZones = zones;

  return { manager, mockTilemap, mockPhysicsLayer };
}

describe('TiledMapManager.isColliding', () => {
  it('should return true when tile at position has collide property', () => {
    const { manager } = createMockTiledMapManager({
      physicsLayerTiles: [
        { x: 3, y: 4, properties: { collide: true }, collides: true },
      ],
    });

    // Position in pixels: tile (3,4) => pixel (96-127, 128-159)
    expect(manager.isColliding(96, 128)).toBe(true);
  });

  it('should return false when no collision tile at position', () => {
    const { manager } = createMockTiledMapManager({
      physicsLayerTiles: [
        { x: 3, y: 4, properties: { collide: true }, collides: true },
      ],
    });

    // Position at tile (0,0) which has no physics tile
    expect(manager.isColliding(0, 0)).toBe(false);
  });

  it('should return true for out-of-bounds positions', () => {
    const { manager } = createMockTiledMapManager({
      mapWidth: 10,
      mapHeight: 10,
    });

    // Position beyond map bounds (tile 10+ is out for a 10-wide map)
    expect(manager.isColliding(-32, 0)).toBe(true);
    expect(manager.isColliding(0, -32)).toBe(true);
    expect(manager.isColliding(320, 0)).toBe(true); // tile 10 is out of bounds
    expect(manager.isColliding(0, 320)).toBe(true);
  });

  it('should return false when tilemap or physics layer is not loaded', () => {
    const mockScene = {
      make: { tilemap: vi.fn() },
      cache: { tilemap: { get: vi.fn() } },
    } as unknown;

    const manager = new TiledMapManager(mockScene as Phaser.Scene);

    // Without loading a map, isColliding should return false
    expect(manager.isColliding(64, 64)).toBe(false);
  });

  it('should use tile.collides property from Phaser collision index', () => {
    const { manager } = createMockTiledMapManager({
      physicsLayerTiles: [
        // Tile where properties.collide is not set but Phaser's collides flag is true
        { x: 5, y: 5, properties: {}, collides: true },
      ],
    });

    expect(manager.isColliding(160, 160)).toBe(true);
  });

  it('should return false when tile exists but has no collision', () => {
    const { manager } = createMockTiledMapManager({
      physicsLayerTiles: [
        { x: 2, y: 2, properties: { collide: false }, collides: false },
      ],
    });

    expect(manager.isColliding(64, 64)).toBe(false);
  });
});

describe('TiledMapManager.getPrivateZoneAt', () => {
  it('should return the private zone for a tile with jitsiRoom property', () => {
    const { manager } = createMockTiledMapManager({
      privateZoneTiles: [
        { x: 2, y: 3, jitsiRoom: 'meeting-room-1' },
        { x: 3, y: 3, jitsiRoom: 'meeting-room-1' },
      ],
    });

    const zone = manager.getPrivateZoneAt(2, 3);
    expect(zone).not.toBeNull();
    expect(zone!.id).toBe('meeting-room-1');
  });

  it('should return null for tiles outside any private zone', () => {
    const { manager } = createMockTiledMapManager({
      privateZoneTiles: [
        { x: 5, y: 5, jitsiRoom: 'meeting-room-1' },
      ],
    });

    const zone = manager.getPrivateZoneAt(0, 0);
    expect(zone).toBeNull();
  });

  it('should distinguish between different private zones', () => {
    const { manager } = createMockTiledMapManager({
      privateZoneTiles: [
        { x: 1, y: 1, jitsiRoom: 'room-a' },
        { x: 5, y: 5, jitsiRoom: 'room-b' },
      ],
    });

    const zoneA = manager.getPrivateZoneAt(1, 1);
    const zoneB = manager.getPrivateZoneAt(5, 5);

    expect(zoneA).not.toBeNull();
    expect(zoneA!.id).toBe('room-a');
    expect(zoneB).not.toBeNull();
    expect(zoneB!.id).toBe('room-b');
  });
});
