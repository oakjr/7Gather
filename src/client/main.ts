// 7Gather - Spatial Collaboration Platform
// Client entry point - wires together all modules into a functional application.
//
// Flow:
// 1. Parse room ID from URL (or show room creation UI)
// 2. RoomEntryFlow: avatar check → Colyseus connect → LiveKit connect
// 3. On ready: create Phaser GameScene, bind ZoneAudioIntegration, wire network sync
//
// Requirements: 2.1, 3.6, 8.3, 9.3

import './styles/index.css';

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
import { StatusSelector } from './ui/components/StatusSelector';
import { getMyHomeRoom, setMyHomeRoom, clearMyHomeRoom, isRoomAvailable, HomeRoomData } from './ui/homeRoom';
import { onZoneChange } from './ui/zoneEvents';
import { getAvatarPosition } from './ui/avatarPosition';
import { SettingsMenu } from './ui/components/SettingsMenu';
import { CollapsibleSection } from './ui/components/CollapsibleSection';
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
    console.log('[App] onRoomReady called, avatarId:', avatarId);

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

    // Click on game area blurs any focused input so keyboard returns to game
    gameContainer.addEventListener('pointerdown', () => {
      if (document.activeElement && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });

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
    // Hide the root entry UI since the game is now active
    const rootEl = document.getElementById('root');
    if (rootEl) {
      rootEl.style.pointerEvents = 'none';
      rootEl.style.display = 'none';
    }

    // Create overlay container
    const overlayContainer = document.createElement('div');
    overlayContainer.id = 'game-overlay';
    overlayContainer.style.position = 'absolute';
    overlayContainer.style.top = '0';
    overlayContainer.style.left = '0';
    overlayContainer.style.width = '100%';
    overlayContainer.style.height = '100%';
    overlayContainer.style.pointerEvents = 'none';
    overlayContainer.style.zIndex = '1000';
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

    console.log('[App] Overlay rendered, container:', overlayContainer);
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
  const [musicTrack, setMusicTrack] = React.useState<{source: string; startedBy: string; isPlaying: boolean} | null>(null);
  const [musicVolume, setMusicVolume] = React.useState(livekitClient.getMusicVolume());
  const [musicProgress, setMusicProgress] = React.useState({ currentTime: 0, duration: 0 });
  const [isMusicMuted, setIsMusicMuted] = React.useState(false);
  const [isMusicPaused, setIsMusicPaused] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [allSectionsState, setAllSectionsState] = React.useState<boolean | null>(false);
  const [currentZoneId, setCurrentZoneId] = React.useState<string | null>(null);
  const [homeRoom, setHomeRoom] = React.useState<HomeRoomData | null>(getMyHomeRoom());

  // Listen for zone changes via global event bus
  React.useEffect(() => {
    const unsub = onZoneChange((zoneId) => setCurrentZoneId(zoneId));
    return unsub;
  }, []);

  // Update music progress every 500ms
  React.useEffect(() => {
    if (!musicTrack) return;
    const interval = setInterval(() => {
      const progress = livekitClient.getMusicProgress();
      if (progress) {
        setMusicProgress(progress);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [musicTrack, livekitClient]);

  const handleLocate = (sessionId: string) => {
    gameScene?.showLocateLine(sessionId);
  };

  const handleFollow = (sessionId: string) => {
    gameScene?.startFollow(sessionId);
  };

  const handlePlay = (source: string, displayName?: string) => {
    livekitClient.publishMusicTrack(source)
      .then(() => {
        const trackName = displayName || source.split('/').pop() || 'Música';
        setMusicTrack({
          source: trackName,
          startedBy: localStorage.getItem('display_name') || 'Eu',
          isPlaying: true,
        });
      })
      .catch((err) => console.error('[MusicPlayer]', err));
  };

  const handleStop = () => {
    livekitClient.stopMusicTrack();
    setMusicTrack(null);
  };

  const handleVolumeChange = (vol: number) => {
    livekitClient.setMusicVolume(vol);
    setMusicVolume(vol);
  };

  const handleToggleMusicMute = () => {
    if (isMusicMuted) {
      // Unmute: restore previous volume
      livekitClient.setMusicVolume(musicVolume);
      setIsMusicMuted(false);
    } else {
      // Mute: set volume to 0 but keep slider state
      livekitClient.setMusicVolume(0);
      setIsMusicMuted(true);
    }
  };

  return React.createElement('div', { className: 'game-overlay-inner' },
    // Sidebar toggle button (always visible)
    React.createElement('button', {
      className: `sidebar-toggle-btn${sidebarCollapsed ? '' : ' sidebar-open'}`,
      onClick: () => setSidebarCollapsed(!sidebarCollapsed),
      'aria-label': sidebarCollapsed ? 'Abrir painel' : 'Minimizar painel',
    }, sidebarCollapsed ? '◀' : '▶'),
    // Sidebar (right side - collapsible)
    !sidebarCollapsed && React.createElement('div', { className: 'overlay-sidebar' },
      // Logo
      React.createElement('div', { className: 'sidebar-logo' },
        React.createElement('img', { src: '/logo.png', alt: '7Gather', className: 'sidebar-logo-img' })
      ),
      // Collapse All / Expand All button
      React.createElement('button', {
        className: 'sidebar-collapse-all-btn',
        onClick: () => {
          setAllSectionsState(prev => prev === false ? true : false);
        },
      }, allSectionsState === false ? '💥 Expandir Tudo' : '🕳️ Colapsar Tudo'),
      // Status section
      React.createElement(CollapsibleSection, { title: '🟢 Status', defaultOpen: false, forceState: allSectionsState },
        React.createElement(StatusSelector, { initialStatus: 'available' })
      ),
      // Participants section
      React.createElement(CollapsibleSection, { title: '👥 Participantes', defaultOpen: false, forceState: allSectionsState },
        React.createElement(ParticipantList, {
          participants: [{
            sessionId: 'local',
            displayName: localStorage.getItem('display_name') || 'Eu',
            avatarId: Number(localStorage.getItem('avatar_id')) || 1,
            currentZone: '',
          }],
          onLocate: handleLocate,
          onFollow: handleFollow,
        })
      ),
      // Music player section
      React.createElement(CollapsibleSection, { title: '🎵 Música', defaultOpen: false, forceState: allSectionsState },
        React.createElement(MusicPlayer, {
          currentTrack: musicTrack,
          volume: musicVolume,
          isMusicMuted,
          onVolumeChange: handleVolumeChange,
          onPlay: handlePlay,
          onStop: handleStop,
          onToggleMusicMute: handleToggleMusicMute,
          isPaused: isMusicPaused,
          onTogglePause: () => {
            const paused = livekitClient.toggleMusicPause();
            setIsMusicPaused(paused);
          },
          currentTime: musicProgress.currentTime,
          duration: musicProgress.duration,
          onSeek: (time: number) => livekitClient.seekMusic(time),
        })
      ),
      // Home Room section
      React.createElement(CollapsibleSection, { title: '🏠 Minha Sala', defaultOpen: false, forceState: allSectionsState },
        homeRoom
          ? React.createElement('div', { className: 'home-room-info' },
              React.createElement('span', { className: 'home-room-name' }, `📍 ${homeRoom.zoneId}`),
              React.createElement('button', {
                className: 'home-room-btn home-room-btn--reset',
                onClick: () => { clearMyHomeRoom(); setHomeRoom(null); },
              }, '🔄 Redefinir Sala')
            )
          : React.createElement('div', { className: 'home-room-info' },
              currentZoneId && currentZoneId !== 'sala-reuniao' && isRoomAvailable(currentZoneId)
                ? React.createElement('button', {
                    className: 'home-room-btn home-room-btn--claim',
                    onClick: () => {
                      const displayName = localStorage.getItem('display_name') || 'Eu';
                      const data = {
                        zoneId: currentZoneId!,
                        ownerName: displayName,
                        spawnTileX: getAvatarPosition().tileX,
                        spawnTileY: getAvatarPosition().tileY,
                      };
                      setMyHomeRoom(data);
                      setHomeRoom(data);
                    },
                  }, '✨ Definir Minha Sala')
                : React.createElement('span', { className: 'home-room-hint' },
                    currentZoneId === 'sala-reuniao'
                      ? 'Sala de reunião não pode ser reivindicada'
                      : currentZoneId && !isRoomAvailable(currentZoneId)
                        ? 'Esta sala já tem dono'
                        : 'Entre numa sala livre para reivindicar'
                  )
            )
      ),
      // Settings section
      React.createElement(CollapsibleSection, { title: '⚙️ Opções', defaultOpen: false, forceState: allSectionsState },
        React.createElement(SettingsMenu, {
          currentName: localStorage.getItem('display_name') || 'User',
          currentAvatarId: Number(localStorage.getItem('avatar_id')) || 1,
        })
      )
    ),
    // Media controls (bottom-center, stays floating)
    React.createElement('div', { className: 'overlay-media-controls' },
      React.createElement(MediaControls, {
        isMuted: livekitClient.getIsMuted(),
        isVideoOn: livekitClient.getIsCameraEnabled(),
        isScreenSharing: livekitClient.getIsScreenSharing(),
        onToggleMute: () => livekitClient.toggleMute(),
        onToggleVideo: () => {
          if (livekitClient.getIsCameraEnabled()) {
            livekitClient.disableCamera();
          } else {
            livekitClient.enableCamera();
          }
        },
        onToggleScreenShare: () => {
          if (livekitClient.getIsScreenSharing()) {
            livekitClient.stopScreenShare();
          } else {
            livekitClient.startScreenShare();
          }
        },
      })
    )
  );
};

// === Start Application ===

const app = new App();
app.start();
