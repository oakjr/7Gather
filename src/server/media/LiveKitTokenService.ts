import { AccessToken } from "livekit-server-sdk";

/**
 * Request parameters for generating a LiveKit access token.
 */
export interface TokenRequest {
  roomName: string;        // Colyseus room ID
  participantId: string;   // session ID
  participantName: string;
  permissions: TokenPermissions;
}

/**
 * Permissions granted via the LiveKit token.
 */
export interface TokenPermissions {
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
}

/**
 * Default token time-to-live: 6 hours.
 */
const DEFAULT_TTL = "6h";

/**
 * Service responsible for generating LiveKit JWT tokens
 * with appropriate room and participant permissions.
 *
 * Reads LIVEKIT_API_KEY and LIVEKIT_API_SECRET from environment variables.
 */
export class LiveKitTokenService {
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor(apiKey?: string, apiSecret?: string) {
    this.apiKey = apiKey || process.env.LIVEKIT_API_KEY || "";
    this.apiSecret = apiSecret || process.env.LIVEKIT_API_SECRET || "";

    if (!this.apiKey || !this.apiSecret) {
      console.warn(
        "[LiveKitTokenService] LIVEKIT_API_KEY or LIVEKIT_API_SECRET not set. Token generation will fail."
      );
    }
  }

  /**
   * Generates a JWT token for a participant joining the general room channel.
   *
   * @param request - Token request containing room name, participant identity, and permissions
   * @returns Promise resolving to a signed JWT string
   */
  async generateToken(request: TokenRequest): Promise<string> {
    const { roomName, participantId, participantName, permissions } = request;

    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: participantId,
      name: participantName,
      ttl: DEFAULT_TTL,
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: permissions.canPublish,
      canSubscribe: permissions.canSubscribe,
      canPublishData: permissions.canPublishData,
    });

    return token.toJwt();
  }

  /**
   * Generates a JWT token for a participant joining a private zone's audio channel.
   * The LiveKit room name is composed as `{roomName}-zone-{zoneId}` to isolate
   * zone audio from the general room channel.
   *
   * @param roomName - The Colyseus room ID (base room)
   * @param zoneId - The private zone identifier from the Tiled map
   * @param participantId - The session ID of the participant
   * @param participantName - Display name of the participant
   * @returns Promise resolving to a signed JWT string
   */
  async generateZoneToken(
    roomName: string,
    zoneId: string,
    participantId: string,
    participantName?: string
  ): Promise<string> {
    const zoneRoomName = `${roomName}-zone-${zoneId}`;

    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: participantId,
      name: participantName,
      ttl: DEFAULT_TTL,
    });

    token.addGrant({
      room: zoneRoomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return token.toJwt();
  }
}
