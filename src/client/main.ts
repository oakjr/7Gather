// 7Gather - Spatial Collaboration Platform
// Client entry point - wires together all modules into a functional application.
//
// Flow:
// 1. Parse room ID from URL (or show room creation UI)
// 2. RoomEntryFlow: avatar check → Colyseus connect → LiveKit connect
// 3. On ready: create Phaser GameScene, bind ZoneAudioIntegration, wire network sync
//
// Requirements: 2.1, 3.6, 8.3, 9.3

import React from 'react';
import { createRoot } from 'react-dom/client';
import Phaser from 'phaser';
import { ColyseusClient } from './network/ColyseusClient';
import { LiveKitClient } from './network/LiveKitClient';
import { RoomEntryFlow, RoomEntryConfig } from './RoomEntryFlow';
import { ZoneAudioIntegration } from './integration/ZoneAudioIntegration';
import { GameScene, GameSceneEvents } from './game/GameScene';
import { RoomEntryApp } from './ui/components/RoomEntryApp';
import { MediaControls } from './ui/components/MediaControls';
import { ParticipantList } from './ui/components/ParticipantList';
import { MusicPlayer } from './ui/components/MusicPlayer';
import { ConnectionStatus } from './ui/components/ConnectionStatus';
import { Direction } from '../shared/types';

// === Configuration from environment or defaults ===

const CONFIG = {
  colyseusUrl: import.meta.env.VITE_COLYSEUS_URL || 'ws://localhost:2567',
  livekitUrl: import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880',
  livekitTokenEndpoint: import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT || '/livekit/token',
  defaultMapUrl: import.meta.env.VITE_DEFAULT_MAP_URL || '/maps/default.json',
};

// === Parse room ID from URL ===

function getRoomIdFromUrl(): string | null {
  const pathParts = window.location.pathname.split('/');
  // Expected URL format: /room/<roomId>
  const roomIndex = pathParts.indexOf('room');
  if (roomIndex !== -1 && pathParts[roomIndex + 1]) {
    return pathParts[roomIndex + 1];
  }
  // Also support ?room=<roomId> query param
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
}

function getDisplayName(): string {
  return localStorage.getItem('display_name') || `User_${Math.random().toString(36).slice(2, 7)}`;
}

// === Application Bootstrap ===

class App {
  private colyseusClient: ColyseusClient;
  private livekitClient: LiveKitClient;
  private entryFlow: RoomEntryFlow;
  private zoneAudioIntegration: ZoneAudioIntegration | null = null;
  private game: Phaser.Game | null = null;
  private gameScene: GameScene | null = null;
  private mapVersion: string = '';

  constructor() {
    this.colyseusClient = new ColyseusClient();
    this.livekitClient = new LiveKitClient();
    this.entryFlow = new RoomEntryFlow(this.colyseusClient, this.livekitClient);
  }

  /**
   * Initialize the application. Renders the entry UI and starts the flow.
   */
  start(): void {
    const roomId = getRoomIdFromUrl();

    if (!roomId) {
      this.renderNoRoomView();
      return;
    }

    const displayName = getDisplayName();

    const config: RoomEntryConfig = {
      colyseusUrl: CONFIG.colyseusUrl,
      livekitUrl: CONFIG.livekitUrl,
      livekitTokenEndpoint: CONFIG.livekitTokenEndpoint,
      roomId,
      displayName,
      mapJsonUrl: CONFIG.defaultMapUrl,
    };

    this.renderEntryUI(config);
  }

  /**
   * Renders the room entry UI (avatar selector, loading states, errors).
   */
  private renderEntryUI(config: RoomEntryConfig): void {
    const root = createRoot(document.getElementById('root')!);

    const handleReady = (avatarId: number, readyConfig: RoomEntryConfig) => {
      this.onRoomReady(avatarId, readyConfig);
    };

    root.render(
      React.createElement(RoomEntryApp, {
        flow: this.entryFlow,
        config,
        onReady: handleReady,
      })
    );
  }

  /**
   * Called when the entry flow reaches 'ready' state.
   * Creates the Phaser game, binds zone audio integration, wires network sync.
   *
   * Requirements: 2.1, 3.6, 8.3, 9.3
   */
  private onRoomReady(avatarId: number, config: RoomEntryConfig): void {
    // Create the Phaser game instance
    this.createGame(avatarId, config);

    // Set up zone audio integration (Requirement 4.1, 4.2, 4.3)
    this.setupZoneAudioIntegration(config.roomId);

    // Wire Colyseus state sync to GameScene
    this.setupNetworkSync();

    // Set up map version monitoring for hot-reload
    this.setupMapVersionMonitor();

    // Render in-game overlay UI (media controls, participant list, etc.)
    this.renderGameOverlayUI(config);
  }

  /**
   * Creates the Phaser game and scene.
   */
  private createGame(avatarId: number, config: RoomEntryConfig): void {
    // Create a container for the game canvas
    const gameContainer = document.createElement('div');
    gameContainer.id = 'game-container';
    gameContainer.style.width = '100%';
    gameContainer.style.height = '100%';
    gameContainer.style.position = 'absolute';
    gameContainer.style.top = '0';
    gameContainer.style.left = '0';
    document.body.appendChild(gameContainer);

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-container',
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: '#1a1a2e',
      scene: [GameScene],
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { x: 0, y: 0 },
          debug: false,
        },
      },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    });

    // Start the GameScene with configuration
    this.game.scene.start('GameScene', {
      mapJsonUrl: config.mapJsonUrl,
      avatarId,
      roomId: config.roomId,
      displayName: config.displayName,
    });

    // Store reference to the scene once it's created
    this.game.events.on('ready', () => {
      this.gameScene = this.game!.scene.getScene('GameScene') as GameScene;
      this.bindSceneEvents();
    });
  }

  /**
   * Binds GameScene events to network layer for position sync.
   */
  private bindSceneEvents(): void {
    if (!this.gameScene) return;

    // Position change → send to Colyseus (Requirement 1.3)
    this.gameScene.events.on(
      GameSceneEvents.POSITION_CHANGE,
      (data: { x: number; y: number; direction: Direction }) => {
        this.colyseusClient.sendPosition(data.x, data.y, data.direction);
      }
    );

    // Bind ZoneAudioIntegration to the scene
    if (this.zoneAudioIntegration) {
      this.zoneAudioIntegration.bind(this.gameScene);
    }
  }

  /**
   * Sets up the ZoneAudioIntegration to wire GameScene zone events
   * to Colyseus and LiveKit.
   *
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
   */
  private setupZoneAudioIntegration(roomId: string): void {
    this.zoneAudioIntegration = new ZoneAudioIntegration(
      this.colyseusClient,
      this.livekitClient,
      roomId
    );

    // Register error callback for UI notification
    this.zoneAudioIntegration.onError((error) => {
      console.error('[App] Zone audio switch error:', error);
      // The ConnectionStatus component will pick this up via state
    });
  }

  /**
   * Wires Colyseus state changes to GameScene remote avatar management.
   */
  private setupNetworkSync(): void {
    // Player join → add remote avatar
    this.colyseusClient.onPlayerJoin((player: any) => {
      if (!this.gameScene) return;
      const room = this.colyseusClient.getRoom();
      if (!room) return;

      // Don't add our own avatar as a remote player
      if (player.sessionId === room.sessionId) return;

      this.gameScene.addRemotePlayer(
        player.sessionId,
        player.avatarId,
        player.x,
        player.y,
        player.direction,
        player.displayName
      );

      // Listen for changes to this player's state
      player.onChange(() => {
        if (!this.gameScene) return;
        this.gameScene.updateRemotePlayer(
          player.sessionId,
          player.x,
          player.y,
          player.direction,
          player.isMoving
        );
        this.gameScene.setRemotePlayerMuted(player.sessionId, player.isMuted);
      });
    });

    // Player leave → remove remote avatar
    this.colyseusClient.onPlayerLeave((sessionId: string) => {
      if (!this.gameScene) return;
      this.gameScene.removeRemotePlayer(sessionId);
    });

    // Connection state change → update UI
    this.colyseusClient.onConnectionStateChange((state) => {
      console.log('[App] Connection state:', state);
    });
  }

  /**
   * Monitors map version changes in the room state for hot-reload.
   * When mapVersion changes, clients reload the map on next reconnection/refresh.
   *
   * Requirements: 12.3
   */
  private setupMapVersionMonitor(): void {
    this.colyseusClient.onStateChange((state: any) => {
      if (state && state.mapVersion && state.mapVersion !== this.mapVersion) {
        const previousVersion = this.mapVersion;
        this.mapVersion = state.mapVersion;

        if (previousVersion !== '') {
          // Map version changed — notify user to refresh for new map
          console.log('[App] New map version detected:', this.mapVersion);
          this.notifyMapUpdate();
        }
      }
    });
  }

  /**
   * Notifies the user that a new map is available.
   * The map will be loaded on next reconnection/refresh (Requirement 12.3).
   */
  private notifyMapUpdate(): void {
    // Simple notification - in production this could be a toast or banner
    console.info('[App] A new map version is available. Refresh to load the updated map.');
  }

  /**
   * Renders the in-game overlay UI (media controls, participant list, music player).
   */
  private renderGameOverlayUI(config: RoomEntryConfig): void {
    // Create overlay container
    const overlayContainer = document.createElement('div');
    overlayContainer.id = 'game-overlay';
    overlayContainer.style.position = 'absolute';
    overlayContainer.style.top = '0';
    overlayContainer.style.left = '0';
    overlayContainer.style.width = '100%';
    overlayContainer.style.height = '100%';
    overlayContainer.style.pointerEvents = 'none';
    overlayContainer.style.zIndex = '10';
    document.body.appendChild(overlayContainer);

    const overlayRoot = createRoot(overlayContainer);
    overlayRoot.render(
      React.createElement(GameOverlay, {
        colyseusClient: this.colyseusClient,
        livekitClient: this.livekitClient,
        gameScene: this.gameScene,
        roomId: config.roomId,
      })
    );
  }

  /**
   * Renders a view when no room ID is found in the URL.
   */
  private renderNoRoomView(): void {
    const root = createRoot(document.getElementById('root')!);
    root.render(
      React.createElement('div', { className: 'no-room-view' },
        React.createElement('h1', null, '7Gather'),
        React.createElement('p', null, 'Nenhuma sala especificada. Use um link de sala para entrar.'),
        React.createElement('p', { className: 'no-room-hint' },
          'Formato: /room/<room-id> ou ?room=<room-id>'
        )
      )
    );
  }
}

// === Game Overlay Component ===

interface GameOverlayProps {
  colyseusClient: ColyseusClient;
  livekitClient: LiveKitClient;
  gameScene: GameScene | null;
  roomId: string;
}

/**
 * GameOverlay renders the in-game UI controls as an overlay on top of the Phaser canvas.
 * All children have pointer-events: auto so they remain interactive.
 */
const GameOverlay: React.FC<GameOverlayProps> = ({
  colyseusClient,
  livekitClient,
  gameScene,
  roomId,
}) => {
  const handleLocate = (sessionId: string) => {
    gameScene?.showLocateLine(sessionId);
  };

  const handleFollow = (sessionId: string) => {
    gameScene?.startFollow(sessionId);
  };

  return React.createElement('div', { className: 'game-overlay-inner' },
    // Connection status (top-right)
    React.createElement('div', {
      className: 'overlay-connection-status',
      style: { position: 'absolute', top: '16px', right: '16px', pointerEvents: 'auto' }
    },
      React.createElement(ConnectionStatus, { state: 'connected' })
    ),
    // Media controls (bottom-center)
    React.createElement('div', {
      className: 'overlay-media-controls',
      style: { position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto' }
    },
      React.createElement(MediaControls, {
        livekitClient,
        onMuteToggle: () => livekitClient.toggleMute(),
        onVideoToggle: () => {
          if (livekitClient.getIsCameraEnabled()) {
            livekitClient.disableCamera();
          } else {
            livekitClient.enableCamera();
          }
        },
        onScreenShareToggle: () => {
          if (livekitClient.getIsScreenSharing()) {
            livekitClient.stopScreenShare();
          } else {
            livekitClient.startScreenShare();
          }
        },
      })
    ),
    // Participant list (left side)
    React.createElement('div', {
      className: 'overlay-participant-list',
      style: { position: 'absolute', top: '16px', left: '16px', pointerEvents: 'auto' }
    },
      React.createElement(ParticipantList, {
        colyseusClient,
        onLocate: handleLocate,
        onFollow: handleFollow,
      })
    ),
    // Music player (top-center)
    React.createElement('div', {
      className: 'overlay-music-player',
      style: { position: 'absolute', top: '16px', left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto' }
    },
      React.createElement(MusicPlayer, {
        livekitClient,
        colyseusClient,
        roomId,
      })
    )
  );
};

// === Start Application ===

const app = new App();
app.start();
