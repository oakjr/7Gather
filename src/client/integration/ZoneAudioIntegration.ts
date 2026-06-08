import Phaser from 'phaser';
import { GameSceneEvents } from '../game/GameScene';
import { ColyseusClient } from '../network/ColyseusClient';
import { LiveKitClient, AudioChannelConfig } from '../network/LiveKitClient';

/**
 * Zone transition event payload emitted by GameScene.
 */
export interface ZoneEventPayload {
  zoneId: string;
}

/**
 * Error callback for zone audio switch failures.
 */
export type ZoneAudioErrorCallback = (error: ZoneAudioError) => void;

/**
 * Describes a zone audio switch error.
 */
export interface ZoneAudioError {
  type: 'switch_failed';
  zoneId: string;
  direction: 'enter' | 'leave';
  attempt: number;
  maxAttempts: number;
  message: string;
}

/** Maximum retry attempts for failed channel switches */
const MAX_RETRY_ATTEMPTS = 3;

/** Delay between retry attempts in milliseconds */
const RETRY_DELAY_MS = 2000;

/** Maximum allowed time for a channel switch (requirement 4.1: ≤500ms) */
const MAX_SWITCH_TIME_MS = 500;

/**
 * ZoneAudioIntegration wires together GameScene zone events, ColyseusClient
 * zone messages, and LiveKitClient audio channel switching.
 *
 * Flow:
 * 1. GameScene emits zone_enter/zone_leave events when player crosses zone boundaries
 * 2. This module notifies Colyseus server of zone transitions
 * 3. This module switches LiveKit audio channel to the zone's private channel (or back to room)
 *
 * Error handling:
 * - On switch failure: disconnect from both channels, retry up to 3 times at 2s intervals
 * - Emits error events for visual indication in the UI
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */
export class ZoneAudioIntegration {
  private scene: Phaser.Scene | null = null;
  private colyseusClient: ColyseusClient;
  private liveKitClient: LiveKitClient;
  private roomId: string;
  private currentZoneId: string | null = null;
  private isSwitching = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private errorCallback: ZoneAudioErrorCallback | null = null;
  private disposed = false;

  constructor(
    colyseusClient: ColyseusClient,
    liveKitClient: LiveKitClient,
    roomId: string
  ) {
    this.colyseusClient = colyseusClient;
    this.liveKitClient = liveKitClient;
    this.roomId = roomId;
  }

  /**
   * Binds to a GameScene's zone events.
   * Call this after the scene is created.
   */
  bind(scene: Phaser.Scene): void {
    this.scene = scene;
    this.scene.events.on(GameSceneEvents.ZONE_ENTER, this.handleZoneEnter, this);
    this.scene.events.on(GameSceneEvents.ZONE_LEAVE, this.handleZoneLeave, this);
  }

  /**
   * Unbinds from the current scene's events and cleans up.
   */
  unbind(): void {
    if (this.scene) {
      this.scene.events.off(GameSceneEvents.ZONE_ENTER, this.handleZoneEnter, this);
      this.scene.events.off(GameSceneEvents.ZONE_LEAVE, this.handleZoneLeave, this);
      this.scene = null;
    }
    this.clearRetryTimer();
  }

  /**
   * Registers a callback for zone audio switch errors.
   * Used by UI layer to display error notifications.
   */
  onError(callback: ZoneAudioErrorCallback): void {
    this.errorCallback = callback;
  }

  /**
   * Returns the current zone ID the user is in, or null if in general room area.
   */
  getCurrentZoneId(): string | null {
    return this.currentZoneId;
  }

  /**
   * Returns whether a channel switch is currently in progress.
   */
  getIsSwitching(): boolean {
    return this.isSwitching;
  }

  /**
   * Disposes of the integration, cleaning up all listeners and timers.
   */
  dispose(): void {
    this.disposed = true;
    this.unbind();
    this.errorCallback = null;
  }

  // === Private Event Handlers ===

  /**
   * Handles zone_enter event from GameScene.
   * Notifies Colyseus and switches LiveKit audio to zone channel.
   */
  private handleZoneEnter = (payload: ZoneEventPayload): void => {
    if (this.disposed) return;
    const { zoneId } = payload;
    this.performZoneTransition(zoneId, 'enter');
  };

  /**
   * Handles zone_leave event from GameScene.
   * Notifies Colyseus and switches LiveKit audio back to room channel.
   */
  private handleZoneLeave = (_payload: ZoneEventPayload): void => {
    if (this.disposed) return;
    this.performZoneTransition(null, 'leave');
  };

  /**
   * Performs the full zone transition:
   * 1. Send zone message to Colyseus server
   * 2. Switch LiveKit audio channel
   * 3. Handle failures with retry logic
   *
   * @param targetZoneId - The zone to enter, or null to return to room channel
   * @param direction - Whether this is an enter or leave transition
   */
  private async performZoneTransition(
    targetZoneId: string | null,
    direction: 'enter' | 'leave'
  ): Promise<void> {
    // Prevent overlapping switches
    if (this.isSwitching) return;

    this.isSwitching = true;
    this.clearRetryTimer();

    const previousZoneId = this.currentZoneId;
    const zoneIdForMessage = direction === 'enter' ? targetZoneId! : previousZoneId!;

    // Step 1: Notify Colyseus server of the zone transition
    this.sendZoneMessage(zoneIdForMessage, direction);

    // Step 2: Switch LiveKit audio channel with retry logic
    const targetChannel: AudioChannelConfig = targetZoneId
      ? { channelId: targetZoneId, type: 'private-zone' }
      : { channelId: this.roomId, type: 'room' };

    const success = await this.switchWithRetry(targetChannel, zoneIdForMessage, direction);

    if (success) {
      this.currentZoneId = targetZoneId;
    }

    this.isSwitching = false;
  }

  /**
   * Attempts to switch the audio channel with retry logic.
   * On failure: disconnects from both channels, retries up to 3 times at 2s intervals.
   *
   * @returns true if the switch succeeded, false if all retries exhausted
   */
  private async switchWithRetry(
    targetChannel: AudioChannelConfig,
    zoneId: string,
    direction: 'enter' | 'leave'
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      if (this.disposed) return false;

      try {
        const startTime = Date.now();
        await this.liveKitClient.switchAudioChannel(targetChannel);
        const elapsed = Date.now() - startTime;

        if (elapsed > MAX_SWITCH_TIME_MS) {
          console.warn(
            `[ZoneAudioIntegration] Channel switch took ${elapsed}ms, exceeding ${MAX_SWITCH_TIME_MS}ms target`
          );
        }

        return true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(
          `[ZoneAudioIntegration] Switch attempt ${attempt}/${MAX_RETRY_ATTEMPTS} failed: ${errorMessage}`
        );

        // Emit error to UI
        this.emitError({
          type: 'switch_failed',
          zoneId,
          direction,
          attempt,
          maxAttempts: MAX_RETRY_ATTEMPTS,
          message: errorMessage,
        });

        // If not the last attempt, wait before retrying
        if (attempt < MAX_RETRY_ATTEMPTS) {
          await this.delay(RETRY_DELAY_MS);
        }
      }
    }

    // All retries exhausted - user remains disconnected from both channels (requirement 4.4)
    console.error(
      `[ZoneAudioIntegration] All ${MAX_RETRY_ATTEMPTS} switch attempts failed. User disconnected from audio.`
    );
    return false;
  }

  /**
   * Sends a zone_enter or zone_leave message to the Colyseus server.
   */
  private sendZoneMessage(zoneId: string, action: 'enter' | 'leave'): void {
    const room = this.colyseusClient.getRoom();
    if (room) {
      room.send(action === 'enter' ? 'zone_enter' : 'zone_leave', {
        zoneId,
        action,
      });
    }
  }

  /**
   * Emits an error to the registered callback.
   */
  private emitError(error: ZoneAudioError): void {
    if (this.errorCallback) {
      this.errorCallback(error);
    }
  }

  /**
   * Returns a promise that resolves after the given delay.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.retryTimer = setTimeout(resolve, ms);
    });
  }

  /**
   * Clears any pending retry timer.
   */
  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
