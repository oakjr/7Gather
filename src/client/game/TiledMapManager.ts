import Phaser from 'phaser';
import { TiledJSON, MapValidationResult } from '../../shared/types';
import { TILE_SIZE } from '../../shared/constants';
import { validateMapFile } from '../../shared/mapValidation';

/**
 * Represents a private zone detected from tiles with "jitsiRoom" property.
 */
export interface PrivateZone {
  id: string;
  bounds: Phaser.Geom.Rectangle;
  tiles: Phaser.Math.Vector2[];
}

/**
 * Configuration returned after successfully loading a Tiled map.
 */
export interface TiledMapConfig {
  json: TiledJSON;
  layers: {
    ground: Phaser.Tilemaps.TilemapLayer;
    physics: Phaser.Tilemaps.TilemapLayer;
    objects: Phaser.Tilemaps.TilemapLayer;
    top: Phaser.Tilemaps.TilemapLayer;
  };
  privateZones: PrivateZone[];
}

/**
 * Manages Tiled map loading, collision detection, and private zone queries.
 * Works with Phaser 3's Tilemap APIs for rendering and a pure validation method
 * for server-side or pre-load checks.
 */
export class TiledMapManager {
  private scene: Phaser.Scene;
  private tilemap: Phaser.Tilemaps.Tilemap | null = null;
  private physicsLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private privateZones: PrivateZone[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Load a Tiled map from the Phaser cache, create tilemap layers, and detect private zones.
   * The map JSON must already be loaded into Phaser's cache (via scene preload).
   *
   * @param mapKey - The cache key for the tilemap JSON data in Phaser
   * @param tilesetKey - The cache key for the tileset image
   * @param tilesetName - The name of the tileset as defined in the Tiled map
   * @returns The loaded map configuration with layers and detected private zones
   */
  loadMap(mapKey: string, tilesetKey: string, tilesetName: string): TiledMapConfig {
    const tilemap = this.scene.make.tilemap({ key: mapKey });
    const tileset = tilemap.addTilesetImage(tilesetName, tilesetKey);

    if (!tileset) {
      throw new Error(`Failed to add tileset image: ${tilesetName}`);
    }

    const groundLayer = tilemap.createLayer('Ground', tileset);
    const physicsLayer = tilemap.createLayer('Physics', tileset);
    const topLayer = tilemap.createLayer('Top', tileset);

    // Objects layer may be an objectgroup (not a tile layer) — handle gracefully
    let objectsLayer = tilemap.createLayer('Objects', tileset);
    if (!objectsLayer) {
      // Create a blank invisible layer as placeholder
      objectsLayer = groundLayer;
    }

    if (!groundLayer || !physicsLayer || !topLayer) {
      throw new Error('Failed to create one or more required tilemap layers');
    }

    // Set collision on Physics layer for non-zero tiles
    // Tiles with collide property or any non-zero tile in Physics layer blocks movement
    physicsLayer.setCollisionByExclusion([-1, 0]);

    this.tilemap = tilemap;
    this.physicsLayer = physicsLayer;

    // Detect private zones from tiles with "jitsiRoom" property
    this.privateZones = this.detectPrivateZones(tilemap);

    const json = this.scene.cache.tilemap.get(mapKey)?.data as TiledJSON;

    return {
      json,
      layers: {
        ground: groundLayer,
        physics: physicsLayer,
        objects: objectsLayer,
        top: topLayer,
      },
      privateZones: this.privateZones,
    };
  }

  /**
   * Check if a world position (in pixels) collides with the Physics layer.
   * Uses the "collide" property set on tiles in the Physics layer.
   *
   * @param x - X position in pixels
   * @param y - Y position in pixels
   * @returns true if the position is blocked by a collision tile
   */
  isColliding(x: number, y: number): boolean {
    if (!this.tilemap || !this.physicsLayer) {
      return false;
    }

    const tileX = this.tilemap.worldToTileX(x);
    const tileY = this.tilemap.worldToTileY(y);

    if (tileX === null || tileY === null) {
      return true; // Out of bounds is treated as collision
    }

    const tile = this.physicsLayer.getTileAt(tileX, tileY);
    if (!tile) {
      return false;
    }

    // Check tile properties for "collide"
    if (tile.properties && tile.properties.collide === true) {
      return true;
    }

    // Also check via Phaser's collision index (set by setCollisionByProperty)
    return tile.collides;
  }

  /**
   * Get the private zone at the given tile coordinates.
   * Checks if a tile at (tileX, tileY) belongs to a detected private zone.
   *
   * @param tileX - Tile X coordinate
   * @param tileY - Tile Y coordinate
   * @returns The PrivateZone if the tile is within one, or null
   */
  getPrivateZoneAt(tileX: number, tileY: number): PrivateZone | null {
    for (const zone of this.privateZones) {
      const found = zone.tiles.some(
        (tile) => tile.x === tileX && tile.y === tileY
      );
      if (found) {
        return zone;
      }
    }
    return null;
  }

  /**
   * Validate a Tiled map JSON file without requiring Phaser.
   * Pure function that checks structure, required layers, and file size.
   * Delegates to the standalone validateMapFile utility.
   *
   * @param json - The raw parsed JSON to validate
   * @param fileSizeBytes - The size of the original file in bytes (optional)
   * @returns Validation result with errors, warnings, and metadata
   */
  static validateMapFile(json: unknown, fileSizeBytes?: number): MapValidationResult {
    return validateMapFile(json, fileSizeBytes);
  }

  /**
   * Detect private zones from the tilemap by scanning for tiles with "jitsiRoom" property.
   * Groups contiguous tiles by zone ID and computes bounding rectangles.
   */
  private detectPrivateZones(tilemap: Phaser.Tilemaps.Tilemap): PrivateZone[] {
    const zoneMap = new Map<string, Phaser.Math.Vector2[]>();

    // Scan all layers for tiles with "jitsiRoom" property
    const layerNames = ['Ground', 'Physics', 'Objects', 'Top'];

    for (const layerName of layerNames) {
      const layer = tilemap.getLayer(layerName);
      if (!layer) continue;

      for (let y = 0; y < layer.height; y++) {
        for (let x = 0; x < layer.width; x++) {
          const tile = layer.data[y][x];
          if (!tile || tile.index === -1) continue;

          const jitsiRoom = this.getTileProperty(tile, 'jitsiRoom');
          if (jitsiRoom && typeof jitsiRoom === 'string') {
            if (!zoneMap.has(jitsiRoom)) {
              zoneMap.set(jitsiRoom, []);
            }
            zoneMap.get(jitsiRoom)!.push(new Phaser.Math.Vector2(x, y));
          }
        }
      }
    }

    // Convert to PrivateZone objects with bounding rectangles
    const zones: PrivateZone[] = [];

    for (const [id, tiles] of zoneMap) {
      if (tiles.length === 0) continue;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const tile of tiles) {
        minX = Math.min(minX, tile.x);
        minY = Math.min(minY, tile.y);
        maxX = Math.max(maxX, tile.x);
        maxY = Math.max(maxY, tile.y);
      }

      // Bounds in pixel coordinates
      const bounds = new Phaser.Geom.Rectangle(
        minX * TILE_SIZE,
        minY * TILE_SIZE,
        (maxX - minX + 1) * TILE_SIZE,
        (maxY - minY + 1) * TILE_SIZE
      );

      zones.push({ id, bounds, tiles });
    }

    return zones;
  }

  /**
   * Get a custom property value from a tile.
   */
  private getTileProperty(tile: Phaser.Tilemaps.Tile, propertyName: string): unknown {
    if (tile.properties && typeof tile.properties === 'object') {
      return tile.properties[propertyName] ?? null;
    }
    return null;
  }
}
