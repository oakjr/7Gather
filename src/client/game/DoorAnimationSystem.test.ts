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
});
