import { Room, Client } from "colyseus";
import { RoomState, PlayerSchema, ZoneStateSchema } from "../state/RoomState";
import { MAX_AVATARS, SYNC_RATE, RECONNECT_TIMEOUT_MS, FLOOR_COLOR_COUNT } from "../../shared/constants";
import { ReconnectionManager } from "./ReconnectionManager";
import type { MoveMessage, ZoneMessage, MusicMessage, TiledJSON } from "../../shared/types";

/**
 * Configuration options passed when creating a SpatialRoom.
 */
export interface SpatialRoomOptions {
  maxClients?: number;
  mapJsonPath?: string;
  roomName?: string;
  mapData?: TiledJSON;
}

/**
 * Options provided by a client when joining the room.
 */
export interface JoinOptions {
  avatarId: number;
  displayName: string;
}

/**
 * SpatialRoom is the main Colyseus room handler for the 7Gather platform.
 * Manages player state synchronization, join/leave lifecycle, and reconnection.
 *
 * Requirements: 7.1, 7.2, 7.3, 9.1, 9.4, 11.4
 */
export class SpatialRoom extends Room<RoomState> {
  /** Map width in tiles for bounds validation (default 100) */
  private mapWidth: number = 100;
  /** Map height in tiles for bounds validation (default 100) */
  private mapHeight: number = 100;

  /** Valid audio formats for music playback */
  private static readonly VALID_MUSIC_FORMATS: ReadonlySet<string> = new Set(["mp3", "ogg", "wav"]);

  /** Manages reconnection state and inactivity detection (Requirements: 1.5, 7.3, 7.5) */
  reconnectionManager!: ReconnectionManager;

  /** Interval handle for inactivity checking */
  private inactivityInterval: ReturnType<typeof setInterval> | null = null;

  /** Interval in ms for checking client inactivity */
  private static readonly INACTIVITY_CHECK_INTERVAL_MS = 1000;

  /** Zone boundary definitions loaded from map data (tile coordinates) */
  private zoneBounds: Map<string, { x: number; y: number; width: number; height: number }> = new Map();

  /** Timeout handles for owner disconnect unlock logic */
  private ownerDisconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Called when the room is created.
   * Configures max clients, patch rate, initializes state, and registers message handlers.
   */
  onCreate(options: SpatialRoomOptions): void {
    // Initialize map bounds for position validation (default 100x100 tiles)
    this.mapWidth = 100;
    this.mapHeight = 100;

    // Configure maxClients: default MAX_AVATARS (20), clamped to range 2-50
    const requestedMax = options.maxClients ?? MAX_AVATARS;
    this.maxClients = Math.min(Math.max(requestedMax, 2), 50);

    // Set state synchronization frequency: 50ms = 20 updates/sec
    this.setPatchRate(1000 / SYNC_RATE);

    // Initialize room state
    this.setState(new RoomState());

    // Initialize reconnection manager for inactivity detection (Requirement 7.3)
    this.reconnectionManager = new ReconnectionManager(RECONNECT_TIMEOUT_MS);

    // Start inactivity monitor: checks every second for clients inactive > 5s
    // Requirement 7.3: remove avatar when connection inactive for more than 5 seconds
    this.inactivityInterval = setInterval(() => {
      this.checkInactiveClients();
    }, SpatialRoom.INACTIVITY_CHECK_INTERVAL_MS);

    // Store map version if provided
    if (options.mapJsonPath) {
      this.state.mapVersion = options.mapJsonPath;
    }

    // Load zone definitions and initialize zone state
    this.initializeZones(options);

    // Register message handlers
    this.registerMessageHandlers();
  }

  /**
   * Loads zone definitions from map data and initializes ZoneStateSchema entries.
   * Zone boundaries are stored in tile coordinates for movement validation.
   * Requirements: 14.5, 14.9
   */
  private initializeZones(options: SpatialRoomOptions): void {
    // Ensure zoneBounds is initialized (needed for Object.create-based instantiation in tests)
    if (!this.zoneBounds) {
      this.zoneBounds = new Map();
    }

    // Try to load zone definitions from map JSON if available
    const mapData = options.mapData as TiledJSON | undefined;
    if (mapData) {
      this.loadZonesFromMapData(mapData);
    }

    // Initialize ZoneStateSchema entries for all loaded zones
    for (const [zoneId, bounds] of this.zoneBounds.entries()) {
      const zoneState = new ZoneStateSchema();
      zoneState.zoneId = zoneId;
      zoneState.isLocked = false;
      zoneState.ownerSessionId = "";
      zoneState.floorColorIndex = -1;
      this.state.zones.set(zoneId, zoneState);
    }
  }

  /**
   * Parses zone definitions from a Tiled JSON map's Objects layer.
   * Converts pixel-based zone coordinates to tile coordinates.
   */
  private loadZonesFromMapData(mapData: TiledJSON): void {
    const tileWidth = mapData.tilewidth || 32;
    const tileHeight = mapData.tileheight || 32;

    // Update map dimensions
    this.mapWidth = mapData.width || 100;
    this.mapHeight = mapData.height || 100;

    // Find the Objects objectgroup layer
    const objectsLayer = mapData.layers?.find(
      (layer) => layer.type === "objectgroup" && layer.name === "Objects"
    );

    if (!objectsLayer?.objects) return;

    for (const obj of objectsLayer.objects) {
      // Zone objects have type "zone" and a jitsiRoom property
      if (obj.type !== "zone") continue;

      const jitsiRoomProp = obj.properties?.find((p) => p.name === "jitsiRoom");
      const zoneId = jitsiRoomProp?.value as string || obj.name;

      if (!zoneId) continue;

      // Convert pixel coordinates to tile coordinates
      this.zoneBounds.set(zoneId, {
        x: Math.floor(obj.x / tileWidth),
        y: Math.floor(obj.y / tileHeight),
        width: Math.floor(obj.width / tileWidth),
        height: Math.floor(obj.height / tileHeight),
      });
    }
  }

  /**
   * Registers all client→server message handlers.
   * Requirements: 1.3, 4.1, 4.3, 6.1, 6.4, 7.4, 14.3, 14.4, 14.5, 14.7, 16.5, 16.6, 16.7, 16.8
   */
  private registerMessageHandlers(): void {
    // Handler "move": update player position and direction with bounds validation
    // Requirement 1.3: transmit updated position to all clients via delta binary
    // Requirement 14.5: reject movement into locked zones for non-owners
    this.onMessage("move", (client: Client, data: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // Track activity for inactivity detection (Requirement 7.3)
      this.reconnectionManager.trackActivity(client.sessionId);

      // Validate position against map bounds
      if (!this.isValidPosition(data.x, data.y)) return;

      // Validate direction
      if (!this.isValidDirection(data.direction)) return;

      // Check if target position is inside a locked zone where player is not the owner
      // Requirement 14.5: reject non-owner movement into locked zone
      // Requirement 14.7: allow owner to enter their own locked room
      const lockedZone = this.getLockedZoneAtPosition(data.x, data.y);
      if (lockedZone && lockedZone.ownerSessionId !== client.sessionId) {
        // Send room_locked notification to the rejected client
        client.send("room_locked", { zoneId: lockedZone.zoneId });
        return;
      }

      player.x = data.x;
      player.y = data.y;
      player.direction = data.direction;
      player.isMoving = true;
    });

    // Handler "lock_room": validate sender is zone owner, set isLocked=true
    // Requirement 14.3, 14.9
    this.onMessage("lock_room", (client: Client, data: { zoneId: string }) => {
      this.reconnectionManager.trackActivity(client.sessionId);

      if (!data?.zoneId || typeof data.zoneId !== "string") return;

      const zoneState = this.state.zones.get(data.zoneId);
      if (!zoneState) return;

      // Validate sender is zone owner
      if (zoneState.ownerSessionId !== client.sessionId) return;

      zoneState.isLocked = true;
    });

    // Handler "unlock_room": validate sender is zone owner, set isLocked=false
    // Requirement 14.4, 14.9
    this.onMessage("unlock_room", (client: Client, data: { zoneId: string }) => {
      this.reconnectionManager.trackActivity(client.sessionId);

      if (!data?.zoneId || typeof data.zoneId !== "string") return;

      const zoneState = this.state.zones.get(data.zoneId);
      if (!zoneState) return;

      // Validate sender is zone owner
      if (zoneState.ownerSessionId !== client.sessionId) return;

      zoneState.isLocked = false;
    });

    // Handler "set_floor_color": validate sender is owner, validate index 0-17, update floorColorIndex
    // Requirements: 16.5, 16.6, 16.7, 16.8
    this.onMessage("set_floor_color", (client: Client, data: { zoneId: string; colorIndex: number }) => {
      this.reconnectionManager.trackActivity(client.sessionId);

      if (!data?.zoneId || typeof data.zoneId !== "string") return;

      const zoneState = this.state.zones.get(data.zoneId);
      if (!zoneState) return;

      // Validate sender is zone owner (Requirement 16.7)
      if (zoneState.ownerSessionId !== client.sessionId) return;

      // Validate colorIndex is an integer in range 0-17 (Requirement 16.8)
      if (typeof data.colorIndex !== "number") return;
      if (!Number.isInteger(data.colorIndex)) return;
      if (data.colorIndex < 0 || data.colorIndex >= FLOOR_COLOR_COUNT) return;

      zoneState.floorColorIndex = data.colorIndex;
    });

    // Handler "claim_room": register room ownership for the sender
    // Required for lock/unlock/floor-color validation
    this.onMessage("claim_room", (client: Client, data: { zoneId: string }) => {
      this.reconnectionManager.trackActivity(client.sessionId);

      if (!data?.zoneId || typeof data.zoneId !== "string") return;

      const zoneState = this.state.zones.get(data.zoneId);
      if (!zoneState) return;

      // Only allow claiming if zone is unclaimed or already owned by this client
      if (zoneState.ownerSessionId && zoneState.ownerSessionId !== client.sessionId) return;

      zoneState.ownerSessionId = client.sessionId;
    });

    // Handler "release_room": release room ownership
    this.onMessage("release_room", (client: Client, data: { zoneId: string }) => {
      this.reconnectionManager.trackActivity(client.sessionId);

      if (!data?.zoneId || typeof data.zoneId !== "string") return;

      const zoneState = this.state.zones.get(data.zoneId);
      if (!zoneState) return;

      // Only the owner can release
      if (zoneState.ownerSessionId !== client.sessionId) return;

      zoneState.ownerSessionId = "";
      zoneState.isLocked = false;
      zoneState.floorColorIndex = -1;
    });

    // Handler "zone_enter": update player's currentZone and emit event for LiveKit integration
    // Requirement 4.1: disconnect from previous audio channel and connect to zone channel
    this.onMessage("zone_enter", (client: Client, data: ZoneMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // Track activity for inactivity detection
      this.reconnectionManager.trackActivity(client.sessionId);

      if (!data.zoneId || typeof data.zoneId !== "string") return;

      player.currentZone = data.zoneId;

      // Emit event for LiveKit audio channel switching integration
      this.broadcast("zone_player_entered", {
        sessionId: client.sessionId,
        zoneId: data.zoneId,
      }, { except: client });
    });

    // Handler "zone_leave": clear player's currentZone and emit exit event
    // Requirement 4.3: disconnect from zone channel and reconnect to room channel
    this.onMessage("zone_leave", (client: Client, _data: ZoneMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // Track activity for inactivity detection
      this.reconnectionManager.trackActivity(client.sessionId);

      const previousZone = player.currentZone;
      player.currentZone = "";

      // Emit event for LiveKit audio channel switching integration
      this.broadcast("zone_player_left", {
        sessionId: client.sessionId,
        zoneId: previousZone,
      }, { except: client });
    });

    // Handler "music_play": validate format, update MusicSchema, limit 1 active track per room
    // Requirement 6.1: transmit audio stream, limited to one active music per room
    this.onMessage("music_play", (client: Client, data: MusicMessage) => {
      // Track activity for inactivity detection
      this.reconnectionManager.trackActivity(client.sessionId);

      // Validate music format (mp3, ogg, wav)
      if (!data.format || !SpatialRoom.VALID_MUSIC_FORMATS.has(data.format)) return;

      // Validate source is provided
      if (!data.source || typeof data.source !== "string") return;

      // Limit: only one active music track per room
      // If music is already playing, reject new request (Requirement 6.1)
      if (this.state.music.isPlaying) return;

      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // Update MusicSchema state
      this.state.music.source = data.source;
      this.state.music.startedBy = player.displayName;
      this.state.music.isPlaying = true;
    });

    // Handler "music_stop": stop music and clear MusicSchema
    // Requirement 6.4: stop transmission for all participants
    this.onMessage("music_stop", (client: Client) => {
      // Track activity for inactivity detection
      this.reconnectionManager.trackActivity(client.sessionId);

      if (!this.state.music.isPlaying) return;

      // Clear music state
      this.state.music.source = "";
      this.state.music.startedBy = "";
      this.state.music.isPlaying = false;
    });
  }

  /**
   * Checks if a given tile position is inside a locked zone.
   * Returns the zone state if the position is in a locked zone, null otherwise.
   * Requirement 14.5
   */
  private getLockedZoneAtPosition(x: number, y: number): ZoneStateSchema | null {
    if (!this.zoneBounds) return null;

    for (const [zoneId, bounds] of this.zoneBounds.entries()) {
      // Check if position is within zone bounds (tile coordinates)
      if (
        x >= bounds.x &&
        x < bounds.x + bounds.width &&
        y >= bounds.y &&
        y < bounds.y + bounds.height
      ) {
        const zoneState = this.state.zones.get(zoneId);
        if (zoneState && zoneState.isLocked) {
          return zoneState;
        }
      }
    }
    return null;
  }

  /**
   * Validates whether a position is within map bounds.
   * Uses simple bounds checking against map dimensions.
   */
  private isValidPosition(x: number, y: number): boolean {
    if (typeof x !== "number" || typeof y !== "number") return false;
    if (isNaN(x) || isNaN(y)) return false;
    return x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight;
  }

  /**
   * Validates whether a direction string is one of the allowed values.
   */
  private isValidDirection(direction: string): boolean {
    return direction === "up" || direction === "down" || direction === "left" || direction === "right";
  }

  /**
   * Called when a client joins the room.
   * Creates a PlayerSchema entry in state and sends full snapshot.
   *
   * Requirements: 7.2 (full state snapshot on join), 11.4 (room full handled by Colyseus maxClients)
   */
  onJoin(client: Client, options: JoinOptions): void {
    const player = new PlayerSchema();
    player.sessionId = client.sessionId;
    player.displayName = options?.displayName ?? "Anonymous";
    player.avatarId = options?.avatarId ?? 1;
    player.x = 0;
    player.y = 0;
    player.direction = "down";
    player.isMoving = false;
    player.isMuted = false;
    player.currentZone = "";

    // Add player to room state — Colyseus automatically sends full state
    // snapshot to the joining client (Requirement 7.2)
    this.state.players.set(client.sessionId, player);

    // Track initial activity for inactivity detection (Requirement 7.3)
    this.reconnectionManager.trackActivity(client.sessionId);
  }

  /**
   * Called when a client leaves the room.
   * Allows reconnection within RECONNECT_TIMEOUT_MS (5s).
   * If reconnection fails, removes player from state and notifies others.
   * If the owner of a locked room disconnects, unlocks after timeout.
   *
   * Requirements: 7.3, 1.5, 14.10
   */
  async onLeave(client: Client, consented: boolean): Promise<void> {
    if (consented) {
      // Client intentionally left — remove immediately
      this.state.players.delete(client.sessionId);
      this.reconnectionManager.removeClient(client.sessionId);
      // Unlock any rooms owned by this player immediately on consented leave
      this.unlockOwnedZones(client.sessionId);
      return;
    }

    // Unexpected disconnect — allow reconnection within timeout (5s)
    // Requirement 7.5: allow automatic reconnection and re-send full state
    this.reconnectionManager.markReconnecting(client.sessionId);

    // Requirement 14.10: If owner disconnects while room is locked,
    // start a timer to unlock after RECONNECT_TIMEOUT_MS
    this.startOwnerDisconnectTimer(client.sessionId);

    try {
      await this.allowReconnection(client, RECONNECT_TIMEOUT_MS / 1000);
      // Client successfully reconnected — player state is preserved
      // Colyseus automatically re-sends full state to the reconnected client (Requirement 7.5)
      this.reconnectionManager.markReconnected(client.sessionId);
      // Cancel the unlock timer since the owner reconnected
      this.cancelOwnerDisconnectTimer(client.sessionId);
    } catch {
      // Reconnection timed out — remove player from state
      // Colyseus automatically notifies remaining clients via state patch (Requirement 7.3)
      this.state.players.delete(client.sessionId);
      this.reconnectionManager.removeClient(client.sessionId);
      // Unlock will have already happened via the timer (or unlock now as safety)
      this.unlockOwnedZones(client.sessionId);
      this.cancelOwnerDisconnectTimer(client.sessionId);
    }
  }

  /**
   * Starts a timer to unlock rooms owned by the disconnected player after RECONNECT_TIMEOUT_MS.
   * Requirement 14.10
   */
  private startOwnerDisconnectTimer(sessionId: string): void {
    if (!this.ownerDisconnectTimers) {
      this.ownerDisconnectTimers = new Map();
    }

    // Check if this player owns any locked zones
    let ownsLockedZone = false;
    this.state.zones.forEach((zoneState) => {
      if (zoneState.ownerSessionId === sessionId && zoneState.isLocked) {
        ownsLockedZone = true;
      }
    });

    if (!ownsLockedZone) return;

    // Set timer to unlock after RECONNECT_TIMEOUT_MS
    const timer = setTimeout(() => {
      this.unlockOwnedZones(sessionId);
      this.ownerDisconnectTimers.delete(sessionId);
    }, RECONNECT_TIMEOUT_MS);

    this.ownerDisconnectTimers.set(sessionId, timer);
  }

  /**
   * Cancels the owner disconnect unlock timer (called on successful reconnection).
   */
  private cancelOwnerDisconnectTimer(sessionId: string): void {
    if (!this.ownerDisconnectTimers) return;
    const timer = this.ownerDisconnectTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.ownerDisconnectTimers.delete(sessionId);
    }
  }

  /**
   * Unlocks all zones owned by the given session ID.
   * Called when owner disconnects and doesn't reconnect in time.
   * Requirement 14.10
   */
  private unlockOwnedZones(sessionId: string): void {
    this.state.zones.forEach((zoneState) => {
      if (zoneState.ownerSessionId === sessionId && zoneState.isLocked) {
        zoneState.isLocked = false;
      }
    });
  }

  /**
   * Called when the room is disposed (no more clients and room is being destroyed).
   * Performs cleanup of room resources.
   */
  onDispose(): void {
    // Stop inactivity monitor
    if (this.inactivityInterval) {
      clearInterval(this.inactivityInterval);
      this.inactivityInterval = null;
    }

    // Clear owner disconnect timers
    if (this.ownerDisconnectTimers) {
      for (const timer of this.ownerDisconnectTimers.values()) {
        clearTimeout(timer);
      }
      this.ownerDisconnectTimers.clear();
    }

    // Clear reconnection manager state
    this.reconnectionManager.clear();

    // Clear all players from state
    this.state.players.clear();
  }

  /**
   * Checks for inactive clients and removes them from the room.
   * Called periodically (every 1s) to detect clients that haven't sent
   * any message for more than RECONNECT_TIMEOUT_MS (5s).
   *
   * Requirement 7.3: remove avatar when connection inactive for more than 5 seconds
   */
  private checkInactiveClients(): void {
    const inactiveSessionIds = this.reconnectionManager.getInactiveClients();

    for (const sessionId of inactiveSessionIds) {
      // Remove inactive client's avatar from state
      this.state.players.delete(sessionId);
      this.reconnectionManager.removeClient(sessionId);
    }
  }
}
