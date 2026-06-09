/**
 * Property-Based Tests: Collision System (Properties 1 & 2)
 *
 * Feature: space-theme-room-decoration
 *
 * Property 1: Collision tiles block movement
 * For any tile position on either the Physics layer or ObjectsTiles layer that has the
 * collide: true property set (including wall tiles at index 2, desk tiles at index 12,
 * and meeting table tiles at index 14), isColliding() called with the pixel coordinates
 * of that tile SHALL return true.
 *
 * Property 2: Non-collision tiles allow passage
 * For any tile position that contains a tile without the collide: true property (including
 * zone floor tiles at index 11, chair tiles at index 13, door tiles at indices 15/16, and
 * space window tiles at index 17), that tile SHALL NOT contribute to collision — specifically,
 * a tile on the ObjectsTiles layer without collide: true shall not cause isColliding() to
 * return true for that position (unless the Physics layer independently blocks it).
 *
 * **Validates: Requirements 2.3, 3.2, 4.3, 5.3, 6.3, 7.3, 8.3, 8.4, 8.5**
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

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

// === Constants ===
const TILE_SIZE = 32;
const MAP_SIZE = 20; // Use a 20x20 grid for property tests

// Collision tile indices (tiles that have collide: true in the tileset)
const COLLISION_TILE_INDICES = [2, 12, 14, 18] as const; // wall, desk, meeting table, decorative

// Non-collision tile indices (tiles that do NOT have collide: true)
const NON_COLLISION_TILE_INDICES = [11, 13, 15, 16, 17, 19, 20] as const; // zone, chair, doors, window, decoratives

/**
 * Creates a mock TiledMapManager with configurable Physics and ObjectsTiles layers.
 * Follows the pattern from TiledMapManager.test.ts.
 */
function createMockTiledMapManager(options: {
  mapWidth?: number;
  mapHeight?: number;
  physicsLayerTiles?: Array<{ x: number; y: number; properties?: Record<string, unknown>; collides?: boolean }>;
  objectsTileLayerTiles?: Array<{ x: number; y: number; properties?: Record<string, unknown>; collides?: boolean }>;
}) {
  const { mapWidth = MAP_SIZE, mapHeight = MAP_SIZE, physicsLayerTiles = [], objectsTileLayerTiles } = options;

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
      const tileX = Math.floor(x / TILE_SIZE);
      if (tileX < 0 || tileX >= mapWidth) return null;
      return tileX;
    }),
    worldToTileY: vi.fn((y: number) => {
      const tileY = Math.floor(y / TILE_SIZE);
      if (tileY < 0 || tileY >= mapHeight) return null;
      return tileY;
    }),
  };

  const mockScene = {
    make: { tilemap: vi.fn() },
    cache: { tilemap: { get: vi.fn() } },
  } as unknown;

  const manager = new TiledMapManager(mockScene as Phaser.Scene);

  // Inject mocked tilemap and layers using private field access
  (manager as unknown as { tilemap: unknown }).tilemap = mockTilemap;
  (manager as unknown as { physicsLayer: unknown }).physicsLayer = mockPhysicsLayer;
  (manager as unknown as { objectsTileLayer: unknown }).objectsTileLayer = mockObjectsTileLayer;

  return { manager };
}

// === Arbitraries (Generators) ===

/** Generate a collision tile index */
const collisionTileIndexArb = fc.constantFrom(...COLLISION_TILE_INDICES);

/** Generate a non-collision tile index */
const nonCollisionTileIndexArb = fc.constantFrom(...NON_COLLISION_TILE_INDICES);

/** Generate which layer(s) to place a tile on: 'physics', 'objects', or 'both' */
const layerChoiceArb = fc.constantFrom('physics' as const, 'objects' as const, 'both' as const);

/** Generate a set of unique collision tile positions with layer assignments */
const collisionTileSetArb = fc.array(
  fc.record({
    x: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
    y: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
    tileIndex: collisionTileIndexArb,
    layer: layerChoiceArb,
  }),
  { minLength: 1, maxLength: 15 }
).map(tiles => {
  // Deduplicate by position per layer
  const seenPhysics = new Set<string>();
  const seenObjects = new Set<string>();
  return tiles.filter(t => {
    const key = `${t.x},${t.y}`;
    let dominated = true;
    if (t.layer === 'physics' || t.layer === 'both') {
      if (seenPhysics.has(key)) return false;
      seenPhysics.add(key);
      dominated = false;
    }
    if (t.layer === 'objects' || t.layer === 'both') {
      if (seenObjects.has(key)) return false;
      seenObjects.add(key);
      dominated = false;
    }
    return !dominated;
  });
});

/** Generate a set of unique non-collision tile positions on the ObjectsTiles layer */
const nonCollisionObjectsTileSetArb = fc.array(
  fc.record({
    x: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
    y: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
    tileIndex: nonCollisionTileIndexArb,
  }),
  { minLength: 1, maxLength: 15 }
).map(tiles => {
  // Deduplicate by position
  const seen = new Set<string>();
  return tiles.filter(t => {
    const key = `${t.x},${t.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});

// === Property Tests ===

describe('Property 1: Collision tiles block movement', () => {
  /**
   * **Validates: Requirements 2.3, 4.3, 6.3, 8.3, 8.5**
   *
   * For any tile position on either the Physics layer or ObjectsTiles layer that has
   * the collide: true property set, isColliding() called with the pixel coordinates
   * of that tile SHALL return true.
   */
  it('isColliding returns true for any tile with collide: true on the Physics layer', () => {
    fc.assert(
      fc.property(
        collisionTileSetArb,
        (collisionTiles) => {
          // Filter tiles that are on the physics layer
          const physicsTiles = collisionTiles.filter(
            t => t.layer === 'physics' || t.layer === 'both'
          );

          if (physicsTiles.length === 0) return true; // trivially satisfied

          const { manager } = createMockTiledMapManager({
            mapWidth: MAP_SIZE,
            mapHeight: MAP_SIZE,
            physicsLayerTiles: physicsTiles.map(t => ({
              x: t.x,
              y: t.y,
              properties: { collide: true },
              collides: true,
            })),
          });

          // Check that each collision tile position reports collision
          for (const tile of physicsTiles) {
            const pixelX = tile.x * TILE_SIZE + TILE_SIZE / 2;
            const pixelY = tile.y * TILE_SIZE + TILE_SIZE / 2;
            if (!manager.isColliding(pixelX, pixelY)) {
              return false;
            }
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isColliding returns true for any tile with collide: true on the ObjectsTiles layer', () => {
    fc.assert(
      fc.property(
        collisionTileSetArb,
        (collisionTiles) => {
          // Filter tiles that are on the objects layer
          const objectsTiles = collisionTiles.filter(
            t => t.layer === 'objects' || t.layer === 'both'
          );

          if (objectsTiles.length === 0) return true; // trivially satisfied

          const { manager } = createMockTiledMapManager({
            mapWidth: MAP_SIZE,
            mapHeight: MAP_SIZE,
            physicsLayerTiles: [],
            objectsTileLayerTiles: objectsTiles.map(t => ({
              x: t.x,
              y: t.y,
              properties: { collide: true },
              collides: true,
            })),
          });

          // Check that each collision tile position reports collision
          for (const tile of objectsTiles) {
            const pixelX = tile.x * TILE_SIZE + TILE_SIZE / 2;
            const pixelY = tile.y * TILE_SIZE + TILE_SIZE / 2;
            if (!manager.isColliding(pixelX, pixelY)) {
              return false;
            }
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isColliding returns true for collision tiles on both layers simultaneously', () => {
    fc.assert(
      fc.property(
        collisionTileSetArb,
        (collisionTiles) => {
          const physicsTiles = collisionTiles.filter(
            t => t.layer === 'physics' || t.layer === 'both'
          );
          const objectsTiles = collisionTiles.filter(
            t => t.layer === 'objects' || t.layer === 'both'
          );

          const { manager } = createMockTiledMapManager({
            mapWidth: MAP_SIZE,
            mapHeight: MAP_SIZE,
            physicsLayerTiles: physicsTiles.map(t => ({
              x: t.x,
              y: t.y,
              properties: { collide: true },
              collides: true,
            })),
            objectsTileLayerTiles: objectsTiles.length > 0
              ? objectsTiles.map(t => ({
                  x: t.x,
                  y: t.y,
                  properties: { collide: true },
                  collides: true,
                }))
              : [],
          });

          // Every collision tile (regardless of layer) must report collision
          for (const tile of collisionTiles) {
            const pixelX = tile.x * TILE_SIZE + TILE_SIZE / 2;
            const pixelY = tile.y * TILE_SIZE + TILE_SIZE / 2;
            if (!manager.isColliding(pixelX, pixelY)) {
              return false;
            }
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 2: Non-collision tiles allow passage', () => {
  /**
   * **Validates: Requirements 3.2, 5.3, 7.3, 8.4**
   *
   * For any tile position that contains a tile without the collide: true property,
   * that tile SHALL NOT contribute to collision — specifically, a tile on the ObjectsTiles
   * layer without collide: true shall not cause isColliding() to return true for that
   * position (unless the Physics layer independently blocks it).
   */
  it('isColliding returns false for non-collision tiles on ObjectsTiles when Physics layer is clear', () => {
    fc.assert(
      fc.property(
        nonCollisionObjectsTileSetArb,
        (nonCollisionTiles) => {
          if (nonCollisionTiles.length === 0) return true;

          const { manager } = createMockTiledMapManager({
            mapWidth: MAP_SIZE,
            mapHeight: MAP_SIZE,
            physicsLayerTiles: [], // No physics collision
            objectsTileLayerTiles: nonCollisionTiles.map(t => ({
              x: t.x,
              y: t.y,
              properties: {}, // No collide property
              collides: false,
            })),
          });

          // Each non-collision tile position should not report collision
          for (const tile of nonCollisionTiles) {
            const pixelX = tile.x * TILE_SIZE + TILE_SIZE / 2;
            const pixelY = tile.y * TILE_SIZE + TILE_SIZE / 2;
            if (manager.isColliding(pixelX, pixelY)) {
              return false;
            }
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('non-collision ObjectsTiles tiles do not override Physics layer collision', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            x: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
            y: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
          }),
          { minLength: 1, maxLength: 10 }
        ).map(tiles => {
          // Deduplicate
          const seen = new Set<string>();
          return tiles.filter(t => {
            const key = `${t.x},${t.y}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }),
        (positions) => {
          if (positions.length === 0) return true;

          // Physics layer blocks these positions, ObjectsTiles has non-collision tiles
          const { manager } = createMockTiledMapManager({
            mapWidth: MAP_SIZE,
            mapHeight: MAP_SIZE,
            physicsLayerTiles: positions.map(p => ({
              x: p.x,
              y: p.y,
              properties: { collide: true },
              collides: true,
            })),
            objectsTileLayerTiles: positions.map(p => ({
              x: p.x,
              y: p.y,
              properties: {}, // Non-collision on Objects layer
              collides: false,
            })),
          });

          // These positions should STILL be blocked (Physics layer blocks independently)
          for (const pos of positions) {
            const pixelX = pos.x * TILE_SIZE + TILE_SIZE / 2;
            const pixelY = pos.y * TILE_SIZE + TILE_SIZE / 2;
            if (!manager.isColliding(pixelX, pixelY)) {
              return false; // Physics should still block
            }
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('mixed map: non-collision ObjectsTiles tiles only block if Physics independently collides', () => {
    fc.assert(
      fc.property(
        fc.record({
          // Tiles that are blocked on physics layer (use x range 0-9)
          blockedPositions: fc.array(
            fc.record({
              x: fc.integer({ min: 0, max: 9 }),
              y: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          // Tiles that are free on both layers (use x range 10-19 to avoid overlap)
          freePositions: fc.array(
            fc.record({
              x: fc.integer({ min: 10, max: MAP_SIZE - 1 }),
              y: fc.integer({ min: 0, max: MAP_SIZE - 1 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
        }),
        ({ blockedPositions, freePositions }) => {
          // Deduplicate within each set
          const dedup = (arr: { x: number; y: number }[]) => {
            const seen = new Set<string>();
            return arr.filter(t => {
              const key = `${t.x},${t.y}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          };

          const blocked = dedup(blockedPositions);
          const free = dedup(freePositions);

          if (blocked.length === 0 || free.length === 0) return true;

          const { manager } = createMockTiledMapManager({
            mapWidth: MAP_SIZE,
            mapHeight: MAP_SIZE,
            physicsLayerTiles: blocked.map(p => ({
              x: p.x,
              y: p.y,
              properties: { collide: true },
              collides: true,
            })),
            objectsTileLayerTiles: [
              // Non-collision tiles at blocked positions (should still collide due to Physics)
              ...blocked.map(p => ({
                x: p.x,
                y: p.y,
                properties: {},
                collides: false,
              })),
              // Non-collision tiles at free positions (should not collide)
              ...free.map(p => ({
                x: p.x,
                y: p.y,
                properties: {},
                collides: false,
              })),
            ],
          });

          // Blocked positions should still report collision
          for (const pos of blocked) {
            const pixelX = pos.x * TILE_SIZE + TILE_SIZE / 2;
            const pixelY = pos.y * TILE_SIZE + TILE_SIZE / 2;
            if (!manager.isColliding(pixelX, pixelY)) {
              return false;
            }
          }

          // Free positions should not report collision
          for (const pos of free) {
            const pixelX = pos.x * TILE_SIZE + TILE_SIZE / 2;
            const pixelY = pos.y * TILE_SIZE + TILE_SIZE / 2;
            if (manager.isColliding(pixelX, pixelY)) {
              return false;
            }
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
