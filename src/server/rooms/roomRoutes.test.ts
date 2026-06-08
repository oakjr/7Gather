import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express, { Express } from "express";
import { createServer, Server } from "http";
import { createRoomRouter } from "./roomRoutes";
import { RoomManager } from "./RoomManager";
import { MAX_ROOMS } from "../../shared/constants";

/**
 * Unit tests for room HTTP routes (GET /rooms, POST /rooms, GET /rooms/:id).
 * Requirements: 9.1, 9.2, 9.3, 9.5
 */

describe("roomRoutes", () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;
  let roomManager: RoomManager;

  beforeEach(async () => {
    roomManager = new RoomManager();
    app = express();
    app.use(express.json());
    app.use(createRoomRouter(roomManager));

    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });

    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe("GET /rooms", () => {
    it("should return empty array when no rooms exist", async () => {
      const res = await fetch(`${baseUrl}/rooms`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual([]);
    });

    it("should return all active rooms", async () => {
      roomManager.createRoom({ name: "Room 1" });
      roomManager.createRoom({ name: "Room 2" });

      const res = await fetch(`${baseUrl}/rooms`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe("Room 1");
      expect(body[1].name).toBe("Room 2");
    });
  });

  describe("POST /rooms", () => {
    it("should create a room with valid name", async () => {
      const res = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Engineering" }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("Engineering");
      expect(body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it("should return 400 when name is missing", async () => {
      const res = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("name");
    });

    it("should return 400 when name is empty string", async () => {
      const res = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   " }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain("name");
    });

    it("should return 409 when MAX_ROOMS limit reached", async () => {
      for (let i = 0; i < MAX_ROOMS; i++) {
        roomManager.createRoom({ name: `Room ${i}` });
      }

      const res = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Over limit" }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("maximum");
    });

    it("should trim whitespace from room name", async () => {
      const res = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "  Trimmed  " }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("Trimmed");
    });

    it("should accept custom maxParticipants", async () => {
      const res = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Small Room", maxParticipants: 5 }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.maxParticipants).toBe(5);
    });
  });

  describe("GET /rooms/:id", () => {
    it("should return room details for valid ID", async () => {
      const room = roomManager.createRoom({ name: "Lookup Test" });
      const res = await fetch(`${baseUrl}/rooms/${room.id}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(room.id);
      expect(body.name).toBe("Lookup Test");
    });

    it("should return 404 for non-existent room ID", async () => {
      const res = await fetch(`${baseUrl}/rooms/non-existent-uuid`);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toMatch(/not found/i);
    });

    it("should return 404 for removed room", async () => {
      const room = roomManager.createRoom({ name: "To Remove" });
      roomManager.removeRoom(room.id);

      const res = await fetch(`${baseUrl}/rooms/${room.id}`);
      expect(res.status).toBe(404);
    });
  });
});
