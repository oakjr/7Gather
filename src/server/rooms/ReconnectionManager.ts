import { RECONNECT_TIMEOUT_MS } from "../../shared/constants";

/**
 * Manages client reconnection state and inactivity detection.
 * Tracks last activity timestamps for connected clients and detects
 * clients that have become inactive (no messages for RECONNECT_TIMEOUT_MS).
 *
 * Requirements: 1.5, 7.3, 7.5
 */
export class ReconnectionManager {
  /** Map of sessionId → last activity timestamp (ms) */
  private lastActivity: Map<string, number> = new Map();

  /** Set of sessionIds currently in the reconnection grace period */
  private reconnecting: Set<string> = new Set();

  /** Inactivity threshold in milliseconds */
  private readonly inactivityThresholdMs: number;

  constructor(inactivityThresholdMs: number = RECONNECT_TIMEOUT_MS) {
    this.inactivityThresholdMs = inactivityThresholdMs;
  }

  /**
   * Register a client as active. Called on join and on any message received.
   */
  trackActivity(sessionId: string): void {
    this.lastActivity.set(sessionId, Date.now());
    // If this client was in reconnecting state, clear it since they're active now
    this.reconnecting.delete(sessionId);
  }

  /**
   * Mark a client as being in the reconnection grace period.
   * Their activity timestamp is preserved so we can detect inactivity
   * after they reconnect.
   */
  markReconnecting(sessionId: string): void {
    this.reconnecting.add(sessionId);
  }

  /**
   * Check if a client is currently in the reconnection grace period.
   */
  isReconnecting(sessionId: string): boolean {
    return this.reconnecting.has(sessionId);
  }

  /**
   * Called when a client successfully reconnects.
   * Resets their activity timestamp so inactivity detection starts fresh.
   */
  markReconnected(sessionId: string): void {
    this.reconnecting.delete(sessionId);
    this.lastActivity.set(sessionId, Date.now());
  }

  /**
   * Remove a client from tracking (on permanent leave).
   */
  removeClient(sessionId: string): void {
    this.lastActivity.delete(sessionId);
    this.reconnecting.delete(sessionId);
  }

  /**
   * Returns sessionIds of clients that have been inactive longer than
   * the threshold. These clients should be considered disconnected.
   *
   * Clients in the reconnecting state are excluded from this check
   * since they're already being handled by Colyseus allowReconnection.
   */
  getInactiveClients(): string[] {
    const now = Date.now();
    const inactive: string[] = [];

    for (const [sessionId, lastTime] of this.lastActivity) {
      if (this.reconnecting.has(sessionId)) {
        // Skip clients in reconnection grace period — handled by allowReconnection
        continue;
      }
      if (now - lastTime > this.inactivityThresholdMs) {
        inactive.push(sessionId);
      }
    }

    return inactive;
  }

  /**
   * Get the last activity timestamp for a given client.
   * Returns undefined if the client is not tracked.
   */
  getLastActivity(sessionId: string): number | undefined {
    return this.lastActivity.get(sessionId);
  }

  /**
   * Get the number of tracked clients.
   */
  get trackedCount(): number {
    return this.lastActivity.size;
  }

  /**
   * Get the number of clients in reconnection state.
   */
  get reconnectingCount(): number {
    return this.reconnecting.size;
  }

  /**
   * Clear all tracked state. Used on room dispose.
   */
  clear(): void {
    this.lastActivity.clear();
    this.reconnecting.clear();
  }
}
