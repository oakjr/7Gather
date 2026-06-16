import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DoorAnimationSystem } from './DoorAnimationSystem';
import { DoorTile } from './TiledMapManager';

// Mock Phaser module
vi.mock('phaser', () => {
  return {
    default: {
      Scene: class MockScene {},
      Math: {
        Vector2: class {
          x: number;
          y: number;
          constructor(x: number, y: number) {
            this.x = x;
            this.y = y;
          }
        },
      },
      Geom: {
        Rectangle: class {
          x: number;
          y: number;
          width: number;
          height: number;
          constructor(x: number, y: number, w: number, h: number) {
            this.x = x;
            this.y = y;
            this.width = w;
            this.height = h;
          }
        },
      },
    },
  };
});

function createMockDoorTile(tileX: number, tileY: number, isOpen: boolean = false): DoorTile {
  return {
    tileX,
    tileY,
    closedIndex: 16,
    openIndex: 17,
    isOpen,
  };
}

function createMockMapManager(doors: DoorTile[], privateZones: any[] = []) {
  return {
    getDoorTiles: vi.fn(() => doors),
    setDoorState: vi.fn((tileX: number, tileY: number, open: boolean) => {
      const door = doors.find(d => d.tileX === tileX && d.tileY === tileY);
      if (door) {
        door.isOpen = open;
      }
    }),
    getPrivateZones: vi.fn(() => privateZones),
    setLockedDoor: vi.fn(),
    clearLockedDoor: vi.fn(),
  } as any;
}

function createMockObjectsLayer() {
  return {} as any;
}

describe('DoorAnimationSystem', () => {
  let doors: DoorTile[];
  let mapManager: ReturnType<typeof createMockMapManager>;
  let objectsLayer: any;
  let system: DoorAnimationSystem;

  beforeEach(() => {
    doors = [createMockDoorTile(5, 5)];
    mapManager = createMockMapManager(doors);
    objectsLayer = createMockObjectsLayer();
    system = new DoorAnimationSystem(mapManager, objectsLayer);
  });

  describe('constructor', () => {
    it('should get door tiles from mapManager', () => {
      expect(mapManager.getDoorTiles).toHaveBeenCalled();
    });
  });

  describe('update - opening doors', () => {
    it('should open a closed door when local avatar is at Manhattan distance 0 (same tile)', () => {
      system.update(5, 5, new Map());

      expect(mapManager.setDoorState).toHaveBeenCalledWith(5, 5, true);
      expect(doors[0].isOpen).toBe(true);
    });

    it('should open a closed door when local avatar is at Manhattan distance 1', () => {
      system.update(5, 4, new Map()); // distance = |5-5| + |5-4| = 1

      expect(mapManager.setDoorState).toHaveBeenCalledWith(5, 5, true);
      expect(doors[0].isOpen).toBe(true);
    });

    it('should open a closed door when local avatar is adjacent horizontally', () => {
      system.update(4, 5, new Map()); // distance = |5-4| + |5-5| = 1

      expect(mapManager.setDoorState).toHaveBeenCalledWith(5, 5, true);
      expect(doors[0].isOpen).toBe(true);
    });

    it('should NOT open a closed door when local avatar is at Manhattan distance 2', () => {
      system.update(5, 3, new Map()); // distance = |5-5| + |5-3| = 2

      expect(mapManager.setDoorState).not.toHaveBeenCalled();
      expect(doors[0].isOpen).toBe(false);
    });

    it('should NOT open a closed door when local avatar is far away', () => {
      system.update(10, 10, new Map()); // distance = 10

      expect(mapManager.setDoorState).not.toHaveBeenCalled();
      expect(doors[0].isOpen).toBe(false);
    });

    it('should open a closed door when remote avatar is within distance 1', () => {
      const remotePositions = new Map<string, { tileX: number; tileY: number }>();
      remotePositions.set('player-2', { tileX: 6, tileY: 5 }); // distance = 1

      system.update(20, 20, remotePositions); // local is far away

      expect(mapManager.setDoorState).toHaveBeenCalledWith(5, 5, true);
      expect(doors[0].isOpen).toBe(true);
    });

    it('should open door when any one of multiple remote avatars is within threshold', () => {
      const remotePositions = new Map<string, { tileX: number; tileY: number }>();
      remotePositions.set('player-2', { tileX: 20, tileY: 20 }); // far
      remotePositions.set('player-3', { tileX: 5, tileY: 6 }); // distance = 1

      system.update(20, 20, remotePositions); // local is far

      expect(mapManager.setDoorState).toHaveBeenCalledWith(5, 5, true);
      expect(doors[0].isOpen).toBe(true);
    });
  });

  describe('update - closing doors', () => {
    beforeEach(() => {
      doors = [createMockDoorTile(5, 5, true)]; // start open
      mapManager = createMockMapManager(doors);
      system = new DoorAnimationSystem(mapManager, objectsLayer);
    });

    it('should close an open door when all avatars are beyond Manhattan distance 2', () => {
      system.update(10, 10, new Map()); // distance = 10

      expect(mapManager.setDoorState).toHaveBeenCalledWith(5, 5, false);
      expect(doors[0].isOpen).toBe(false);
    });

    it('should NOT close an open door when local avatar is at Manhattan distance 2', () => {
      system.update(5, 3, new Map()); // distance = |5-5| + |5-3| = 2

      expect(mapManager.setDoorState).not.toHaveBeenCalled();
      expect(doors[0].isOpen).toBe(true);
    });

    it('should NOT close an open door when local avatar is at distance 1', () => {
      system.update(5, 4, new Map()); // distance = 1

      expect(mapManager.setDoorState).not.toHaveBeenCalled();
      expect(doors[0].isOpen).toBe(true);
    });

    it('should NOT close an open door when remote avatar is within distance 2', () => {
      const remotePositions = new Map<string, { tileX: number; tileY: number }>();
      remotePositions.set('player-2', { tileX: 7, tileY: 5 }); // distance = 2

      system.update(20, 20, remotePositions); // local is far

      expect(mapManager.setDoorState).not.toHaveBeenCalled();
      expect(doors[0].isOpen).toBe(true);
    });

    it('should close open door only when ALL avatars are beyond distance 2', () => {
      const remotePositions = new Map<string, { tileX: number; tileY: number }>();
      remotePositions.set('player-2', { tileX: 20, tileY: 20 }); // far
      remotePositions.set('player-3', { tileX: 30, tileY: 30 }); // far

      system.update(20, 20, remotePositions); // local also far

      expect(mapManager.setDoorState).toHaveBeenCalledWith(5, 5, false);
      expect(doors[0].isOpen).toBe(false);
    });

    it('should keep door open if at least one remote avatar is within threshold 2', () => {
      const remotePositions = new Map<string, { tileX: number; tileY: number }>();
      remotePositions.set('player-2', { tileX: 20, tileY: 20 }); // far
      remotePositions.set('player-3', { tileX: 5, tileY: 4 }); // distance = 1

      system.update(20, 20, remotePositions); // local is far

      expect(mapManager.setDoorState).not.toHaveBeenCalled();
      expect(doors[0].isOpen).toBe(true);
    });
  });

  describe('update - multiple doors', () => {
    beforeEach(() => {
      doors = [
        createMockDoorTile(5, 5, false),
        createMockDoorTile(10, 10, false),
        createMockDoorTile(15, 15, true),
      ];
      mapManager = createMockMapManager(doors);
      system = new DoorAnimationSystem(mapManager, objectsLayer);
    });

    it('should open only the door near the avatar', () => {
      system.update(5, 5, new Map()); // at door 1

      expect(mapManager.setDoorState).toHaveBeenCalledWith(5, 5, true);
      expect(mapManager.setDoorState).not.toHaveBeenCalledWith(10, 10, true);
      // Door at 15,15 is open, avatar is far → should close
      expect(mapManager.setDoorState).toHaveBeenCalledWith(15, 15, false);
    });

    it('should handle multiple doors opening simultaneously', () => {
      // Avatar at position where it's within distance 1 of both door 1 and 2 is not possible
      // with doors at (5,5) and (10,10). But let's place doors close together.
      doors = [
        createMockDoorTile(5, 5, false),
        createMockDoorTile(5, 6, false),
      ];
      mapManager = createMockMapManager(doors);
      system = new DoorAnimationSystem(mapManager, objectsLayer);

      system.update(5, 5, new Map()); // distance 0 to door 1, distance 1 to door 2

      expect(mapManager.setDoorState).toHaveBeenCalledWith(5, 5, true);
      expect(mapManager.setDoorState).toHaveBeenCalledWith(5, 6, true);
    });
  });

  describe('update - already in correct state', () => {
    it('should not call setDoorState when door is already open and avatar is near', () => {
      doors = [createMockDoorTile(5, 5, true)]; // already open
      mapManager = createMockMapManager(doors);
      system = new DoorAnimationSystem(mapManager, objectsLayer);

      system.update(5, 5, new Map()); // at door, door already open

      // Door is open and avatar is within threshold 2 → stays open, no call needed
      expect(mapManager.setDoorState).not.toHaveBeenCalled();
    });

    it('should not call setDoorState when door is already closed and avatar is far', () => {
      system.update(20, 20, new Map()); // far from door

      expect(mapManager.setDoorState).not.toHaveBeenCalled();
    });
  });

  describe('update - edge cases', () => {
    it('should handle empty remote positions', () => {
      system.update(5, 5, new Map());

      expect(mapManager.setDoorState).toHaveBeenCalledWith(5, 5, true);
    });

    it('should handle no doors', () => {
      const noDoors: DoorTile[] = [];
      const emptyManager = createMockMapManager(noDoors);
      const emptySystem = new DoorAnimationSystem(emptyManager, objectsLayer);

      // Should not throw
      expect(() => emptySystem.update(5, 5, new Map())).not.toThrow();
      expect(emptyManager.setDoorState).not.toHaveBeenCalled();
    });

    it('should correctly compute Manhattan distance for diagonal positions', () => {
      // Door at (5,5), avatar at (6,6) → distance = |5-6| + |5-6| = 2 (not within 1)
      system.update(6, 6, new Map());

      expect(mapManager.setDoorState).not.toHaveBeenCalled();
      expect(doors[0].isOpen).toBe(false);
    });

    it('should use Manhattan distance, not Euclidean', () => {
      // Door at (5,5), avatar at (4,4) → Manhattan = 2, Euclidean ≈ 1.41
      // Should NOT open since Manhattan distance 2 > threshold 1
      system.update(4, 4, new Map());

      expect(mapManager.setDoorState).not.toHaveBeenCalled();
      expect(doors[0].isOpen).toBe(false);
    });
  });

  describe('setZoneLocked - locking zones', () => {
    let zoneDoors: DoorTile[];
    let zoneMapManager: ReturnType<typeof createMockMapManager>;
    let zoneSystem: DoorAnimationSystem;

    // Zone at pixel (96, 96) with size (128, 128) → tile (3, 3) with tile size (4, 4)
    // Door at (3, 2) is on the north edge adjacent to zone
    const mockZone = {
      id: 'zone-1',
      bounds: { x: 96, y: 96, width: 128, height: 128 },
      tiles: [],
    };

    beforeEach(() => {
      zoneDoors = [createMockDoorTile(3, 2, false)]; // door adjacent to zone north edge
      zoneMapManager = createMockMapManager(zoneDoors, [mockZone]);
      zoneSystem = new DoorAnimationSystem(zoneMapManager, objectsLayer);
    });

    it('should call setLockedDoor on door tiles adjacent to the locked zone', () => {
      zoneSystem.setZoneLocked('zone-1', true);

      expect(zoneMapManager.setLockedDoor).toHaveBeenCalledWith(3, 2);
    });

    it('should force close an open door when zone is locked', () => {
      zoneDoors = [createMockDoorTile(3, 2, true)]; // door is open
      zoneMapManager = createMockMapManager(zoneDoors, [mockZone]);
      zoneSystem = new DoorAnimationSystem(zoneMapManager, objectsLayer);

      zoneSystem.setZoneLocked('zone-1', true);

      expect(zoneMapManager.setDoorState).toHaveBeenCalledWith(3, 2, false);
      expect(zoneMapManager.setLockedDoor).toHaveBeenCalledWith(3, 2);
    });

    it('should not call setDoorState if door is already closed when zone is locked', () => {
      zoneSystem.setZoneLocked('zone-1', true);

      // Door was already closed, so setDoorState should NOT be called
      expect(zoneMapManager.setDoorState).not.toHaveBeenCalled();
      // But setLockedDoor should still be called
      expect(zoneMapManager.setLockedDoor).toHaveBeenCalledWith(3, 2);
    });

    it('should ignore proximity triggers for locked doors during update', () => {
      zoneSystem.setZoneLocked('zone-1', true);

      // Avatar moves right next to the locked door
      zoneSystem.update(3, 2, new Map());

      // setDoorState should not be called with open=true (proximity ignored)
      expect(zoneMapManager.setDoorState).not.toHaveBeenCalledWith(3, 2, true);
    });

    it('should force close a locked door if it somehow gets opened during update', () => {
      zoneSystem.setZoneLocked('zone-1', true);
      // Manually set door to open to simulate an edge case
      zoneDoors[0].isOpen = true;

      zoneSystem.update(3, 2, new Map());

      expect(zoneMapManager.setDoorState).toHaveBeenCalledWith(3, 2, false);
    });

    it('should not affect doors that are not adjacent to the locked zone', () => {
      // Add a door far from the zone
      const farDoor = createMockDoorTile(20, 20, false);
      zoneDoors = [createMockDoorTile(3, 2, false), farDoor];
      zoneMapManager = createMockMapManager(zoneDoors, [mockZone]);
      zoneSystem = new DoorAnimationSystem(zoneMapManager, objectsLayer);

      zoneSystem.setZoneLocked('zone-1', true);

      // Only the adjacent door should get locked
      expect(zoneMapManager.setLockedDoor).toHaveBeenCalledWith(3, 2);
      expect(zoneMapManager.setLockedDoor).not.toHaveBeenCalledWith(20, 20);
    });

    it('should allow non-adjacent doors to still respond to proximity when zone is locked', () => {
      const farDoor = createMockDoorTile(20, 20, false);
      zoneDoors = [createMockDoorTile(3, 2, false), farDoor];
      zoneMapManager = createMockMapManager(zoneDoors, [mockZone]);
      zoneSystem = new DoorAnimationSystem(zoneMapManager, objectsLayer);

      zoneSystem.setZoneLocked('zone-1', true);
      zoneMapManager.setDoorState.mockClear();

      // Avatar near the far door
      zoneSystem.update(20, 20, new Map());

      expect(zoneMapManager.setDoorState).toHaveBeenCalledWith(20, 20, true);
    });
  });

  describe('setZoneLocked - unlocking zones', () => {
    let zoneDoors: DoorTile[];
    let zoneMapManager: ReturnType<typeof createMockMapManager>;
    let zoneSystem: DoorAnimationSystem;

    const mockZone = {
      id: 'zone-1',
      bounds: { x: 96, y: 96, width: 128, height: 128 },
      tiles: [],
    };

    beforeEach(() => {
      zoneDoors = [createMockDoorTile(3, 2, false)];
      zoneMapManager = createMockMapManager(zoneDoors, [mockZone]);
      zoneSystem = new DoorAnimationSystem(zoneMapManager, objectsLayer);
      // Lock first, then unlock
      zoneSystem.setZoneLocked('zone-1', true);
      zoneMapManager.setDoorState.mockClear();
      zoneMapManager.setLockedDoor.mockClear();
      zoneMapManager.clearLockedDoor.mockClear();
    });

    it('should call clearLockedDoor on door tiles when zone is unlocked', () => {
      zoneSystem.setZoneLocked('zone-1', false);

      expect(zoneMapManager.clearLockedDoor).toHaveBeenCalledWith(3, 2);
    });

    it('should restore proximity-based open behavior after unlock (Manhattan distance ≤1)', () => {
      zoneSystem.setZoneLocked('zone-1', false);

      // Avatar adjacent to door → should open
      zoneSystem.update(3, 1, new Map()); // Manhattan distance = 1

      expect(zoneMapManager.setDoorState).toHaveBeenCalledWith(3, 2, true);
    });

    it('should restore proximity-based close behavior after unlock (Manhattan distance >2)', () => {
      zoneSystem.setZoneLocked('zone-1', false);

      // First open the door
      zoneDoors[0].isOpen = true;

      // Avatar far from door → should close
      zoneSystem.update(20, 20, new Map());

      expect(zoneMapManager.setDoorState).toHaveBeenCalledWith(3, 2, false);
    });

    it('should not close door at Manhattan distance exactly 2 after unlock', () => {
      zoneSystem.setZoneLocked('zone-1', false);

      // Open the door first
      zoneDoors[0].isOpen = true;

      // Avatar at Manhattan distance 2 from door (3,2) → (3,0) = distance 2
      zoneSystem.update(3, 0, new Map());

      // Door should stay open (threshold to close is >2)
      expect(zoneMapManager.setDoorState).not.toHaveBeenCalled();
    });
  });
});
