import { TiledLayer, TiledProperty, MapValidationResult } from './types';

/** Required layer names in the Tiled map */
export const REQUIRED_LAYERS = ['Ground', 'Physics', 'Objects', 'Top'] as const;

/** Maximum allowed map file size in bytes (5MB) */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Validate a Tiled map JSON file without requiring Phaser.
 * Pure function that checks structure, required layers, and file size.
 *
 * @param json - The raw parsed JSON to validate
 * @param fileSizeBytes - The size of the original file in bytes (optional, defaults to JSON string length)
 * @returns Validation result with errors, warnings, and metadata
 */
export function validateMapFile(json: unknown, fileSizeBytes?: number): MapValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const layersFound: string[] = [];
  let privateZonesDetected = 0;

  const size = fileSizeBytes ?? (typeof json === 'string'
    ? json.length
    : JSON.stringify(json).length);

  // Check file size
  if (size > MAX_FILE_SIZE_BYTES) {
    errors.push(`File size ${size} bytes exceeds maximum of ${MAX_FILE_SIZE_BYTES} bytes (5MB)`);
  }

  // Check basic structure
  if (json === null || typeof json !== 'object') {
    errors.push('Map file is not a valid JSON object');
    return { valid: false, errors, warnings, layersFound, privateZonesDetected, fileSizeBytes: size };
  }

  const mapData = json as Record<string, unknown>;

  // Check required top-level fields
  if (typeof mapData.width !== 'number' || mapData.width <= 0) {
    errors.push('Missing or invalid "width" field');
  }
  if (typeof mapData.height !== 'number' || mapData.height <= 0) {
    errors.push('Missing or invalid "height" field');
  }
  if (typeof mapData.tilewidth !== 'number' || mapData.tilewidth <= 0) {
    errors.push('Missing or invalid "tilewidth" field');
  }
  if (typeof mapData.tileheight !== 'number' || mapData.tileheight <= 0) {
    errors.push('Missing or invalid "tileheight" field');
  }

  // Validate tilesets
  if (!Array.isArray(mapData.tilesets) || mapData.tilesets.length === 0) {
    errors.push('Missing or empty "tilesets" array');
  }

  // Check layers
  if (!Array.isArray(mapData.layers)) {
    errors.push('Missing "layers" array');
    return { valid: false, errors, warnings, layersFound, privateZonesDetected, fileSizeBytes: size };
  }

  const layers = mapData.layers as TiledLayer[];

  for (const layer of layers) {
    if (layer.name) {
      layersFound.push(layer.name);
    }
  }

  // Check for required layers
  for (const requiredLayer of REQUIRED_LAYERS) {
    if (!layersFound.includes(requiredLayer)) {
      errors.push(`Missing required layer: "${requiredLayer}"`);
    }
  }

  // Count private zones by checking for "jitsiRoom" properties in layer tiles
  const zoneIds = new Set<string>();
  for (const layer of layers) {
    // Check layer-level properties
    if (layer.properties) {
      for (const prop of layer.properties) {
        if (prop.name === 'jitsiRoom' && typeof prop.value === 'string' && prop.value) {
          zoneIds.add(prop.value);
        }
      }
    }
  }

  // Also check tileset tile properties for jitsiRoom (common pattern in Tiled)
  if (Array.isArray(mapData.tilesets)) {
    for (const tileset of mapData.tilesets as Array<Record<string, unknown>>) {
      if (Array.isArray(tileset.tiles)) {
        for (const tile of tileset.tiles as Array<Record<string, unknown>>) {
          if (Array.isArray(tile.properties)) {
            for (const prop of tile.properties as TiledProperty[]) {
              if (prop.name === 'jitsiRoom' && typeof prop.value === 'string' && prop.value) {
                zoneIds.add(prop.value);
              }
            }
          }
        }
      }
    }
  }

  privateZonesDetected = zoneIds.size;

  // Warnings
  if (privateZonesDetected === 0) {
    warnings.push('No private zones detected (no tiles with "jitsiRoom" property found)');
  }

  const physicsLayer = layers.find((l) => l.name === 'Physics');
  if (physicsLayer && physicsLayer.type === 'tilelayer' && Array.isArray(physicsLayer.data)) {
    const hasData = physicsLayer.data.some((id) => id !== 0);
    if (!hasData) {
      warnings.push('Physics layer has no tile data (no collision tiles defined)');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    layersFound,
    privateZonesDetected,
    fileSizeBytes: size,
  };
}
