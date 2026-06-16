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


// === Property 7 Tests (Feature: room-ux-improvements) ===

describe("Feature: room-ux-improvements, Property 7: Room lock authorization and movement rejection", () => {
  /**
   * **Validates: Requirements 7.7, 7.8**
   *
   * For any move message targeting a tile inside a locked zone, the server SHALL accept
   * the move if and only if the sender is the zone owner. Non-owner moves SHALL be
   * rejected with position unchanged.
   */

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("movement into locked zone accepted iff sender is zone owner; non-owner position unchanged", () => {
    fc.assert(
      fc.property(
        // Whether the mover is the zone owner
        fc.boolean(),
        // Two distinct session IDs
        distinctSessionPairArb,
        // Zone bounds
        zoneBoundsArb,
        // Direction for the move
        directionArb,
        // Target offset within zone (ensure position is inside zone)
        fc.record({
          dx: fc.integer({ min: 1, max: 5 }),
          dy: fc.integer({ min: 1, max: 5 }),
        }),
        (senderIsOwner, [sessionA, sessionB], zoneBounds, direction, offset) => {
          // Clamp offsets to be within zone bounds
          const dx = Math.min(offset.dx, zoneBounds.width - 1);
          const dy = Math.min(offset.dy, zoneBounds.height - 1);

          const room = createRoomWithZone(zoneBounds);

          const ownerSession = sessionA;
          const otherSession = sessionB;

          // Both join
          const ownerClient = createMockClient(ownerSession);
          const otherClient = createMockClient(otherSession);
          room.onJoin(ownerClient, { avatarId: 1, displayName: "Owner" });
          room.onJoin(otherClient, { avatarId: 2, displayName: "Visitor" });

          // Owner claims and locks the zone
          sendMessage(room, "claim_room", ownerClient, { zoneId: "test-zone" });
          sendMessage(room, "lock_room", ownerClient, { zoneId: "test-zone" });

          // Determine which player attempts the move
          const moverSession = senderIsOwner ? ownerSession : otherSession;
          const moverClient = senderIsOwner ? ownerClient : otherClient;

          // Capture initial position
          const player = (room as any).state.players.get(moverSession);
          const initialX = player.x;
          const initialY = player.y;

          // Target inside the locked zone
          const targetX = zoneBounds.x + dx;
          const targetY = zoneBounds.y + dy;

          // Attempt move into locked zone
          sendMessage(room, "move", moverClient, {
            x: targetX,
            y: targetY,
            direction,
            timestamp: Date.now(),
          });

          if (senderIsOwner) {
            // Owner: movement accepted (Requirement 7.8)
            expect(player.x).toBe(targetX);
            expect(player.y).toBe(targetY);
          } else {
            // Non-owner: movement rejected, position unchanged (Requirement 7.7)
            expect(player.x).toBe(initialX);
            expect(player.y).toBe(initialY);
          }

          room.onDispose();
          return true;
        }
      ),
      { numRuns: 150 }
    );
  });

  it("non-owner receives room_locked notification when move is rejected (Requirement 7.7)", () => {
    fc.assert(
      fc.property(
        distinctSessionPairArb,
        zoneBoundsArb,
        directionArb,
        fc.record({
          dx: fc.integer({ min: 1, max: 5 }),
          dy: fc.integer({ min: 1, max: 5 }),
        }),
        ([ownerSession, nonOwnerSession], zoneBounds, direction, offset) => {
          const dx = Math.min(offset.dx, zoneBounds.width - 1);
          const dy = Math.min(offset.dy, zoneBounds.height - 1);

          const room = createRoomWithZone(zoneBounds);

          // Owner joins, claims and locks
          const ownerClient = createMockClient(ownerSession);
          room.onJoin(ownerClient, { avatarId: 1, displayName: "Owner" });
          sendMessage(room, "claim_room", ownerClient, { zoneId: "test-zone" });
          sendMessage(room, "lock_room", ownerClient, { zoneId: "test-zone" });

          // Non-owner joins
          const nonOwnerClient = createMockClient(nonOwnerSession);
          room.onJoin(nonOwnerClient, { avatarId: 2, displayName: "Visitor" });

          // Target inside the locked zone
          const targetX = zoneBounds.x + dx;
          const targetY = zoneBounds.y + dy;

          // Non-owner attempts move
          sendMessage(room, "move", nonOwnerClient, {
            x: targetX,
            y: targetY,
            direction,
            timestamp: Date.now(),
          });

          // Should receive room_locked notification with zoneId
          expect(nonOwnerClient.send).toHaveBeenCalledWith("room_locked", { zoneId: "test-zone" });

          room.onDispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("owner does NOT receive room_locked notification when moving into own locked zone (Requirement 7.8)", () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        zoneBoundsArb,
        directionArb,
        fc.record({
          dx: fc.integer({ min: 1, max: 5 }),
          dy: fc.integer({ min: 1, max: 5 }),
        }),
        (ownerSession, zoneBounds, direction, offset) => {
          const dx = Math.min(offset.dx, zoneBounds.width - 1);
          const dy = Math.min(offset.dy, zoneBounds.height - 1);

          const room = createRoomWithZone(zoneBounds);

          // Owner joins, claims and locks
          const ownerClient = createMockClient(ownerSession);
          room.onJoin(ownerClient, { avatarId: 1, displayName: "Owner" });
          sendMessage(room, "claim_room", ownerClient, { zoneId: "test-zone" });
          sendMessage(room, "lock_room", ownerClient, { zoneId: "test-zone" });

          // Clear any prior send calls from setup
          ownerClient.send.mockClear();

          // Target inside the locked zone
          const targetX = zoneBounds.x + dx;
          const targetY = zoneBounds.y + dy;

          // Owner moves into own locked zone
          sendMessage(room, "move", ownerClient, {
            x: targetX,
            y: targetY,
            direction,
            timestamp: Date.now(),
          });

          // Owner should NOT receive room_locked notification
          const roomLockedCalls = ownerClient.send.mock.calls.filter(
            (call: any[]) => call[0] === "room_locked"
          );
          expect(roomLockedCalls).toHaveLength(0);

          // Position should be updated
          const player = (room as any).state.players.get(ownerSession);
          expect(player.x).toBe(targetX);
          expect(player.y).toBe(targetY);

          room.onDispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// === Property 6 Tests (Feature: room-ux-improvements) ===

describe("Feature: room-ux-improvements, Property 6: Floor color owner authorization", () => {
  /**
   * **Validates: Requirements 6.4, 6.6**
   *
   * For any `set_floor_color` message, the server SHALL accept the message if and only if
   * the sender's sessionId matches the zone's ownerSessionId AND the colorIndex is an integer
   * in [0, 17]. Otherwise the zone state SHALL remain unchanged.
   */

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Helper: create a room with a zone and set up ownership */
  function setupRoomWithOwner(ownerSessionId: string) {
    const room = createRoom();
    const zoneId = "test-zone";

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

    const ownerClient = createMockClient(ownerSessionId);
    room.onJoin(ownerClient, { avatarId: 1, displayName: "Owner" });
    sendMessage(room, "claim_room", ownerClient, { zoneId });

    return { room, zoneId };
  }

  it("accepts set_floor_color iff sender is owner AND colorIndex ∈ [0, 17]; otherwise zone unchanged", () => {
    fc.assert(
      fc.property(
        // Whether the sender is the owner or not
        fc.boolean(),
        // Two distinct session IDs for owner and non-owner
        distinctSessionPairArb,
        // Color index: mix of valid and invalid values
        fc.oneof(
          { weight: 5, arbitrary: fc.integer({ min: 0, max: 17 }) },           // valid
          { weight: 2, arbitrary: fc.integer({ min: -100, max: -1 }) },         // invalid: negative
          { weight: 2, arbitrary: fc.integer({ min: 18, max: 200 }) },          // invalid: above range
          { weight: 1, arbitrary: fc.double({ min: -50, max: 50, noNaN: true, noDefaultInfinity: true })
            .filter((n) => !Number.isInteger(n)) }                              // invalid: non-integer
        ),
        (senderIsOwner, [ownerSession, otherSession], colorIndex) => {
          const { room, zoneId } = setupRoomWithOwner(ownerSession);

          // If sender is not the owner, join non-owner
          const senderSession = senderIsOwner ? ownerSession : otherSession;
          if (!senderIsOwner) {
            room.onJoin(createMockClient(otherSession), { avatarId: 2, displayName: "NonOwner" });
          }

          // Capture initial state
          const zoneState = (room as any).state.zones.get(zoneId);
          const initialFloorColor = zoneState.floorColorIndex;

          // Send set_floor_color
          const senderClient = createMockClient(senderSession);
          sendMessage(room, "set_floor_color", senderClient, { zoneId, colorIndex });

          // Determine expected outcome
          const isValidIndex =
            typeof colorIndex === "number" &&
            Number.isInteger(colorIndex) &&
            colorIndex >= 0 &&
            colorIndex < FLOOR_COLOR_COUNT; // FLOOR_COLOR_COUNT = 18, so valid range is [0, 17]

          const shouldAccept = senderIsOwner && isValidIndex;

          if (shouldAccept) {
            // Zone floorColorIndex updated to colorIndex
            expect(zoneState.floorColorIndex).toBe(colorIndex);
          } else {
            // Zone floorColorIndex unchanged
            expect(zoneState.floorColorIndex).toBe(initialFloorColor);
          }

          room.onDispose();
          return true;
        }
      ),
      { numRuns: 150 }
    );
  });

  it("non-owner with valid colorIndex is always rejected (Requirement 6.4)", () => {
    fc.assert(
      fc.property(
        distinctSessionPairArb,
        fc.integer({ min: 0, max: 17 }),
        ([ownerSession, nonOwnerSession], colorIndex) => {
          const { room, zoneId } = setupRoomWithOwner(ownerSession);

          // Non-owner joins
          room.onJoin(createMockClient(nonOwnerSession), { avatarId: 2, displayName: "Intruder" });

          const zoneState = (room as any).state.zones.get(zoneId);
          const initialFloorColor = zoneState.floorColorIndex;

          // Non-owner sends a perfectly valid color index
          const client = createMockClient(nonOwnerSession);
          sendMessage(room, "set_floor_color", client, { zoneId, colorIndex });

          // Should be rejected — state unchanged
          expect(zoneState.floorColorIndex).toBe(initialFloorColor);

          room.onDispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("owner with invalid colorIndex is rejected (Requirement 6.6)", () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        fc.oneof(
          fc.integer({ min: -500, max: -1 }),
          fc.integer({ min: 18, max: 500 }),
          fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true })
            .filter((n) => !Number.isInteger(n))
        ),
        (ownerSession, invalidColorIndex) => {
          const { room, zoneId } = setupRoomWithOwner(ownerSession);

          const zoneState = (room as any).state.zones.get(zoneId);
          const initialFloorColor = zoneState.floorColorIndex;

          // Owner sends invalid index
          const client = createMockClient(ownerSession);
          sendMessage(room, "set_floor_color", client, { zoneId, colorIndex: invalidColorIndex });

          // Should be rejected — state unchanged
          expect(zoneState.floorColorIndex).toBe(initialFloorColor);

          room.onDispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});


// === Property 8 Tests (Feature: room-ux-improvements) - Room Reset Atomicity ===

describe("Feature: room-ux-improvements, Property 8: Room reset atomically clears all zone properties", () => {
  /**
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.6**
   *
   * For any valid `release_room` message from the zone owner, the resulting zone state
   * SHALL have `isLocked = false`, `floorColorIndex = -1`, and `ownerSessionId = ""`.
   * For any `release_room` from a non-owner, the zone state SHALL remain unchanged.
   */

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Valid floor color index in range [0, 17] */
  const validColorIndexArb = fc.integer({ min: 0, max: 17 });

  /**
   * Helper: create a room with a zone, an owner who claims/locks/colors it.
   * Returns the room with the zone in a fully configured state.
   */
  function setupOwnedZone(ownerSessionId: string, colorIndex: number, locked: boolean) {
    const room = createRoomWithZone({ x: 3, y: 3, width: 5, height: 5 });

    const ownerClient = createMockClient(ownerSessionId);
    room.onJoin(ownerClient, { avatarId: 1, displayName: "Owner" });
    sendMessage(room, "claim_room", ownerClient, { zoneId: "test-zone" });

    // Set floor color
    sendMessage(room, "set_floor_color", ownerClient, { zoneId: "test-zone", colorIndex });

    // Lock if requested
    if (locked) {
      sendMessage(room, "lock_room", ownerClient, { zoneId: "test-zone" });
    }

    return room;
  }

  it("owner release_room clears all three zone properties atomically (Requirements 8.1, 8.2, 8.3)", () => {
    fc.assert(
      fc.property(
        sessionIdArb,
        validColorIndexArb,
        fc.boolean(), // whether zone is locked before release
        (ownerSession, colorIndex, isLocked) => {
          const room = setupOwnedZone(ownerSession, colorIndex, isLocked);

          // Verify zone is in configured state before release
          const zoneState = (room as any).state.zones.get("test-zone");
          expect(zoneState.ownerSessionId).toBe(ownerSession);
          expect(zoneState.floorColorIndex).toBe(colorIndex);
          if (isLocked) {
            expect(zoneState.isLocked).toBe(true);
          }

          // Owner sends release_room
          const ownerClient = createMockClient(ownerSession);
          sendMessage(room, "release_room", ownerClient, { zoneId: "test-zone" });

          // All three properties must be cleared (Requirements 8.1, 8.2, 8.3)
          expect(zoneState.isLocked).toBe(false);
          expect(zoneState.floorColorIndex).toBe(-1);
          expect(zoneState.ownerSessionId).toBe("");

          room.onDispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("non-owner release_room leaves zone state unchanged (Requirement 8.6)", () => {
    fc.assert(
      fc.property(
        distinctSessionPairArb,
        validColorIndexArb,
        fc.boolean(), // whether zone is locked
        ([ownerSession, nonOwnerSession], colorIndex, isLocked) => {
          const room = setupOwnedZone(ownerSession, colorIndex, isLocked);

          // Non-owner joins
          room.onJoin(createMockClient(nonOwnerSession), { avatarId: 2, displayName: "Intruder" });

          // Capture state before non-owner release attempt
          const zoneState = (room as any).state.zones.get("test-zone");
          const prevOwner = zoneState.ownerSessionId;
          const prevLocked = zoneState.isLocked;
          const prevColor = zoneState.floorColorIndex;

          // Non-owner sends release_room — should be ignored (Requirement 8.6)
          const nonOwnerClient = createMockClient(nonOwnerSession);
          sendMessage(room, "release_room", nonOwnerClient, { zoneId: "test-zone" });

          // Zone state must remain unchanged
          expect(zoneState.ownerSessionId).toBe(prevOwner);
          expect(zoneState.isLocked).toBe(prevLocked);
          expect(zoneState.floorColorIndex).toBe(prevColor);

          room.onDispose();
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
