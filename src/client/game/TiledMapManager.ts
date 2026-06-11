import Phaser from 'phaser';
import { TiledJSON, MapValidationResult } from '../../shared/types';
import { TILE_SIZE } from '../../shared/constants';
import { validateMapFile } from '../../shared/mapValidation';

/**
 * Represents a door tile detected from the ObjectsTiles layer with doorState property.
 */
export interface DoorTile {
  tileX: number;
  tileY: number;
  closedIndex: number;
  openIndex: number;
  isOpen: boolean;
}

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
    objectsTiles: Phaser.Tilemaps.TilemapLayer | null;
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
  private objectsTileLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private privateZones: PrivateZone[] = [];
  private doorTiles: DoorTile[] = [];
  private mapJson: TiledJSON | null = null;
  /** Set of locked door tile positions (key: "x,y") that block movement */
  private lockedDoorPositions: Set<string> = new Set();

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

    // ObjectsTiles layer may be missing in older maps — graceful fallback to null
    const objectsTileLayer = tilemap.createLayer('ObjectsTiles', tileset) ?? null;

    if (!groundLayer || !physicsLayer || !topLayer) {
      throw new Error('Failed to create one or more required tilemap layers');
    }

    // Set depth values per layer architecture
    groundLayer.setDepth(1);
    physicsLayer.setDepth(2);
    if (objectsTileLayer) {
      objectsTileLayer.setDepth(3);
    }
    topLayer.setDepth(5);

    // Set collision on Physics layer for wall tiles only
    // Exclude: -1 (empty), 0 (no tile), 11 (zone detect local id), 12 (zone detect GID)
    physicsLayer.setCollisionByExclusion([-1, 0, 11, 12]);

    // Set collision on ObjectsTiles layer for tiles with collide: true property
    if (objectsTileLayer) {
      objectsTileLayer.setCollisionByProperty({ collide: true });
    }

    this.tilemap = tilemap;
    this.physicsLayer = physicsLayer;
    this.objectsTileLayer = objectsTileLayer;

    // Detect private zones from tiles with "jitsiRoom" property
    this.privateZones = this.detectPrivateZones(tilemap);

    const json = this.scene.cache.tilemap.get(mapKey)?.data as TiledJSON;
    this.mapJson = json;

    // Detect door tiles from ObjectsTiles layer
    this.doorTiles = this.detectDoorTiles();

    return {
      json,
      layers: {
        ground: groundLayer,
        physics: physicsLayer,
        objects: objectsLayer,
        objectsTiles: objectsTileLayer,
        top: topLayer,
      },
      privateZones: this.privateZones,
    };
  }

  /**
   * Check if a world position (in pixels) collides with the Physics layer or ObjectsTiles layer.
   * Uses the "collide" property set on tiles in both layers.
   * Also checks locked door positions.
   *
   * @param x - X position in pixels
   * @param y - Y position in pixels
   * @returns true if the position is blocked by a collision tile on either layer
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

    // Check locked door positions (closed doors of locked zones block movement)
    if (this.lockedDoorPositions.has(`${tileX},${tileY}`)) {
      return true;
    }

    // Check Physics layer
    const physicsTile = this.physicsLayer.getTileAt(tileX, tileY);
    if (physicsTile) {
      if (physicsTile.properties && physicsTile.properties.collide === true) {
        return true;
      }
      if (physicsTile.collides) {
        return true;
      }
    }

    // Check ObjectsTiles layer
    if (this.objectsTileLayer) {
      const objectsTile = this.objectsTileLayer.getTileAt(tileX, tileY);
      if (objectsTile) {
        if (objectsTile.properties && objectsTile.properties.collide === true) {
          return true;
        }
        if (objectsTile.collides) {
          return true;
        }
      }
    }

    return false;
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
   * Get the ObjectsTiles layer, or null if the layer is not present in the map.
   *
   * @returns The ObjectsTiles tilemap layer or null
   */
  getObjectsTileLayer(): Phaser.Tilemaps.TilemapLayer | null {
    return this.objectsTileLayer;
  }

  /**
   * Get all detected private zones.
   *
   * @returns Array of PrivateZone entries
   */
  getPrivateZones(): PrivateZone[] {
    return this.privateZones;
  }

  /**
   * Get all detected door tiles from the ObjectsTiles layer.
   * Each entry includes the tile position, closed/open indices, and current state.
   *
   * @returns Array of DoorTile entries
   */
  getDoorTiles(): DoorTile[] {
    return this.doorTiles;
  }

  /**
   * Set the door state (open/closed) for a door tile at the given tile coordinates.
   * Swaps the tile index on the ObjectsTiles layer between closedIndex and openIndex.
   *
   * @param tileX - Tile X coordinate of the door
   * @param tileY - Tile Y coordinate of the door
   * @param open - Whether the door should be open (true) or closed (false)
   */
  setDoorState(tileX: number, tileY: number, open: boolean): void {
    if (!this.objectsTileLayer) {
      console.warn('[TiledMapManager] Cannot set door state: ObjectsTiles layer not loaded');
      return;
    }

    const door = this.doorTiles.find(d => d.tileX === tileX && d.tileY === tileY);
    if (!door) {
      console.warn(`[TiledMapManager] No door tile found at (${tileX}, ${tileY})`);
      return;
    }

    if (door.isOpen === open) {
      return; // Already in the desired state
    }

    const newIndex = open ? door.openIndex : door.closedIndex;
    // Phaser tile indices in the tilemap use GID (firstgid + local id)
    // putTileAt uses the GID directly
    this.objectsTileLayer.putTileAt(newIndex, tileX, tileY);
    door.isOpen = open;
  }

  /**
   * Mark a door position as locked (blocks movement via isColliding).
   */
  setLockedDoor(tileX: number, tileY: number): void {
    this.lockedDoorPositions.add(`${tileX},${tileY}`);
  }

  /**
   * Remove a door position from the locked set (allows movement again).
   */
  clearLockedDoor(tileX: number, tileY: number): void {
    this.lockedDoorPositions.delete(`${tileX},${tileY}`);
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
   * Detect door tiles by scanning the ObjectsTiles layer for tiles with doorState property.
   * Uses the tileset tile properties to identify closed/open tile indices.
   */
  private detectDoorTiles(): DoorTile[] {
    if (!this.objectsTileLayer || !this.tilemap || !this.mapJson) {
      return [];
    }

    // Find closed and open door tile indices from tileset properties
    let closedIndex = -1;
    let openIndex = -1;

    for (const tileset of this.mapJson.tilesets) {
      if (!tileset.tiles) continue;
      for (const tile of tileset.tiles) {
        if (!tile.properties) continue;
        for (const prop of tile.properties) {
          if (prop.name === 'doorState' && prop.value === 'closed') {
            // GID = firstgid + local tile id
            closedIndex = tileset.firstgid + tile.id;
          }
          if (prop.name === 'doorState' && prop.value === 'open') {
            openIndex = tileset.firstgid + tile.id;
          }
        }
      }
    }

    if (closedIndex === -1 || openIndex === -1) {
      console.log('[TiledMapManager] No door tile indices found in tileset properties');
      return [];
    }

    // Scan the ObjectsTiles layer for tiles matching the closed door index
    const doors: DoorTile[] = [];
    const layer = this.tilemap.getLayer('ObjectsTiles');
    if (!layer) {
      return [];
    }

    for (let y = 0; y < layer.height; y++) {
      for (let x = 0; x < layer.width; x++) {
        const tile = layer.data[y][x];
        if (!tile || tile.index === -1) continue;

        // Check if this tile's index matches a door tile (closed or open)
        if (tile.index === closedIndex) {
          doors.push({
            tileX: x,
            tileY: y,
            closedIndex,
            openIndex,
            isOpen: false,
          });
        } else if (tile.index === openIndex) {
          doors.push({
            tileX: x,
            tileY: y,
            closedIndex,
            openIndex,
            isOpen: true,
          });
        }
      }
    }

    console.log(`[TiledMapManager] Detected ${doors.length} door tiles`);
    return doors;
  }

  /**
   * Detect private zones by scanning for tile index 11 in the Physics layer
   * and matching positions with Objects layer zone definitions.
   */
  private detectPrivateZones(tilemap: Phaser.Tilemaps.Tilemap): PrivateZone[] {
    // Zone detect tile: tileset index 11, GID 12 (firstgid=1)
    // Phaser may store tile.index as raw GID (12) or normalized (11) depending on version
    const ZONE_TILE_INDICES = [11, 12];
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
          if (!tile || !ZONE_TILE_INDICES.includes(tile.index)) continue;

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
   * Apply a color tint to all zone floor tiles (index 10) within a private zone's bounds.
   * Uses Phaser's tile.tint API for runtime colorization without requiring additional tileset slots.
   *
   * @param zone - The private zone whose floor tiles should be tinted
   * @param color - Hex color number to apply as tint (e.g., 0x2D1B69)
   */
  applyFloorTint(zone: PrivateZone, color: number): void {
    if (!this.tilemap || !this.physicsLayer) return;

    const ZONE_FLOOR_TILE_INDEX = 10;
    const bounds = zone.bounds;

    const startTileX = Math.floor(bounds.x / TILE_SIZE);
    const startTileY = Math.floor(bounds.y / TILE_SIZE);
    const endTileX = startTileX + Math.floor(bounds.width / TILE_SIZE);
    const endTileY = startTileY + Math.floor(bounds.height / TILE_SIZE);

    for (let y = startTileY; y < endTileY; y++) {
      for (let x = startTileX; x < endTileX; x++) {
        const tile = this.physicsLayer.getTileAt(x, y);
        if (tile && tile.index === ZONE_FLOOR_TILE_INDEX) {
          tile.tint = color;
        }
      }
    }
  }

  /**
   * Clear the floor tint from all zone floor tiles (index 10) within a private zone's bounds.
   * Resets tile tint to white (0xFFFFFF) which is the default/no-tint state.
   *
   * @param zone - The private zone whose floor tiles should have tint removed
   */
  clearFloorTint(zone: PrivateZone): void {
    this.applyFloorTint(zone, 0xFFFFFF);
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
