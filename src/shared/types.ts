/**
 * Shared types and interfaces for the 7Gather spatial collaboration platform.
 * Used by both client and server.
 */

// === Avatar & Movement ===

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface AvatarState {
  sessionId: string;
  avatarId: number;     // 1-20
  x: number;           // tile position
  y: number;           // tile position
  direction: Direction;
  isMoving: boolean;
  isMuted: boolean;
}

// === WebSocket Messages (Client → Server) ===

export interface MoveMessage {
  x: number;
  y: number;
  direction: Direction;
  timestamp: number;
}

export interface ZoneMessage {
  zoneId: string;
  action: 'enter' | 'leave';
}

export interface MusicMessage {
  source: string;       // URL or file name
  format: 'mp3' | 'ogg' | 'wav';
}

// === Tiled Map Types ===

export interface TiledJSON {
  width: number;           // width in tiles
  height: number;          // height in tiles
  tilewidth: number;       // 16 or 32
  tileheight: number;      // 16 or 32
  layers: TiledLayer[];
  tilesets: TiledTileset[];
}

export interface TiledLayer {
  name: string;
  type: 'tilelayer' | 'objectgroup';
  data?: number[];         // tile IDs
  objects?: TiledObject[];
  properties?: TiledProperty[];
}

export interface TiledProperty {
  name: string;            // "collide" | "jitsiRoom"
  type: string;
  value: string | boolean;
}

export interface TiledTilesetTile {
  id: number;
  properties?: TiledProperty[];
}

export interface TiledTileset {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  image: string;
  imagewidth: number;
  imageheight: number;
  tiles?: TiledTilesetTile[];
}

export interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties?: TiledProperty[];
}

export interface MapValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  layersFound: string[];
  privateZonesDetected: number;
  fileSizeBytes: number;
}
