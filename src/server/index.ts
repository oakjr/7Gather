import "dotenv/config";
import express from "express";
import http from "http";
import { Server, matchMaker } from "colyseus";
import { monitor } from "@colyseus/monitor";
import { WebSocketTransport } from "@colyseus/ws-transport";

import { SpatialRoom } from "./rooms/SpatialRoom";
import { RoomManager } from "./rooms/RoomManager";
import { createRoomRouter } from "./rooms/roomRoutes";
import { createMapRouter, MapStorage } from "./rooms/mapRoutes";
import { LiveKitTokenService } from "./media/LiveKitTokenService";
import { createLiveKitRouter } from "./media/livekitRoutes";

/**
 * 7Gather Server Entry Point
 *
 * Wires together:
 * - Express HTTP server with JSON body parsing
 * - Colyseus WebSocket server (SpatialRoom handler)
 * - Room management routes (GET/POST /rooms)
 * - Map upload routes (POST /maps, GET /maps/current)
 * - LiveKit token route (POST /livekit/token)
 * - Health check endpoint (GET /health)
 * - Colyseus monitor (GET /colyseus)
 *
 * Requirements: 7.1, 9.1, 10.1, 10.5, 12.3
 */

const PORT = Number(process.env.PORT) || 2567;

// === Express App ===
const app = express();
app.use(express.json({ limit: "6mb" })); // Allow map uploads up to ~5MB + overhead

// === Services ===
const roomManager = new RoomManager();
const mapStorage = new MapStorage();
const livekitTokenService = new LiveKitTokenService();

// === HTTP Server ===
const httpServer = http.createServer(app);

// === Colyseus Server ===
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Register the SpatialRoom handler
gameServer.define("spatial_room", SpatialRoom);

// === Map version update callback ===
// When a new map is uploaded, update all active SpatialRoom instances' mapVersion state.
// Clients detect the version change and prompt for refresh (handled in main.ts).
const onMapVersionUpdate = async (newVersion: string) => {
  console.log(`[Server] New map version: ${newVersion}. Notifying active rooms.`);
  try {
    const rooms = await matchMaker.query({ name: "spatial_room" });
    for (const roomListing of rooms) {
      const roomId = roomListing.roomId;
      const room = matchMaker.getRoomById(roomId) as SpatialRoom | undefined;
      if (room && room.state) {
        room.state.mapVersion = newVersion;
      }
    }
  } catch (err) {
    console.warn("[Server] Failed to propagate map version to rooms:", err);
  }
};

// === Routes ===

// Health check (used by Docker healthcheck and load balancers)
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "healthy",
    uptime: process.uptime(),
    rooms: roomManager.getRoomCount(),
    timestamp: new Date().toISOString(),
  });
});

// Room management
app.use(createRoomRouter(roomManager));

// Map management with version update notification
app.use(createMapRouter(mapStorage, onMapVersionUpdate));

// LiveKit token generation
app.use(createLiveKitRouter(livekitTokenService));

// Colyseus monitor (admin panel)
app.use("/colyseus", monitor());

// === Start Server ===
gameServer.listen(PORT).then(() => {
  console.log(`[7Gather] Server listening on port ${PORT}`);
  console.log(`[7Gather] Health check: http://localhost:${PORT}/health`);
  console.log(`[7Gather] Colyseus monitor: http://localhost:${PORT}/colyseus`);
  console.log(`[7Gather] LiveKit token: POST http://localhost:${PORT}/livekit/token`);
  console.log(`[7Gather] Rooms API: http://localhost:${PORT}/rooms`);
  console.log(`[7Gather] Maps API: POST http://localhost:${PORT}/maps`);
});
