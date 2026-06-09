# 7Gather

Plataforma de colaboração espacial — um escritório virtual 2D com áudio/vídeo em tempo real, movimentação de avatares e salas interativas. Construído com Phaser 3, React, Colyseus e LiveKit.

## Pré-requisitos

- **Node.js** >= 18
- **npm** (incluso com o Node)
- **Docker** e **Docker Compose** (para subir a infraestrutura completa)

## Configuração do Ambiente

1. Clone o repositório:

```bash
git clone <url-do-repositorio>
cd 7Gather
```

2. Copie o arquivo de variáveis de ambiente e ajuste se necessário:

```bash
cp .env.example .env
```

Os valores padrão do `.env.example` já funcionam para desenvolvimento local. As variáveis principais são:

| Variável | Descrição | Valor padrão (dev) |
|----------|-----------|-------------------|
| `LIVEKIT_URL` | URL do servidor LiveKit | `ws://localhost:7880` |
| `LIVEKIT_API_KEY` | Chave de API do LiveKit | `devkey7gather` |
| `LIVEKIT_API_SECRET` | Secret da API do LiveKit | `this-is-a-dev-secret-at-least-32chars` |

3. Instale as dependências:

```bash
npm install
```

---

## Subindo o Projeto

### Opção 1: Desenvolvimento Local (recomendado para dev)

Essa opção roda client e server separados, com hot-reload.

**Terminal 1 — Servidor Colyseus:**

```bash
npm run dev:server
```

O servidor sobe na porta `2567`.

**Terminal 2 — Cliente Vite (React + Phaser):**

```bash
npm run dev:client
```

O cliente sobe na porta `3000` com proxy automático para o servidor.

**Terminal 3 — LiveKit (via Docker):**

```bash
docker compose up livekit
```

O LiveKit sobe nas portas `7880` (WebSocket) e `7881` (TCP).

Acesse o app em: **http://localhost:3000**

---

### Opção 2: Docker Compose (ambiente completo)

Sobe todos os serviços (Nginx Proxy Manager, Colyseus, LiveKit e Client) com um comando:

```bash
docker compose up --build
```

Serviços disponíveis:

| Serviço | Porta | Descrição |
|---------|-------|-----------|
| Client (Nginx) | 80 | Frontend da aplicação |
| Nginx Proxy Manager | 81 | Painel de administração do proxy |
| Colyseus | 2567 | Servidor de game/WebSocket |
| LiveKit | 7880 | Servidor de áudio/vídeo |

Para rodar em background:

```bash
docker compose up --build -d
```

Para parar todos os serviços:

```bash
docker compose down
```

---

## Testando

### Testes unitários

```bash
npm test
```

### Testes em modo watch (durante desenvolvimento)

```bash
npm run test:watch
```

### Testes de integração

```bash
npm run test:integration
```

---

## Endpoints da API

Com o servidor rodando, os seguintes endpoints estão disponíveis:

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/health` | Health check do servidor |
| GET | `/rooms` | Lista salas ativas |
| POST | `/rooms` | Cria uma nova sala |
| POST | `/livekit/token` | Gera token de acesso ao LiveKit |
| POST | `/maps` | Upload de mapa (JSON, até 5MB) |
| GET | `/colyseus` | Painel de monitoramento Colyseus |

### Exemplo: Health Check

```bash
curl http://localhost:2567/health
```

### Exemplo: Gerar token LiveKit

```bash
curl -X POST http://localhost:2567/livekit/token \
  -H "Content-Type: application/json" \
  -d '{"roomName": "sala-teste", "participantName": "usuario1"}'
```

---

## Estrutura do Projeto

```
7Gather/
├── config/             # Configs (LiveKit, Nginx)
├── docker/             # Dockerfiles (client e server)
├── docs/               # Documentação adicional
├── public/             # Assets estáticos (mapas, sprites)
├── scripts/            # Scripts utilitários (geração de avatares/tilesets)
├── src/
│   ├── client/         # Frontend (Phaser + React)
│   │   ├── game/       # Cena do jogo, avatares, follow system
│   │   ├── network/    # Clients Colyseus e LiveKit
│   │   ├── ui/         # Componentes React (controles, seletor de avatar)
│   │   └── integration/# Testes de integração do client
│   ├── server/         # Backend (Express + Colyseus)
│   │   ├── rooms/      # SpatialRoom, RoomManager, rotas
│   │   ├── media/      # Integração LiveKit (tokens)
│   │   └── state/      # Schema de estado (Colyseus)
│   └── shared/         # Tipos e utilitários compartilhados
├── docker-compose.yml  # Orquestração de containers
├── package.json        # Dependências e scripts
└── vite.config.ts      # Config do Vite (build + dev server)
```

---

## Troubleshooting

- **Porta em uso:** Certifique-se de que as portas 2567, 3000, 7880 e 80/81 não estão sendo usadas por outros processos.
- **LiveKit não conecta:** Verifique se o container `livekit` está rodando (`docker compose ps`) e se as variáveis `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` no `.env` batem com o `config/livekit.yaml`.
- **Erro no build do Docker:** Rode `docker compose build --no-cache` para forçar rebuild limpo.
- **Testes falhando:** Certifique-se de ter rodado `npm install` após pulls recentes.

---

## Scripts Úteis

```bash
# Gerar sprite de avatar
node scripts/generate-avatar.js

# Gerar tileset
node scripts/generate-tileset.js

# Build do client (produção)
npm run build:client

# Build do server (produção)
npm run build:server
```
