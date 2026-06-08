# Implementation Plan: Spatial Collaboration Platform

## Overview

Implementação incremental de um escritório virtual 2D auto-hospedado usando Phaser 3 (renderização), Colyseus (sincronização de estado via WebSocket) e LiveKit SFU (áudio/vídeo via WebRTC). O plano está organizado por dependências: infraestrutura e tipos base primeiro, depois servidor de estado, mídia, e por fim funcionalidades de alto nível.

## Tasks

- [ ] 1. Estrutura do projeto e interfaces base
  - [x] 1.1 Criar estrutura de diretórios e configuração do projeto
    - Criar diretórios `src/client/game/`, `src/client/network/`, `src/client/ui/`, `src/server/rooms/`, `src/server/state/`, `src/server/media/`, `config/`, `docker/`
    - Configurar `package.json` com dependências: phaser@3, colyseus, @colyseus/schema, livekit-client, livekit-server-sdk, react, typescript
    - Configurar `tsconfig.json` com strict mode e paths
    - Configurar bundler (Vite) para o cliente
    - _Requisitos: 10.1_

  - [x] 1.2 Definir interfaces e tipos compartilhados
    - Criar `src/shared/types.ts` com interfaces: `AvatarState`, `Direction`, `MoveMessage`, `ZoneMessage`, `MusicMessage`, `TiledJSON`, `TiledLayer`, `TiledProperty`, `MapValidationResult`
    - Criar `src/shared/constants.ts` com: `AVATAR_SPEED = 4`, `TILE_SIZE = 32`, `MAX_AVATARS = 20`, `MAX_ROOMS = 50`, `SYNC_RATE = 20`, `MAX_LATENCY_MS = 200`, `RECONNECT_TIMEOUT_MS = 5000`
    - _Requisitos: 1.1, 1.2, 7.1, 8.1_

  - [x] 1.3 Criar esquemas Colyseus (RoomState)
    - Implementar `src/server/state/RoomState.ts` com classes `PlayerSchema`, `MusicSchema`, `RoomState` usando decorators `@type` do `@colyseus/schema`
    - `PlayerSchema`: sessionId, displayName, avatarId (uint8), x (float32), y (float32), direction, isMoving, isMuted, currentZone
    - `MusicSchema`: source, startedBy, isPlaying
    - `RoomState`: players (MapSchema), music, mapVersion
    - _Requisitos: 7.1, 7.4, 8.1_

- [x] 2. Servidor de Estado (Colyseus)
  - [x] 2.1 Implementar SpatialRoom handler
    - Criar `src/server/rooms/SpatialRoom.ts` estendendo `Room<RoomState>`
    - Implementar `onCreate` com configuração de maxClients (padrão 20, range 2-50), carregamento de mapa, e frequência de patch (50ms = 20 updates/sec)
    - Implementar `onJoin` adicionando PlayerSchema ao state com avatarId e displayName, e envio de state snapshot completo
    - Implementar `onLeave` removendo player do state e notificando demais clientes (timeout 5s para reconexão)
    - Implementar `onDispose` para cleanup
    - _Requisitos: 7.1, 7.2, 7.3, 9.1, 9.4, 11.4_

  - [x] 2.2 Implementar handlers de mensagens do servidor
    - Handler `"move"`: atualizar x, y, direction do PlayerSchema correspondente ao client, validar posição contra mapa
    - Handler `"zone_enter"`: atualizar `currentZone` do player, emitir evento para integração com LiveKit
    - Handler `"zone_leave"`: limpar `currentZone`, emitir evento de saída de zona
    - Handler `"music_play"`: validar formato (mp3/ogg/wav), atualizar MusicSchema, limitar 1 música ativa por sala
    - Handler `"music_stop"`: parar música, limpar MusicSchema
    - _Requisitos: 1.3, 4.1, 4.3, 6.1, 6.4, 7.4_

  - [x] 2.3 Implementar gerenciamento multi-sala
    - Criar `src/server/rooms/RoomManager.ts` para registro e lookup de salas
    - Implementar criação de sala com link único (UUID), limite de 50 salas simultâneas
    - Implementar rota HTTP `GET /rooms` para listar salas ativas e `POST /rooms` para criação
    - Implementar validação de sala existente no join (retornar erro se sala inexistente/removida)
    - _Requisitos: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 2.4 Implementar reconexão e tolerância a falhas
    - Configurar `allowReconnection` no Colyseus com timeout de 5 segundos
    - Implementar reenvio de state completo no reconect
    - Implementar detecção de desconexão (5s inatividade) e remoção do avatar
    - _Requisitos: 1.5, 7.3, 7.5_

  - [x] 2.5 Escrever testes unitários para SpatialRoom
    - Testar onJoin/onLeave atualizam state corretamente
    - Testar handler "move" valida posição
    - Testar limite de maxClients rejeita conexões excedentes
    - Testar reconexão preserva state do player
    - _Requisitos: 7.1, 7.2, 7.3, 9.4, 11.4_

- [x] 3. Checkpoint - Verificar servidor de estado
  - Garantir que todos os testes passam, perguntar ao usuário se surgirem dúvidas.

- [x] 4. Servidor de Mídia (LiveKit)
  - [x] 4.1 Criar serviço de geração de tokens LiveKit
    - Implementar `src/server/media/LiveKitTokenService.ts`
    - Gerar tokens JWT com permissões: canPublish, canSubscribe, canPublishData
    - Implementar `generateToken` para canal geral da sala
    - Implementar `generateZoneToken` para canais de zonas privadas
    - Expor rota HTTP `POST /livekit/token` no servidor Colyseus
    - _Requisitos: 2.1, 4.1_

  - [x] 4.2 Configurar LiveKit Server
    - Criar `config/livekit.yaml` com: port 7880, RTC ports 50000-60000/UDP, TCP port 7881, TURN habilitado (ports 5349/3478), max_participants 50, empty_timeout 300s
    - Configurar variáveis de ambiente para API key/secret
    - _Requisitos: 2.2, 3.4, 10.1_

  - [x] 4.3 Escrever testes unitários para LiveKitTokenService
    - Testar geração de token com permissões corretas
    - Testar token de zona privada contém room name correto
    - _Requisitos: 2.1, 4.1_

- [x] 5. Cliente - Motor de Renderização (Phaser 3)
  - [x] 5.1 Implementar TiledMapManager
    - Criar `src/client/game/TiledMapManager.ts`
    - Implementar `loadMap`: carregar JSON, criar tilemap layers (Ground, Physics, Objects, Top)
    - Implementar `isColliding`: verificar propriedade "collide" na camada Physics
    - Implementar `getPrivateZoneAt`: detectar tiles com propriedade "jitsiRoom" e retornar PrivateZone correspondente
    - Implementar `validateMapFile`: verificar presença das 4 camadas obrigatórias, tamanho máximo 5MB, formato válido
    - _Requisitos: 12.1, 12.2, 12.4_

  - [x] 5.2 Implementar PlayerAvatar e movimentação
    - Criar `src/client/game/PlayerAvatar.ts`
    - Implementar `move`: movimentação a 4 tiles/sec com interpolação delta time, colisão apenas com Physics layer
    - Implementar animações de caminhada e idle por direção
    - Implementar indicador visual de mute no sprite
    - Implementar classe `RemoteAvatar` com interpolação suave de posição (lerp)
    - _Requisitos: 1.1, 1.2, 2.4_

  - [x] 5.3 Implementar GameScene principal
    - Criar `src/client/game/GameScene.ts` estendendo `Phaser.Scene`
    - Implementar `create`: carregar mapa, instanciar avatar local, configurar câmera follow
    - Implementar `update`: processar input (setas + WASD), atualizar posição, detectar entrada/saída de zonas privadas
    - Implementar gerenciamento de avatares remotos (Map<sessionId, RemoteAvatar>)
    - Implementar detecção de zona privada: quando avatar entra/sai, emitir eventos para troca de canal de áudio
    - _Requisitos: 1.1, 1.2, 1.3, 4.1, 4.3_

  - [x] 5.4 Implementar sistema de Follow e Localização
    - Implementar `startFollow`: mover avatar automaticamente em direção ao alvo, parar a 1 tile de distância
    - Implementar `stopFollow`: cancelar ao pressionar tecla direcional
    - Implementar `showLocateLine`: desenhar linha conectando avatar local ao alvo, atualizar em tempo real
    - Implementar `hideLocateLine`: remover ao ativar follow, nova busca, ou Escape
    - Implementar parada na borda de zona privada se alvo entrar na zona
    - Implementar cancelamento se alvo desconectar
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 5.5 Escrever testes unitários para TiledMapManager
    - Testar validação rejeita mapa sem camadas obrigatórias
    - Testar validação rejeita mapa > 5MB
    - Testar detecção de colisão na camada Physics
    - Testar detecção de zonas privadas por propriedade "jitsiRoom"
    - _Requisitos: 12.1, 12.2, 12.4_

- [x] 6. Checkpoint - Verificar motor de renderização
  - Garantir que todos os testes passam, perguntar ao usuário se surgirem dúvidas.

- [x] 7. Cliente - Módulo de Rede
  - [x] 7.1 Implementar ColyseusClient
    - Criar `src/client/network/ColyseusClient.ts`
    - Implementar `connect` e `joinRoom` com opções (roomId, avatarId, displayName)
    - Implementar `sendPosition`: enviar MoveMessage com x, y, direction, timestamp
    - Implementar fila de posições offline (positionQueue) com flush após reconexão
    - Implementar reconexão automática com indicação visual após 5s
    - Implementar listeners: `onStateChange`, `onPlayerJoin`, `onPlayerLeave`
    - _Requisitos: 1.3, 1.5, 7.1, 7.2, 7.5_

  - [x] 7.2 Implementar LiveKitClient
    - Criar `src/client/network/LiveKitClient.ts`
    - Implementar `connect`: obter token do servidor, conectar à room LiveKit
    - Implementar áudio automático: `enableMicrophone` no connect, `toggleMute`
    - Implementar vídeo sob demanda: `enableCamera` (720p 30FPS), `disableCamera`
    - Implementar screen share: `startScreenShare` (Full HD 5FPS com Simulcast), `stopScreenShare`
    - Implementar `switchAudioChannel`: desconectar canal atual, reconectar ao novo canal (room ou zone) em ≤500ms
    - Implementar handlers de erro: permissão negada (modo somente escuta), reconexão (3 tentativas a cada 5s)
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 7.3 Implementar integração de música compartilhada
    - Implementar `publishMusicTrack`: carregar URL/arquivo (MP3, OGG, WAV), publicar como AudioTrack no LiveKit
    - Implementar `stopMusicTrack`: parar publicação
    - Implementar `setMusicVolume`: controle local de volume (0-100, padrão 50)
    - Implementar auto-conexão de novo participante ao stream de música existente
    - Validar URL acessível e formato suportado antes de publicar
    - _Requisitos: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 7.4 Escrever testes unitários para módulo de rede
    - Testar fila de posições acumula durante desconexão e faz flush após reconexão
    - Testar switchAudioChannel troca de canal corretamente
    - Testar modo somente escuta quando microfone negado
    - _Requisitos: 1.5, 2.5, 4.1_

- [x] 8. Cliente - Interface do Usuário (React)
  - [x] 8.1 Implementar tela de seleção de avatar
    - Criar `src/client/ui/components/AvatarSelector.tsx`
    - Exibir grid com 20 modelos de avatar (robôs, drones, soldados espaciais, aliens pixelados)
    - Ao selecionar, salvar ID (1-20) no LocalStorage e prosseguir para sala
    - Bloquear acesso à sala até seleção ser realizada
    - Validar valor no LocalStorage: se inválido/ausente/fora de range, mostrar tela de seleção
    - Implementar opção de trocar avatar acessível dentro da sala
    - _Requisitos: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [x] 8.2 Implementar controles de mídia
    - Criar `src/client/ui/components/MediaControls.tsx`
    - Botão mute/unmute com indicador visual
    - Botão vídeo on/off (desativado por padrão)
    - Botão screen share on/off (desativado por padrão)
    - Estado dos botões reflete permissões do navegador (desabilitar se permissão negada)
    - _Requisitos: 2.4, 3.1, 3.2, 3.5, 3.6, 3.7_

  - [x] 8.3 Implementar lista de participantes e controles
    - Criar `src/client/ui/components/ParticipantList.tsx`
    - Listar todos os participantes da sala com avatar e nome
    - Botão "Localizar" (mostra linha até o colega)
    - Botão "Seguir" (ativa follow automático)
    - Indicador de zona privada ao lado do nome
    - _Requisitos: 5.1, 5.2_

  - [x] 8.4 Implementar player de música compartilhada
    - Criar `src/client/ui/components/MusicPlayer.tsx`
    - Input para URL de áudio ou upload de arquivo (MP3, OGG, WAV)
    - Indicador visual: nome da música + quem iniciou
    - Slider de volume individual (0-100%, padrão 50%)
    - Botão play/stop (qualquer um pode ajustar volume, apenas quem iniciou ou admin pode parar)
    - _Requisitos: 6.1, 6.2, 6.3, 6.4_

  - [x] 8.5 Implementar indicadores de status de conexão
    - Criar `src/client/ui/components/ConnectionStatus.tsx`
    - Exibir estado: conectado, reconectando, desconectado
    - Notificação de sala cheia com mensagem (Requirement 11.4)
    - Notificação de erros de áudio/vídeo
    - _Requisitos: 1.5, 2.6, 9.5, 11.4_

  - [x] 8.6 Escrever testes unitários para componentes UI
    - Testar AvatarSelector salva ID no LocalStorage
    - Testar MediaControls reflete estado de mute/vídeo/tela
    - Testar MusicPlayer valida formato de entrada
    - _Requisitos: 8.2, 2.4, 6.5_

- [x] 9. Checkpoint - Verificar cliente completo
  - Garantir que todos os testes passam, perguntar ao usuário se surgirem dúvidas.

- [x] 10. Infraestrutura Docker
  - [x] 10.1 Criar docker-compose.yml para deploy local
    - Definir serviço `nginx` (jc21/nginx-proxy-manager) com ports 80, 443, 81
    - Definir serviço `colyseus` com build do servidor, port 2567, healthcheck (curl /health), restart unless-stopped (max 3)
    - Definir serviço `livekit` (livekit/livekit-server:latest) com ports 7880, 7881, 50000-60000/udp, config volume
    - Definir serviço `client` com build do frontend, depends_on colyseus
    - Configurar rede interna entre serviços
    - Configurar variáveis de ambiente via `.env` (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, domínios)
    - _Requisitos: 10.1, 10.3, 10.4, 10.5, 10.6_

  - [x] 10.2 Configurar Nginx para proxy reverso e TLS
    - Configurar redirect HTTP→HTTPS automático
    - Configurar proxy pass para WebSocket (Colyseus :2567) com upgrade headers e timeout ≥300s
    - Configurar proxy pass para LiveKit (:7880) com WebSocket support
    - Configurar Let's Encrypt para certificado SSL automático
    - Documentar configuração de domínio customizado via variáveis de ambiente
    - _Requisitos: 10.2, 10.3, 10.5, 11.2_

  - [x] 10.3 Criar Dockerfiles para servidor e cliente
    - `docker/server/Dockerfile`: Node.js, build TypeScript, expose 2567
    - `docker/client/Dockerfile`: Node.js build stage + Nginx serve stage
    - Otimizar imagens com multi-stage builds
    - _Requisitos: 10.1_

  - [x] 10.4 Criar documentação de deploy público
    - Documentar deploy para Oracle Cloud Free Tier / Fly.io / Railway
    - Passo-a-passo: criação de conta → configuração → plataforma acessível
    - Documentar requisitos mínimos: vCPUs, RAM, banda para 5 salas × 20 participantes
    - Documentar configuração de domínio público e Let's Encrypt
    - Documentar troubleshooting de certificado SSL
    - _Requisitos: 11.1, 11.2, 11.3, 11.5_

  - [x] 10.5 Escrever teste de integração Docker Compose
    - Testar `docker compose up` inicia todos os serviços em ≤120s
    - Testar healthcheck do Colyseus retorna 200
    - Testar conexão WebSocket através do Nginx proxy
    - _Requisitos: 10.1, 10.5, 10.6_

- [x] 11. Integração e Wiring Final
  - [x] 11.1 Integrar fluxo de entrada na sala
    - Conectar AvatarSelector → ColyseusClient.joinRoom → LiveKitClient.connect → GameScene.create
    - Implementar fluxo: verificar avatar no LocalStorage → selecionar se necessário → conectar Colyseus → obter token LiveKit → conectar mídia → carregar mapa → renderizar
    - Implementar desconexão de sala anterior ao entrar em nova sala (via link)
    - _Requisitos: 2.1, 3.6, 8.3, 9.3_

  - [x] 11.2 Integrar zonas privadas com troca de canal de áudio
    - Conectar detecção de zona (GameScene) → ColyseusClient (zone_enter/zone_leave) → LiveKitClient (switchAudioChannel)
    - Garantir troca completa em ≤500ms
    - Garantir isolamento: áudio/vídeo/tela restritos à zona
    - Tratar falha de troca: desconectar de ambos, erro visual, retry 3x a cada 2s
    - _Requisitos: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 11.3 Integrar gerenciamento de mapas com hot-reload
    - Implementar endpoint para upload de mapa no servidor
    - Validar mapa no upload (4 camadas, ≤5MB, formato JSON válido)
    - Atualizar mapVersion no RoomState
    - Clientes carregam novo mapa na próxima reconexão/refresh
    - Manter último mapa válido se novo mapa for rejeitado
    - _Requisitos: 12.1, 12.2, 12.3, 12.4_

  - [x] 11.4 Escrever testes de integração end-to-end
    - Testar fluxo completo: selecionar avatar → entrar na sala → mover → sair
    - Testar entrada/saída de zona privada troca canal de áudio
    - Testar música compartilhada é recebida por novo participante
    - Testar reconexão preserva estado
    - _Requisitos: 1.1, 4.1, 6.6, 7.5_

- [x] 12. Checkpoint Final
  - Garantir que todos os testes passam, executar `docker compose up` e verificar saúde dos serviços, perguntar ao usuário se surgirem dúvidas.

## Notes

- Tasks marcadas com `*` são opcionais e podem ser puladas para um MVP mais rápido
- Cada task referencia requisitos específicos para rastreabilidade
- Checkpoints garantem validação incremental
- A ordem respeita dependências: tipos base → servidor de estado → mídia → renderização → UI → infra → integração
- Testes unitários são complementares à implementação e validam edge cases específicos
- O design usa TypeScript em todos os componentes (cliente e servidor)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "4.1", "4.2"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "4.3"] },
    { "id": 4, "tasks": ["2.5", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "7.1"] },
    { "id": 6, "tasks": ["5.4", "5.5", "7.2"] },
    { "id": 7, "tasks": ["7.3", "7.4", "8.1"] },
    { "id": 8, "tasks": ["8.2", "8.3", "8.4", "8.5"] },
    { "id": 9, "tasks": ["8.6", "10.1", "10.2", "10.3"] },
    { "id": 10, "tasks": ["10.4", "10.5"] },
    { "id": 11, "tasks": ["11.1", "11.2", "11.3"] },
    { "id": 12, "tasks": ["11.4"] }
  ]
}
```
