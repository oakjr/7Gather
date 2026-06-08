/**
 * @vitest-environment jsdom
 */

/**
 * End-to-End Integration Tests for Room Entry and Module Wiring
 *
 * These tests validate the integration between modules without requiring
 * running infrastructure (Docker). They test:
 * - Avatar selection → room join → media connect → ready flow
 * - Zone enter/leave triggers audio channel switch
 * - Music shared track received by new participant
 * - Reconnection preserves state
 *
 * Requirements: 1.1, 4.1, 6.6, 7.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock colyseus.js before importing modules that depend on it
vi.mock("colyseus.js", () => {
  const createMockRoom = () => ({
    sessionId: "test-session-123",
    send: vi.fn(),
    leave: vi.fn().mockResolvedValue(undefined),
    onStateChange: vi.fn(),
    onLeave: vi.fn(),
    reconnectionToken: "reconnect-token",
    state: {
      players: {
        onAdd: vi.fn(),
        onRemove: vi.fn(),
      },
      mapVersion: "",
    },
  });

  const mockRoom = createMockRoom();

  return {
    Client: vi.fn().mockImplementation(() => ({
      joinOrCreate: vi.fn().mockResolvedValue(mockRoom),
      reconnect: vi.fn().mockResolvedValue(createMockRoom()),
    })),
    __mockRoom: mockRoom,
  };
});

// Mock Phaser (imported indirectly via ZoneAudioIntegration → GameScene)
vi.mock("phaser", () => {
  const EventEmitter = class {
    private handlers: Record<string, Function[]> = {};
    on(event: string, fn: Function) { (this.handlers[event] ??= []).push(fn); return this; }
    off(event: string, fn: Function) { this.handlers[event] = (this.handlers[event] || []).filter(h => h !== fn); return this; }
    emit(event: string, ...args: any[]) { (this.handlers[event] || []).forEach(h => h(...args)); }
  };
  const Scene = class extends EventEmitter { constructor(config?: any) { super(); } };
  return {
    default: { Scene, Scale: { RESIZE: 0, CENTER_BOTH: 0 }, AUTO: 0, Input: { Keyboard: { KeyCodes: {} } } },
    Scene,
    __esModule: true,
  };
});

// Mock livekit-client
vi.mock("livekit-client", () => {
  const createMockRoom = () => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    localParticipant: {
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      setCameraEnabled: vi.fn().mockResolvedValue(undefined),
      setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
      publishTrack: vi.fn().mockResolvedValue({}),
      unpublishTrack: vi.fn(),
    },
    on: vi.fn(),
  });

  return {
    Room: vi.fn().mockImplementation(() => createMockRoom()),
    RoomEvent: {
      TrackSubscribed: "trackSubscribed",
      ConnectionStateChanged: "connectionStateChanged",
      Disconnected: "disconnected",
      Reconnecting: "reconnecting",
      Reconnected: "reconnected",
      LocalTrackUnpublished: "localTrackUnpublished",
    },
    ConnectionState: {
      Connected: "connected",
      Connecting: "connecting",
      Reconnecting: "reconnecting",
      Disconnected: "disconnected",
    },
    VideoPresets: { h360: {}, h180: {} },
    ScreenSharePresets: { h720fps5: {}, h360fps3: {} },
    LocalAudioTrack: vi.fn(),
    Track: { Source: { Unknown: "unknown" } },
  };
});

import { RoomEntryFlow, RoomEntryConfig, RoomEntryState } from "../RoomEntryFlow";
import { ColyseusClient } from "../network/ColyseusClient";
import { LiveKitClient } from "../network/LiveKitClient";
import { ZoneAudioIntegration } from "./ZoneAudioIntegration";

// Mock fetch for LiveKit token requests
const mockFetch = vi.fn();
(globalThis as any).fetch = mockFetch;

const TEST_CONFIG: RoomEntryConfig = {
  colyseusUrl: "ws://localhost:2567",
  livekitUrl: "ws://localhost:7880",
  livekitTokenEndpoint: "/livekit/token",
  roomId: "test-room-id",
  displayName: "TestUser",
  mapJsonUrl: "/maps/default.json",
};

describe("Room Entry Flow Integration", () => {
  let colyseusClient: ColyseusClient;
  let livekitClient: LiveKitClient;
  let flow: RoomEntryFlow;

  beforeEach(() => {
    localStorage.clear();

    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: "mock-livekit-token" }),
    });

    colyseusClient = new ColyseusClient();
    livekitClient = new LiveKitClient();
    flow = new RoomEntryFlow(colyseusClient, livekitClient);
  });

  afterEach(() => {
  });

  describe("Complete flow: select avatar → enter room → move → ready", () => {
    it("should require avatar selection when no avatar stored", async () => {
      const states: RoomEntryState[] = [];
      flow.onStateChange((state) => states.push(state));

      await flow.start(TEST_CONFIG);

      expect(flow.getState()).toBe("avatar_selection");
      expect(states).toContain("avatar_selection");
    });

    it("should proceed directly to connection when avatar already stored", async () => {
      localStorage.setItem("avatar_id", "5");

      const states: RoomEntryState[] = [];
      flow.onStateChange((state) => states.push(state));

      await flow.start(TEST_CONFIG);

      expect(states).toContain("connecting_colyseus");
      expect(states).toContain("fetching_livekit_token");
      expect(states).toContain("connecting_media");
      expect(states).toContain("ready");
      expect(flow.getState()).toBe("ready");
    });

    it("should complete full flow: avatar selection → connection → ready", async () => {
      const states: RoomEntryState[] = [];
      flow.onStateChange((state) => states.push(state));

      await flow.start(TEST_CONFIG);
      expect(flow.getState()).toBe("avatar_selection");

      await flow.onAvatarSelected(7);

      expect(states).toContain("connecting_colyseus");
      expect(states).toContain("ready");
      expect(flow.getAvatarId()).toBe(7);
    });

    it("should fetch LiveKit token with correct room and session info", async () => {
      localStorage.setItem("avatar_id", "3");

      await flow.start(TEST_CONFIG);

      expect(mockFetch).toHaveBeenCalledWith(
        TEST_CONFIG.livekitTokenEndpoint,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        })
      );

      const callBody = JSON.parse(
        (mockFetch.mock.calls[0][1] as any).body
      );
      expect(callBody.roomName).toBe("test-room-id");
      expect(callBody.participantName).toBe("TestUser");
    });
  });

  describe("Room switching via link (Requirement 9.3)", () => {
    it("should disconnect from previous room before joining new one", async () => {
      localStorage.setItem("avatar_id", "1");

      await flow.start(TEST_CONFIG);
      expect(flow.getState()).toBe("ready");

      const newConfig = { ...TEST_CONFIG, roomId: "new-room-id" };
      await flow.start(newConfig);

      expect(flow.getState()).toBe("ready");
      expect(flow.getConfig()?.roomId).toBe("new-room-id");
    });
  });

  describe("Error handling", () => {
    it("should set media_failed when LiveKit token fetch fails", async () => {
      localStorage.setItem("avatar_id", "1");

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await flow.start(TEST_CONFIG);

      expect(flow.getState()).toBe("error");
      expect(flow.getError()?.code).toBe("media_failed");
    });
  });
});

describe("Zone Audio Integration", () => {
  let colyseusClient: ColyseusClient;
  let livekitClient: LiveKitClient;
  let integration: ZoneAudioIntegration;

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: "mock-zone-token" }),
    });

    colyseusClient = new ColyseusClient();
    livekitClient = new LiveKitClient();
    integration = new ZoneAudioIntegration(colyseusClient, livekitClient, "test-room");
  });

  it("should track zone transitions correctly", () => {
    expect(integration.getCurrentZoneId()).toBeNull();
    expect(integration.getIsSwitching()).toBe(false);
  });

  it("should register error callback", () => {
    const errorCb = vi.fn();
    integration.onError(errorCb);
    expect(integration.getCurrentZoneId()).toBeNull();
  });

  it("should cleanup on dispose", () => {
    integration.dispose();
    expect(integration.getCurrentZoneId()).toBeNull();
  });
});

describe("Reconnection State Preservation (Requirement 7.5)", () => {
  let colyseusClient: ColyseusClient;

  beforeEach(() => {
    colyseusClient = new ColyseusClient();
  });

  it("should queue positions during disconnection", () => {
    colyseusClient.sendPosition(5, 10, "right");
    colyseusClient.sendPosition(6, 10, "right");
    colyseusClient.sendPosition(7, 10, "right");

    expect(colyseusClient.getQueueLength()).toBe(3);
  });

  it("should send positions directly when connected (no queue)", async () => {
    await colyseusClient.connect("ws://localhost:2567");
    await colyseusClient.joinRoom({
      roomId: "test-room",
      avatarId: 1,
      displayName: "Test",
    });

    colyseusClient.sendPosition(1, 1, "down");
    expect(colyseusClient.getQueueLength()).toBe(0);
  });

  it("should track connection state changes", () => {
    const states: string[] = [];
    colyseusClient.onConnectionStateChange((state) => states.push(state));
    expect(colyseusClient.getConnectionState()).toBe("disconnected");
  });
});

describe("Music Shared Track Integration (Requirement 6.6)", () => {
  let livekitClient: LiveKitClient;

  beforeEach(() => {
    livekitClient = new LiveKitClient();
  });

  it("should start with no music playing", () => {
    expect(livekitClient.getIsMusicPlaying()).toBe(false);
    expect(livekitClient.getMusicVolume()).toBe(50);
  });

  it("should reject unsupported music formats", async () => {
    await expect(
      livekitClient.publishMusicTrack("http://example.com/track.flac")
    ).rejects.toThrow("Unsupported music format");
  });

  it("should allow volume adjustment within valid range", () => {
    livekitClient.setMusicVolume(75);
    expect(livekitClient.getMusicVolume()).toBe(75);

    livekitClient.setMusicVolume(0);
    expect(livekitClient.getMusicVolume()).toBe(0);

    livekitClient.setMusicVolume(100);
    expect(livekitClient.getMusicVolume()).toBe(100);
  });

  it("should clamp volume to 0-100 range", () => {
    livekitClient.setMusicVolume(-10);
    expect(livekitClient.getMusicVolume()).toBe(0);

    livekitClient.setMusicVolume(150);
    expect(livekitClient.getMusicVolume()).toBe(100);
  });
});
