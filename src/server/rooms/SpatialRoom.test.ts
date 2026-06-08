import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SpatialRoom } from "./SpatialRoom";
import { RoomState } from "../state/RoomState";
import { MAX_AVATARS, SYNC_RATE, RECONNECT_TIMEOUT_MS } from "../../shared/constants";

/**
 * Unit tests for SpatialRoom handler.
 * Tests lifecycle methods: onCreate, onJoin, onLeave, onDispose.
 * Tests message handlers: move, zone_enter, zone_leave, music_play, music_stop.
 * Tests reconnection and inactivity detection (Requirements: 1.5, 7.3, 7.5).
 */

// Minimal mock for Colyseus Client
function createMockClient(sessionId: string) {
  return { sessionId } as any;
}

// Create a SpatialRoom instance with mocked Colyseus internals
function createRoom(): SpatialRoom {
  const room = Object.create(SpatialRoom.prototype) as SpatialRoom;
  // Store registered message handlers for testing
  const messageHandlers = new Map<string, Function>();

  // Mock setPatchRate and setState
  (room as any).setPatchRate = vi.fn();
  (room as any).setState = vi.fn((state: RoomState) => {
    (room as any).state = state;
  });
  (room as any).allowReconnection = vi.fn();
  (room as any).onMessage = vi.fn((type: string, handler: Function) => {
    messageHandlers.set(type, handler);
  });
  (room as any).broadcast = vi.fn();
  (room as any)._messageHandlers = messageHandlers;

  return room;
}

// Helper to invoke a registered message handler
function sendMessage(room: SpatialRoom, type: string, client: any, data?: any) {
  const handlers = (room as any)._messageHandlers as Map<string, Function>;
  const handler = handlers.get(type);
  if (handler) {
    handler(client, data);
  }
}

describe("SpatialRoom", () => {
  let room: SpatialRoom;

  beforeEach(() => {
    vi.useFakeTimers();
    room = createRoom();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("onCreate", () => {
    it("should set maxClients to default MAX_AVATARS when no option provided", () => {
      room.onCreate({});
      expect(room.maxClients).toBe(MAX_AVATARS);
    });

    it("should clamp maxClients to minimum of 2", () => {
      room.onCreate({ maxClients: 1 });
      expect(room.maxClients).toBe(2);
    });

    it("should clamp maxClients to maximum of 50", () => {
      room.onCreate({ maxClients: 100 });
      expect(room.maxClients).toBe(50);
    });

    it("should accept maxClients within valid range", () => {
      room.onCreate({ maxClients: 30 });
      expect(room.maxClients).toBe(30);
    });

    it("should set patch rate to 50ms (1000 / SYNC_RATE)", () => {
      room.onCreate({});
      expect((room as any).setPatchRate).toHaveBeenCalledWith(1000 / SYNC_RATE);
    });

    it("should initialize RoomState", () => {
      room.onCreate({});
      expect((room as any).setState).toHaveBeenCalled();
      expect((room as any).state).toBeInstanceOf(RoomState);
    });

    it("should set mapVersion when mapJsonPath is provided", () => {
      room.onCreate({ mapJsonPath: "maps/office-v2.json" });
      expect((room as any).state.mapVersion).toBe("maps/office-v2.json");
    });

    it("should leave mapVersion empty when mapJsonPath is not provided", () => {
      room.onCreate({});
      expect((room as any).state.mapVersion).toBe("");
    });

    it("should initialize ReconnectionManager", () => {
      room.onCreate({});
      expect(room.reconnectionManager).toBeDefined();
    });
  });

  describe("onJoin", () => {
    beforeEach(() => {
      room.onCreate({});
    });

    it("should add a player to state with correct session ID", () => {
      const client = createMockClient("abc123");
      room.onJoin(client, { avatarId: 5, displayName: "Alice" });

      const player = (room as any).state.players.get("abc123");
      expect(player).toBeDefined();
      expect(player.sessionId).toBe("abc123");
    });

    it("should set player displayName and avatarId from options", () => {
      const client = createMockClient("abc123");
      room.onJoin(client, { avatarId: 12, displayName: "Bob" });

      const player = (room as any).state.players.get("abc123");
      expect(player.displayName).toBe("Bob");
      expect(player.avatarId).toBe(12);
    });

    it("should initialize player position at origin", () => {
      const client = createMockClient("abc123");
      room.onJoin(client, { avatarId: 1, displayName: "Test" });

      const player = (room as any).state.players.get("abc123");
      expect(player.x).toBe(0);
      expect(player.y).toBe(0);
    });

    it("should initialize player with default direction and state", () => {
      const client = createMockClient("abc123");
      room.onJoin(client, { avatarId: 1, displayName: "Test" });

      const player = (room as any).state.players.get("abc123");
      expect(player.direction).toBe("down");
      expect(player.isMoving).toBe(false);
      expect(player.isMuted).toBe(false);
      expect(player.currentZone).toBe("");
    });

    it("should default displayName to 'Anonymous' when not provided", () => {
      const client = createMockClient("abc123");
      room.onJoin(client, undefined as any);

      const player = (room as any).state.players.get("abc123");
      expect(player.displayName).toBe("Anonymous");
    });

    it("should support multiple players joining", () => {
      room.onJoin(createMockClient("p1"), { avatarId: 1, displayName: "P1" });
      room.onJoin(createMockClient("p2"), { avatarId: 2, displayName: "P2" });
      room.onJoin(createMockClient("p3"), { avatarId: 3, displayName: "P3" });

      expect((room as any).state.players.size).toBe(3);
    });

    it("should track activity for new client", () => {
      vi.spyOn(room.reconnectionManager, "trackActivity");
      const client = createMockClient("abc123");
      room.onJoin(client, { avatarId: 1, displayName: "Test" });

      expect(room.reconnectionManager.trackActivity).toHaveBeenCalledWith("abc123");
    });
  });

  describe("onLeave", () => {
    beforeEach(() => {
      room.onCreate({});
      vi.spyOn(room.reconnectionManager, "removeClient");
      vi.spyOn(room.reconnectionManager, "markReconnecting");
      vi.spyOn(room.reconnectionManager, "markReconnected");
      room.onJoin(createMockClient("player1"), { avatarId: 1, displayName: "Player1" });
    });

    it("should remove player immediately when consented is true", async () => {
      const client = createMockClient("player1");
      await room.onLeave(client, true);

      expect((room as any).state.players.has("player1")).toBe(false);
    });

    it("should remove client from reconnection manager on consented leave", async () => {
      const client = createMockClient("player1");
      await room.onLeave(client, true);

      expect(room.reconnectionManager.removeClient).toHaveBeenCalledWith("player1");
    });

    it("should attempt reconnection when consented is false", async () => {
      const client = createMockClient("player1");
      (room as any).allowReconnection.mockResolvedValue(client);

      await room.onLeave(client, false);

      expect((room as any).allowReconnection).toHaveBeenCalledWith(
        client,
        RECONNECT_TIMEOUT_MS / 1000
      );
    });

    it("should mark client as reconnecting on unexpected disconnect", async () => {
      const client = createMockClient("player1");
      (room as any).allowReconnection.mockResolvedValue(client);

      await room.onLeave(client, false);

      expect(room.reconnectionManager.markReconnecting).toHaveBeenCalledWith("player1");
    });

    it("should preserve player state on successful reconnection", async () => {
      const client = createMockClient("player1");
      (room as any).allowReconnection.mockResolvedValue(client);

      await room.onLeave(client, false);

      expect((room as any).state.players.has("player1")).toBe(true);
    });

    it("should mark client as reconnected on successful reconnection", async () => {
      const client = createMockClient("player1");
      (room as any).allowReconnection.mockResolvedValue(client);

      await room.onLeave(client, false);

      expect(room.reconnectionManager.markReconnected).toHaveBeenCalledWith("player1");
    });

    it("should remove player after reconnection timeout", async () => {
      const client = createMockClient("player1");
      (room as any).allowReconnection.mockRejectedValue(new Error("timeout"));

      await room.onLeave(client, false);

      expect((room as any).state.players.has("player1")).toBe(false);
    });

    it("should remove client from reconnection manager after timeout", async () => {
      const client = createMockClient("player1");
      (room as any).allowReconnection.mockRejectedValue(new Error("timeout"));

      await room.onLeave(client, false);

      expect(room.reconnectionManager.removeClient).toHaveBeenCalledWith("player1");
    });
  });

  describe("maxClients enforcement (Requirement 11.4)", () => {
    it("should configure maxClients to MAX_AVATARS by default to enforce room capacity", () => {
      room.onCreate({});
      // Colyseus uses room.maxClients to reject connections when the room is full.
      // Requirement 11.4: "WHEN o número de participantes em uma Sala atinge o limite configurado"
      expect(room.maxClients).toBe(MAX_AVATARS);
      expect(room.maxClients).toBe(20);
    });

    it("should allow custom maxClients within valid range (2-50) for room capacity configuration", () => {
      room.onCreate({ maxClients: 10 });
      // A room configured with maxClients=10 will reject the 11th connection
      expect(room.maxClients).toBe(10);
    });

    it("should enforce minimum capacity of 2 participants", () => {
      room.onCreate({ maxClients: 0 });
      expect(room.maxClients).toBe(2);
    });

    it("should enforce maximum capacity of 50 participants", () => {
      room.onCreate({ maxClients: 999 });
      expect(room.maxClients).toBe(50);
    });
  });

  describe("onDispose", () => {
    it("should clear all players from state", () => {
      room.onCreate({});
      room.onJoin(createMockClient("p1"), { avatarId: 1, displayName: "P1" });
      room.onJoin(createMockClient("p2"), { avatarId: 2, displayName: "P2" });

      room.onDispose();

      expect((room as any).state.players.size).toBe(0);
    });

    it("should clear reconnection manager on dispose", () => {
      room.onCreate({});
      vi.spyOn(room.reconnectionManager, "clear");
      room.onJoin(createMockClient("p1"), { avatarId: 1, displayName: "P1" });

      room.onDispose();

      expect(room.reconnectionManager.clear).toHaveBeenCalled();
    });
  });

  describe("Reconnection and Inactivity Detection", () => {
    beforeEach(() => {
      room.onCreate({});
      vi.spyOn(room.reconnectionManager, "trackActivity");
      vi.spyOn(room.reconnectionManager, "removeClient");
    });

    it("should track activity on move message", () => {
      room.onJoin(createMockClient("player1"), { avatarId: 1, displayName: "P1" });
      const client = createMockClient("player1");
      sendMessage(room, "move", client, { x: 5, y: 5, direction: "up", timestamp: Date.now() });

      expect(room.reconnectionManager.trackActivity).toHaveBeenCalledWith("player1");
    });

    it("should track activity on zone_enter message", () => {
      room.onJoin(createMockClient("player1"), { avatarId: 1, displayName: "P1" });
      const client = createMockClient("player1");
      sendMessage(room, "zone_enter", client, { zoneId: "zone1", action: "enter" });

      expect(room.reconnectionManager.trackActivity).toHaveBeenCalledWith("player1");
    });

    it("should track activity on zone_leave message", () => {
      room.onJoin(createMockClient("player1"), { avatarId: 1, displayName: "P1" });
      const client = createMockClient("player1");
      sendMessage(room, "zone_leave", client, { zoneId: "zone1", action: "leave" });

      expect(room.reconnectionManager.trackActivity).toHaveBeenCalledWith("player1");
    });

    it("should track activity on music_play message", () => {
      room.onJoin(createMockClient("player1"), { avatarId: 1, displayName: "P1" });
      const client = createMockClient("player1");
      sendMessage(room, "music_play", client, { source: "track.mp3", format: "mp3" });

      expect(room.reconnectionManager.trackActivity).toHaveBeenCalledWith("player1");
    });

    it("should track activity on music_stop message", () => {
      room.onJoin(createMockClient("player1"), { avatarId: 1, displayName: "P1" });
      const client = createMockClient("player1");
      sendMessage(room, "music_play", client, { source: "track.mp3", format: "mp3" });
      sendMessage(room, "music_stop", client);

      expect(room.reconnectionManager.trackActivity).toHaveBeenCalledWith("player1");
    });

    it("should remove inactive clients detected by checkInactiveClients", () => {
      room.onJoin(createMockClient("player1"), { avatarId: 1, displayName: "P1" });
      room.onJoin(createMockClient("player2"), { avatarId: 2, displayName: "P2" });

      // Advance time past inactivity threshold
      vi.advanceTimersByTime(RECONNECT_TIMEOUT_MS + 1000);

      // Trigger the inactivity check
      (room as any).checkInactiveClients();

      // Both players should be removed (no messages sent after join)
      expect((room as any).state.players.has("player1")).toBe(false);
      expect((room as any).state.players.has("player2")).toBe(false);
    });

    it("should keep active clients when checking inactivity", () => {
      room.onJoin(createMockClient("player1"), { avatarId: 1, displayName: "P1" });
      room.onJoin(createMockClient("player2"), { avatarId: 2, displayName: "P2" });

      // Advance time to just before the threshold so neither is inactive yet
      vi.advanceTimersByTime(RECONNECT_TIMEOUT_MS - 500);

      // player2 sends a message refreshing their activity
      const client2 = createMockClient("player2");
      sendMessage(room, "move", client2, { x: 1, y: 1, direction: "up", timestamp: Date.now() });

      // Now advance past the threshold — player1 becomes inactive, player2 stays active
      vi.advanceTimersByTime(1000);

      // Trigger check manually to verify correct filtering
      (room as any).checkInactiveClients();

      expect((room as any).state.players.has("player1")).toBe(false);
      expect((room as any).state.players.has("player2")).toBe(true);
    });

    it("should not remove clients within the inactivity threshold", () => {
      room.onJoin(createMockClient("player1"), { avatarId: 1, displayName: "P1" });

      // Advance time but stay within threshold
      vi.advanceTimersByTime(RECONNECT_TIMEOUT_MS - 100);

      (room as any).checkInactiveClients();

      expect((room as any).state.players.has("player1")).toBe(true);
    });

    it("should trigger inactivity check via setInterval", () => {
      room.onJoin(createMockClient("player1"), { avatarId: 1, displayName: "P1" });

      // Advance timer enough for the interval to fire and for the player to be inactive
      vi.advanceTimersByTime(RECONNECT_TIMEOUT_MS + 1500);

      // The interval should have fired and removed the inactive player
      expect((room as any).state.players.has("player1")).toBe(false);
    });
  });

  describe("Message Handlers", () => {
    beforeEach(() => {
      room.onCreate({});
      room.onJoin(createMockClient("player1"), { avatarId: 1, displayName: "Alice" });
    });

    describe("move handler", () => {
      it("should update player position and direction", () => {
        const client = createMockClient("player1");
        sendMessage(room, "move", client, { x: 5, y: 10, direction: "right", timestamp: Date.now() });

        const player = (room as any).state.players.get("player1");
        expect(player.x).toBe(5);
        expect(player.y).toBe(10);
        expect(player.direction).toBe("right");
        expect(player.isMoving).toBe(true);
      });

      it("should reject move with negative coordinates", () => {
        const client = createMockClient("player1");
        sendMessage(room, "move", client, { x: -1, y: 5, direction: "up", timestamp: Date.now() });

        const player = (room as any).state.players.get("player1");
        expect(player.x).toBe(0); // unchanged
        expect(player.y).toBe(0); // unchanged
      });

      it("should reject move beyond map bounds", () => {
        const client = createMockClient("player1");
        sendMessage(room, "move", client, { x: 200, y: 5, direction: "right", timestamp: Date.now() });

        const player = (room as any).state.players.get("player1");
        expect(player.x).toBe(0); // unchanged
      });

      it("should reject move with invalid direction", () => {
        const client = createMockClient("player1");
        sendMessage(room, "move", client, { x: 5, y: 5, direction: "diagonal", timestamp: Date.now() });

        const player = (room as any).state.players.get("player1");
        expect(player.x).toBe(0); // unchanged — invalid direction rejected
      });

      it("should ignore move from unknown client", () => {
        const unknownClient = createMockClient("unknown");
        sendMessage(room, "move", unknownClient, { x: 5, y: 5, direction: "up", timestamp: Date.now() });

        expect((room as any).state.players.has("unknown")).toBe(false);
      });
    });

    describe("zone_enter handler", () => {
      it("should update player's currentZone", () => {
        const client = createMockClient("player1");
        sendMessage(room, "zone_enter", client, { zoneId: "meeting-room-1", action: "enter" });

        const player = (room as any).state.players.get("player1");
        expect(player.currentZone).toBe("meeting-room-1");
      });

      it("should broadcast zone_player_entered to other clients", () => {
        const client = createMockClient("player1");
        sendMessage(room, "zone_enter", client, { zoneId: "meeting-room-1", action: "enter" });

        expect((room as any).broadcast).toHaveBeenCalledWith(
          "zone_player_entered",
          { sessionId: "player1", zoneId: "meeting-room-1" },
          { except: client }
        );
      });

      it("should ignore zone_enter with empty zoneId", () => {
        const client = createMockClient("player1");
        sendMessage(room, "zone_enter", client, { zoneId: "", action: "enter" });

        const player = (room as any).state.players.get("player1");
        expect(player.currentZone).toBe("");
      });

      it("should ignore zone_enter from unknown client", () => {
        const unknownClient = createMockClient("unknown");
        sendMessage(room, "zone_enter", unknownClient, { zoneId: "meeting-room-1", action: "enter" });
        // No error thrown
      });
    });

    describe("zone_leave handler", () => {
      it("should clear player's currentZone", () => {
        const client = createMockClient("player1");
        const player = (room as any).state.players.get("player1");
        player.currentZone = "meeting-room-1";

        sendMessage(room, "zone_leave", client, { zoneId: "meeting-room-1", action: "leave" });

        expect(player.currentZone).toBe("");
      });

      it("should broadcast zone_player_left with previous zone ID", () => {
        const client = createMockClient("player1");
        const player = (room as any).state.players.get("player1");
        player.currentZone = "meeting-room-1";

        sendMessage(room, "zone_leave", client, { zoneId: "meeting-room-1", action: "leave" });

        expect((room as any).broadcast).toHaveBeenCalledWith(
          "zone_player_left",
          { sessionId: "player1", zoneId: "meeting-room-1" },
          { except: client }
        );
      });

      it("should ignore zone_leave from unknown client", () => {
        const unknownClient = createMockClient("unknown");
        sendMessage(room, "zone_leave", unknownClient, { zoneId: "meeting-room-1", action: "leave" });
        // No error thrown
      });
    });

    describe("music_play handler", () => {
      it("should update MusicSchema when valid format provided", () => {
        const client = createMockClient("player1");
        sendMessage(room, "music_play", client, { source: "https://example.com/track.mp3", format: "mp3" });

        const music = (room as any).state.music;
        expect(music.source).toBe("https://example.com/track.mp3");
        expect(music.startedBy).toBe("Alice");
        expect(music.isPlaying).toBe(true);
      });

      it("should reject invalid format", () => {
        const client = createMockClient("player1");
        sendMessage(room, "music_play", client, { source: "https://example.com/track.flac", format: "flac" });

        const music = (room as any).state.music;
        expect(music.isPlaying).toBe(false);
      });

      it("should reject empty source", () => {
        const client = createMockClient("player1");
        sendMessage(room, "music_play", client, { source: "", format: "mp3" });

        const music = (room as any).state.music;
        expect(music.isPlaying).toBe(false);
      });

      it("should limit to one active track per room", () => {
        const client = createMockClient("player1");
        sendMessage(room, "music_play", client, { source: "track1.mp3", format: "mp3" });

        room.onJoin(createMockClient("player2"), { avatarId: 2, displayName: "Bob" });
        const client2 = createMockClient("player2");
        sendMessage(room, "music_play", client2, { source: "track2.ogg", format: "ogg" });

        const music = (room as any).state.music;
        expect(music.source).toBe("track1.mp3");
        expect(music.startedBy).toBe("Alice");
      });

      it("should accept ogg format", () => {
        const client = createMockClient("player1");
        sendMessage(room, "music_play", client, { source: "music.ogg", format: "ogg" });

        expect((room as any).state.music.isPlaying).toBe(true);
      });

      it("should accept wav format", () => {
        const client = createMockClient("player1");
        sendMessage(room, "music_play", client, { source: "music.wav", format: "wav" });

        expect((room as any).state.music.isPlaying).toBe(true);
      });
    });

    describe("music_stop handler", () => {
      it("should clear MusicSchema when music is playing", () => {
        const client = createMockClient("player1");
        sendMessage(room, "music_play", client, { source: "track.mp3", format: "mp3" });
        sendMessage(room, "music_stop", client);

        const music = (room as any).state.music;
        expect(music.source).toBe("");
        expect(music.startedBy).toBe("");
        expect(music.isPlaying).toBe(false);
      });

      it("should do nothing when no music is playing", () => {
        const client = createMockClient("player1");
        sendMessage(room, "music_stop", client);

        const music = (room as any).state.music;
        expect(music.isPlaying).toBe(false);
      });

      it("should allow new music after stopping", () => {
        const client = createMockClient("player1");
        sendMessage(room, "music_play", client, { source: "track1.mp3", format: "mp3" });
        sendMessage(room, "music_stop", client);
        sendMessage(room, "music_play", client, { source: "track2.ogg", format: "ogg" });

        const music = (room as any).state.music;
        expect(music.source).toBe("track2.ogg");
        expect(music.isPlaying).toBe(true);
      });
    });
  });
});
