import { randomUUID } from "crypto";
import { MAX_ROOMS } from "../../shared/constants";

/**
 * Represents a managed room with metadata.
 */
export interface ManagedRoom {
  /** Unique room identifier (UUID) */
  id: string;
  /** Human-readable room name */
  name: string;
  /** Timestamp of room creation */
  createdAt: Date;
  /** Current number of connected participants */
  participantCount: number;
  /** Maximum allowed participants for this room */
  maxParticipants: number;
}

/**
 * Options for creating a new room.
 */
export interface CreateRoomOptions {
  name: string;
  maxParticipants?: number;
}

/**
 * RoomManager handles registration, lookup, and lifecycle of active rooms.
 * Enforces a maximum of MAX_ROOMS (50) simultaneous rooms.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */
export class RoomManager {
  private rooms: Map<string, ManagedRoom> = new Map();

  /**
   * Creates a new room with a unique UUID-based link.
   * Enforces the MAX_ROOMS limit.
   *
   * @param options - Room creation options (name, optional maxParticipants)
   * @returns The created ManagedRoom
   * @throws Error if MAX_ROOMS limit is reached
   */
  createRoom(options: CreateRoomOptions): ManagedRoom {
    if (this.rooms.size >= MAX_ROOMS) {
      throw new Error(
        `Cannot create room: maximum of ${MAX_ROOMS} simultaneous rooms reached`
      );
    }

    const id = randomUUID();
    const room: ManagedRoom = {
      id,
      name: options.name,
      createdAt: new Date(),
      participantCount: 0,
      maxParticipants: options.maxParticipants ?? 20,
    };

    this.rooms.set(id, room);
    return room;
  }

  /**
   * Returns a room by its ID, or undefined if not found.
   *
   * @param id - Room UUID
   */
  getRoom(id: string): ManagedRoom | undefined {
    return this.rooms.get(id);
  }

  /**
   * Returns whether a room with the given ID exists.
   *
   * @param id - Room UUID
   */
  hasRoom(id: string): boolean {
    return this.rooms.has(id);
  }

  /**
   * Lists all active rooms.
   */
  listRooms(): ManagedRoom[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Removes a room by its ID.
   *
   * @param id - Room UUID
   * @returns true if room was removed, false if it didn't exist
   */
  removeRoom(id: string): boolean {
    return this.rooms.delete(id);
  }

  /**
   * Updates the participant count for a room.
   *
   * @param id - Room UUID
   * @param count - New participant count
   */
  updateParticipantCount(id: string, count: number): void {
    const room = this.rooms.get(id);
    if (room) {
      room.participantCount = count;
    }
  }

  /**
   * Returns the current number of active rooms.
   */
  getRoomCount(): number {
    return this.rooms.size;
  }
}
