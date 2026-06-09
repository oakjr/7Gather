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

    describe("lock_room handler (Requirement 14.3, 14.9)", () => {
      let roomWithZones: SpatialRoom;

      beforeEach(() => {
        roomWithZones = createRoom();
        roomWithZones.onCreate({
          mapData: {
            width: 50,
            height: 40,
            tilewidth: 32,
            tileheight: 32,
            layers: [
              {
                name: "Objects",
                type: "objectgroup",
                objects: [
                  {
                    id: 1,
                    name: "sala-1",
                    type: "zone",
                    x: 64,
                    y: 64,
                    width: 160,
                    height: 160,
                    properties: [{ name: "jitsiRoom", type: "string", value: "sala-1" }],
                  },
                ],
              },
            ],
            tilesets: [],
          },
        });
        roomWithZones.onJoin(createMockClient("owner1"), { avatarId: 1, displayName: "Owner" });
        // Claim the room
        sendMessage(roomWithZones, "claim_room", createMockClient("owner1"), { zoneId: "sala-1" });
      });

      it("should set isLocked to true when owner sends lock_room", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "lock_room", client, { zoneId: "sala-1" });

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.isLocked).toBe(true);
      });

      it("should reject lock_room from non-owner", () => {
        roomWithZones.onJoin(createMockClient("intruder"), { avatarId: 2, displayName: "Intruder" });
        const client = createMockClient("intruder");
        sendMessage(roomWithZones, "lock_room", client, { zoneId: "sala-1" });

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.isLocked).toBe(false);
      });

      it("should reject lock_room with invalid zoneId", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "lock_room", client, { zoneId: "nonexistent" });
        // No error thrown, no state change
      });

      it("should reject lock_room with empty zoneId", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "lock_room", client, { zoneId: "" });
        // No error thrown
      });

      it("should reject lock_room with non-string zoneId", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "lock_room", client, { zoneId: 123 });
        // No error thrown
      });
    });

    describe("unlock_room handler (Requirement 14.4, 14.9)", () => {
      let roomWithZones: SpatialRoom;

      beforeEach(() => {
        roomWithZones = createRoom();
        roomWithZones.onCreate({
          mapData: {
            width: 50,
            height: 40,
            tilewidth: 32,
            tileheight: 32,
            layers: [
              {
                name: "Objects",
                type: "objectgroup",
                objects: [
                  {
                    id: 1,
                    name: "sala-1",
                    type: "zone",
                    x: 64,
                    y: 64,
                    width: 160,
                    height: 160,
                    properties: [{ name: "jitsiRoom", type: "string", value: "sala-1" }],
                  },
                ],
              },
            ],
            tilesets: [],
          },
        });
        roomWithZones.onJoin(createMockClient("owner1"), { avatarId: 1, displayName: "Owner" });
        sendMessage(roomWithZones, "claim_room", createMockClient("owner1"), { zoneId: "sala-1" });
        sendMessage(roomWithZones, "lock_room", createMockClient("owner1"), { zoneId: "sala-1" });
      });

      it("should set isLocked to false when owner sends unlock_room", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "unlock_room", client, { zoneId: "sala-1" });

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.isLocked).toBe(false);
      });

      it("should reject unlock_room from non-owner", () => {
        roomWithZones.onJoin(createMockClient("intruder"), { avatarId: 2, displayName: "Intruder" });
        const client = createMockClient("intruder");
        sendMessage(roomWithZones, "unlock_room", client, { zoneId: "sala-1" });

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.isLocked).toBe(true);
      });

      it("should reject unlock_room with invalid zoneId", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "unlock_room", client, { zoneId: "nonexistent" });
        // No error, locked zone stays locked
        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.isLocked).toBe(true);
      });
    });

    describe("set_floor_color handler (Requirements 16.5, 16.6, 16.7, 16.8)", () => {
      let roomWithZones: SpatialRoom;

      beforeEach(() => {
        roomWithZones = createRoom();
        roomWithZones.onCreate({
          mapData: {
            width: 50,
            height: 40,
            tilewidth: 32,
            tileheight: 32,
            layers: [
              {
                name: "Objects",
                type: "objectgroup",
                objects: [
                  {
                    id: 1,
                    name: "sala-1",
                    type: "zone",
                    x: 64,
                    y: 64,
                    width: 160,
                    height: 160,
                    properties: [{ name: "jitsiRoom", type: "string", value: "sala-1" }],
                  },
                ],
              },
            ],
            tilesets: [],
          },
        });
        roomWithZones.onJoin(createMockClient("owner1"), { avatarId: 1, displayName: "Owner" });
        sendMessage(roomWithZones, "claim_room", createMockClient("owner1"), { zoneId: "sala-1" });
      });

      it("should update floorColorIndex when owner sends valid index", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "set_floor_color", client, { zoneId: "sala-1", colorIndex: 5 });

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.floorColorIndex).toBe(5);
      });

      it("should accept colorIndex 0 (minimum valid)", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "set_floor_color", client, { zoneId: "sala-1", colorIndex: 0 });

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.floorColorIndex).toBe(0);
      });

      it("should accept colorIndex 17 (maximum valid)", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "set_floor_color", client, { zoneId: "sala-1", colorIndex: 17 });

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.floorColorIndex).toBe(17);
      });

      it("should reject colorIndex 18 (out of range)", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "set_floor_color", client, { zoneId: "sala-1", colorIndex: 18 });

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.floorColorIndex).toBe(-1); // unchanged
      });

      it("should reject negative colorIndex", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "set_floor_color", client, { zoneId: "sala-1", colorIndex: -1 });

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.floorColorIndex).toBe(-1); // unchanged
      });

      it("should reject non-integer colorIndex (float)", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "set_floor_color", client, { zoneId: "sala-1", colorIndex: 2.5 });

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.floorColorIndex).toBe(-1); // unchanged
      });

      it("should reject non-number colorIndex", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "set_floor_color", client, { zoneId: "sala-1", colorIndex: "5" });

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.floorColorIndex).toBe(-1); // unchanged
      });

      it("should reject set_floor_color from non-owner", () => {
        roomWithZones.onJoin(createMockClient("intruder"), { avatarId: 2, displayName: "Intruder" });
        const client = createMockClient("intruder");
        sendMessage(roomWithZones, "set_floor_color", client, { zoneId: "sala-1", colorIndex: 5 });

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.floorColorIndex).toBe(-1); // unchanged
      });

      it("should reject set_floor_color for nonexistent zone", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "set_floor_color", client, { zoneId: "nonexistent", colorIndex: 5 });
        // No error thrown
      });
    });

    describe("move handler - locked zone rejection (Requirements 14.5, 14.7)", () => {
      let roomWithZones: SpatialRoom;

      beforeEach(() => {
        roomWithZones = createRoom();
        // Add client.send mock
        (roomWithZones as any)._clientSendCalls = [] as any[];
        roomWithZones.onCreate({
          mapData: {
            width: 50,
            height: 40,
            tilewidth: 32,
            tileheight: 32,
            layers: [
              {
                name: "Objects",
                type: "objectgroup",
                objects: [
                  {
                    id: 1,
                    name: "sala-1",
                    type: "zone",
                    x: 64,  // tile x=2
                    y: 64,  // tile y=2
                    width: 160, // 5 tiles
                    height: 160, // 5 tiles
                    properties: [{ name: "jitsiRoom", type: "string", value: "sala-1" }],
                  },
                ],
              },
            ],
            tilesets: [],
          },
        });
        roomWithZones.onJoin(createMockClient("owner1"), { avatarId: 1, displayName: "Owner" });
        roomWithZones.onJoin(createMockClient("visitor"), { avatarId: 2, displayName: "Visitor" });
        sendMessage(roomWithZones, "claim_room", createMockClient("owner1"), { zoneId: "sala-1" });
        sendMessage(roomWithZones, "lock_room", createMockClient("owner1"), { zoneId: "sala-1" });
      });

      it("should reject non-owner movement into locked zone", () => {
        const client = { sessionId: "visitor", send: vi.fn() } as any;
        sendMessage(roomWithZones, "move", client, { x: 3, y: 3, direction: "up", timestamp: Date.now() });

        const player = (roomWithZones as any).state.players.get("visitor");
        expect(player.x).toBe(0); // unchanged
        expect(player.y).toBe(0); // unchanged
      });

      it("should send room_locked notification to rejected client", () => {
        const client = { sessionId: "visitor", send: vi.fn() } as any;
        sendMessage(roomWithZones, "move", client, { x: 3, y: 3, direction: "up", timestamp: Date.now() });

        expect(client.send).toHaveBeenCalledWith("room_locked", { zoneId: "sala-1" });
      });

      it("should allow owner to enter their own locked room", () => {
        const client = createMockClient("owner1");
        sendMessage(roomWithZones, "move", client, { x: 3, y: 3, direction: "up", timestamp: Date.now() });

        const player = (roomWithZones as any).state.players.get("owner1");
        expect(player.x).toBe(3);
        expect(player.y).toBe(3);
      });

      it("should allow movement outside locked zone for non-owner", () => {
        const client = createMockClient("visitor");
        // Position outside the zone (zone is at tiles 2-6, so tile 1 is outside)
        sendMessage(roomWithZones, "move", client, { x: 1, y: 1, direction: "up", timestamp: Date.now() });

        const player = (roomWithZones as any).state.players.get("visitor");
        expect(player.x).toBe(1);
        expect(player.y).toBe(1);
      });

      it("should allow movement into unlocked zone for non-owner", () => {
        // Unlock the room first
        sendMessage(roomWithZones, "unlock_room", createMockClient("owner1"), { zoneId: "sala-1" });

        const client = createMockClient("visitor");
        sendMessage(roomWithZones, "move", client, { x: 3, y: 3, direction: "up", timestamp: Date.now() });

        const player = (roomWithZones as any).state.players.get("visitor");
        expect(player.x).toBe(3);
        expect(player.y).toBe(3);
      });
    });

    describe("Zone initialization on room creation (Requirement 14.9)", () => {
      it("should initialize ZoneStateSchema for all zones from map data", () => {
        const roomWithZones = createRoom();
        roomWithZones.onCreate({
          mapData: {
            width: 50,
            height: 40,
            tilewidth: 32,
            tileheight: 32,
            layers: [
              {
                name: "Objects",
                type: "objectgroup",
                objects: [
                  {
                    id: 1,
                    name: "sala-1",
                    type: "zone",
                    x: 64,
                    y: 64,
                    width: 160,
                    height: 160,
                    properties: [{ name: "jitsiRoom", type: "string", value: "sala-1" }],
                  },
                  {
                    id: 2,
                    name: "sala-2",
                    type: "zone",
                    x: 256,
                    y: 64,
                    width: 160,
                    height: 160,
                    properties: [{ name: "jitsiRoom", type: "string", value: "sala-2" }],
                  },
                ],
              },
            ],
            tilesets: [],
          },
        });

        const zones = (roomWithZones as any).state.zones;
        expect(zones.size).toBe(2);

        const zone1 = zones.get("sala-1");
        expect(zone1).toBeDefined();
        expect(zone1.zoneId).toBe("sala-1");
        expect(zone1.isLocked).toBe(false);
        expect(zone1.ownerSessionId).toBe("");
        expect(zone1.floorColorIndex).toBe(-1);

        const zone2 = zones.get("sala-2");
        expect(zone2).toBeDefined();
        expect(zone2.zoneId).toBe("sala-2");
        expect(zone2.isLocked).toBe(false);
      });

      it("should have empty zones map when no map data provided", () => {
        const roomNoMap = createRoom();
        roomNoMap.onCreate({});

        expect((roomNoMap as any).state.zones.size).toBe(0);
      });

      it("should skip non-zone objects in the map data", () => {
        const roomWithMixed = createRoom();
        roomWithMixed.onCreate({
          mapData: {
            width: 50,
            height: 40,
            tilewidth: 32,
            tileheight: 32,
            layers: [
              {
                name: "Objects",
                type: "objectgroup",
                objects: [
                  {
                    id: 1,
                    name: "sala-1",
                    type: "zone",
                    x: 64,
                    y: 64,
                    width: 160,
                    height: 160,
                    properties: [{ name: "jitsiRoom", type: "string", value: "sala-1" }],
                  },
                  {
                    id: 2,
                    name: "decoration",
                    type: "decoration",
                    x: 0,
                    y: 0,
                    width: 32,
                    height: 32,
                    properties: [],
                  },
                ],
              },
            ],
            tilesets: [],
          },
        });

        expect((roomWithMixed as any).state.zones.size).toBe(1);
      });
    });

    describe("Owner disconnect unlock (Requirement 14.10)", () => {
      let roomWithZones: SpatialRoom;

      beforeEach(() => {
        roomWithZones = createRoom();
        roomWithZones.onCreate({
          mapData: {
            width: 50,
            height: 40,
            tilewidth: 32,
            tileheight: 32,
            layers: [
              {
                name: "Objects",
                type: "objectgroup",
                objects: [
                  {
                    id: 1,
                    name: "sala-1",
                    type: "zone",
                    x: 64,
                    y: 64,
                    width: 160,
                    height: 160,
                    properties: [{ name: "jitsiRoom", type: "string", value: "sala-1" }],
                  },
                ],
              },
            ],
            tilesets: [],
          },
        });
        roomWithZones.onJoin(createMockClient("owner1"), { avatarId: 1, displayName: "Owner" });
        sendMessage(roomWithZones, "claim_room", createMockClient("owner1"), { zoneId: "sala-1" });
        sendMessage(roomWithZones, "lock_room", createMockClient("owner1"), { zoneId: "sala-1" });
      });

      it("should unlock room after RECONNECT_TIMEOUT_MS when owner disconnects and does not reconnect", async () => {
        const client = createMockClient("owner1");
        (roomWithZones as any).allowReconnection.mockRejectedValue(new Error("timeout"));

        await roomWithZones.onLeave(client, false);

        // After onLeave resolves with timeout, the zone should be unlocked
        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.isLocked).toBe(false);
      });

      it("should keep room locked if owner reconnects in time", async () => {
        const client = createMockClient("owner1");
        (roomWithZones as any).allowReconnection.mockResolvedValue(client);

        await roomWithZones.onLeave(client, false);

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.isLocked).toBe(true);
      });

      it("should unlock room immediately on consented leave", async () => {
        const client = createMockClient("owner1");
        await roomWithZones.onLeave(client, true);

        const zoneState = (roomWithZones as any).state.zones.get("sala-1");
        expect(zoneState.isLocked).toBe(false);
      });
    });
  });
});
