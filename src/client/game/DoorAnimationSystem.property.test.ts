/**
 * Property-Based Tests: Door Animation System (Properties 6 & 7)
 *
 * Feature: space-theme-room-decoration
 *
 * Property 6: Door proximity opens
 * For any closed door tile and any set of avatar positions (local or remote),
 * if at least one avatar has a Manhattan distance of 1 or less from the door tile,
 * then after the DoorAnimationSystem update() executes, the door tile SHALL be in
 * the open state.
 *
 * Property 7: Door distance closes
 * For any open door tile, if all tracked avatar positions (local and remote) have a
 * Manhattan distance greater than 2 from the door tile, then after the DoorAnimationSystem
 * update() executes, the door tile SHALL be in the closed state.
 *
 * **Validates: Requirements 13.1, 13.2, 13.4, 13.6**
 */
import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// Mock Phaser module before importing DoorAnimationSystem
vi.mock('phaser', () => ({
  default: {
    Scene: class {},
    Math: {
      Vector2: class {
        x: number; y: number;
        constructor(x: number, y: number) { this.x = x; this.y = y; }
      },
    },
    Geom: {
      Rectangle: class {
        x: number; y: number; width: number; height: number;
        constructor(x: number, y: number, w: number, h: number) {
          this.x = x; this.y = y; this.width = w; this.height = h;
        }
      },
    },
  },
}));

import { DoorAnimationSystem } from './DoorAnimationSystem';
import { DoorTile } from './TiledMapManager';

// === Helpers ===

const CLOSED_INDEX = 16;
const OPEN_INDEX = 17;

function createDoorTile(tileX: number, tileY: number, isOpen: boolean): DoorTile {
  return {
    tileX,
    tileY,
    closedIndex: CLOSED_INDEX,
    openIndex: OPEN_INDEX,
    isOpen,
  };
}

function createMockMapManager(doors: DoorTile[]) {
  return {
    getDoorTiles: vi.fn(() => doors),
    setDoorState: vi.fn((tileX: number, tileY: number, open: boolean) => {
      const door = doors.find(d => d.tileX === tileX && d.tileY === tileY);
      if (door) {
        door.isOpen = open;
      }
    }),
  } as any;
}

function createMockObjectsLayer() {
  return {} as any;
}

/**
 * Computes Manhattan distance between two tile positions.
 */
function manhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

// === Arbitraries (Generators) ===

/** Generate a door tile position within a reasonable map area */
const doorPositionArb = fc.record({
  tileX: fc.integer({ min: 0, max: 49 }),
  tileY: fc.integer({ min: 0, max: 39 }),
});

/** Generate a tile coordinate in a reasonable range */
const tileCoordArb = fc.integer({ min: 0, max: 49 });

/**
 * Generate an avatar position guaranteed to be within Manhattan distance ≤ 1
 * from a given door position. Returns one of the 5 valid positions (same tile
 * or orthogonally adjacent).
 */
function avatarWithinDistance1(doorX: number, doorY: number): fc.Arbitrary<{ tileX: number; tileY: number }> {
  return fc.constantFrom(
    { tileX: doorX, tileY: doorY },       // distance 0
    { tileX: doorX + 1, tileY: doorY },   // distance 1
    { tileX: doorX - 1, tileY: doorY },   // distance 1
    { tileX: doorX, tileY: doorY + 1 },   // distance 1
    { tileX: doorX, tileY: doorY - 1 },   // distance 1
  );
}

// === Property 6 Tests ===

describe('Property 6: Door proximity opens', () => {
  /**
   * **Validates: Requirements 13.1, 13.4, 13.6**
   *
   * For any closed door tile and any set of avatar positions (local or remote),
   * if at least one avatar has a Manhattan distance of 1 or less from the door tile,
   * then after the DoorAnimationSystem update() executes, the door tile SHALL be in
   * the open state.
   */
  it('closed door opens when local avatar is within Manhattan distance ≤ 1', () => {
    fc.assert(
      fc.property(
        doorPositionArb.chain(doorPos =>
          fc.record({
            doorPos: fc.constant(doorPos),
            avatarPos: avatarWithinDistance1(doorPos.tileX, doorPos.tileY),
          })
        ),
        ({ doorPos, avatarPos }) => {
          const doors = [createDoorTile(doorPos.tileX, doorPos.tileY, false)];
          const mapManager = createMockMapManager(doors);
          const system = new DoorAnimationSystem(mapManager, createMockObjectsLayer());

          system.update(avatarPos.tileX, avatarPos.tileY, new Map());

          // Door must be open after update
          return doors[0].isOpen === true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('closed door opens when a remote avatar is within Manhattan distance ≤ 1 (local is far)', () => {
    fc.assert(
      fc.property(
        doorPositionArb.chain(doorPos =>
          fc.record({
            doorPos: fc.constant(doorPos),
            remotePos: avatarWithinDistance1(doorPos.tileX, doorPos.tileY),
          })
        ),
        ({ doorPos, remotePos }) => {
          const doors = [createDoorTile(doorPos.tileX, doorPos.tileY, false)];
          const mapManager = createMockMapManager(doors);
          const system = new DoorAnimationSystem(mapManager, createMockObjectsLayer());

          // Local avatar is far away
          const localX = doorPos.tileX + 50;
          const localY = doorPos.tileY + 50;

          const remotePositions = new Map<string, { tileX: number; tileY: number }>();
          remotePositions.set('remote-1', remotePos);

          system.update(localX, localY, remotePositions);

          // Door must be open after update
          return doors[0].isOpen === true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('closed door opens when any one of multiple avatars is within distance ≤ 1', () => {
    fc.assert(
      fc.property(
        doorPositionArb.chain(doorPos =>
          fc.record({
            doorPos: fc.constant(doorPos),
            nearbyAvatar: avatarWithinDistance1(doorPos.tileX, doorPos.tileY),
            nearbyIsLocal: fc.boolean(),
            // Additional far-away remote avatars
            farRemotes: fc.array(
              fc.record({
                tileX: fc.integer({ min: 0, max: 99 }),
                tileY: fc.integer({ min: 0, max: 99 }),
              }),
              { minLength: 0, maxLength: 5 }
            ),
          })
        ),
        ({ doorPos, nearbyAvatar, nearbyIsLocal, farRemotes }) => {
          const doors = [createDoorTile(doorPos.tileX, doorPos.tileY, false)];
          const mapManager = createMockMapManager(doors);
          const system = new DoorAnimationSystem(mapManager, createMockObjectsLayer());

          let localX: number;
          let localY: number;
          const remotePositions = new Map<string, { tileX: number; tileY: number }>();

          if (nearbyIsLocal) {
            localX = nearbyAvatar.tileX;
            localY = nearbyAvatar.tileY;
            // Add far remotes
            farRemotes.forEach((pos, i) => remotePositions.set(`remote-${i}`, pos));
          } else {
            // Local avatar far away
            localX = doorPos.tileX + 50;
            localY = doorPos.tileY + 50;
            // Nearby avatar is one of the remotes
            remotePositions.set('nearby-remote', nearbyAvatar);
            farRemotes.forEach((pos, i) => remotePositions.set(`remote-${i}`, pos));
          }

          system.update(localX, localY, remotePositions);

          // Door must be open after update
          return doors[0].isOpen === true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('verifies the property with fully random positions (door opens iff any avatar within distance 1)', () => {
    fc.assert(
      fc.property(
        doorPositionArb,
        tileCoordArb,
        tileCoordArb,
        fc.array(
          fc.record({
            tileX: tileCoordArb,
            tileY: tileCoordArb,
          }),
          { minLength: 0, maxLength: 5 }
        ),
        (doorPos, localX, localY, remotePositionsArr) => {
          // Compute whether any avatar is within Manhattan distance ≤ 1
          const localDist = manhattanDistance(doorPos.tileX, doorPos.tileY, localX, localY);
          let anyWithinThreshold = localDist <= 1;
          for (const pos of remotePositionsArr) {
            if (manhattanDistance(doorPos.tileX, doorPos.tileY, pos.tileX, pos.tileY) <= 1) {
              anyWithinThreshold = true;
              break;
            }
          }

          // Only test the property when the precondition is met
          if (!anyWithinThreshold) return true;

          const doors = [createDoorTile(doorPos.tileX, doorPos.tileY, false)];
          const mapManager = createMockMapManager(doors);
          const system = new DoorAnimationSystem(mapManager, createMockObjectsLayer());

          const remotePositions = new Map<string, { tileX: number; tileY: number }>();
          remotePositionsArr.forEach((pos, i) => remotePositions.set(`player-${i}`, pos));

          system.update(localX, localY, remotePositions);

          // Door must be open after update
          return doors[0].isOpen === true;
        }
      ),
      { numRuns: 200 }
    );
  });
});

// === Property 7 Tests ===

describe('Property 7: Door distance closes', () => {
  /**
   * **Validates: Requirements 13.2**
   *
   * For any open door tile, if all tracked avatar positions (local and remote) have a
   * Manhattan distance greater than 2 from the door tile, then after the DoorAnimationSystem
   * update() executes, the door tile SHALL be in the closed state.
   */
  it('open door closes when all avatars (local only) are beyond Manhattan distance 2', () => {
    fc.assert(
      fc.property(
        doorPositionArb,
        fc.integer({ min: 0, max: 99 }),
        fc.integer({ min: 0, max: 99 }),
        (doorPos, avatarX, avatarY) => {
          const distance = manhattanDistance(doorPos.tileX, doorPos.tileY, avatarX, avatarY);

          // Pre-condition: avatar must be beyond distance 2
          fc.pre(distance > 2);

          const doors = [createDoorTile(doorPos.tileX, doorPos.tileY, true)];
          const mapManager = createMockMapManager(doors);
          const system = new DoorAnimationSystem(mapManager, createMockObjectsLayer());

          system.update(avatarX, avatarY, new Map());

          // After update, door should be closed
          return doors[0].isOpen === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('open door closes when all avatars (local + remote) are beyond Manhattan distance 2', () => {
    fc.assert(
      fc.property(
        doorPositionArb,
        fc.integer({ min: 1, max: 5 }),
        (doorPos, remoteCount) => {
          // Place local avatar far from door
          const localX = doorPos.tileX + 10;
          const localY = doorPos.tileY + 10;

          // Place remotes far from the door
          const remotePositions = new Map<string, { tileX: number; tileY: number }>();
          for (let i = 0; i < remoteCount; i++) {
            remotePositions.set(`remote-${i}`, {
              tileX: doorPos.tileX + 5 + i * 3,
              tileY: doorPos.tileY + 5 + i * 2,
            });
          }

          const doors = [createDoorTile(doorPos.tileX, doorPos.tileY, true)];
          const mapManager = createMockMapManager(doors);
          const system = new DoorAnimationSystem(mapManager, createMockObjectsLayer());

          system.update(localX, localY, remotePositions);

          // After update, door should be closed
          return doors[0].isOpen === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('open door stays OPEN if at least one avatar is within Manhattan distance ≤ 2', () => {
    fc.assert(
      fc.property(
        doorPositionArb.chain(doorPos =>
          fc.record({
            doorPos: fc.constant(doorPos),
            // Generate an avatar within distance ≤ 2 (one of the 13 valid positions)
            nearbyAvatar: fc.constantFrom(
              { tileX: doorPos.tileX, tileY: doorPos.tileY },         // dist 0
              { tileX: doorPos.tileX + 1, tileY: doorPos.tileY },     // dist 1
              { tileX: doorPos.tileX - 1, tileY: doorPos.tileY },     // dist 1
              { tileX: doorPos.tileX, tileY: doorPos.tileY + 1 },     // dist 1
              { tileX: doorPos.tileX, tileY: doorPos.tileY - 1 },     // dist 1
              { tileX: doorPos.tileX + 2, tileY: doorPos.tileY },     // dist 2
              { tileX: doorPos.tileX - 2, tileY: doorPos.tileY },     // dist 2
              { tileX: doorPos.tileX, tileY: doorPos.tileY + 2 },     // dist 2
              { tileX: doorPos.tileX, tileY: doorPos.tileY - 2 },     // dist 2
              { tileX: doorPos.tileX + 1, tileY: doorPos.tileY + 1 }, // dist 2
              { tileX: doorPos.tileX + 1, tileY: doorPos.tileY - 1 }, // dist 2
              { tileX: doorPos.tileX - 1, tileY: doorPos.tileY + 1 }, // dist 2
              { tileX: doorPos.tileX - 1, tileY: doorPos.tileY - 1 }, // dist 2
            ),
            nearbyIsLocal: fc.boolean(),
          })
        ),
        ({ doorPos, nearbyAvatar, nearbyIsLocal }) => {
          const doors = [createDoorTile(doorPos.tileX, doorPos.tileY, true)];
          const mapManager = createMockMapManager(doors);
          const system = new DoorAnimationSystem(mapManager, createMockObjectsLayer());

          let localX: number;
          let localY: number;
          const remotePositions = new Map<string, { tileX: number; tileY: number }>();

          if (nearbyIsLocal) {
            localX = nearbyAvatar.tileX;
            localY = nearbyAvatar.tileY;
          } else {
            localX = doorPos.tileX + 50;
            localY = doorPos.tileY + 50;
            remotePositions.set('nearby-remote', nearbyAvatar);
          }

          system.update(localX, localY, remotePositions);

          // Door must remain open
          return doors[0].isOpen === true;
        }
      ),
      { numRuns: 200 }
    );
  });

  it('multiple open doors all close when all avatars are far from all doors', () => {
    fc.assert(
      fc.property(
        fc.array(doorPositionArb, { minLength: 1, maxLength: 5 }).map(positions => {
          // Deduplicate
          const seen = new Set<string>();
          return positions.filter(p => {
            const key = `${p.tileX},${p.tileY}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }),
        (doorPositions) => {
          if (doorPositions.length === 0) return true;

          // Place avatar very far from all doors
          const localX = 90;
          const localY = 90;

          // Verify pre-condition
          for (const dp of doorPositions) {
            if (manhattanDistance(dp.tileX, dp.tileY, localX, localY) <= 2) {
              return true; // skip this case
            }
          }

          const doors = doorPositions.map(dp => createDoorTile(dp.tileX, dp.tileY, true));
          const mapManager = createMockMapManager(doors);
          const system = new DoorAnimationSystem(mapManager, createMockObjectsLayer());

          system.update(localX, localY, new Map());

          // All doors should be closed
          return doors.every(d => d.isOpen === false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
