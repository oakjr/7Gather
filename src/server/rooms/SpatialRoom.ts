import { Room, Client } from "colyseus";
import { RoomState, PlayerSchema } from "../state/RoomState";
import { MAX_AVATARS, SYNC_RATE, RECONNECT_TIMEOUT_MS } from "../../shared/constants";
import { ReconnectionManager } from "./ReconnectionManager";
import type { MoveMessage, ZoneMessage, MusicMessage } from "../../shared/types";

/**
 * Configuration options passed when creating a SpatialRoom.
 */
export interface SpatialRoomOptions {
  maxClients?: number;
  mapJsonPath?: string;
  roomName?: string;
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

    // Register message handlers
    this.registerMessageHandlers();
  }

  /**
   * Registers all client→server message handlers.
   * Requirements: 1.3, 4.1, 4.3, 6.1, 6.4, 7.4
   */
  private registerMessageHandlers(): void {
    // Handler "move": update player position and direction with bounds validation
    // Requirement 1.3: transmit updated position to all clients via delta binary
    this.onMessage("move", (client: Client, data: MoveMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // Track activity for inactivity detection (Requirement 7.3)
      this.reconnectionManager.trackActivity(client.sessionId);

      // Validate position against map bounds
      if (!this.isValidPosition(data.x, data.y)) return;

      // Validate direction
      if (!this.isValidDirection(data.direction)) return;

      player.x = data.x;
      player.y = data.y;
      player.direction = data.direction;
      player.isMoving = true;
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
   *
   * Requirements: 7.3, 1.5
   */
  async onLeave(client: Client, consented: boolean): Promise<void> {
    if (consented) {
      // Client intentionally left — remove immediately
      this.state.players.delete(client.sessionId);
      this.reconnectionManager.removeClient(client.sessionId);
      return;
    }

    // Unexpected disconnect — allow reconnection within timeout (5s)
    // Requirement 7.5: allow automatic reconnection and re-send full state
    this.reconnectionManager.markReconnecting(client.sessionId);

    try {
      await this.allowReconnection(client, RECONNECT_TIMEOUT_MS / 1000);
      // Client successfully reconnected — player state is preserved
      // Colyseus automatically re-sends full state to the reconnected client (Requirement 7.5)
      this.reconnectionManager.markReconnected(client.sessionId);
    } catch {
      // Reconnection timed out — remove player from state
      // Colyseus automatically notifies remaining clients via state patch (Requirement 7.3)
      this.state.players.delete(client.sessionId);
      this.reconnectionManager.removeClient(client.sessionId);
    }
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
