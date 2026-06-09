# Tech Stack

## Runtime & Language

- **Node.js** >= 18
- **TypeScript** 5.4+ (strict mode)
- `ts-node` for server development

## Frontend

- **Phaser 3** (v3.80) — 2D game engine, arcade physics, tile maps
- **React 18** — UI overlays (functional components, hooks)
- **Vite 5** — dev server (port 3000) and production bundler
- **livekit-client** — WebRTC audio/video on the client

## Backend

- **Express 4** — HTTP routes, JSON body parsing
- **Colyseus 0.15** — WebSocket game server, room state synchronization
- **@colyseus/schema** — binary delta-encoded state (decorators: `@type`)
- **livekit-server-sdk** — token generation for LiveKit rooms
- **dotenv** — environment variable loading

## Infrastructure

- **LiveKit** — SFU for real-time audio/video (Docker, ports 7880/7881)
- **Docker Compose** — full-stack orchestration (Nginx, Colyseus, LiveKit, Client)
- **Nginx** — reverse proxy and static file serving in production

## Testing

- **Vitest 2** — unit and integration test runner
- **@testing-library/react** — React component tests
- **jsdom** — DOM environment for tests

## Common Commands

```bash
# Development
npm run dev:client        # Vite dev server (port 3000)
npm run dev:server        # Colyseus server via ts-node (port 2567)
docker compose up livekit # LiveKit only

# Testing
npm test                  # Run all unit tests (vitest run)
npm run test:watch        # Watch mode
npm run test:integration  # Integration tests

# Production Builds
npm run build:client      # Vite production build
npm run build:server      # TypeScript compile server

# Docker (full stack)
docker compose up --build    # All services
docker compose down          # Stop all

# Utility Scripts
node scripts/generate-avatar.js
node scripts/generate-tileset.js
node scripts/generate-map.js
```
