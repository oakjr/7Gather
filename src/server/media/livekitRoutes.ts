import { Router, Request, Response } from "express";
import { LiveKitTokenService } from "./LiveKitTokenService";

/**
 * Request body for the POST /livekit/token endpoint.
 */
interface TokenRequestBody {
  roomName: string;
  participantId: string;
  participantName: string;
  zoneId?: string;
}

/**
 * Creates an Express router with the LiveKit token endpoint.
 *
 * POST /livekit/token
 *   Body: { roomName, participantId, participantName, zoneId? }
 *   Response: { token: string }
 *
 * If `zoneId` is provided, generates a zone-specific token.
 * Otherwise, generates a general room token with full permissions.
 */
export function createLiveKitRouter(tokenService: LiveKitTokenService): Router {
  const router = Router();

  router.post("/livekit/token", async (req: Request, res: Response) => {
    const { roomName, participantId, participantName, zoneId } =
      req.body as TokenRequestBody;

    if (!roomName || !participantId || !participantName) {
      res.status(400).json({
        error: "Missing required fields: roomName, participantId, participantName",
      });
      return;
    }

    try {
      let token: string;

      if (zoneId) {
        token = await tokenService.generateZoneToken(
          roomName,
          zoneId,
          participantId,
          participantName
        );
      } else {
        token = await tokenService.generateToken({
          roomName,
          participantId,
          participantName,
          permissions: {
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
          },
        });
      }

      res.json({ token });
    } catch (error) {
      console.error("[LiveKit Token] Failed to generate token:", error);
      res.status(500).json({ error: "Failed to generate token" });
    }
  });

  return router;
}
