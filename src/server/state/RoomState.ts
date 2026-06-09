import { Schema, MapSchema, type } from "@colyseus/schema";

/**
 * Schema representing a player's state in the spatial room.
 * Synchronized across all connected clients via Colyseus delta encoding.
 */
export class PlayerSchema extends Schema {
  @type("string") sessionId: string = "";
  @type("string") displayName: string = "";
  @type("uint8") avatarId: number = 0;
  @type("float32") x: number = 0;
  @type("float32") y: number = 0;
  @type("string") direction: string = "down";
  @type("boolean") isMoving: boolean = false;
  @type("boolean") isMuted: boolean = false;
  @type("string") currentZone: string = "";
}

/**
 * Schema representing the shared music state in a room.
 * Only one music track can be active per room at a time.
 */
export class MusicSchema extends Schema {
  @type("string") source: string = "";
  @type("string") startedBy: string = "";
  @type("boolean") isPlaying: boolean = false;
}

/**
 * Schema representing a private zone's lock and customization state.
 * Each zone can be locked by its owner and have a custom floor color.
 */
export class ZoneStateSchema extends Schema {
  @type("string") zoneId: string = "";
  @type("boolean") isLocked: boolean = false;
  @type("string") ownerSessionId: string = "";
  @type("int8") floorColorIndex: number = -1; // -1 = no tint
}

/**
 * Root state schema for a spatial room.
 * Contains all players, music state, map version, and zone states for synchronization.
 */
export class RoomState extends Schema {
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type(MusicSchema) music: MusicSchema = new MusicSchema();
  @type("string") mapVersion: string = "";
  @type({ map: ZoneStateSchema }) zones = new MapSchema<ZoneStateSchema>();
}
