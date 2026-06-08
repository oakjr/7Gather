import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { MapValidationResult } from "../../shared/types";
import { validateMapFile } from "../../shared/mapValidation";

/**
 * Maximum allowed map file size in bytes (5MB).
 */
const MAX_MAP_SIZE_BYTES = 5 * 1024 * 1024;

/**
 * Directory where uploaded maps are stored on disk.
 */
const DEFAULT_MAPS_DIR = path.resolve(process.cwd(), "data", "maps");

/**
 * Manages map file storage on disk.
 * Stores maps as JSON files and tracks the current active map version.
 */
export class MapStorage {
  private mapsDir: string;
  private currentMapVersion: string = "";
  private currentMapPath: string = "";

  constructor(mapsDir?: string) {
    this.mapsDir = mapsDir ?? DEFAULT_MAPS_DIR;
    this.ensureDirectory();
  }

  /**
   * Ensure the maps directory exists.
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.mapsDir)) {
      fs.mkdirSync(this.mapsDir, { recursive: true });
    }
  }

  /**
   * Store a validated map file to disk.
   * Returns the new map version string.
   */
  storeMap(mapJson: object): string {
    const version = `map_${Date.now()}`;
    const filename = `${version}.json`;
    const filePath = path.join(this.mapsDir, filename);

    fs.writeFileSync(filePath, JSON.stringify(mapJson), "utf-8");

    this.currentMapVersion = version;
    this.currentMapPath = filePath;

    return version;
  }

  /**
   * Get the current active map version string.
   */
  getCurrentVersion(): string {
    return this.currentMapVersion;
  }

  /**
   * Get the current active map file path.
   */
  getCurrentMapPath(): string {
    return this.currentMapPath;
  }

  /**
   * Get the maps directory path.
   */
  getMapsDir(): string {
    return this.mapsDir;
  }
}

/**
 * Callback type for notifying room state of map version updates.
 */
export type MapVersionUpdateCallback = (newVersion: string) => void;

/**
 * Creates an Express router with map management endpoints.
 *
 * POST /maps
 *   Body: JSON map file (Tiled format)
 *   Response: { version, valid, warnings }
 *   Errors: 400 if invalid JSON, 400 if validation fails, 413 if too large
 *
 * GET /maps/current
 *   Response: { version, mapPath } or 404 if no map uploaded
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */
export function createMapRouter(
  mapStorage: MapStorage,
  onMapVersionUpdate?: MapVersionUpdateCallback
): Router {
  const router = Router();

  /**
   * POST /maps - Upload a new map file.
   * Validates the map (4 required layers, ≤5MB, valid JSON format).
   * On success: stores map to disk and updates mapVersion.
   * On failure: rejects with error details, keeps last valid map active.
   *
   * Requirements: 12.1, 12.2, 12.3, 12.4
   */
  router.post("/maps", (req: Request, res: Response) => {
    // Check Content-Type
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("application/json")) {
      res.status(400).json({
        error: "Content-Type must be application/json",
      });
      return;
    }

    const body = req.body;

    // Check if body is present
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      res.status(400).json({
        error: "Request body must be a valid JSON object",
      });
      return;
    }

    // Calculate file size from the serialized JSON
    const serialized = JSON.stringify(body);
    const fileSizeBytes = Buffer.byteLength(serialized, "utf-8");

    // Check file size limit (413 Payload Too Large)
    if (fileSizeBytes > MAX_MAP_SIZE_BYTES) {
      res.status(413).json({
        error: `Map file exceeds maximum size of 5MB (received ${fileSizeBytes} bytes)`,
      });
      return;
    }

    // Validate map structure using shared validation logic
    const validation: MapValidationResult = validateMapFile(body, fileSizeBytes);

    if (!validation.valid) {
      // Reject invalid map — keep last valid map active (Requirement 12.4)
      res.status(400).json({
        error: "Map validation failed",
        details: validation.errors,
        warnings: validation.warnings,
        layersFound: validation.layersFound,
      });
      return;
    }

    // Store map to disk
    const version = mapStorage.storeMap(body);

    // Notify room state of new map version (Requirement 12.3)
    if (onMapVersionUpdate) {
      onMapVersionUpdate(version);
    }

    res.status(201).json({
      version,
      valid: true,
      warnings: validation.warnings,
      layersFound: validation.layersFound,
      privateZonesDetected: validation.privateZonesDetected,
      fileSizeBytes,
    });
  });

  /**
   * GET /maps/current - Get the current active map version info.
   */
  router.get("/maps/current", (_req: Request, res: Response) => {
    const version = mapStorage.getCurrentVersion();

    if (!version) {
      res.status(404).json({
        error: "No map has been uploaded yet",
      });
      return;
    }

    res.json({
      version,
      mapPath: mapStorage.getCurrentMapPath(),
    });
  });

  return router;
}
