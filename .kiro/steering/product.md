# Product Overview

7Gather is a spatial collaboration platform — a 2D virtual office where users move pixel-art avatars around a tile-based map and communicate via real-time audio/video.

## Core Concepts

- **Spatial rooms**: Users join a room via URL (`/room/<id>`), move avatars with keyboard (arrows/WASD), and interact with other participants in real time.
- **Private zones**: Defined areas on the map that create separate audio channels. Entering a zone switches the user's LiveKit audio room automatically.
- **Home rooms**: Players can claim a private zone as their personal room. They spawn there on subsequent visits.
- **Music sharing**: One music track can be streamed to all room participants at a time.
- **Map hot-reload**: When a new map is uploaded via the API, active rooms update their `mapVersion` state so clients know to refresh.

## User Flow

1. User opens a room link → selects an avatar → connects to Colyseus + LiveKit
2. Phaser game scene renders the tile map, local avatar, and remote players
3. Moving into a private zone triggers audio channel switching
4. Overlay UI provides media controls, participant list, music player, status selector, and settings

## Language

The UI and documentation are primarily in **Brazilian Portuguese**. Code (variable names, comments, commit messages) is in **English**.
