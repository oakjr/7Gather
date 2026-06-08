import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LiveKitClient, LiveKitConnectionState } from "./LiveKitClient";

/**
 * Unit tests for LiveKitClient.
 * Tests connection lifecycle, audio controls, video on-demand, screen share,
 * audio channel switching, listen-only mode, and reconnection logic.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4,
 * 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5
 */

// Mock the livekit-client module
const mockSetMicrophoneEnabled = vi.fn().mockResolvedValue(undefined);
const mockSetCameraEnabled = vi.fn().mockResolvedValue(undefined);
const mockSetScreenShareEnabled = vi.fn().mockResolvedValue(undefined);
const mockPublishTrack = vi.fn().mockResolvedValue({ trackSid: "TR_MUSIC" });
const mockUnpublishTrack = vi.fn().mockResolvedValue(undefined);

const mockLocalParticipant = {
  setMicrophoneEnabled: mockSetMicrophoneEnabled,
  setCameraEnabled: mockSetCameraEnabled,
  setScreenShareEnabled: mockSetScreenShareEnabled,
  publishTrack: mockPublishTrack,
  unpublishTrack: mockUnpublishTrack,
};

const roomListeners: Record<string, Function[]> = {};

const mockRoomConnect = vi.fn().mockResolvedValue(undefined);
const mockRoomDisconnect = vi.fn().mockResolvedValue(undefined);
const mockRoomOn = vi.fn((event: string, handler: Function) => {
  if (!roomListeners[event]) roomListeners[event] = [];
  roomListeners[event].push(handler);
  return mockRoomInstance;
});

const mockRoomInstance = {
  connect: mockRoomConnect,
  disconnect: mockRoomDisconnect,
  on: mockRoomOn,
  localParticipant: mockLocalParticipant,
  state: "disconnected",
};

vi.mock("livekit-client", () => ({
  Room: vi.fn().mockImplementation(() => {
    // Reset listeners for each new Room instance
    Object.keys(roomListeners).forEach((key) => delete roomListeners[key]);
    return { ...mockRoomInstance };
  }),
  RoomEvent: {
    TrackSubscribed: "trackSubscribed",
    ConnectionStateChanged: "connectionStateChanged",
    Disconnected: "disconnected",
    Reconnecting: "reconnecting",
    Reconnected: "reconnected",
    LocalTrackUnpublished: "localTrackUnpublished",
  },
  ConnectionState: {
    Disconnected: "disconnected",
    Connecting: "connecting",
    Connected: "connected",
    Reconnecting: "reconnecting",
    SignalReconnecting: "signalReconnecting",
  },
  VideoPresets: {
    h360: { width: 640, height: 360, encoding: { maxBitrate: 700000 } },
    h180: { width: 320, height: 180, encoding: { maxBitrate: 200000 } },
  },
  ScreenSharePresets: {
    h720fps5: { width: 1280, height: 720, encoding: { maxBitrate: 1500000 } },
    h360fps3: { width: 640, height: 360, encoding: { maxBitrate: 500000 } },
  },
  LocalAudioTrack: vi.fn().mockImplementation((mediaStreamTrack) => ({
    mediaStreamTrack,
    stop: vi.fn(),
  })),
  Track: {
    Source: {
      Unknown: "unknown",
    },
  },
}));

describe("LiveKitClient", () => {
  let client: LiveKitClient;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.keys(roomListeners).forEach((key) => delete roomListeners[key]);
    client = new LiveKitClient();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("connect", () => {
    it("should connect to LiveKit room with provided url and token", async () => {
      await client.connect("wss://livekit.example.com", "test-token");

      expect(mockRoomConnect).toHaveBeenCalledWith(
        "wss://livekit.example.com",
        "test-token"
      );
    });

    it("should set connection state to connected after successful connect", async () => {
      await client.connect("wss://livekit.example.com", "test-token");

      expect(client.getConnectionState()).toBe("connected");
    });

    it("should auto-enable microphone on connect", async () => {
      await client.connect("wss://livekit.example.com", "test-token");

      expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(true);
    });

    it("should enter listen-only mode when microphone permission is denied", async () => {
      const permissionError = new Error("Permission denied");
      permissionError.name = "NotAllowedError";
      mockSetMicrophoneEnabled.mockRejectedValueOnce(permissionError);

      await client.connect("wss://livekit.example.com", "test-token");

      expect(client.getIsListenOnly()).toBe(true);
      expect(client.getIsMuted()).toBe(true);
      expect(client.getConnectionState()).toBe("connected");
    });

    it("should set state to disconnected if connection fails", async () => {
      mockRoomConnect.mockRejectedValueOnce(new Error("Connection refused"));

      await expect(
        client.connect("wss://invalid.example.com", "bad-token")
      ).rejects.toThrow("Connection refused");

      expect(client.getConnectionState()).toBe("disconnected");
    });
  });

  describe("disconnect", () => {
    it("should disconnect from the room", async () => {
      await client.connect("wss://livekit.example.com", "test-token");
      await client.disconnect();

      expect(mockRoomDisconnect).toHaveBeenCalled();
      expect(client.getConnectionState()).toBe("disconnected");
    });

    it("should reset camera and screen share state on disconnect", async () => {
      await client.connect("wss://livekit.example.com", "test-token");

      await client.enableCamera();
      expect(client.getIsCameraEnabled()).toBe(true);

      await client.disconnect();

      expect(client.getIsCameraEnabled()).toBe(false);
      expect(client.getIsScreenSharing()).toBe(false);
    });
  });

  describe("audio controls", () => {
    beforeEach(async () => {
      await client.connect("wss://livekit.example.com", "test-token");
    });

    it("should toggle mute from unmuted to muted", () => {
      const result = client.toggleMute();

      expect(result).toBe(true);
      expect(client.getIsMuted()).toBe(true);
      expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(false);
    });

    it("should toggle mute from muted to unmuted", () => {
      client.toggleMute(); // mute
      mockSetMicrophoneEnabled.mockClear();

      const result = client.toggleMute(); // unmute

      expect(result).toBe(false);
      expect(client.getIsMuted()).toBe(false);
      expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(true);
    });

    it("should remain muted when toggling in listen-only mode", async () => {
      // Force listen-only
      (client as any).isListenOnly = true;
      (client as any).isMuted = true;

      const result = client.toggleMute();

      expect(result).toBe(true); // still muted
    });

    it("should disable microphone", () => {
      client.disableMicrophone();

      expect(mockSetMicrophoneEnabled).toHaveBeenCalledWith(false);
      expect(client.getIsMuted()).toBe(true);
    });
  });

  describe("video controls (on-demand)", () => {
    beforeEach(async () => {
      await client.connect("wss://livekit.example.com", "test-token");
    });

    it("should enable camera with default 720p 30FPS", async () => {
      await client.enableCamera();

      expect(mockSetCameraEnabled).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          resolution: expect.objectContaining({
            width: 1280,
            height: 720,
            frameRate: 30,
          }),
        }),
        expect.objectContaining({
          videoEncoding: expect.objectContaining({
            maxFramerate: 30,
          }),
          simulcast: true,
        })
      );
      expect(client.getIsCameraEnabled()).toBe(true);
    });

    it("should enable camera with custom constraints", async () => {
      await client.enableCamera({
        resolution: { width: 640, height: 480 },
        frameRate: 15,
      });

      expect(mockSetCameraEnabled).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          resolution: expect.objectContaining({
            width: 640,
            height: 480,
            frameRate: 15,
          }),
        }),
        expect.objectContaining({
          videoEncoding: expect.objectContaining({
            maxFramerate: 15,
          }),
        })
      );
    });

    it("should disable camera", () => {
      client.disableCamera();

      expect(mockSetCameraEnabled).toHaveBeenCalledWith(false);
      expect(client.getIsCameraEnabled()).toBe(false);
    });
  });

  describe("screen share (on-demand, Full HD 5FPS)", () => {
    beforeEach(async () => {
      await client.connect("wss://livekit.example.com", "test-token");
    });

    it("should start screen share with Full HD 5FPS and simulcast", async () => {
      await client.startScreenShare();

      expect(mockSetScreenShareEnabled).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          resolution: expect.objectContaining({
            width: 1920,
            height: 1080,
            frameRate: 5,
          }),
          contentHint: "detail",
        }),
        expect.objectContaining({
          screenShareEncoding: expect.objectContaining({
            maxBitrate: 3_000_000,
            maxFramerate: 5,
          }),
          simulcast: true,
        })
      );
      expect(client.getIsScreenSharing()).toBe(true);
    });

    it("should stop screen share", () => {
      client.stopScreenShare();

      expect(mockSetScreenShareEnabled).toHaveBeenCalledWith(false);
      expect(client.getIsScreenSharing()).toBe(false);
    });
  });

  describe("switchAudioChannel", () => {
    beforeEach(async () => {
      await client.connect("wss://livekit.example.com", "test-token");
      // Configure token endpoint for channel switching
      client.configureTokenEndpoint(
        "http://localhost:2567/livekit/token",
        "user-123",
        "Alice"
      );
    });

    it("should not switch if already on the same channel", async () => {
      (client as any).currentChannel = {
        channelId: "room-1",
        type: "room",
      };

      mockRoomDisconnect.mockClear();

      await client.switchAudioChannel({ channelId: "room-1", type: "room" });

      expect(mockRoomDisconnect).not.toHaveBeenCalled();
    });

    it("should disconnect and reconnect to a new channel", async () => {
      // Mock fetch for token
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ token: "new-zone-token" }),
      });

      await client.switchAudioChannel({
        channelId: "zone-private-1",
        type: "private-zone",
      });

      expect(mockRoomDisconnect).toHaveBeenCalledWith(false);
      expect(mockRoomConnect).toHaveBeenCalledWith(
        "wss://livekit.example.com",
        "new-zone-token"
      );
    });

    it("should update currentChannel after successful switch", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ token: "new-token" }),
      });

      const newChannel = { channelId: "zone-2", type: "private-zone" as const };
      await client.switchAudioChannel(newChannel);

      expect(client.getCurrentChannel()).toEqual(newChannel);
    });

    it("should send zoneId in token request for private zones", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ token: "zone-token" }),
      });

      await client.switchAudioChannel({
        channelId: "zone-meeting",
        type: "private-zone",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:2567/livekit/token",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"zoneId":"zone-meeting"'),
        })
      );
    });

    it("should throw if token endpoint is not configured", async () => {
      const freshClient = new LiveKitClient();
      await freshClient.connect("wss://livekit.example.com", "test-token");

      await expect(
        freshClient.switchAudioChannel({
          channelId: "zone-1",
          type: "private-zone",
        })
      ).rejects.toThrow("Token endpoint not configured");
    });
  });

  describe("error handling - reconnection", () => {
    it("should attempt reconnection on unexpected disconnect", async () => {
      await client.connect("wss://livekit.example.com", "test-token");

      // Trigger the Disconnected event - find handler registered via mockRoomOn
      const disconnectCalls = mockRoomOn.mock.calls.filter(
        (call) => call[0] === "disconnected"
      );
      if (disconnectCalls.length > 0) {
        const handler = disconnectCalls[disconnectCalls.length - 1][1];
        handler();
      }

      // Should be in reconnecting state
      expect(client.getConnectionState()).toBe("reconnecting");
    });

    it("should retry up to 3 times with 5s delay", async () => {
      await client.connect("wss://livekit.example.com", "test-token");

      // Now make subsequent connections fail
      mockRoomConnect.mockRejectedValue(new Error("Connection failed"));

      // Manually trigger reconnection
      (client as any).reconnectAttempts = 0;
      (client as any).attemptReconnect();

      // First attempt after 5s
      await vi.advanceTimersByTimeAsync(5000);
      expect((client as any).reconnectAttempts).toBe(2); // 1 from attemptReconnect + 1 retry

      // Second attempt after another 5s
      await vi.advanceTimersByTimeAsync(5000);
      expect((client as any).reconnectAttempts).toBe(3);

      // Third attempt - should give up (max reached)
      await vi.advanceTimersByTimeAsync(5000);
      expect(client.getConnectionState()).toBe("disconnected");

      // Reset mock for other tests
      mockRoomConnect.mockResolvedValue(undefined);
    });

    it("should stop retrying after max attempts reached", async () => {
      await client.connect("wss://livekit.example.com", "test-token");

      // Set attempts to max
      (client as any).reconnectAttempts = 3;
      (client as any).attemptReconnect();

      // Should immediately go to disconnected
      expect(client.getConnectionState()).toBe("disconnected");
    });
  });

  describe("events", () => {
    it("should register and invoke onTrackSubscribed callback", async () => {
      const callback = vi.fn();
      client.onTrackSubscribed(callback);

      await client.connect("wss://livekit.example.com", "test-token");

      // Find the trackSubscribed handler that was registered on the room
      const trackSubscribedCalls = mockRoomOn.mock.calls.filter(
        (call) => call[0] === "trackSubscribed"
      );
      expect(trackSubscribedCalls.length).toBeGreaterThan(0);

      // Invoke the handler directly
      const handler = trackSubscribedCalls[trackSubscribedCalls.length - 1][1];
      const mockTrack = { kind: "audio" } as any;
      const mockPub = { trackSid: "TR_123" } as any;
      const mockParticipant = { identity: "user-2" } as any;
      handler(mockTrack, mockPub, mockParticipant);

      expect(callback).toHaveBeenCalledWith(
        mockTrack,
        mockPub,
        mockParticipant
      );
    });

    it("should register and invoke onConnectionStateChange callback", async () => {
      const states: LiveKitConnectionState[] = [];
      client.onConnectionStateChange((state) => states.push(state));

      await client.connect("wss://livekit.example.com", "test-token");

      expect(states).toContain("connecting");
      expect(states).toContain("connected");
    });
  });

  describe("listen-only mode", () => {
    it("should prevent unmuting when in listen-only mode", async () => {
      // Set up the mock BEFORE creating the client/connecting
      mockSetMicrophoneEnabled.mockRejectedValueOnce(
        Object.assign(new Error("Permission denied"), { name: "NotAllowedError" })
      );

      await client.connect("wss://livekit.example.com", "test-token");

      expect(client.getIsListenOnly()).toBe(true);
      expect(client.getIsMuted()).toBe(true);

      // Trying to toggle mute should not change state
      const result = client.toggleMute();
      expect(result).toBe(true); // still muted
    });
  });

  describe("shared music", () => {
    let mockAudioElement: any;
    let mockAudioContext: any;
    let mockMediaStreamTrack: any;

    beforeEach(async () => {
      // Set up browser API mocks needed for music functionality
      mockMediaStreamTrack = { kind: "audio", id: "track-1" };
      const mockSourceNode = { connect: vi.fn() };
      const mockDestination = {
        stream: { getAudioTracks: () => [mockMediaStreamTrack] },
      };
      mockAudioContext = {
        createMediaElementSource: vi.fn().mockReturnValue(mockSourceNode),
        createMediaStreamDestination: vi.fn().mockReturnValue(mockDestination),
        state: "running",
        close: vi.fn(),
      };
      (globalThis as any).AudioContext = vi.fn(() => mockAudioContext);

      mockAudioElement = {
        crossOrigin: "",
        loop: false,
        volume: 1,
        src: "",
        addEventListener: vi.fn((event: string, handler: Function) => {
          if (event === "canplaythrough") {
            Promise.resolve().then(() => handler());
          }
        }),
        load: vi.fn(),
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
      };
      (globalThis as any).Audio = vi.fn(() => mockAudioElement);

      await client.connect("wss://livekit.example.com", "test-token");
    });

    describe("publishMusicTrack", () => {
      it("should reject unsupported audio formats", async () => {
        await expect(
          client.publishMusicTrack("https://example.com/song.flac")
        ).rejects.toThrow("Unsupported music format");
      });

      it("should reject files without extension", async () => {
        await expect(
          client.publishMusicTrack("https://example.com/noextension")
        ).rejects.toThrow("Unsupported music format");
      });

      it("should accept MP3 format after validation", async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true });

        await client.publishMusicTrack("https://example.com/song.mp3");

        expect(client.getIsMusicPlaying()).toBe(true);
        expect(mockPublishTrack).toHaveBeenCalled();
      });

      it("should accept OGG format", async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true });

        await client.publishMusicTrack("https://example.com/track.ogg");

        expect(client.getIsMusicPlaying()).toBe(true);
      });

      it("should accept WAV format", async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true });

        await client.publishMusicTrack("https://example.com/audio.wav");

        expect(client.getIsMusicPlaying()).toBe(true);
      });

      it("should reject inaccessible URLs", async () => {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 404,
          statusText: "Not Found",
        });

        await expect(
          client.publishMusicTrack("https://example.com/missing.mp3")
        ).rejects.toThrow("Music source is not accessible");
      });

      it("should reject when fetch throws network error", async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

        await expect(
          client.publishMusicTrack("https://example.com/song.mp3")
        ).rejects.toThrow("Music source is not accessible");
      });

      it("should handle URL with query parameters", async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true });

        await client.publishMusicTrack(
          "https://cdn.example.com/song.mp3?token=abc123"
        );

        expect(client.getIsMusicPlaying()).toBe(true);
      });
    });

    describe("stopMusicTrack", () => {
      it("should do nothing if no music is playing", () => {
        expect(client.getIsMusicPlaying()).toBe(false);
        client.stopMusicTrack(); // should not throw
        expect(client.getIsMusicPlaying()).toBe(false);
      });

      it("should stop and unpublish the music track", async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true });

        await client.publishMusicTrack("https://example.com/song.mp3");
        expect(client.getIsMusicPlaying()).toBe(true);

        client.stopMusicTrack();

        expect(client.getIsMusicPlaying()).toBe(false);
        expect(mockUnpublishTrack).toHaveBeenCalled();
        expect(mockAudioElement.pause).toHaveBeenCalled();
        expect(mockAudioContext.close).toHaveBeenCalled();
      });
    });

    describe("setMusicVolume", () => {
      it("should have default volume of 50", () => {
        expect(client.getMusicVolume()).toBe(50);
      });

      it("should set volume within valid range", () => {
        client.setMusicVolume(75);
        expect(client.getMusicVolume()).toBe(75);
      });

      it("should clamp volume to 0 for negative values", () => {
        client.setMusicVolume(-10);
        expect(client.getMusicVolume()).toBe(0);
      });

      it("should clamp volume to 100 for values over 100", () => {
        client.setMusicVolume(150);
        expect(client.getMusicVolume()).toBe(100);
      });

      it("should round fractional values", () => {
        client.setMusicVolume(33.7);
        expect(client.getMusicVolume()).toBe(34);
      });

      it("should update the audio element volume when music is playing", async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: true });

        await client.publishMusicTrack("https://example.com/song.mp3");

        client.setMusicVolume(80);

        expect(mockAudioElement.volume).toBe(0.8);
      });
    });
  });
});
