import { describe, it, expect, beforeEach } from "vitest";
import { RoomManager } from "./RoomManager";
import { MAX_ROOMS } from "../../shared/constants";

describe("RoomManager", () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  describe("createRoom", () => {
    it("should create a room with a UUID id", () => {
      const room = manager.createRoom({ name: "Team Alpha" });

      expect(room.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it("should create a room with the given name", () => {
      const room = manager.createRoom({ name: "Engineering" });
      expect(room.name).toBe("Engineering");
    });

    it("should default maxParticipants to 20", () => {
      const room = manager.createRoom({ name: "Test" });
      expect(room.maxParticipants).toBe(20);
    });

    it("should use provided maxParticipants", () => {
      const room = manager.createRoom({ name: "Test", maxParticipants: 10 });
      expect(room.maxParticipants).toBe(10);
    });

    it("should initialize participantCount to 0", () => {
      const room = manager.createRoom({ name: "Test" });
      expect(room.participantCount).toBe(0);
    });

    it("should set createdAt to a valid date", () => {
      const before = new Date();
      const room = manager.createRoom({ name: "Test" });
      const after = new Date();

      expect(room.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(room.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should generate unique IDs for each room", () => {
      const room1 = manager.createRoom({ name: "Room 1" });
      const room2 = manager.createRoom({ name: "Room 2" });
      expect(room1.id).not.toBe(room2.id);
    });

    it("should throw when MAX_ROOMS limit is reached", () => {
      for (let i = 0; i < MAX_ROOMS; i++) {
        manager.createRoom({ name: `Room ${i}` });
      }

      expect(() => manager.createRoom({ name: "One too many" })).toThrow(
        `Cannot create room: maximum of ${MAX_ROOMS} simultaneous rooms reached`
      );
    });
  });

  describe("getRoom", () => {
    it("should return a room by ID", () => {
      const created = manager.createRoom({ name: "Lookup Test" });
      const found = manager.getRoom(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.name).toBe("Lookup Test");
    });

    it("should return undefined for non-existent ID", () => {
      const found = manager.getRoom("non-existent-id");
      expect(found).toBeUndefined();
    });
  });

  describe("hasRoom", () => {
    it("should return true for existing room", () => {
      const room = manager.createRoom({ name: "Test" });
      expect(manager.hasRoom(room.id)).toBe(true);
    });

    it("should return false for non-existent room", () => {
      expect(manager.hasRoom("fake-id")).toBe(false);
    });
  });

  describe("listRooms", () => {
    it("should return empty array when no rooms exist", () => {
      expect(manager.listRooms()).toEqual([]);
    });

    it("should return all active rooms", () => {
      manager.createRoom({ name: "Room A" });
      manager.createRoom({ name: "Room B" });
      manager.createRoom({ name: "Room C" });

      const rooms = manager.listRooms();
      expect(rooms).toHaveLength(3);

      const names = rooms.map((r) => r.name);
      expect(names).toContain("Room A");
      expect(names).toContain("Room B");
      expect(names).toContain("Room C");
    });
  });

  describe("removeRoom", () => {
    it("should remove an existing room and return true", () => {
      const room = manager.createRoom({ name: "To Remove" });
      const result = manager.removeRoom(room.id);

      expect(result).toBe(true);
      expect(manager.hasRoom(room.id)).toBe(false);
    });

    it("should return false when removing non-existent room", () => {
      expect(manager.removeRoom("fake-id")).toBe(false);
    });

    it("should allow creating a new room after removing one at limit", () => {
      for (let i = 0; i < MAX_ROOMS; i++) {
        manager.createRoom({ name: `Room ${i}` });
      }

      const rooms = manager.listRooms();
      manager.removeRoom(rooms[0].id);

      expect(() => manager.createRoom({ name: "New room" })).not.toThrow();
    });
  });

  describe("updateParticipantCount", () => {
    it("should update the participant count of a room", () => {
      const room = manager.createRoom({ name: "Test" });
      manager.updateParticipantCount(room.id, 5);

      expect(manager.getRoom(room.id)!.participantCount).toBe(5);
    });

    it("should do nothing for a non-existent room", () => {
      // Should not throw
      manager.updateParticipantCount("non-existent", 10);
    });
  });

  describe("getRoomCount", () => {
    it("should return 0 when no rooms exist", () => {
      expect(manager.getRoomCount()).toBe(0);
    });

    it("should return the number of active rooms", () => {
      manager.createRoom({ name: "A" });
      manager.createRoom({ name: "B" });
      expect(manager.getRoomCount()).toBe(2);
    });
  });
});
