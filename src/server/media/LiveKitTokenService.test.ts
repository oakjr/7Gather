import { describe, it, expect, beforeEach, vi } from "vitest";
import { LiveKitTokenService, TokenRequest } from "./LiveKitTokenService";

const TEST_API_KEY = "test-api-key";
const TEST_API_SECRET = "secret-that-is-at-least-256-bits-long-for-hs256";

/**
 * Mock the livekit-server-sdk AccessToken to avoid jose/Uint8Array compatibility
 * issue in the vitest/Node ESM environment.
 * We test that our service correctly configures the token grants and identity.
 */
const mockToJwt = vi.fn().mockResolvedValue("mock.jwt.token");
const mockAddGrant = vi.fn();
let lastTokenOptions: any = null;

vi.mock("livekit-server-sdk", () => {
  class MockAccessToken {
    private grants: any = {};
    private options: any;

    constructor(_apiKey: string, _apiSecret: string, options: any) {
      lastTokenOptions = options;
      this.options = options;
    }

    addGrant(grant: any) {
      this.grants = grant;
      mockAddGrant(grant);
    }

    toJwt() {
      return mockToJwt();
    }
  }

  return {
    AccessToken: MockAccessToken,
  };
});

describe("LiveKitTokenService", () => {
  let service: LiveKitTokenService;

  beforeEach(() => {
    vi.clearAllMocks();
    lastTokenOptions = null;
    service = new LiveKitTokenService(TEST_API_KEY, TEST_API_SECRET);
  });

  describe("generateToken", () => {
    it("should generate a valid JWT token for a room participant", async () => {
      const request: TokenRequest = {
        roomName: "room-abc",
        participantId: "session-123",
        participantName: "Alice",
        permissions: {
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        },
      };

      const token = await service.generateToken(request);

      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(mockToJwt).toHaveBeenCalledOnce();
    });

    it("should include correct room and participant identity in claims", async () => {
      const request: TokenRequest = {
        roomName: "office-main",
        participantId: "user-456",
        participantName: "Bob",
        permissions: {
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        },
      };

      await service.generateToken(request);

      // Check that AccessToken was created with correct identity
      expect(lastTokenOptions.identity).toBe("user-456");
      expect(lastTokenOptions.name).toBe("Bob");

      // Check that the grant includes the correct room
      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          room: "office-main",
          roomJoin: true,
        })
      );
    });

    it("should set canPublish, canSubscribe, canPublishData permissions", async () => {
      const request: TokenRequest = {
        roomName: "room-xyz",
        participantId: "user-789",
        participantName: "Carol",
        permissions: {
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        },
      };

      await service.generateToken(request);

      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        })
      );
    });

    it("should respect restricted permissions", async () => {
      const request: TokenRequest = {
        roomName: "room-restricted",
        participantId: "user-listen-only",
        participantName: "Dave",
        permissions: {
          canPublish: false,
          canSubscribe: true,
          canPublishData: false,
        },
      };

      await service.generateToken(request);

      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          canPublish: false,
          canSubscribe: true,
          canPublishData: false,
        })
      );
    });
  });

  describe("generateZoneToken", () => {
    it("should generate a token with zone-specific room name", async () => {
      await service.generateZoneToken(
        "office-main",
        "meeting-room-1",
        "user-100",
        "Eve"
      );

      expect(lastTokenOptions.identity).toBe("user-100");
      expect(lastTokenOptions.name).toBe("Eve");

      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          room: "office-main-zone-meeting-room-1",
          roomJoin: true,
        })
      );
    });

    it("should grant full publish/subscribe permissions for zone", async () => {
      await service.generateZoneToken(
        "room-1",
        "private-zone-a",
        "session-xyz",
        "Frank"
      );

      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        })
      );
    });

    it("should work without a participant name", async () => {
      await service.generateZoneToken(
        "room-2",
        "zone-b",
        "session-anon"
      );

      expect(lastTokenOptions.identity).toBe("session-anon");

      expect(mockAddGrant).toHaveBeenCalledWith(
        expect.objectContaining({
          room: "room-2-zone-zone-b",
          roomJoin: true,
        })
      );
    });
  });
});
