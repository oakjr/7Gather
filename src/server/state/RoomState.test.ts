import { describe, it, expect } from "vitest";
import { MapSchema } from "@colyseus/schema";
import { PlayerSchema, MusicSchema, RoomState } from "./RoomState";

describe("PlayerSchema", () => {
  it("should initialize with default values", () => {
    const player = new PlayerSchema();
    expect(player.sessionId).toBe("");
    expect(player.displayName).toBe("");
    expect(player.avatarId).toBe(0);
    expect(player.x).toBe(0);
    expect(player.y).toBe(0);
    expect(player.direction).toBe("down");
    expect(player.isMoving).toBe(false);
    expect(player.isMuted).toBe(false);
    expect(player.currentZone).toBe("");
    expect(player.status).toBe("available");
  });

  it("should accept valid property assignments", () => {
    const player = new PlayerSchema();
    player.sessionId = "abc123";
    player.displayName = "Test User";
    player.avatarId = 15;
    player.x = 10.5;
    player.y = 20.75;
    player.direction = "up";
    player.isMoving = true;
    player.isMuted = true;
    player.currentZone = "zone_meeting";
    player.status = "busy";

    expect(player.sessionId).toBe("abc123");
    expect(player.displayName).toBe("Test User");
    expect(player.avatarId).toBe(15);
    expect(player.x).toBeCloseTo(10.5);
    expect(player.y).toBeCloseTo(20.75);
    expect(player.direction).toBe("up");
    expect(player.isMoving).toBe(true);
    expect(player.isMuted).toBe(true);
    expect(player.currentZone).toBe("zone_meeting");
    expect(player.status).toBe("busy");
  });
});

describe("MusicSchema", () => {
  it("should initialize with default values", () => {
    const music = new MusicSchema();
    expect(music.source).toBe("");
    expect(music.startedBy).toBe("");
    expect(music.isPlaying).toBe(false);
  });

  it("should accept valid property assignments", () => {
    const music = new MusicSchema();
    music.source = "https://example.com/song.mp3";
    music.startedBy = "Alice";
    music.isPlaying = true;

    expect(music.source).toBe("https://example.com/song.mp3");
    expect(music.startedBy).toBe("Alice");
    expect(music.isPlaying).toBe(true);
  });
});

describe("RoomState", () => {
  it("should initialize with empty players map and default music", () => {
    const state = new RoomState();
    expect(state.players).toBeInstanceOf(MapSchema);
    expect(state.players.size).toBe(0);
    expect(state.music).toBeInstanceOf(MusicSchema);
    expect(state.music.isPlaying).toBe(false);
    expect(state.mapVersion).toBe("");
  });

  it("should allow adding players to the map", () => {
    const state = new RoomState();
    const player = new PlayerSchema();
    player.sessionId = "player1";
    player.displayName = "Alice";
    player.avatarId = 5;
    player.x = 3;
    player.y = 7;

    state.players.set("player1", player);

    expect(state.players.size).toBe(1);
    expect(state.players.get("player1")?.displayName).toBe("Alice");
    expect(state.players.get("player1")?.avatarId).toBe(5);
  });

  it("should allow removing players from the map", () => {
    const state = new RoomState();
    const player = new PlayerSchema();
    player.sessionId = "player1";
    state.players.set("player1", player);

    state.players.delete("player1");
    expect(state.players.size).toBe(0);
  });

  it("should support multiple players", () => {
    const state = new RoomState();

    const player1 = new PlayerSchema();
    player1.sessionId = "p1";
    player1.displayName = "Alice";

    const player2 = new PlayerSchema();
    player2.sessionId = "p2";
    player2.displayName = "Bob";

    state.players.set("p1", player1);
    state.players.set("p2", player2);

    expect(state.players.size).toBe(2);
    expect(state.players.get("p1")?.displayName).toBe("Alice");
    expect(state.players.get("p2")?.displayName).toBe("Bob");
  });

  it("should allow updating mapVersion", () => {
    const state = new RoomState();
    state.mapVersion = "v1.2.3";
    expect(state.mapVersion).toBe("v1.2.3");
  });
});
