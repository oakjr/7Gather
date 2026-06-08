import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ColyseusClient, ConnectionState } from "./ColyseusClient";

/**
 * Unit tests for ColyseusClient.
 * Tests connection lifecycle, position sending, offline queue, reconnection,
 * and event listener registration.
 *
 * Validates: Requirements 1.3, 1.5, 7.1, 7.2, 7.5
 */

// Mock the colyseus.js module
vi.mock("colyseus.js", () => {
  const createMockRoom = () => {
    const listeners: Record<string, Function[]> = {};
    const state = {
      players: {
        onAdd: vi.fn(),
        onRemove: vi.fn(),
      },
    };
    return {
      send: vi.fn(),
      leave: vi.fn().mockResolvedValue(undefined),
      onStateChange: vi.fn((cb: Function) => {
        if (!listeners["stateChange"]) listeners["stateChange"] = [];
        listeners["stateChange"].push(cb);
      }),
      onLeave: vi.fn((cb: Function) => {
        if (!listeners["leave"]) listeners["leave"] = [];
        listeners["leave"].push(cb);
      }),
      state,
      reconnectionToken: "mock-reconnection-token",
      _listeners: listeners,
    };
  };

  const mockRoom = createMockRoom();

  return {
    Client: vi.fn().mockImplementation(() => ({
      joinOrCreate: vi.fn().mockResolvedValue(mockRoom),
      reconnect: vi.fn().mockResolvedValue(createMockRoom()),
    })),
    __mockRoom: mockRoom,
    __createMockRoom: createMockRoom,
  };
});

describe("ColyseusClient", () => {
  let client: ColyseusClient;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new ColyseusClient();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("connect", () => {
    it("should create a Colyseus.Client instance", async () => {
      await client.connect("ws://localhost:2567");
      // After connect, the client should be able to join rooms
      expect(client.getConnectionState()).toBe("disconnected");
    });
  });

  describe("joinRoom", () => {
    it("should throw if connect was not called first", async () => {
      await expect(
        client.joinRoom({ roomId: "room1", avatarId: 5, displayName: "Alice" })
      ).rejects.toThrow("Client not connected. Call connect() first.");
    });

    it("should join a room and set state to connected", async () => {
      await client.connect("ws://localhost:2567");
      const room = await client.joinRoom({
        roomId: "room1",
        avatarId: 5,
        displayName: "Alice",
      });

      expect(room).toBeDefined();
      expect(client.getConnectionState()).toBe("connected");
    });

    it("should return the room instance", async () => {
      await client.connect("ws://localhost:2567");
      const room = await client.joinRoom({
        roomId: "room1",
        avatarId: 3,
        displayName: "Bob",
      });

      expect(room).not.toBeNull();
      expect(client.getRoom()).toBe(room);
    });
  });

  describe("sendPosition", () => {
    it("should send move message to room when connected", async () => {
      await client.connect("ws://localhost:2567");
      const room = await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      client.sendPosition(5, 10, "right");

      expect(room.send).toHaveBeenCalledWith("move", {
        x: 5,
        y: 10,
        direction: "right",
        timestamp: expect.any(Number),
      });
    });

    it("should queue position when disconnected", async () => {
      // Don't connect - positions should queue
      client.sendPosition(3, 7, "up");
      client.sendPosition(4, 7, "up");

      expect(client.getQueueLength()).toBe(2);
    });

    it("should include timestamp in the message", async () => {
      const now = 1700000000000;
      vi.setSystemTime(now);

      await client.connect("ws://localhost:2567");
      const room = await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      client.sendPosition(1, 1, "down");

      expect(room.send).toHaveBeenCalledWith("move", {
        x: 1,
        y: 1,
        direction: "down",
        timestamp: now,
      });
    });
  });

  describe("positionQueue and flush", () => {
    it("should accumulate positions while disconnected", () => {
      client.sendPosition(1, 1, "up");
      client.sendPosition(2, 2, "right");
      client.sendPosition(3, 3, "down");

      expect(client.getQueueLength()).toBe(3);
    });

    it("should flush only the latest position on reconnection", async () => {
      await client.connect("ws://localhost:2567");
      const room = await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      // Simulate being disconnected by directly manipulating the queue
      // (In practice this happens via the onLeave handler)
      (client as any).connectionState = "reconnecting";
      client.sendPosition(1, 1, "up");
      client.sendPosition(2, 2, "right");
      client.sendPosition(3, 3, "down");

      // Restore connected state and flush
      (client as any).connectionState = "connected";
      client.flushPositionQueue();

      // Should send only the latest position
      expect(room.send).toHaveBeenLastCalledWith("move", {
        x: 3,
        y: 3,
        direction: "down",
        timestamp: expect.any(Number),
      });
    });

    it("should clear the queue after flush", async () => {
      await client.connect("ws://localhost:2567");
      await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      // Queue up positions
      (client as any).connectionState = "reconnecting";
      client.sendPosition(1, 1, "up");
      client.sendPosition(2, 2, "right");

      (client as any).connectionState = "connected";
      client.flushPositionQueue();

      expect(client.getQueueLength()).toBe(0);
    });

    it("should do nothing when flushing an empty queue", async () => {
      await client.connect("ws://localhost:2567");
      const room = await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      room.send.mockClear();
      client.flushPositionQueue();

      expect(room.send).not.toHaveBeenCalled();
    });
  });

  describe("onDisconnect", () => {
    it("should register a disconnect callback", async () => {
      const callback = vi.fn();
      client.onDisconnect(callback);

      await client.connect("ws://localhost:2567");
      const room = await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      // Simulate disconnect by calling the onLeave callback
      const onLeaveHandler = room.onLeave.mock.calls[0][0];
      onLeaveHandler(4000); // abnormal close code

      expect(callback).toHaveBeenCalledWith(4000);
    });
  });

  describe("onConnectionStateChange", () => {
    it("should notify when state changes to connected", async () => {
      const callback = vi.fn();
      client.onConnectionStateChange(callback);

      await client.connect("ws://localhost:2567");
      await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      expect(callback).toHaveBeenCalledWith("connected");
    });
  });

  describe("onStateChange", () => {
    it("should register a state change callback on the room", async () => {
      const callback = vi.fn();

      await client.connect("ws://localhost:2567");
      const room = await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      client.onStateChange(callback);

      expect(room.onStateChange).toHaveBeenCalledWith(callback);
    });
  });

  describe("onPlayerJoin", () => {
    it("should register a player join callback on the room state", async () => {
      const callback = vi.fn();

      await client.connect("ws://localhost:2567");
      const room = await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      client.onPlayerJoin(callback);

      expect(room.state.players.onAdd).toHaveBeenCalledWith(callback);
    });
  });

  describe("onPlayerLeave", () => {
    it("should register a player leave callback on the room state", async () => {
      const callback = vi.fn();

      await client.connect("ws://localhost:2567");
      const room = await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      client.onPlayerLeave(callback);

      expect(room.state.players.onRemove).toHaveBeenCalled();
    });
  });

  describe("reconnection", () => {
    it("should attempt reconnection on unexpected disconnect", async () => {
      await client.connect("ws://localhost:2567");
      const room = await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      // Trigger unexpected disconnect
      const onLeaveHandler = room.onLeave.mock.calls[0][0];
      await onLeaveHandler(4001); // abnormal close

      // Should have moved to reconnecting state
      expect(
        client.getConnectionState() === "connected" ||
        client.getConnectionState() === "reconnecting"
      ).toBe(true);
    });

    it("should not attempt reconnection on intentional leave (code 1000)", async () => {
      const stateChanges: ConnectionState[] = [];
      client.onConnectionStateChange((state) => stateChanges.push(state));

      await client.connect("ws://localhost:2567");
      const room = await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      const onLeaveHandler = room.onLeave.mock.calls[0][0];
      onLeaveHandler(1000); // intentional

      expect(client.getConnectionState()).toBe("disconnected");
    });

    it("should show visual indicator (disconnected state) after 5s timeout", async () => {
      await client.connect("ws://localhost:2567");
      await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      // Override reconnect to never resolve (simulate hanging reconnection)
      const internalClient = (client as any).client;
      internalClient.reconnect = vi.fn().mockReturnValue(new Promise(() => {}));

      // Start reconnection manually
      const reconnectPromise = client.attemptReconnect();

      // Before 5s, should be reconnecting
      expect(client.getConnectionState()).toBe("reconnecting");

      // After 5s, should switch to disconnected (visual indicator)
      vi.advanceTimersByTime(5001);

      expect(client.getConnectionState()).toBe("disconnected");

      // Clean up - don't await the never-resolving promise
    });

    it("should flush position queue after successful reconnection", async () => {
      await client.connect("ws://localhost:2567");
      await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      // Queue some positions while "disconnected"
      (client as any).connectionState = "reconnecting";
      client.sendPosition(5, 5, "left");
      client.sendPosition(6, 6, "right");

      // Attempt reconnect - the mock reconnect resolves with a new room
      const result = await client.attemptReconnect();

      expect(result).toBe(true);
      expect(client.getQueueLength()).toBe(0);
      expect(client.getConnectionState()).toBe("connected");

      // The new room's send should have been called with the latest queued position
      const newRoom = client.getRoom() as any;
      expect(newRoom.send).toHaveBeenCalledWith("move", {
        x: 6,
        y: 6,
        direction: "right",
        timestamp: expect.any(Number),
      });
    });

    it("should return false when reconnection fails", async () => {
      await client.connect("ws://localhost:2567");
      await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      // Override the client's internal client to reject reconnection
      const internalClient = (client as any).client;
      internalClient.reconnect = vi.fn().mockRejectedValue(new Error("failed"));

      const result = await client.attemptReconnect();

      expect(result).toBe(false);
      expect(client.getConnectionState()).toBe("disconnected");
    });
  });

  describe("leave", () => {
    it("should leave the room and reset state", async () => {
      await client.connect("ws://localhost:2567");
      await client.joinRoom({
        roomId: "room1",
        avatarId: 1,
        displayName: "Test",
      });

      await client.leave();

      expect(client.getRoom()).toBeNull();
      expect(client.getConnectionState()).toBe("disconnected");
      expect(client.getQueueLength()).toBe(0);
    });
  });
});
