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
  objectsTileLayerTiles?: Array<{ x: number; y: number; properties?: Record<string, unknown>; collides?: boolean }>;
  privateZoneTiles?: Array<{ x: number; y: number; jitsiRoom: string }>;
}) {
  const { mapWidth = 10, mapHeight = 10, physicsLayerTiles = [], objectsTileLayerTiles, privateZoneTiles = [] } = options;

  // Build physics layer tile lookup
  const physicsTileMap = new Map<string, { properties: Record<string, unknown>; collides: boolean }>();
  for (const t of physicsLayerTiles) {
    physicsTileMap.set(`${t.x},${t.y}`, {
      properties: t.properties ?? { collide: true },
      collides: t.collides ?? true,
    });
  }

  // Build objects tile layer lookup (if provided)
  const objectsTileMap = new Map<string, { properties: Record<string, unknown>; collides: boolean }>();
  if (objectsTileLayerTiles) {
    for (const t of objectsTileLayerTiles) {
      objectsTileMap.set(`${t.x},${t.y}`, {
        properties: t.properties ?? { collide: true },
        collides: t.collides ?? true,
      });
    }
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

  // Mock objects tile layer (null if not provided)
  const mockObjectsTileLayer = objectsTileLayerTiles !== undefined ? {
    getTileAt: vi.fn((tileX: number, tileY: number) => {
      const key = `${tileX},${tileY}`;
      const entry = objectsTileMap.get(key);
      if (!entry) return null;
      return { properties: entry.properties, collides: entry.collides };
    }),
    setCollisionByProperty: vi.fn(),
  } : null;

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
    getObjectLayer: vi.fn((_name: string) => {
      // Return zone definitions from privateZoneTiles if available
      if (privateZoneTiles.length === 0) return null;
      
      // Group tiles by jitsiRoom to create zone rectangles
      const zoneGroups = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
      for (const t of privateZoneTiles) {
        if (!zoneGroups.has(t.jitsiRoom)) {
          zoneGroups.set(t.jitsiRoom, { minX: t.x, minY: t.y, maxX: t.x, maxY: t.y });
        } else {
          const g = zoneGroups.get(t.jitsiRoom)!;
          g.minX = Math.min(g.minX, t.x);
          g.minY = Math.min(g.minY, t.y);
          g.maxX = Math.max(g.maxX, t.x);
          g.maxY = Math.max(g.maxY, t.y);
        }
      }

      const objects = Array.from(zoneGroups.entries()).map(([name, g]) => ({
        name,
        x: g.minX * 32,
        y: g.minY * 32,
        width: (g.maxX - g.minX + 1) * 32,
        height: (g.maxY - g.minY + 1) * 32,
        properties: [{ name: 'jitsiRoom', value: name }],
      }));

      return { objects };
    }),
    getLayer: vi.fn((_name: string) => {
      // Build layer data with tiles
      const layerData: unknown[][] = [];
      for (let row = 0; row < mapHeight; row++) {
        layerData[row] = [];
        for (let col = 0; col < mapWidth; col++) {
          const key = `${col},${row}`;
          const jitsiRoom = privateZoneTileMap.get(key);
          if (jitsiRoom) {
            layerData[row][col] = {
              index: 11, // ZONE_TILE_INDEX for private zone detection
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
  (manager as unknown as { objectsTileLayer: unknown }).objectsTileLayer = mockObjectsTileLayer;

  // Detect private zones using the mock tilemap
  const zones = (manager as unknown as { detectPrivateZones: (tilemap: unknown) => unknown[] }).detectPrivateZones(mockTilemap);
  (manager as unknown as { privateZones: unknown[] }).privateZones = zones;

  return { manager, mockTilemap, mockPhysicsLayer, mockObjectsTileLayer };
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


describe('TiledMapManager.isColliding with ObjectsTiles layer', () => {
  it('should return true when ObjectsTiles layer has a tile with collide: true property', () => {
    const { manager } = createMockTiledMapManager({
      physicsLayerTiles: [],
      objectsTileLayerTiles: [
        { x: 4, y: 5, properties: { collide: true }, collides: true },
      ],
    });

    // Position in pixels: tile (4,5) => pixel (128, 160)
    expect(manager.isColliding(128, 160)).toBe(true);
  });

  it('should return false when ObjectsTiles layer has a tile without collide property', () => {
    const { manager } = createMockTiledMapManager({
      physicsLayerTiles: [],
      objectsTileLayerTiles: [
        { x: 4, y: 5, properties: {}, collides: false },
      ],
    });

    expect(manager.isColliding(128, 160)).toBe(false);
  });

  it('should return true when ObjectsTiles layer tile has collides flag from Phaser', () => {
    const { manager } = createMockTiledMapManager({
      physicsLayerTiles: [],
      objectsTileLayerTiles: [
        { x: 2, y: 3, properties: {}, collides: true },
      ],
    });

    expect(manager.isColliding(64, 96)).toBe(true);
  });

  it('should return true if Physics layer blocks even when ObjectsTiles does not', () => {
    const { manager } = createMockTiledMapManager({
      physicsLayerTiles: [
        { x: 1, y: 1, properties: { collide: true }, collides: true },
      ],
      objectsTileLayerTiles: [
        { x: 1, y: 1, properties: {}, collides: false },
      ],
    });

    expect(manager.isColliding(32, 32)).toBe(true);
  });

  it('should return true if ObjectsTiles layer blocks even when Physics layer does not', () => {
    const { manager } = createMockTiledMapManager({
      physicsLayerTiles: [],
      objectsTileLayerTiles: [
        { x: 6, y: 7, properties: { collide: true }, collides: true },
      ],
    });

    expect(manager.isColliding(192, 224)).toBe(true);
  });

  it('should return false when ObjectsTiles layer is null (missing in map)', () => {
    const { manager } = createMockTiledMapManager({
      physicsLayerTiles: [],
      // objectsTileLayerTiles not provided => objectsTileLayer is null
    });

    // No physics tiles, no ObjectsTiles layer => no collision
    expect(manager.isColliding(64, 64)).toBe(false);
  });

  it('should return false when neither layer has collision at position', () => {
    const { manager } = createMockTiledMapManager({
      physicsLayerTiles: [
        { x: 0, y: 0, properties: { collide: false }, collides: false },
      ],
      objectsTileLayerTiles: [
        { x: 0, y: 0, properties: { collide: false }, collides: false },
      ],
    });

    expect(manager.isColliding(0, 0)).toBe(false);
  });
});

describe('TiledMapManager.getObjectsTileLayer', () => {
  it('should return null when no ObjectsTiles layer was loaded', () => {
    const mockScene = {
      make: { tilemap: vi.fn() },
      cache: { tilemap: { get: vi.fn() } },
    } as unknown;

    const manager = new TiledMapManager(mockScene as Phaser.Scene);

    expect(manager.getObjectsTileLayer()).toBeNull();
  });

  it('should return the ObjectsTiles layer when it exists', () => {
    const { manager, mockObjectsTileLayer } = createMockTiledMapManager({
      objectsTileLayerTiles: [
        { x: 1, y: 1, properties: { collide: true }, collides: true },
      ],
    });

    expect(manager.getObjectsTileLayer()).toBe(mockObjectsTileLayer);
  });
});


// --- Floor Tint Tests ---

/**
 * Creates a mock TiledMapManager with a ground layer containing zone floor tiles (index 10)
 * for testing applyFloorTint and clearFloorTint.
 */
function createMockTiledMapManagerWithFloorTiles(options: {
  mapWidth?: number;
  mapHeight?: number;
  floorTiles?: Array<{ x: number; y: number }>;
  otherTiles?: Array<{ x: number; y: number; index: number }>;
}) {
  const { mapWidth = 10, mapHeight = 10, floorTiles = [], otherTiles = [] } = options;
  // With firstgid=1, zone floor local id 10 => GID 11
  const ZONE_FLOOR_GID = 11;

  // Build a tile grid for the ground layer mock
  const tileGrid = new Map<string, { index: number; tint: number }>();
  for (const t of floorTiles) {
    tileGrid.set(`${t.x},${t.y}`, { index: ZONE_FLOOR_GID, tint: 0xFFFFFF });
  }
  for (const t of otherTiles) {
    tileGrid.set(`${t.x},${t.y}`, { index: t.index, tint: 0xFFFFFF });
  }

  const mockGroundLayer = {
    getTileAt: vi.fn((tileX: number, tileY: number) => {
      const key = `${tileX},${tileY}`;
      const entry = tileGrid.get(key);
      if (!entry) return null;
      return entry; // Returns the mutable object so tint can be set
    }),
    setCollisionByProperty: vi.fn(),
    setCollisionByExclusion: vi.fn(),
  };

  const mockPhysicsLayer = {
    getTileAt: vi.fn(() => null),
    setCollisionByProperty: vi.fn(),
    setCollisionByExclusion: vi.fn(),
  };

  const mockTilemap = {
    worldToTileX: vi.fn((x: number) => Math.floor(x / 32)),
    worldToTileY: vi.fn((y: number) => Math.floor(y / 32)),
    width: mapWidth,
    height: mapHeight,
  };

  // Mock mapJson with firstgid=1 (matching the real tileset)
  const mockMapJson = {
    width: mapWidth,
    height: mapHeight,
    tilewidth: 32,
    tileheight: 32,
    layers: [],
    tilesets: [{ firstgid: 1, name: 'tileset', tilewidth: 32, tileheight: 32, tilecount: 64, columns: 8, image: 'tileset.png', imagewidth: 256, imageheight: 256 }],
  };

  const mockScene = {
    make: { tilemap: vi.fn() },
    cache: { tilemap: { get: vi.fn() } },
  } as unknown;

  const manager = new TiledMapManager(mockScene as Phaser.Scene);

  // Inject mocked fields
  (manager as unknown as { tilemap: unknown }).tilemap = mockTilemap;
  (manager as unknown as { groundLayer: unknown }).groundLayer = mockGroundLayer;
  (manager as unknown as { physicsLayer: unknown }).physicsLayer = mockPhysicsLayer;
  (manager as unknown as { mapJson: unknown }).mapJson = mockMapJson;

  return { manager, mockGroundLayer, mockPhysicsLayer, tileGrid };
}

describe('TiledMapManager.applyFloorTint', () => {
  it('should tint all zone floor tiles (index 10) within zone bounds', () => {
    const { manager, tileGrid } = createMockTiledMapManagerWithFloorTiles({
      floorTiles: [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
      ],
    });

    const zone: import('./TiledMapManager').PrivateZone = {
      id: 'test-room',
      bounds: { x: 64, y: 64, width: 64, height: 64 } as Phaser.Geom.Rectangle,
      tiles: [],
    };

    manager.applyFloorTint(zone, 0x2D1B69);

    // All floor tiles within bounds should be tinted
    expect(tileGrid.get('2,2')!.tint).toBe(0x2D1B69);
    expect(tileGrid.get('3,2')!.tint).toBe(0x2D1B69);
    expect(tileGrid.get('2,3')!.tint).toBe(0x2D1B69);
    expect(tileGrid.get('3,3')!.tint).toBe(0x2D1B69);
  });

  it('should only tint zone floor tiles (GID 11), not other tiles', () => {
    const { manager, tileGrid } = createMockTiledMapManagerWithFloorTiles({
      floorTiles: [{ x: 2, y: 2 }],
      otherTiles: [
        { x: 3, y: 2, index: 12 }, // zone detection tile (GID 12)
        { x: 2, y: 3, index: 3 },  // wall tile (GID 3)
      ],
    });

    const zone: import('./TiledMapManager').PrivateZone = {
      id: 'test-room',
      bounds: { x: 64, y: 64, width: 64, height: 64 } as Phaser.Geom.Rectangle,
      tiles: [],
    };

    manager.applyFloorTint(zone, 0xFF0000);

    // Only the floor tile (GID 11) should be tinted
    expect(tileGrid.get('2,2')!.tint).toBe(0xFF0000);
    // Other tiles should remain untinted
    expect(tileGrid.get('3,2')!.tint).toBe(0xFFFFFF);
    expect(tileGrid.get('2,3')!.tint).toBe(0xFFFFFF);
  });

  it('should not tint floor tiles outside zone bounds', () => {
    const { manager, tileGrid } = createMockTiledMapManagerWithFloorTiles({
      floorTiles: [
        { x: 2, y: 2 }, // inside bounds
        { x: 5, y: 5 }, // outside bounds
      ],
    });

    const zone: import('./TiledMapManager').PrivateZone = {
      id: 'test-room',
      bounds: { x: 64, y: 64, width: 32, height: 32 } as Phaser.Geom.Rectangle,
      tiles: [],
    };

    manager.applyFloorTint(zone, 0x00E5FF);

    // Only tile inside bounds should be tinted
    expect(tileGrid.get('2,2')!.tint).toBe(0x00E5FF);
    // Tile outside bounds should remain default
    expect(tileGrid.get('5,5')!.tint).toBe(0xFFFFFF);
  });

  it('should do nothing when tilemap is not loaded', () => {
    const mockScene = {
      make: { tilemap: vi.fn() },
      cache: { tilemap: { get: vi.fn() } },
    } as unknown;

    const manager = new TiledMapManager(mockScene as Phaser.Scene);
    const zone: import('./TiledMapManager').PrivateZone = {
      id: 'test-room',
      bounds: { x: 0, y: 0, width: 64, height: 64 } as Phaser.Geom.Rectangle,
      tiles: [],
    };

    // Should not throw
    expect(() => manager.applyFloorTint(zone, 0xFF0000)).not.toThrow();
  });

  it('should replace previously applied tint with new color', () => {
    const { manager, tileGrid } = createMockTiledMapManagerWithFloorTiles({
      floorTiles: [{ x: 2, y: 2 }],
    });

    const zone: import('./TiledMapManager').PrivateZone = {
      id: 'test-room',
      bounds: { x: 64, y: 64, width: 32, height: 32 } as Phaser.Geom.Rectangle,
      tiles: [],
    };

    // Apply first tint
    manager.applyFloorTint(zone, 0xFF0000);
    expect(tileGrid.get('2,2')!.tint).toBe(0xFF0000);

    // Apply second tint — should replace
    manager.applyFloorTint(zone, 0x00FF00);
    expect(tileGrid.get('2,2')!.tint).toBe(0x00FF00);
  });

  it('should only target the Ground layer, not the Physics layer', () => {
    const { manager, mockGroundLayer, mockPhysicsLayer } = createMockTiledMapManagerWithFloorTiles({
      floorTiles: [{ x: 2, y: 2 }],
    });

    const zone: import('./TiledMapManager').PrivateZone = {
      id: 'test-room',
      bounds: { x: 64, y: 64, width: 32, height: 32 } as Phaser.Geom.Rectangle,
      tiles: [],
    };

    manager.applyFloorTint(zone, 0xFF0000);

    // Ground layer should be queried
    expect(mockGroundLayer.getTileAt).toHaveBeenCalled();
    // Physics layer should NOT be queried for floor tint
    expect(mockPhysicsLayer.getTileAt).not.toHaveBeenCalled();
  });
});

describe('TiledMapManager.clearFloorTint', () => {
  it('should reset tint to white (0xFFFFFF) for all zone floor tiles', () => {
    const { manager, tileGrid } = createMockTiledMapManagerWithFloorTiles({
      floorTiles: [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
      ],
    });

    const zone: import('./TiledMapManager').PrivateZone = {
      id: 'test-room',
      bounds: { x: 64, y: 64, width: 64, height: 32 } as Phaser.Geom.Rectangle,
      tiles: [],
    };

    // First apply a tint
    manager.applyFloorTint(zone, 0x2D1B69);
    expect(tileGrid.get('2,2')!.tint).toBe(0x2D1B69);
    expect(tileGrid.get('3,2')!.tint).toBe(0x2D1B69);

    // Then clear it
    manager.clearFloorTint(zone);
    expect(tileGrid.get('2,2')!.tint).toBe(0xFFFFFF);
    expect(tileGrid.get('3,2')!.tint).toBe(0xFFFFFF);
  });

  it('should do nothing when tilemap is not loaded', () => {
    const mockScene = {
      make: { tilemap: vi.fn() },
      cache: { tilemap: { get: vi.fn() } },
    } as unknown;

    const manager = new TiledMapManager(mockScene as Phaser.Scene);
    const zone: import('./TiledMapManager').PrivateZone = {
      id: 'test-room',
      bounds: { x: 0, y: 0, width: 64, height: 64 } as Phaser.Geom.Rectangle,
      tiles: [],
    };

    // Should not throw
    expect(() => manager.clearFloorTint(zone)).not.toThrow();
  });
});


// Import DoorTile for type reference
import type { DoorTile } from './TiledMapManager';

/**
 * Creates a mock TiledMapManager with door tiles support for testing getDoorTiles() and setDoorState().
 */
function createMockDoorTiledMapManager(options: {
  mapWidth?: number;
  mapHeight?: number;
  doorTiles?: Array<{ x: number; y: number; isOpen?: boolean }>;
  closedIndex?: number;
  openIndex?: number;
}) {
  const {
    mapWidth = 10,
    mapHeight = 10,
    doorTiles = [],
    closedIndex = 16, // firstgid(1) + tile id(15) = 16
    openIndex = 17,   // firstgid(1) + tile id(16) = 17
  } = options;

  // Build ObjectsTiles layer data for tilemap.getLayer()
  const objectsTilesData: unknown[][] = [];
  for (let row = 0; row < mapHeight; row++) {
    objectsTilesData[row] = [];
    for (let col = 0; col < mapWidth; col++) {
      const door = doorTiles.find(d => d.x === col && d.y === row);
      if (door) {
        objectsTilesData[row][col] = {
          index: door.isOpen ? openIndex : closedIndex,
          properties: {},
        };
      } else {
        objectsTilesData[row][col] = { index: -1, properties: {} };
      }
    }
  }

  // Track the tile state for putTileAt verification
  const tileStateMap = new Map<string, number>();
  for (const door of doorTiles) {
    tileStateMap.set(`${door.x},${door.y}`, door.isOpen ? openIndex : closedIndex);
  }

  // Mock ObjectsTiles layer
  const mockObjectsTileLayer = {
    getTileAt: vi.fn((tileX: number, tileY: number) => {
      const key = `${tileX},${tileY}`;
      const index = tileStateMap.get(key);
      if (index === undefined) return null;
      return { index, properties: {} };
    }),
    setCollisionByProperty: vi.fn(),
    putTileAt: vi.fn((index: number, tileX: number, tileY: number) => {
      tileStateMap.set(`${tileX},${tileY}`, index);
      return { index };
    }),
  };

  // Mock physics layer (empty, no collisions)
  const mockPhysicsLayer = {
    getTileAt: vi.fn(() => null),
    setCollisionByProperty: vi.fn(),
  };

  // Mock tilemap with getLayer that returns the ObjectsTiles data
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
    getObjectLayer: vi.fn(() => null),
    getLayer: vi.fn((name: string) => {
      if (name === 'ObjectsTiles') {
        return { height: mapHeight, width: mapWidth, data: objectsTilesData };
      }
      if (name === 'Physics') {
        // Empty physics layer
        const emptyData: unknown[][] = [];
        for (let row = 0; row < mapHeight; row++) {
          emptyData[row] = [];
          for (let col = 0; col < mapWidth; col++) {
            emptyData[row][col] = { index: -1, properties: {} };
          }
        }
        return { height: mapHeight, width: mapWidth, data: emptyData };
      }
      return null;
    }),
  };

  // Mock map JSON with tileset containing door tile properties
  const mockMapJson = {
    width: mapWidth,
    height: mapHeight,
    tilewidth: 32,
    tileheight: 32,
    layers: [],
    tilesets: [{
      firstgid: 1,
      name: 'tileset',
      tilewidth: 32,
      tileheight: 32,
      tilecount: 64,
      columns: 8,
      image: 'tileset.png',
      imagewidth: 256,
      imageheight: 256,
      tiles: [
        { id: 15, properties: [{ name: 'doorState', type: 'string', value: 'closed' }] },
        { id: 16, properties: [{ name: 'doorState', type: 'string', value: 'open' }] },
      ],
    }],
  };

  const mockScene = {
    make: { tilemap: vi.fn() },
    cache: { tilemap: { get: vi.fn() } },
  } as unknown;

  const manager = new TiledMapManager(mockScene as Phaser.Scene);

  // Inject mocked internal state
  (manager as unknown as { tilemap: unknown }).tilemap = mockTilemap;
  (manager as unknown as { physicsLayer: unknown }).physicsLayer = mockPhysicsLayer;
  (manager as unknown as { objectsTileLayer: unknown }).objectsTileLayer = mockObjectsTileLayer;
  (manager as unknown as { mapJson: unknown }).mapJson = mockMapJson;
  (manager as unknown as { privateZones: unknown[] }).privateZones = [];

  // Trigger door detection
  const detectedDoors = (manager as unknown as { detectDoorTiles: () => DoorTile[] }).detectDoorTiles();
  (manager as unknown as { doorTiles: DoorTile[] }).doorTiles = detectedDoors;

  return { manager, mockObjectsTileLayer, tileStateMap, closedIndex, openIndex };
}


describe('TiledMapManager.getDoorTiles', () => {
  it('should return an empty array when no door tiles exist', () => {
    const { manager } = createMockDoorTiledMapManager({
      doorTiles: [],
    });

    expect(manager.getDoorTiles()).toEqual([]);
  });

  it('should detect closed door tiles from ObjectsTiles layer', () => {
    const { manager } = createMockDoorTiledMapManager({
      doorTiles: [
        { x: 3, y: 2, isOpen: false },
        { x: 3, y: 3, isOpen: false },
      ],
    });

    const doors = manager.getDoorTiles();
    expect(doors).toHaveLength(2);
    expect(doors[0]).toEqual({
      tileX: 3,
      tileY: 2,
      closedIndex: 16,
      openIndex: 17,
      isOpen: false,
    });
    expect(doors[1]).toEqual({
      tileX: 3,
      tileY: 3,
      closedIndex: 16,
      openIndex: 17,
      isOpen: false,
    });
  });

  it('should detect open door tiles from ObjectsTiles layer', () => {
    const { manager } = createMockDoorTiledMapManager({
      doorTiles: [
        { x: 5, y: 4, isOpen: true },
      ],
    });

    const doors = manager.getDoorTiles();
    expect(doors).toHaveLength(1);
    expect(doors[0]).toEqual({
      tileX: 5,
      tileY: 4,
      closedIndex: 16,
      openIndex: 17,
      isOpen: true,
    });
  });

  it('should detect a mix of open and closed door tiles', () => {
    const { manager } = createMockDoorTiledMapManager({
      doorTiles: [
        { x: 1, y: 1, isOpen: false },
        { x: 7, y: 5, isOpen: true },
        { x: 2, y: 8, isOpen: false },
      ],
    });

    const doors = manager.getDoorTiles();
    expect(doors).toHaveLength(3);

    const closedDoors = doors.filter(d => !d.isOpen);
    const openDoors = doors.filter(d => d.isOpen);
    expect(closedDoors).toHaveLength(2);
    expect(openDoors).toHaveLength(1);
  });

  it('should store correct closedIndex and openIndex from tileset properties', () => {
    const { manager } = createMockDoorTiledMapManager({
      doorTiles: [{ x: 4, y: 4, isOpen: false }],
    });

    const doors = manager.getDoorTiles();
    // firstgid=1, closed tile id=15 => GID 16, open tile id=16 => GID 17
    expect(doors[0].closedIndex).toBe(16);
    expect(doors[0].openIndex).toBe(17);
  });

  it('should return empty array when ObjectsTiles layer is null', () => {
    const mockScene = {
      make: { tilemap: vi.fn() },
      cache: { tilemap: { get: vi.fn() } },
    } as unknown;

    const manager = new TiledMapManager(mockScene as Phaser.Scene);
    expect(manager.getDoorTiles()).toEqual([]);
  });
});


describe('TiledMapManager.setDoorState', () => {
  it('should swap a closed door to open state', () => {
    const { manager, mockObjectsTileLayer, openIndex } = createMockDoorTiledMapManager({
      doorTiles: [{ x: 3, y: 2, isOpen: false }],
    });

    manager.setDoorState(3, 2, true);

    expect(mockObjectsTileLayer.putTileAt).toHaveBeenCalledWith(openIndex, 3, 2);
    const doors = manager.getDoorTiles();
    expect(doors[0].isOpen).toBe(true);
  });

  it('should swap an open door to closed state', () => {
    const { manager, mockObjectsTileLayer, closedIndex } = createMockDoorTiledMapManager({
      doorTiles: [{ x: 5, y: 4, isOpen: true }],
    });

    manager.setDoorState(5, 4, false);

    expect(mockObjectsTileLayer.putTileAt).toHaveBeenCalledWith(closedIndex, 5, 4);
    const doors = manager.getDoorTiles();
    expect(doors[0].isOpen).toBe(false);
  });

  it('should not call putTileAt if door is already in the desired state', () => {
    const { manager, mockObjectsTileLayer } = createMockDoorTiledMapManager({
      doorTiles: [{ x: 3, y: 2, isOpen: false }],
    });

    manager.setDoorState(3, 2, false);

    expect(mockObjectsTileLayer.putTileAt).not.toHaveBeenCalled();
  });

  it('should not throw when setting state on a non-existent door position', () => {
    const { manager, mockObjectsTileLayer } = createMockDoorTiledMapManager({
      doorTiles: [{ x: 3, y: 2, isOpen: false }],
    });

    // Should not throw, just log a warning
    expect(() => manager.setDoorState(9, 9, true)).not.toThrow();
    expect(mockObjectsTileLayer.putTileAt).not.toHaveBeenCalled();
  });

  it('should handle multiple door tiles independently', () => {
    const { manager, mockObjectsTileLayer, openIndex, closedIndex } = createMockDoorTiledMapManager({
      doorTiles: [
        { x: 1, y: 1, isOpen: false },
        { x: 2, y: 1, isOpen: false },
      ],
    });

    // Open only the first door
    manager.setDoorState(1, 1, true);

    const doors = manager.getDoorTiles();
    expect(doors[0].isOpen).toBe(true);
    expect(doors[1].isOpen).toBe(false);

    expect(mockObjectsTileLayer.putTileAt).toHaveBeenCalledTimes(1);
    expect(mockObjectsTileLayer.putTileAt).toHaveBeenCalledWith(openIndex, 1, 1);
  });

  it('should not throw when objectsTileLayer is null', () => {
    const mockScene = {
      make: { tilemap: vi.fn() },
      cache: { tilemap: { get: vi.fn() } },
    } as unknown;

    const manager = new TiledMapManager(mockScene as Phaser.Scene);

    // Should not throw, just log a warning
    expect(() => manager.setDoorState(0, 0, true)).not.toThrow();
  });
});


describe('TiledMapManager.detectDoorTiles with rotation flags', () => {
  const FLIPPED_DIAG = 0x20000000;

  /**
   * Creates a mock TiledMapManager with door tiles that have Tiled flip/rotation bits set.
   * This simulates east/west doors which have the flipped-diagonal flag applied.
   */
  function createMockWithRotatedDoorTiles(options: {
    doorTiles: Array<{ x: number; y: number; isOpen?: boolean; rotated?: boolean }>;
  }) {
    const { doorTiles } = options;
    const mapWidth = 10;
    const mapHeight = 10;
    const closedIndex = 16; // firstgid(1) + tile id(15)
    const openIndex = 17;   // firstgid(1) + tile id(16)

    // Build ObjectsTiles layer data — rotation flags included in tile.index
    const objectsTilesData: unknown[][] = [];
    for (let row = 0; row < mapHeight; row++) {
      objectsTilesData[row] = [];
      for (let col = 0; col < mapWidth; col++) {
        const door = doorTiles.find(d => d.x === col && d.y === row);
        if (door) {
          const baseIndex = door.isOpen ? openIndex : closedIndex;
          // Apply rotation flag if this is an east/west door
          const tileIndex = door.rotated ? (baseIndex | FLIPPED_DIAG) : baseIndex;
          objectsTilesData[row][col] = { index: tileIndex, properties: {} };
        } else {
          objectsTilesData[row][col] = { index: -1, properties: {} };
        }
      }
    }

    const mockTilemap = {
      worldToTileX: vi.fn((x: number) => Math.floor(x / 32)),
      worldToTileY: vi.fn((y: number) => Math.floor(y / 32)),
      getObjectLayer: vi.fn(() => null),
      getLayer: vi.fn((name: string) => {
        if (name === 'ObjectsTiles') {
          return { height: mapHeight, width: mapWidth, data: objectsTilesData };
        }
        return null;
      }),
    };

    const mockMapJson = {
      width: mapWidth,
      height: mapHeight,
      tilewidth: 32,
      tileheight: 32,
      layers: [],
      tilesets: [{
        firstgid: 1,
        name: 'tileset',
        tilewidth: 32,
        tileheight: 32,
        tilecount: 64,
        columns: 8,
        image: 'tileset.png',
        imagewidth: 256,
        imageheight: 256,
        tiles: [
          { id: 15, properties: [{ name: 'doorState', type: 'string', value: 'closed' }] },
          { id: 16, properties: [{ name: 'doorState', type: 'string', value: 'open' }] },
        ],
      }],
    };

    const mockScene = {
      make: { tilemap: vi.fn() },
      cache: { tilemap: { get: vi.fn() } },
    } as unknown;

    const manager = new TiledMapManager(mockScene as Phaser.Scene);

    // Inject mocked internal state
    (manager as unknown as { tilemap: unknown }).tilemap = mockTilemap;
    (manager as unknown as { objectsTileLayer: unknown }).objectsTileLayer = {};
    (manager as unknown as { mapJson: unknown }).mapJson = mockMapJson;
    (manager as unknown as { privateZones: unknown[] }).privateZones = [];

    // Trigger door detection
    const detectedDoors = (manager as unknown as { detectDoorTiles: () => DoorTile[] }).detectDoorTiles();
    (manager as unknown as { doorTiles: DoorTile[] }).doorTiles = detectedDoors;

    return { manager, detectedDoors, closedIndex, openIndex };
  }

  it('should detect closed door tiles with flipped-diagonal rotation flag', () => {
    const { detectedDoors } = createMockWithRotatedDoorTiles({
      doorTiles: [
        { x: 3, y: 2, isOpen: false, rotated: true }, // east/west wall door
      ],
    });

    expect(detectedDoors).toHaveLength(1);
    expect(detectedDoors[0]).toEqual({
      tileX: 3,
      tileY: 2,
      closedIndex: 16,
      openIndex: 17,
      isOpen: false,
    });
  });

  it('should detect open door tiles with flipped-diagonal rotation flag', () => {
    const { detectedDoors } = createMockWithRotatedDoorTiles({
      doorTiles: [
        { x: 5, y: 4, isOpen: true, rotated: true },
      ],
    });

    expect(detectedDoors).toHaveLength(1);
    expect(detectedDoors[0]).toEqual({
      tileX: 5,
      tileY: 4,
      closedIndex: 16,
      openIndex: 17,
      isOpen: true,
    });
  });

  it('should detect a mix of rotated and non-rotated door tiles', () => {
    const { detectedDoors } = createMockWithRotatedDoorTiles({
      doorTiles: [
        { x: 1, y: 1, isOpen: false, rotated: false }, // north/south door (no rotation)
        { x: 5, y: 3, isOpen: false, rotated: true },  // east/west door (rotated)
        { x: 7, y: 5, isOpen: true, rotated: true },   // east/west door open (rotated)
        { x: 2, y: 8, isOpen: true, rotated: false },  // north/south door open (no rotation)
      ],
    });

    expect(detectedDoors).toHaveLength(4);
    // All should be detected regardless of rotation flags
    expect(detectedDoors[0]).toMatchObject({ tileX: 1, tileY: 1, isOpen: false });
    expect(detectedDoors[1]).toMatchObject({ tileX: 5, tileY: 3, isOpen: false });
    expect(detectedDoors[2]).toMatchObject({ tileX: 7, tileY: 5, isOpen: true });
    expect(detectedDoors[3]).toMatchObject({ tileX: 2, tileY: 8, isOpen: true });
  });

  it('should not confuse rotated door GIDs with other tile types', () => {
    const { detectedDoors } = createMockWithRotatedDoorTiles({
      doorTiles: [
        { x: 4, y: 4, isOpen: false, rotated: true },
      ],
    });

    // Only the actual door tile should be detected
    expect(detectedDoors).toHaveLength(1);
    expect(detectedDoors[0].tileX).toBe(4);
    expect(detectedDoors[0].tileY).toBe(4);
  });
});
