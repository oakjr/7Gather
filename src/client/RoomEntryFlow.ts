import { ColyseusClient, RoomJoinOptions } from './network/ColyseusClient';
import { LiveKitClient } from './network/LiveKitClient';
import { getAvatarId } from './ui/avatarStorage';

/**
 * States of the room entry flow state machine.
 */
export type RoomEntryState =
  | 'idle'
  | 'avatar_selection'
  | 'connecting_colyseus'
  | 'fetching_livekit_token'
  | 'connecting_media'
  | 'loading_map'
  | 'ready'
  | 'error';

/**
 * Error information when the flow enters the 'error' state.
 */
export interface RoomEntryError {
  code: 'room_full' | 'room_not_found' | 'connection_failed' | 'media_failed' | 'unknown';
  message: string;
}

/**
 * Configuration for initiating the room entry flow.
 */
export interface RoomEntryConfig {
  colyseusUrl: string;
  livekitUrl: string;
  livekitTokenEndpoint: string;
  roomId: string;
  displayName: string;
  mapJsonUrl: string;
}

/**
 * Callback type for state change listeners.
 */
export type StateChangeListener = (state: RoomEntryState, error?: RoomEntryError) => void;

/**
 * RoomEntryFlow orchestrates the full room entry sequence:
 *
 * 1. Check avatar in LocalStorage → show selector if needed
 * 2. Connect to Colyseus and join room
 * 3. Fetch LiveKit token from server
 * 4. Connect to LiveKit (media)
 * 5. Load map and render GameScene
 *
 * Also handles disconnection from a previous room when navigating via link.
 *
 * Validates: Requirements 2.1, 3.6, 8.3, 9.3
 */
export class RoomEntryFlow {
  private state: RoomEntryState = 'idle';
  private error: RoomEntryError | null = null;
  private config: RoomEntryConfig | null = null;
  private avatarId: number | null = null;

  private colyseusClient: ColyseusClient;
  private livekitClient: LiveKitClient;
  private listeners: StateChangeListener[] = [];

  // Track if we're already connected to a room (for room switching)
  private isConnectedToRoom = false;

  constructor(colyseusClient: ColyseusClient, livekitClient: LiveKitClient) {
    this.colyseusClient = colyseusClient;
    this.livekitClient = livekitClient;
  }

  /**
   * Returns the current flow state.
   */
  getState(): RoomEntryState {
    return this.state;
  }

  /**
   * Returns current error info, or null if no error.
   */
  getError(): RoomEntryError | null {
    return this.error;
  }

  /**
   * Returns the selected avatar ID, or null if not yet selected.
   */
  getAvatarId(): number | null {
    return this.avatarId;
  }

  /**
   * Returns the current room configuration.
   */
  getConfig(): RoomEntryConfig | null {
    return this.config;
  }

  /**
   * Returns the ColyseusClient instance.
   */
  getColyseusClient(): ColyseusClient {
    return this.colyseusClient;
  }

  /**
   * Returns the LiveKitClient instance.
   */
  getLivekitClient(): LiveKitClient {
    return this.livekitClient;
  }

  /**
   * Register a listener for state changes.
   */
  onStateChange(listener: StateChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Starts the room entry flow. This is the main entry point.
   *
   * Flow:
   * 1. Disconnect from previous room if connected (Requirement 9.3)
   * 2. Check LocalStorage for avatar → go to avatar_selection if missing
   * 3. Connect Colyseus → join room
   * 4. Fetch LiveKit token
   * 5. Connect LiveKit media
   * 6. Signal ready for map loading/rendering
   */
  async start(config: RoomEntryConfig): Promise<void> {
    this.config = config;
    this.error = null;

    // Step 1: Disconnect from previous room if already connected (Requirement 9.3)
    if (this.isConnectedToRoom) {
      await this.disconnectPreviousRoom();
    }

    // Step 2: Check avatar in LocalStorage (Requirement 8.3)
    const storedAvatarId = getAvatarId();
    if (storedAvatarId !== null) {
      this.avatarId = storedAvatarId;
      // Avatar already selected, proceed to connection
      await this.proceedToConnection();
    } else {
      // Need avatar selection first
      this.setState('avatar_selection');
    }
  }

  /**
   * Called when the user selects an avatar from the AvatarSelector component.
   * Continues the flow after avatar selection.
   */
  async onAvatarSelected(avatarId: number): Promise<void> {
    this.avatarId = avatarId;
    await this.proceedToConnection();
  }

  /**
   * Resets the flow to idle state (e.g., after leaving a room).
   */
  async reset(): Promise<void> {
    if (this.isConnectedToRoom) {
      await this.disconnectPreviousRoom();
    }
    this.state = 'idle';
    this.error = null;
    this.config = null;
    this.isConnectedToRoom = false;
  }

  /**
   * Disconnects from the current room (both Colyseus and LiveKit).
   * Used when switching rooms via link (Requirement 9.3).
   */
  private async disconnectPreviousRoom(): Promise<void> {
    try {
      await this.livekitClient.disconnect();
    } catch {
      // Ignore LiveKit disconnect errors during room switch
    }

    try {
      await this.colyseusClient.leave();
    } catch {
      // Ignore Colyseus leave errors during room switch
    }

    this.isConnectedToRoom = false;
  }

  /**
   * Proceeds with the connection flow after avatar is confirmed.
   */
  private async proceedToConnection(): Promise<void> {
    if (!this.config || this.avatarId === null) {
      this.setError({ code: 'unknown', message: 'Missing configuration or avatar ID' });
      return;
    }

    // Step 3: Connect to Colyseus and join room
    this.setState('connecting_colyseus');
    try {
      await this.connectColyseus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to room server';
      if (message.includes('full') || message.includes('max')) {
        this.setError({ code: 'room_full', message });
      } else if (message.includes('not found') || message.includes('inexistente')) {
        this.setError({ code: 'room_not_found', message });
      } else {
        this.setError({ code: 'connection_failed', message });
      }
      return;
    }

    // Step 4: Fetch LiveKit token
    this.setState('fetching_livekit_token');
    let livekitToken: string;
    try {
      livekitToken = await this.fetchLivekitToken();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to obtain media token';
      this.setError({ code: 'media_failed', message });
      return;
    }

    // Step 5: Connect LiveKit media (Requirement 2.1, 3.6)
    // Non-blocking: if media fails, continue without audio/video
    this.setState('connecting_media');
    try {
      await Promise.race([
        this.connectMedia(livekitToken),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Media connection timeout')), 10000)
        ),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect media';
      console.warn('[RoomEntryFlow] Media connection failed, continuing without audio:', message);
      // Don't block the flow — proceed to ready state without media
    }

    // Step 6: Ready for map loading/rendering
    this.setState('loading_map');
    this.isConnectedToRoom = true;

    // Transition to ready - GameScene can now be created
    this.setState('ready');
  }

  /**
   * Connects the ColyseusClient and joins the specified room.
   */
  private async connectColyseus(): Promise<void> {
    if (!this.config || this.avatarId === null) {
      throw new Error('Missing configuration');
    }

    await this.colyseusClient.connect(this.config.colyseusUrl);

    const joinOptions: RoomJoinOptions = {
      roomId: this.config.roomId,
      avatarId: this.avatarId,
      displayName: this.config.displayName,
    };

    await this.colyseusClient.joinRoom(joinOptions);
  }

  /**
   * Fetches a LiveKit token from the server for the current room.
   */
  private async fetchLivekitToken(): Promise<string> {
    if (!this.config) {
      throw new Error('Missing configuration');
    }

    const room = this.colyseusClient.getRoom();
    const sessionId = room?.sessionId ?? 'anonymous';

    const response = await fetch(this.config.livekitTokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomName: this.config.roomId,
        participantId: sessionId,
        participantName: this.config.displayName,
      }),
    });

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.token;
  }

  /**
   * Connects to LiveKit with the obtained token.
   * Audio is auto-enabled on connect (Requirement 2.1).
   * Video and screen share remain off (Requirement 3.6).
   */
  private async connectMedia(token: string): Promise<void> {
    if (!this.config) {
      throw new Error('Missing configuration');
    }

    // Configure token endpoint for future channel switches
    const room = this.colyseusClient.getRoom();
    const sessionId = room?.sessionId ?? 'anonymous';

    this.livekitClient.configureTokenEndpoint(
      this.config.livekitTokenEndpoint,
      sessionId,
      this.config.displayName
    );

    // Connect to LiveKit (auto-enables microphone per Requirement 2.1)
    await this.livekitClient.connect(this.config.livekitUrl, token);
  }

  /**
   * Updates internal state and notifies listeners.
   */
  private setState(newState: RoomEntryState): void {
    this.state = newState;
    for (const listener of this.listeners) {
      listener(newState);
    }
  }

  /**
   * Sets error state and notifies listeners.
   */
  private setError(error: RoomEntryError): void {
    this.error = error;
    this.state = 'error';
    for (const listener of this.listeners) {
      listener('error', error);
    }
  }
}
