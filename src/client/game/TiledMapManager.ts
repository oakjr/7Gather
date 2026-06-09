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

    // Set collision on Physics layer for wall tiles only (tile 3)
    // Tile 11 (private zones) should be walkable
    physicsLayer.setCollisionByExclusion([-1, 0, 11]);

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
   * BFS pathfinding from startTile to endTile, avoiding walls.
   * Returns an array of tile positions forming the path, or null if no path found.
   * If avoidMeetingRoom is true, treats sala-reuniao tiles as walls (unless target is inside).
   */
  findPath(
    startX: number, startY: number,
    endX: number, endY: number,
    avoidMeetingRoom: boolean = true
  ): { x: number; y: number }[] | null {
    if (!this.tilemap) return null;

    const width = this.tilemap.width;
    const height = this.tilemap.height;

    // Check if target is inside the meeting room
    const targetInMeeting = this.getPrivateZoneAt(endX, endY)?.id === 'sala-reuniao';

    // BFS
    const visited = new Set<string>();
    const queue: { x: number; y: number; path: { x: number; y: number }[] }[] = [];
    const key = (x: number, y: number) => `${x},${y}`;

    queue.push({ x: startX, y: startY, path: [] });
    visited.add(key(startX, startY));

    const directions = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    ];

    let iterations = 0;
    const maxIterations = width * height; // prevent infinite loop

    while (queue.length > 0 && iterations < maxIterations) {
      iterations++;
      const current = queue.shift()!;

      if (current.x === endX && current.y === endY) {
        return [...current.path, { x: endX, y: endY }];
      }

      for (const dir of directions) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        const nKey = key(nx, ny);

        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (visited.has(nKey)) continue;

        // Check if tile is walkable
        const pixelX = nx * TILE_SIZE + TILE_SIZE / 2;
        const pixelY = ny * TILE_SIZE + TILE_SIZE / 2;
        if (this.isColliding(pixelX, pixelY)) {
          visited.add(nKey);
          continue;
        }

        // Avoid meeting room tiles unless target is inside it
        if (avoidMeetingRoom && !targetInMeeting) {
          const zone = this.getPrivateZoneAt(nx, ny);
          if (zone && zone.id === 'sala-reuniao') {
            visited.add(nKey);
            continue;
          }
        }

        visited.add(nKey);
        queue.push({ x: nx, y: ny, path: [...current.path, { x: current.x, y: current.y }] });
      }
    }

    return null; // No path found
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
   * Detect private zones by scanning for tile index 11 in the Physics layer
   * and matching positions with Objects layer zone definitions.
   */
  private detectPrivateZones(tilemap: Phaser.Tilemaps.Tilemap): PrivateZone[] {
    const ZONE_TILE_INDEX = 11; // gid 11 = private zone floor
    const zoneMap = new Map<string, Phaser.Math.Vector2[]>();

    // Get zone definitions from the Objects layer
    const objectLayer = tilemap.getObjectLayer('Objects');
    const zoneObjects = objectLayer?.objects || [];

    // Build zone definitions: rectangles with their jitsiRoom name
    const zoneDefs: { name: string; x: number; y: number; w: number; h: number }[] = [];
    for (const obj of zoneObjects) {
      const jitsiProp = obj.properties?.find((p: any) => p.name === 'jitsiRoom');
      const zoneName = jitsiProp?.value || obj.name || '';
      if (zoneName) {
        zoneDefs.push({
          name: zoneName,
          x: Math.floor((obj.x || 0) / TILE_SIZE),
          y: Math.floor((obj.y || 0) / TILE_SIZE),
          w: Math.floor((obj.width || 0) / TILE_SIZE),
          h: Math.floor((obj.height || 0) / TILE_SIZE),
        });
      }
    }

    // Scan Physics layer for zone tiles (index 11)
    const layer = tilemap.getLayer('Physics');
    if (layer) {
      for (let y = 0; y < layer.height; y++) {
        for (let x = 0; x < layer.width; x++) {
          const tile = layer.data[y][x];
          if (!tile || tile.index !== ZONE_TILE_INDEX) continue;

          // Find which zone object contains this tile
          let zoneName = '';
          for (const def of zoneDefs) {
            if (x >= def.x && x < def.x + def.w && y >= def.y && y < def.y + def.h) {
              zoneName = def.name;
              break;
            }
          }

          // Fallback: generate a name from position
          if (!zoneName) {
            zoneName = `zone_${x}_${y}`;
          }

          if (!zoneMap.has(zoneName)) {
            zoneMap.set(zoneName, []);
          }
          zoneMap.get(zoneName)!.push(new Phaser.Math.Vector2(x, y));
        }
      }
    }

    // Convert to PrivateZone objects
    const zones: PrivateZone[] = [];
    for (const [id, tiles] of zoneMap) {
      if (tiles.length === 0) continue;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const tile of tiles) {
        minX = Math.min(minX, tile.x);
        minY = Math.min(minY, tile.y);
        maxX = Math.max(maxX, tile.x);
        maxY = Math.max(maxY, tile.y);
      }
      const bounds = new Phaser.Geom.Rectangle(
        minX * TILE_SIZE, minY * TILE_SIZE,
        (maxX - minX + 1) * TILE_SIZE, (maxY - minY + 1) * TILE_SIZE
      );
      zones.push({ id, bounds, tiles });
    }

    console.log(`[TiledMapManager] Detected ${zones.length} private zones:`, zones.map(z => z.id));
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
