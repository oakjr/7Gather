/**
 * Property-Based Tests: SpatialRoom Server Logic
 *
 * Feature: space-theme-room-decoration
 *
 * Property 8: Locked room access control
 * Property 10: Floor color change validation
 *
 * Uses fast-check with Vitest for property-based testing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { SpatialRoom } from "./SpatialRoom";
import { RoomState } from "../state/RoomState";
import { FLOOR_COLOR_COUNT } from "../../shared/constants";

// === Helpers (matching existing test patterns) ===

function createMockClient(sessionId: string) {
  return {
    sessionId,
    send: vi.fn(),
  } as any;
}

function createRoom(): SpatialRoom {
  const room = Object.create(SpatialRoom.prototype) as SpatialRoom;
  const messageHandlers = new Map<string, Function>();

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

function sendMessage(room: SpatialRoom, type: string, client: any, data?: any) {
  const handlers = (room as any)._messageHandlers as Map<string, Function>;
  const handler = handlers.get(type);
  if (handler) {
    handler(client, data);
  }
}

// === Arbitraries (Generators) ===

/**
 * Generate a valid session ID (alphanumeric, non-empty).
 * Excludes JS prototype property names that break Colyseus MapSchema.
 */
const JS_RESERVED_KEYS = new Set([
  "constructor", "toString", "valueOf", "hasOwnProperty",
  "isPrototypeOf", "propertyIsEnumerable", "toLocaleString",
  "__proto__", "__defineGetter__", "__defineSetter__",
  "__lookupGetter__", "__lookupSetter__",
]);

const sessionIdArb = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  { minLength: 4, maxLength: 12 }
).filter(s => !JS_RESERVED_KEYS.has(s));

/** Generate a pair of distinct session IDs (owner vs non-owner) */
const distinctSessionPairArb = fc.tuple(sessionIdArb, sessionIdArb).filter(
  ([a, b]) => a !== b
);

/** Generate zone bounds within a 50x40 map (tile coordinates) */
const zoneBoundsArb = fc.record({
  x: fc.integer({ min: 2, max: 30 }),
  y: fc.integer({ min: 2, max: 20 }),
  width: fc.integer({ min: 3, max: 10 }),
  height: fc.integer({ min: 3, max: 10 }),
});

/** Generate a valid direction */
const directionArb = fc.constantFrom("up", "down", "left", "right");

// === Room Factory with Configurable Zone ===

function createRoomWithZone(zoneBounds: { x: number; y: number; width: number; height: number }) {
  const room = createRoom();
  const tileWidth = 32;
  const tileHeight = 32;

  room.onCreate({
    mapData: {
      width: 50,
      height: 40,
      tilewidth: tileWidth,
      tileheight: tileHeight,
      layers: [
        {
          name: "Objects",
          type: "objectgroup",
          objects: [
            {
              id: 1,
              name: "test-zone",
              type: "zone",
              x: zoneBounds.x * tileWidth,
              y: zoneBounds.y * tileHeight,
              width: zoneBounds.width * tileWidth,
              height: zoneBounds.height * tileHeight,
              properties: [{ name: "jitsiRoom", type: "string", value: "test-zone" }],
            },
          ],
        },
      ],
      tilesets: [],
    },
  });

  return room;
}

// === Property 8 Tests ===

describe("Property 8: Locked room access control", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * **Validates: Requirements 14.5**
   *
   * Non-owner movement into a locked zone SHALL be rejected with position unchanged.
   */
  it("non-owner movement into a locked zone is rejected with position unchanged", () => {
    fc.assert(
      fc.property(
        distinctSessionPairArb,
        zoneBoundsArb,
        directionArb,
        ([ownerSession, nonOwnerSession], zoneBounds, direction) => {
          const room = createRoomWithZone(zoneBounds);

          // Owner joins and claims the room
          const ownerClient = createMockClient(ownerSession);
          room.onJoin(ownerClient, { avatarId: 1, displayName: "Owner" });
          sendMessage(room, "claim_room", ownerClient, { zoneId: "test-zone" });

          // Non-owner joins
          const nonOwnerClient = createMockClient(nonOwnerSession);
          room.onJoin(nonOwnerClient, { avatarId: 2, displayName: "Visitor" });

          // Owner locks the room
          sendMessage(room, "lock_room", ownerClient, { zoneId: "test-zone" });

          // Capture non-owner's initial position
          const player = (room as any).state.players.get(nonOwnerSession);
          const initialX = player.x;
          const initialY = player.y;

          // Generate a position inside the locked zone
          const targetX = zoneBounds.x + Math.floor(zoneBounds.width / 2);
          const targetY = zoneBounds.y + Math.floor(zoneBounds.height / 2);

          // Non-owner attempts to move into locked zone
          sendMessage(room, "move", nonOwnerClient, {
            x: targetX,
            y: targetY,
            direction,
            timestamp: Date.now(),
          });

          // Position should be unchanged
          expect(player.x).toBe(initialX);
          expect(player.y).toBe(initialY);

          // Clean up timers for this room
          room.onDispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.7**
   *
   * Owner movement into their own locked zone SHALL be allowed.
   */
  it("owner movement into their own locked zone is accepted", () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        zoneBoundsArb,
        directionArb,
        (ownerSession, zoneBounds, direction) => {
          const room = createRoomWithZone(zoneBounds);

          // Owner joins and claims the room
          const ownerClient = createMockClient(ownerSession);
          room.onJoin(ownerClient, { avatarId: 1, displayName: "Owner" });
          sendMessage(room, "claim_room", ownerClient, { zoneId: "test-zone" });

          // Owner locks the room
          sendMessage(room, "lock_room", ownerClient, { zoneId: "test-zone" });

          // Generate a position inside the locked zone
          const targetX = zoneBounds.x + Math.floor(zoneBounds.width / 2);
          const targetY = zoneBounds.y + Math.floor(zoneBounds.height / 2);

          // Owner attempts to move into their own locked zone
          sendMessage(room, "move", ownerClient, {
            x: targetX,
            y: targetY,
            direction,
            timestamp: Date.now(),
          });

          // Position should be updated to target
          const player = (room as any).state.players.get(ownerSession);
          expect(player.x).toBe(targetX);
          expect(player.y).toBe(targetY);

          // Clean up timers for this room
          room.onDispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.5, 14.7**
   *
   * Movement into a locked zone is accepted IFF the sender is the owner.
   */
  it("movement into locked zone accepted iff sender is owner", () => {
    fc.assert(
      fc.property(
        distinctSessionPairArb,
        zoneBoundsArb,
        directionArb,
        fc.boolean(), // true = mover is owner, false = mover is non-owner
        ([sessionA, sessionB], zoneBounds, direction, moverIsOwner) => {
          const room = createRoomWithZone(zoneBounds);

          const ownerSession = sessionA;
          const otherSession = sessionB;

          // Both players join
          const ownerClient = createMockClient(ownerSession);
          const otherClient = createMockClient(otherSession);
          room.onJoin(ownerClient, { avatarId: 1, displayName: "Owner" });
          room.onJoin(otherClient, { avatarId: 2, displayName: "Other" });

          // Owner claims and locks the room
          sendMessage(room, "claim_room", ownerClient, { zoneId: "test-zone" });
          sendMessage(room, "lock_room", ownerClient, { zoneId: "test-zone" });

          // Determine the mover
          const moverSession = moverIsOwner ? ownerSession : otherSession;
          const moverClient = moverIsOwner ? ownerClient : otherClient;

          // Capture initial position
          const player = (room as any).state.players.get(moverSession);
          const initialX = player.x;
          const initialY = player.y;

          // Target inside locked zone
          const targetX = zoneBounds.x + Math.floor(zoneBounds.width / 2);
          const targetY = zoneBounds.y + Math.floor(zoneBounds.height / 2);

          // Attempt to move into locked zone
          sendMessage(room, "move", moverClient, {
            x: targetX,
            y: targetY,
            direction,
            timestamp: Date.now(),
          });

          if (moverIsOwner) {
            // Owner: movement accepted
            expect(player.x).toBe(targetX);
            expect(player.y).toBe(targetY);
          } else {
            // Non-owner: movement rejected, position unchanged
            expect(player.x).toBe(initialX);
            expect(player.y).toBe(initialY);
          }

          // Clean up timers for this room
          room.onDispose();
          return true;
        }
      ),
      { numRuns: 150 }
    );
  });

  /**
   * **Validates: Requirements 14.5**
   *
   * Non-owner receives "room_locked" notification when movement is rejected.
   */
  it("non-owner receives room_locked notification when rejected", () => {
    fc.assert(
      fc.property(
        distinctSessionPairArb,
        zoneBoundsArb,
        directionArb,
        ([ownerSession, nonOwnerSession], zoneBounds, direction) => {
          const room = createRoomWithZone(zoneBounds);

          // Setup: owner claims and locks
          const ownerClient = createMockClient(ownerSession);
          room.onJoin(ownerClient, { avatarId: 1, displayName: "Owner" });
          sendMessage(room, "claim_room", ownerClient, { zoneId: "test-zone" });
          sendMessage(room, "lock_room", ownerClient, { zoneId: "test-zone" });

          // Non-owner joins
          const nonOwnerClient = createMockClient(nonOwnerSession);
          room.onJoin(nonOwnerClient, { avatarId: 2, displayName: "Visitor" });

          // Target inside locked zone
          const targetX = zoneBounds.x + Math.floor(zoneBounds.width / 2);
          const targetY = zoneBounds.y + Math.floor(zoneBounds.height / 2);

          // Non-owner attempts movement
          sendMessage(room, "move", nonOwnerClient, {
            x: targetX,
            y: targetY,
            direction,
            timestamp: Date.now(),
          });

          // Non-owner should receive "room_locked" notification
          expect(nonOwnerClient.send).toHaveBeenCalledWith("room_locked", { zoneId: "test-zone" });

          // Clean up timers for this room
          room.onDispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.5, 14.7**
   *
   * Movement to unlocked zone positions is always allowed regardless of ownership.
   */
  it("movement to unlocked zone is allowed for any player", () => {
    fc.assert(
      fc.property(
        distinctSessionPairArb,
        zoneBoundsArb,
        directionArb,
        ([ownerSession, otherSession], zoneBounds, direction) => {
          const room = createRoomWithZone(zoneBounds);

          // Owner claims but does NOT lock the room
          const ownerClient = createMockClient(ownerSession);
          room.onJoin(ownerClient, { avatarId: 1, displayName: "Owner" });
          sendMessage(room, "claim_room", ownerClient, { zoneId: "test-zone" });

          // Other player joins
          const otherClient = createMockClient(otherSession);
          room.onJoin(otherClient, { avatarId: 2, displayName: "Other" });

          // Target inside zone (which is unlocked)
          const targetX = zoneBounds.x + Math.floor(zoneBounds.width / 2);
          const targetY = zoneBounds.y + Math.floor(zoneBounds.height / 2);

          // Other player moves into zone
          sendMessage(room, "move", otherClient, {
            x: targetX,
            y: targetY,
            direction,
            timestamp: Date.now(),
          });

          // Movement should be accepted (zone is not locked)
          const player = (room as any).state.players.get(otherSession);
          expect(player.x).toBe(targetX);
          expect(player.y).toBe(targetY);

          // Clean up timers for this room
          room.onDispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// === Property 10 Tests ===

describe("Property 10: Floor color change validation", () => {
  // Feature: space-theme-room-decoration, Property 10: Floor color change validation
  // **Validates: Requirements 16.6, 16.7, 16.8**

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Helper: create a room with a zone and set up ownership */
  function createRoomWithOwner(zoneId: string, ownerSessionId: string): SpatialRoom {
    const room = createRoom();
    room.onCreate({
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
                name: zoneId,
                type: "zone",
                x: 64,
                y: 64,
                width: 160,
                height: 160,
                properties: [{ name: "jitsiRoom", type: "string", value: zoneId }],
              },
            ],
          },
        ],
        tilesets: [],
      },
    });
    room.onJoin(createMockClient(ownerSessionId), { avatarId: 1, displayName: "Owner" });
    sendMessage(room, "claim_room", createMockClient(ownerSessionId), { zoneId });
    return room;
  }

  /**
   * **Validates: Requirements 16.6, 16.7, 16.8**
   *
   * Floor color change is accepted if and only if sender is owner AND index is integer in 0-17.
   * All other messages are rejected with no state modification.
   */
  it("should accept floor color change iff sender is owner AND index is integer in 0-17", () => {
    fc.assert(
      fc.property(
        // Owner session ID
        sessionIdArb,
        // Sender session ID (may or may not be owner)
        sessionIdArb,
        // Color index value: mix of valid and invalid
        fc.oneof(
          // Valid integer indices 0-17
          fc.integer({ min: 0, max: 17 }),
          // Invalid: negative integers
          fc.integer({ min: -100, max: -1 }),
          // Invalid: integers above 17
          fc.integer({ min: 18, max: 200 }),
          // Invalid: floats (non-integer numbers)
          fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true })
            .filter((n) => !Number.isInteger(n))
        ),
        (ownerSessionId, senderSessionId, colorIndex) => {
          const zoneId = "test-zone";
          const room = createRoomWithOwner(zoneId, ownerSessionId);

          // If sender is different from owner, join them too
          if (senderSessionId !== ownerSessionId) {
            room.onJoin(createMockClient(senderSessionId), { avatarId: 2, displayName: "Other" });
          }

          // Get initial floor color state
          const zoneState = (room as any).state.zones.get(zoneId);
          const initialColor = zoneState.floorColorIndex;

          // Send set_floor_color message
          const client = createMockClient(senderSessionId);
          sendMessage(room, "set_floor_color", client, { zoneId, colorIndex });

          // Determine expected outcome
          const isOwner = senderSessionId === ownerSessionId;
          const isValidIndex =
            typeof colorIndex === "number" &&
            Number.isInteger(colorIndex) &&
            colorIndex >= 0 &&
            colorIndex < FLOOR_COLOR_COUNT;
          const shouldAccept = isOwner && isValidIndex;

          if (shouldAccept) {
            expect(zoneState.floorColorIndex).toBe(colorIndex);
          } else {
            expect(zoneState.floorColorIndex).toBe(initialColor);
          }

          room.onDispose();
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });

  /**
   * **Validates: Requirements 16.7**
   *
   * Non-owner requests are always rejected, regardless of color index validity.
   */
  it("should reject all non-owner requests regardless of color index validity", () => {
    fc.assert(
      fc.property(
        // Ensure owner and sender are distinct
        distinctSessionPairArb,
        // Valid color index to prove even valid indices are rejected for non-owners
        fc.integer({ min: 0, max: 17 }),
        ([ownerSessionId, nonOwnerSessionId], colorIndex) => {
          const zoneId = "test-zone";
          const room = createRoomWithOwner(zoneId, ownerSessionId);
          room.onJoin(createMockClient(nonOwnerSessionId), { avatarId: 2, displayName: "NonOwner" });

          const zoneState = (room as any).state.zones.get(zoneId);
          const initialColor = zoneState.floorColorIndex;

          // Non-owner sends valid color index - should be rejected
          const client = createMockClient(nonOwnerSessionId);
          sendMessage(room, "set_floor_color", client, { zoneId, colorIndex });

          expect(zoneState.floorColorIndex).toBe(initialColor);

          room.onDispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 16.6**
   *
   * Owner can set any valid integer index from 0-17 and the state is updated.
   */
  it("should accept all valid integer indices 0-17 from the owner", () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.integer({ min: 0, max: 17 }),
        (ownerSessionId, colorIndex) => {
          const zoneId = "test-zone";
          const room = createRoomWithOwner(zoneId, ownerSessionId);

          const client = createMockClient(ownerSessionId);
          sendMessage(room, "set_floor_color", client, { zoneId, colorIndex });

          const zoneState = (room as any).state.zones.get(zoneId);
          expect(zoneState.floorColorIndex).toBe(colorIndex);

          room.onDispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 16.8**
   *
   * Out-of-range and non-integer indices are rejected even from the owner.
   */
  it("should reject all out-of-range indices from the owner (negative, >17, floats)", () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.oneof(
          // Negative integers
          fc.integer({ min: -1000, max: -1 }),
          // Integers above valid range
          fc.integer({ min: 18, max: 1000 }),
          // Non-integer floats
          fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true })
            .filter((n) => !Number.isInteger(n))
        ),
        (ownerSessionId, invalidIndex) => {
          const zoneId = "test-zone";
          const room = createRoomWithOwner(zoneId, ownerSessionId);

          const zoneState = (room as any).state.zones.get(zoneId);
          const initialColor = zoneState.floorColorIndex;

          const client = createMockClient(ownerSessionId);
          sendMessage(room, "set_floor_color", client, { zoneId, colorIndex: invalidIndex });

          // Should remain unchanged
          expect(zoneState.floorColorIndex).toBe(initialColor);

          room.onDispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
