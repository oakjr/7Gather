# Project Structure

```
7Gather/
├── config/                  # Service configurations
│   ├── livekit.yaml         # LiveKit server config
│   └── nginx/               # Nginx proxy config + SSL init script
├── docker/                  # Dockerfiles
│   ├── client/              # Multi-stage Vite build → Nginx
│   └── server/              # Node.js server image
├── docs/                    # Deployment and operational docs
├── public/                  # Static assets served by Vite
│   ├── maps/                # Tiled JSON map + tileset PNG
│   └── sprites/             # Avatar PNGs (avatar_1..20)
├── scripts/                 # Node.js utility scripts (asset generation)
├── src/
│   ├── client/              # Frontend application
│   │   ├── game/            # Phaser scene, avatar classes, follow system, map manager
│   │   ├── integration/     # Cross-system glue (ZoneAudioIntegration)
│   │   ├── network/         # ColyseusClient, LiveKitClient wrappers
│   │   ├── styles/          # CSS
│   │   ├── ui/              # React components and UI utilities
│   │   │   └── components/  # Reusable UI components (MediaControls, ParticipantList, etc.)
│   │   ├── main.ts          # App bootstrap and entry point
│   │   └── RoomEntryFlow.ts # Join flow state machine
│   ├── server/              # Backend application
│   │   ├── media/           # LiveKit token service + routes
│   │   ├── rooms/           # SpatialRoom handler, RoomManager, routes
│   │   ├── state/           # Colyseus schema definitions (RoomState, PlayerSchema)
│   │   └── index.ts         # Server entry point (Express + Colyseus wiring)
│   └── shared/              # Code shared between client and server
│       ├── types.ts         # Interfaces and type definitions
│       └── constants.ts     # Numeric constants (TILE_SIZE, SYNC_RATE, etc.)
├── docker-compose.yml       # Full-stack orchestration
├── package.json             # Monorepo-style single package
├── index.html               # Vite HTML entry
└── vite.config.ts           # Vite build configuration
```

## Key Conventions

- **Monorepo single-package**: Client and server share one `package.json`. No workspaces.
- **Shared code**: Types and constants live in `src/shared/` and are imported by both client and server.
- **Test colocation**: Unit tests sit next to their source file (e.g., `SpatialRoom.test.ts` beside `SpatialRoom.ts`).
- **Integration tests**: Placed in `src/client/integration/` for cross-module scenarios.
- **Colyseus schemas**: Defined in `src/server/state/` using `@type` decorators from `@colyseus/schema`.
- **React components**: Functional components with hooks. Created via `React.createElement` (no JSX in `main.ts`); `.tsx` files in `ui/components/` use JSX.
- **Phaser scenes**: Class-based, extending `Phaser.Scene`. Game logic in `src/client/game/`.
- **Route factories**: Express routers are created via factory functions (e.g., `createRoomRouter(deps)`).
- **Asset generation**: Scripts in `scripts/` generate sprites, tilesets, and maps as static files in `public/`.
