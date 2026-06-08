import {
  Room,
  RoomEvent,
  ConnectionState,
  RemoteTrack,
  RemoteTrackPublication,
  RemoteParticipant,
  VideoPresets,
  ScreenSharePresets,
  LocalTrackPublication,
  LocalAudioTrack,
  Track,
} from "livekit-client";
import type {
  VideoCaptureOptions,
  TrackPublishOptions,
} from "livekit-client";

/**
 * Configuration for the media defaults on connect.
 */
export interface MediaConfig {
  audioAutoConnect: boolean; // true - auto-enable microphone on connect
  videoEnabled: boolean; // false - video is on-demand
  screenShareEnabled: boolean; // false - screen share is on-demand
}

/**
 * Configuration for an audio channel (room or private zone).
 */
export interface AudioChannelConfig {
  channelId: string; // room ID or zone ID
  type: "room" | "private-zone";
}

/**
 * Video constraints for enableCamera.
 */
export interface VideoConstraints {
  resolution?: { width: number; height: number };
  frameRate?: number;
}

/**
 * Connection state exposed by LiveKitClient.
 */
export type LiveKitConnectionState =
  | "connected"
  | "connecting"
  | "reconnecting"
  | "disconnected";

/** Maximum reconnection attempts */
const MAX_RECONNECT_ATTEMPTS = 3;

/** Delay between reconnection attempts in ms */
const RECONNECT_DELAY_MS = 5000;

/** Default video constraints: 720p at 30 FPS */
const DEFAULT_VIDEO_RESOLUTION = { width: 1280, height: 720 };
const DEFAULT_VIDEO_FRAMERATE = 30;

/** Screen share constraints: Full HD at 5 FPS */
const SCREEN_SHARE_RESOLUTION = { width: 1920, height: 1080 };
const SCREEN_SHARE_FRAMERATE = 5;

/** Supported music audio formats */
const SUPPORTED_MUSIC_FORMATS = ["mp3", "ogg", "wav"] as const;
export type MusicFormat = (typeof SUPPORTED_MUSIC_FORMATS)[number];

/** Default music volume (0-100) */
const DEFAULT_MUSIC_VOLUME = 50;

/**
 * LiveKitClient wraps the livekit-client SDK Room to manage real-time
 * audio, video, and screen share connections. Handles automatic microphone
 * enablement on connect, on-demand video/screen share, audio channel switching
 * for private zones, and reconnection with retry logic.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4,
 * 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5
 */
export class LiveKitClient {
  private room: Room;
  private currentChannel: AudioChannelConfig | null = null;
  private connectionState: LiveKitConnectionState = "disconnected";
  private isMuted = false;
  private isCameraEnabled = false;
  private isScreenSharing = false;
  private isListenOnly = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private serverUrl = "";
  private currentToken = "";

  // Token fetching configuration
  private tokenEndpoint = "";
  private participantId = "";
  private participantName = "";

  // Music state
  private musicTrack: LocalAudioTrack | null = null;
  private musicPublication: LocalTrackPublication | null = null;
  private musicVolume = DEFAULT_MUSIC_VOLUME;
  private isMusicPlaying = false;

  // Callbacks
  private trackSubscribedCallback:
    | ((
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => void)
    | null = null;
  private connectionStateCallback:
    | ((state: LiveKitConnectionState) => void)
    | null = null;

  constructor() {
    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    this.setupRoomListeners();
  }

  /**
   * Returns the current connection state.
   */
  getConnectionState(): LiveKitConnectionState {
    return this.connectionState;
  }

  /**
   * Returns whether the client is in listen-only mode (microphone permission denied).
   */
  getIsListenOnly(): boolean {
    return this.isListenOnly;
  }

  /**
   * Returns whether the microphone is currently muted.
   */
  getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Returns whether the camera is currently enabled.
   */
  getIsCameraEnabled(): boolean {
    return this.isCameraEnabled;
  }

  /**
   * Returns whether screen share is active.
   */
  getIsScreenSharing(): boolean {
    return this.isScreenSharing;
  }

  /**
   * Returns whether music is currently playing.
   */
  getIsMusicPlaying(): boolean {
    return this.isMusicPlaying;
  }

  /**
   * Returns the current music volume (0-100).
   */
  getMusicVolume(): number {
    return this.musicVolume;
  }

  /**
   * Returns the current audio channel configuration.
   */
  getCurrentChannel(): AudioChannelConfig | null {
    return this.currentChannel;
  }

  /**
   * Returns the underlying Room instance (useful for testing).
   */
  getRoom(): Room {
    return this.room;
  }

  /**
   * Configures the token endpoint for fetching tokens from the server.
   * Must be called before connect.
   */
  configureTokenEndpoint(
    endpoint: string,
    participantId: string,
    participantName: string
  ): void {
    this.tokenEndpoint = endpoint;
    this.participantId = participantId;
    this.participantName = participantName;
  }

  /**
   * Connects to a LiveKit room and auto-enables the microphone.
   * If microphone permission is denied, enters listen-only mode.
   *
   * @param url - LiveKit server WebSocket URL
   * @param token - JWT access token for the room
   */
  async connect(url: string, token: string): Promise<void> {
    this.serverUrl = url;
    this.currentToken = token;
    this.setConnectionState("connecting");

    try {
      await this.room.connect(url, token);
      this.setConnectionState("connected");
      this.reconnectAttempts = 0;

      // Auto-enable microphone on connect
      await this.enableMicrophone();
    } catch (error) {
      this.setConnectionState("disconnected");
      throw error;
    }
  }

  /**
   * Disconnects from the current LiveKit room.
   */
  async disconnect(): Promise<void> {
    this.clearReconnectTimer();
    await this.room.disconnect();
    this.resetState();
    this.setConnectionState("disconnected");
  }

  // === Audio (automatic on connect) ===

  /**
   * Enables the microphone. If permission is denied, switches to listen-only mode.
   */
  async enableMicrophone(): Promise<void> {
    try {
      await this.room.localParticipant.setMicrophoneEnabled(true);
      this.isMuted = false;
      this.isListenOnly = false;
    } catch (error) {
      // Permission denied - enter listen-only mode
      if (this.isPermissionError(error)) {
        this.isListenOnly = true;
        this.isMuted = true;
        console.warn(
          "[LiveKitClient] Microphone permission denied. Entering listen-only mode."
        );
      } else {
        throw error;
      }
    }
  }

  /**
   * Disables the microphone track.
   */
  disableMicrophone(): void {
    this.room.localParticipant.setMicrophoneEnabled(false);
    this.isMuted = true;
  }

  /**
   * Toggles the microphone mute state.
   * @returns The new muted state (true = muted, false = unmuted).
   */
  toggleMute(): boolean {
    if (this.isListenOnly) {
      return true; // Can't unmute in listen-only mode
    }

    if (this.isMuted) {
      this.room.localParticipant.setMicrophoneEnabled(true);
      this.isMuted = false;
    } else {
      this.room.localParticipant.setMicrophoneEnabled(false);
      this.isMuted = true;
    }

    return this.isMuted;
  }

  // === Video (on-demand) ===

  /**
   * Enables the camera with 720p 30FPS by default.
   * @param constraints - Optional video constraints override.
   */
  async enableCamera(constraints?: VideoConstraints): Promise<void> {
    const resolution = constraints?.resolution ?? DEFAULT_VIDEO_RESOLUTION;
    const frameRate = constraints?.frameRate ?? DEFAULT_VIDEO_FRAMERATE;

    const captureOptions: VideoCaptureOptions = {
      resolution: {
        width: resolution.width,
        height: resolution.height,
        frameRate,
      },
    };

    const publishOptions: TrackPublishOptions = {
      videoEncoding: {
        maxBitrate: 1_500_000, // 1.5 Mbps for 720p
        maxFramerate: frameRate,
      },
      simulcast: true,
      videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h180],
    };

    await this.room.localParticipant.setCameraEnabled(
      true,
      captureOptions,
      publishOptions
    );
    this.isCameraEnabled = true;
  }

  /**
   * Disables the camera track.
   */
  disableCamera(): void {
    this.room.localParticipant.setCameraEnabled(false);
    this.isCameraEnabled = false;
  }

  // === Screen Share (on-demand, Full HD 5FPS with Simulcast) ===

  /**
   * Starts screen sharing at Full HD (1920x1080) 5FPS with Simulcast enabled.
   */
  async startScreenShare(): Promise<void> {
    const publishOptions: TrackPublishOptions = {
      screenShareEncoding: {
        maxBitrate: 3_000_000, // 3 Mbps for Full HD screen share
        maxFramerate: SCREEN_SHARE_FRAMERATE,
      },
      simulcast: true,
      screenShareSimulcastLayers: [
        ScreenSharePresets.h720fps5,
        ScreenSharePresets.h360fps3,
      ],
    };

    await this.room.localParticipant.setScreenShareEnabled(
      true,
      {
        resolution: {
          width: SCREEN_SHARE_RESOLUTION.width,
          height: SCREEN_SHARE_RESOLUTION.height,
          frameRate: SCREEN_SHARE_FRAMERATE,
        },
        contentHint: "detail",
      },
      publishOptions
    );
    this.isScreenSharing = true;
  }

  /**
   * Stops screen sharing.
   */
  stopScreenShare(): void {
    this.room.localParticipant.setScreenShareEnabled(false);
    this.isScreenSharing = false;
  }

  // === Shared Music ===

  /**
   * Publishes a music track from a URL or file path.
   * Validates the source format (MP3, OGG, WAV) and accessibility before publishing.
   * The track is published as an AudioTrack that all participants receive automatically.
   *
   * @param source - URL or file path to the audio source
   * @throws Error if the format is not supported or the URL is inaccessible
   */
  async publishMusicTrack(source: string): Promise<void> {
    // Validate format
    const format = this.extractMusicFormat(source);
    if (!format) {
      throw new Error(
        `[LiveKitClient] Unsupported music format. Supported formats: ${SUPPORTED_MUSIC_FORMATS.join(", ")}`
      );
    }

    // Validate URL accessibility
    await this.validateMusicSource(source);

    // Stop any existing music track before publishing a new one
    if (this.isMusicPlaying) {
      this.stopMusicTrack();
    }

    // Create an audio element to load the music
    const audioElement = new Audio(source);
    audioElement.crossOrigin = "anonymous";
    audioElement.loop = true;

    // Wait for the audio to be loadable
    await new Promise<void>((resolve, reject) => {
      audioElement.addEventListener("canplaythrough", () => resolve(), {
        once: true,
      });
      audioElement.addEventListener(
        "error",
        () =>
          reject(
            new Error(
              `[LiveKitClient] Failed to load audio from source: ${source}`
            )
          ),
        { once: true }
      );
      audioElement.load();
    });

    // Create a MediaStream from the audio element using AudioContext
    const audioContext = new AudioContext();
    const sourceNode = audioContext.createMediaElementSource(audioElement);
    const destination = audioContext.createMediaStreamDestination();
    sourceNode.connect(destination);

    // Get the audio track from the media stream
    const mediaStreamTrack = destination.stream.getAudioTracks()[0];
    if (!mediaStreamTrack) {
      throw new Error(
        "[LiveKitClient] Failed to create audio track from source"
      );
    }

    // Create a LocalAudioTrack from the MediaStreamTrack
    this.musicTrack = new LocalAudioTrack(mediaStreamTrack, undefined, false);

    // Publish the track to the room
    this.musicPublication =
      await this.room.localParticipant.publishTrack(this.musicTrack, {
        name: "shared-music",
        source: Track.Source.Unknown,
      });

    // Start playback
    audioElement.volume = this.musicVolume / 100;
    await audioElement.play();

    this.isMusicPlaying = true;

    // Store audioElement reference for volume control and cleanup
    (this.musicTrack as any)._audioElement = audioElement;
    (this.musicTrack as any)._audioContext = audioContext;
  }

  /**
   * Stops the currently playing music track and unpublishes it.
   */
  stopMusicTrack(): void {
    if (!this.isMusicPlaying || !this.musicTrack) {
      return;
    }

    // Clean up audio element and context
    const audioElement = (this.musicTrack as any)._audioElement as
      | HTMLAudioElement
      | undefined;
    const audioContext = (this.musicTrack as any)._audioContext as
      | AudioContext
      | undefined;

    if (audioElement) {
      audioElement.pause();
      audioElement.src = "";
    }

    if (audioContext && audioContext.state !== "closed") {
      audioContext.close();
    }

    // Unpublish the track
    if (this.musicPublication) {
      this.room.localParticipant.unpublishTrack(this.musicTrack);
      this.musicPublication = null;
    }

    // Stop the track
    this.musicTrack.stop();
    this.musicTrack = null;
    this.isMusicPlaying = false;
  }

  /**
   * Sets the local playback volume for the shared music track.
   * Does not affect other participants' volume.
   *
   * @param volume - Volume level from 0 (muted) to 100 (max), default 50
   */
  setMusicVolume(volume: number): void {
    // Clamp volume to valid range
    this.musicVolume = Math.max(0, Math.min(100, Math.round(volume)));

    // Apply volume to the audio element if music is playing
    if (this.musicTrack) {
      const audioElement = (this.musicTrack as any)._audioElement as
        | HTMLAudioElement
        | undefined;
      if (audioElement) {
        audioElement.volume = this.musicVolume / 100;
      }
    }
  }

  // === Audio Channel Switching (Private Zones) ===

  /**
   * Switches the audio channel for private zone transitions.
   * Disconnects from the current room and reconnects to the new channel.
   * Target: ≤500ms total switch time.
   *
   * @param config - The new audio channel configuration.
   */
  async switchAudioChannel(config: AudioChannelConfig): Promise<void> {
    if (
      this.currentChannel?.channelId === config.channelId &&
      this.currentChannel?.type === config.type
    ) {
      return; // Already on this channel
    }

    const previousChannel = this.currentChannel;

    try {
      // Disconnect from current room (fast, don't stop tracks)
      await this.room.disconnect(false);

      // Fetch new token for the target channel
      const newToken = await this.fetchTokenForChannel(config);

      // Create a fresh room instance for the new channel
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      this.setupRoomListeners();

      // Connect to new channel
      await this.room.connect(this.serverUrl, newToken);
      this.currentChannel = config;

      // Re-enable microphone unless in listen-only mode
      if (!this.isListenOnly) {
        await this.room.localParticipant.setMicrophoneEnabled(!this.isMuted);
      }
    } catch (error) {
      // On failure, attempt to reconnect to previous channel
      console.error(
        "[LiveKitClient] Channel switch failed, attempting rollback:",
        error
      );
      if (previousChannel && this.currentToken) {
        try {
          this.room = new Room({
            adaptiveStream: true,
            dynacast: true,
          });
          this.setupRoomListeners();
          await this.room.connect(this.serverUrl, this.currentToken);
          this.currentChannel = previousChannel;
        } catch (rollbackError) {
          console.error(
            "[LiveKitClient] Rollback failed:",
            rollbackError
          );
          this.setConnectionState("disconnected");
        }
      }
      throw error;
    }
  }

  // === Events ===

  /**
   * Registers a callback for when a remote track is subscribed.
   */
  onTrackSubscribed(
    callback: (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => void
  ): void {
    this.trackSubscribedCallback = callback;
  }

  /**
   * Registers a callback for connection state changes.
   */
  onConnectionStateChange(
    callback: (state: LiveKitConnectionState) => void
  ): void {
    this.connectionStateCallback = callback;
  }

  // === Private methods ===

  /**
   * Sets up event listeners on the Room instance.
   */
  private setupRoomListeners(): void {
    this.room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        publication: RemoteTrackPublication,
        participant: RemoteParticipant
      ) => {
        if (this.trackSubscribedCallback) {
          this.trackSubscribedCallback(track, publication, participant);
        }
      }
    );

    this.room.on(
      RoomEvent.ConnectionStateChanged,
      (state: ConnectionState) => {
        this.handleConnectionStateChanged(state);
      }
    );

    this.room.on(RoomEvent.Disconnected, () => {
      this.handleDisconnected();
    });

    this.room.on(RoomEvent.Reconnecting, () => {
      this.setConnectionState("reconnecting");
    });

    this.room.on(RoomEvent.Reconnected, () => {
      this.setConnectionState("connected");
      this.reconnectAttempts = 0;
    });

    // Handle screen share ended by browser UI "Stop sharing" button
    this.room.on(
      RoomEvent.LocalTrackUnpublished,
      (publication: LocalTrackPublication) => {
        if (publication.source === "screen_share") {
          this.isScreenSharing = false;
        }
      }
    );
  }

  /**
   * Handles connection state changes from the LiveKit SDK.
   */
  private handleConnectionStateChanged(state: ConnectionState): void {
    switch (state) {
      case ConnectionState.Connected:
        this.setConnectionState("connected");
        break;
      case ConnectionState.Connecting:
        this.setConnectionState("connecting");
        break;
      case ConnectionState.Reconnecting:
        this.setConnectionState("reconnecting");
        break;
      case ConnectionState.Disconnected:
        this.setConnectionState("disconnected");
        break;
    }
  }

  /**
   * Handles unexpected disconnection with retry logic.
   * Attempts reconnection up to 3 times, every 5 seconds.
   */
  private handleDisconnected(): void {
    if (this.connectionState === "disconnected") {
      return; // Intentional disconnect
    }

    this.attemptReconnect();
  }

  /**
   * Attempts to reconnect to the LiveKit room.
   * Retries up to MAX_RECONNECT_ATTEMPTS (3) times with RECONNECT_DELAY_MS (5s) delay.
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `[LiveKitClient] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`
      );
      this.setConnectionState("disconnected");
      return;
    }

    this.reconnectAttempts++;
    this.setConnectionState("reconnecting");

    this.reconnectTimer = setTimeout(async () => {
      try {
        // Create a new Room instance for the reconnection
        this.room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });
        this.setupRoomListeners();

        await this.room.connect(this.serverUrl, this.currentToken);
        this.setConnectionState("connected");
        this.reconnectAttempts = 0;

        // Re-enable microphone if not in listen-only mode
        if (!this.isListenOnly && !this.isMuted) {
          await this.room.localParticipant.setMicrophoneEnabled(true);
        }
      } catch {
        console.warn(
          `[LiveKitClient] Reconnection attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} failed.`
        );
        this.attemptReconnect();
      }
    }, RECONNECT_DELAY_MS);
  }

  /**
   * Fetches a token for the specified audio channel from the server.
   */
  private async fetchTokenForChannel(
    config: AudioChannelConfig
  ): Promise<string> {
    if (!this.tokenEndpoint) {
      throw new Error(
        "[LiveKitClient] Token endpoint not configured. Call configureTokenEndpoint() first."
      );
    }

    const body: Record<string, string> = {
      roomName: config.channelId,
      participantId: this.participantId,
      participantName: this.participantName,
    };

    if (config.type === "private-zone") {
      body.zoneId = config.channelId;
    }

    const response = await fetch(this.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `[LiveKitClient] Failed to fetch token: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    this.currentToken = data.token;
    return data.token;
  }

  /**
   * Extracts and validates the music format from the source URL/path.
   * @returns The format if valid, or null if unsupported.
   */
  private extractMusicFormat(source: string): MusicFormat | null {
    // Remove query params and hash for URL-based sources
    const cleanPath = source.split("?")[0].split("#")[0];
    const extension = cleanPath.split(".").pop()?.toLowerCase();

    if (
      extension &&
      SUPPORTED_MUSIC_FORMATS.includes(extension as MusicFormat)
    ) {
      return extension as MusicFormat;
    }
    return null;
  }

  /**
   * Validates that the music source URL is accessible.
   * Uses a HEAD request to check availability without downloading the full file.
   */
  private async validateMusicSource(source: string): Promise<void> {
    try {
      const response = await fetch(source, { method: "HEAD" });
      if (!response.ok) {
        throw new Error(
          `[LiveKitClient] Music source is not accessible: ${response.status} ${response.statusText}`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("Music source")) {
        throw error;
      }
      throw new Error(
        `[LiveKitClient] Music source is not accessible: ${source}`
      );
    }
  }

  /**
   * Determines if an error is a permission-related error (e.g., NotAllowedError).
   */
  private isPermissionError(error: unknown): boolean {
    if (error instanceof Error) {
      return (
        error.name === "NotAllowedError" ||
        error.message.includes("Permission denied") ||
        error.message.includes("not allowed")
      );
    }
    return false;
  }

  /**
   * Updates internal connection state and notifies the callback.
   */
  private setConnectionState(state: LiveKitConnectionState): void {
    this.connectionState = state;
    if (this.connectionStateCallback) {
      this.connectionStateCallback(state);
    }
  }

  /**
   * Resets internal state after disconnect.
   */
  private resetState(): void {
    this.isCameraEnabled = false;
    this.isScreenSharing = false;
    this.currentChannel = null;
    this.reconnectAttempts = 0;

    // Clean up music state
    if (this.isMusicPlaying) {
      this.stopMusicTrack();
    }
  }

  /**
   * Clears any pending reconnect timer.
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
