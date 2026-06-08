import * as Colyseus from "colyseus.js";
import { Direction, MoveMessage } from "../../shared/types";
import { RECONNECT_TIMEOUT_MS } from "../../shared/constants";

/**
 * Options for joining a Colyseus room.
 */
export interface RoomJoinOptions {
  roomId: string;
  avatarId: number;
  displayName: string;
}

/**
 * A queued position update stored during disconnection.
 */
interface PositionUpdate {
  x: number;
  y: number;
  direction: Direction;
  timestamp: number;
}

/**
 * Connection state for the ColyseusClient.
 */
export type ConnectionState = "connected" | "reconnecting" | "disconnected";

/**
 * ColyseusClient wraps the Colyseus.Client SDK to manage the WebSocket
 * connection lifecycle including joining rooms, sending position updates,
 * offline queueing, and automatic reconnection.
 *
 * Validates: Requirements 1.3, 1.5, 7.1, 7.2, 7.5
 */
export class ColyseusClient {
  private client: Colyseus.Client | null = null;
  private room: Colyseus.Room | null = null;
  private reconnectAttempts = 0;
  private positionQueue: PositionUpdate[] = [];
  private connectionState: ConnectionState = "disconnected";
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private visualIndicatorTimer: ReturnType<typeof setTimeout> | null = null;
  private isReconnecting = false;

  // Callbacks
  private stateChangeCallback: ((state: unknown) => void) | null = null;
  private playerJoinCallback: ((player: unknown) => void) | null = null;
  private playerLeaveCallback: ((sessionId: string) => void) | null = null;
  private disconnectCallback: ((code: number) => void) | null = null;
  private connectionStateCallback: ((state: ConnectionState) => void) | null = null;

  /**
   * Returns the current room instance, or null if not connected.
   */
  getRoom(): Colyseus.Room | null {
    return this.room;
  }

  /**
   * Returns the current connection state.
   */
  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Returns the current position queue length (useful for testing).
   */
  getQueueLength(): number {
    return this.positionQueue.length;
  }

  /**
   * Connects to the Colyseus server at the given URL.
   */
  async connect(serverUrl: string): Promise<void> {
    this.client = new Colyseus.Client(serverUrl);
  }

  /**
   * Joins a room with the specified options.
   * Registers internal listeners for state changes, player join/leave, and disconnection.
   */
  async joinRoom(options: RoomJoinOptions): Promise<Colyseus.Room> {
    if (!this.client) {
      throw new Error("Client not connected. Call connect() first.");
    }

    this.room = await this.client.joinOrCreate("spatial_room", {
      roomId: options.roomId,
      avatarId: options.avatarId,
      displayName: options.displayName,
    });

    this.setConnectionState("connected");
    this.reconnectAttempts = 0;
    this.registerRoomListeners();

    return this.room;
  }

  /**
   * Sends a position update to the server.
   * If disconnected, queues the update for later flush on reconnection.
   */
  sendPosition(x: number, y: number, direction: Direction): void {
    const message: MoveMessage = {
      x,
      y,
      direction,
      timestamp: Date.now(),
    };

    if (this.connectionState === "connected" && this.room) {
      this.room.send("move", message);
    } else {
      this.positionQueue.push({
        x,
        y,
        direction,
        timestamp: message.timestamp,
      });
    }
  }

  /**
   * Flushes the queued position updates to the server after reconnection.
   * Sends only the most recent position to avoid flooding.
   */
  flushPositionQueue(): void {
    if (!this.room || this.positionQueue.length === 0) {
      return;
    }

    // Send only the latest position since intermediate positions are stale
    const latestPosition = this.positionQueue[this.positionQueue.length - 1];
    const message: MoveMessage = {
      x: latestPosition.x,
      y: latestPosition.y,
      direction: latestPosition.direction,
      timestamp: latestPosition.timestamp,
    };
    this.room.send("move", message);

    this.positionQueue = [];
  }

  /**
   * Registers a callback for disconnection events.
   */
  onDisconnect(callback: (code: number) => void): void {
    this.disconnectCallback = callback;
  }

  /**
   * Registers a callback for connection state changes.
   * Used for visual indicators (connected, reconnecting, disconnected).
   */
  onConnectionStateChange(callback: (state: ConnectionState) => void): void {
    this.connectionStateCallback = callback;
  }

  /**
   * Registers a callback for room state changes.
   */
  onStateChange(callback: (state: unknown) => void): void {
    this.stateChangeCallback = callback;
    if (this.room) {
      this.room.onStateChange(callback);
    }
  }

  /**
   * Registers a callback for when a player joins the room.
   */
  onPlayerJoin(callback: (player: unknown) => void): void {
    this.playerJoinCallback = callback;
    if (this.room) {
      this.room.state.players.onAdd(callback);
    }
  }

  /**
   * Registers a callback for when a player leaves the room.
   */
  onPlayerLeave(callback: (sessionId: string) => void): void {
    this.playerLeaveCallback = callback;
    if (this.room) {
      this.room.state.players.onRemove((_player: unknown, sessionId: string) => {
        callback(sessionId);
      });
    }
  }

  /**
   * Attempts automatic reconnection to the last room.
   * Shows visual indicator after RECONNECT_TIMEOUT_MS (5s).
   * Returns true if reconnection succeeded, false otherwise.
   */
  async attemptReconnect(): Promise<boolean> {
    if (!this.client || !this.room || this.isReconnecting) {
      return false;
    }

    this.isReconnecting = true;
    this.setConnectionState("reconnecting");

    // Start visual indicator timer (show disconnected state after 5s)
    this.visualIndicatorTimer = setTimeout(() => {
      if (this.connectionState === "reconnecting") {
        this.setConnectionState("disconnected");
      }
    }, RECONNECT_TIMEOUT_MS);

    try {
      this.reconnectAttempts++;
      const reconnectedRoom = await this.client.reconnect(this.room.reconnectionToken);

      // Reconnection succeeded
      this.clearTimers();
      this.room = reconnectedRoom;
      this.reconnectAttempts = 0;
      this.isReconnecting = false;
      this.setConnectionState("connected");
      this.registerRoomListeners();
      this.flushPositionQueue();

      return true;
    } catch {
      this.clearTimers();
      this.isReconnecting = false;
      this.setConnectionState("disconnected");
      return false;
    }
  }

  /**
   * Leaves the current room and resets state.
   */
  async leave(): Promise<void> {
    this.clearTimers();
    if (this.room) {
      await this.room.leave();
      this.room = null;
    }
    this.positionQueue = [];
    this.setConnectionState("disconnected");
  }

  /**
   * Registers event listeners on the room instance.
   */
  private registerRoomListeners(): void {
    if (!this.room) return;

    // State change listener
    if (this.stateChangeCallback) {
      this.room.onStateChange(this.stateChangeCallback);
    }

    // Player join listener
    if (this.playerJoinCallback) {
      this.room.state.players.onAdd(this.playerJoinCallback);
    }

    // Player leave listener
    if (this.playerLeaveCallback) {
      const callback = this.playerLeaveCallback;
      this.room.state.players.onRemove((_player: unknown, sessionId: string) => {
        callback(sessionId);
      });
    }

    // Disconnection handler with automatic reconnection
    this.room.onLeave((code: number) => {
      if (this.disconnectCallback) {
        this.disconnectCallback(code);
      }

      // Code 1000 = intentional leave, don't reconnect
      if (code === 1000) {
        this.setConnectionState("disconnected");
        return;
      }

      // Attempt automatic reconnection for unexpected disconnects
      this.attemptReconnect();
    });
  }

  /**
   * Updates connection state and notifies callback.
   */
  private setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    if (this.connectionStateCallback) {
      this.connectionStateCallback(state);
    }
  }

  /**
   * Clears all pending timers.
   */
  private clearTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.visualIndicatorTimer) {
      clearTimeout(this.visualIndicatorTimer);
      this.visualIndicatorTimer = null;
    }
  }
}
