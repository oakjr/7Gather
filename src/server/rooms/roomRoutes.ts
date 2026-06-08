import { Router, Request, Response } from "express";
import { RoomManager } from "./RoomManager";

/**
 * Request body for POST /rooms endpoint.
 */
interface CreateRoomBody {
  name: string;
  maxParticipants?: number;
}

/**
 * Creates an Express router with room management endpoints.
 *
 * GET /rooms
 *   Response: Array of active rooms with id, name, createdAt, participantCount, maxParticipants
 *
 * POST /rooms
 *   Body: { name: string, maxParticipants?: number }
 *   Response: Created room object with unique UUID link
 *   Errors: 400 if name missing, 409 if MAX_ROOMS limit reached
 *
 * Requirements: 9.1, 9.2, 9.3, 9.5
 */
export function createRoomRouter(roomManager: RoomManager): Router {
  const router = Router();

  /**
   * GET /rooms - List all active rooms.
   */
  router.get("/rooms", (_req: Request, res: Response) => {
    const rooms = roomManager.listRooms();
    res.json(rooms);
  });

  /**
   * POST /rooms - Create a new room with a unique UUID link.
   */
  router.post("/rooms", (req: Request, res: Response) => {
    const { name, maxParticipants } = req.body as CreateRoomBody;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({
        error: "Missing required field: name",
      });
      return;
    }

    try {
      const room = roomManager.createRoom({
        name: name.trim(),
        maxParticipants,
      });

      res.status(201).json(room);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to create room";

      // MAX_ROOMS limit reached
      if (message.includes("maximum of")) {
        res.status(409).json({ error: message });
        return;
      }

      res.status(500).json({ error: message });
    }
  });

  /**
   * GET /rooms/:id - Validate that a room exists.
   * Used by clients to check if a room link is valid before joining.
   *
   * Requirement 9.5: Return error if room is non-existent/removed
   */
  router.get("/rooms/:id", (req: Request, res: Response) => {
    const { id } = req.params;
    const room = roomManager.getRoom(id);

    if (!room) {
      res.status(404).json({
        error: "Room not found. The room may not exist or has been removed.",
      });
      return;
    }

    res.json(room);
  });

  return router;
}
