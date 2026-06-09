# 7Gather

Plataforma de colaboração espacial — um escritório virtual 2D com áudio/vídeo em tempo real, movimentação de avatares e salas interativas. Construído com Phaser 3, React, Colyseus e LiveKit.

---

## ⚡ Quickstart (dev local)

```bash
git clone <url-do-repositorio>
cd 7Gather
cp .env.example .env
npm install
docker compose up livekit -d   # sobe o LiveKit em background
npm run dev:server &           # terminal 1: servidor na porta 2567
npm run dev:client             # terminal 2: cliente na porta 3000
```

Acesse **http://localhost:3000** e pronto.

---

## Pré-requisitos

| Ferramenta | Versão mínima | Observação |
|-----------|---------------|------------|
| [Node.js](https://nodejs.org/) | 18+ | Vem com `npm` |
| [Docker](https://docs.docker.com/get-docker/) | 20+ | Necessário para LiveKit |
| [Docker Compose](https://docs.docker.com/compose/install/) | v2+ | Já incluso no Docker Desktop |

> **Dica:** No Windows, use o Docker Desktop que já inclui Docker Compose. No Linux, instale via apt/dnf ou o pacote `docker-compose-plugin`.

---

## Configuração do Ambiente

### 1. Clone o repositório

```bash
git clone <url-do-repositorio>
cd 7Gather
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Os valores padrão já funcionam para desenvolvimento local. Variáveis principais:

| Variável | Descrição | Padrão (dev) |
|----------|-----------|--------------|
| `LIVEKIT_URL` | URL do servidor LiveKit | `ws://localhost:7880` |
| `LIVEKIT_API_KEY` | Chave de API do LiveKit | `devkey7gather` |
| `LIVEKIT_API_SECRET` | Secret da API do LiveKit | `this-is-a-dev-secret-at-least-32chars` |

> Para produção, veja também `DOMAIN`, `SSL_CERT_PATH`, `CERTBOT_EMAIL` no `.env.example`.

### 3. Instale as dependências

```bash
npm install
```

---

## Subindo o Projeto

### Opção 1: Desenvolvimento Local (recomendado)

Roda client e server separados com hot-reload. Você precisa de 3 terminais (ou use `&` / tabs).

**1. LiveKit (via Docker):**

```bash
docker compose up livekit -d
```

Sobe nas portas `7880` (WS) e `7881` (TCP). Use `-d` para rodar em background.

**2. Servidor Colyseus:**

```bash
npm run dev:server
```

Sobe na porta `2567`.

**3. Cliente Vite:**

```bash
npm run dev:client
```

Sobe na porta `3000` com proxy automático para o servidor.

✅ Acesse: **http://localhost:3000**

---

### Opção 2: Docker Compose (stack completa)

Sobe todos os serviços com um comando:

```bash
docker compose up --build
```

| Serviço | Porta | Descrição |
|---------|-------|-----------|
| Client (Nginx) | 80 | Frontend da aplicação |
| Nginx Proxy Manager | 81 | Painel admin do proxy (login: `admin@example.com` / `changeme`) |
| Colyseus | 2567 | Servidor de game/WebSocket |
| LiveKit | 7880 | Servidor de áudio/vídeo (SFU) |

```bash
docker compose up --build -d  # em background
docker compose down            # parar tudo
docker compose logs -f colyseus # ver logs de um serviço
```

---

## Testes

```bash
npm test               # rodar todos os testes (vitest run)
npm run test:watch     # modo watch (ideal durante dev)
npm run test:integration  # testes de integração
```

---

## Endpoints da API

Com o servidor rodando (`localhost:2567`):

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/health` | Health check |
| GET | `/rooms` | Lista salas ativas |
| POST | `/rooms` | Cria uma nova sala |
| POST | `/livekit/token` | Gera token de acesso ao LiveKit |
| POST | `/maps` | Upload de mapa (JSON, até 5MB) |
| GET | `/colyseus` | Painel de monitoramento Colyseus |

**Exemplos:**

```bash
# Health check
curl http://localhost:2567/health

# Gerar token LiveKit
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
│   │   └── integration/# Glue de integração entre sistemas
│   ├── server/         # Backend (Express + Colyseus)
│   │   ├── rooms/      # SpatialRoom, RoomManager, rotas
│   │   ├── media/      # Integração LiveKit (tokens)
│   │   └── state/      # Schema de estado (Colyseus)
│   └── shared/         # Tipos e constantes compartilhados
├── docker-compose.yml  # Orquestração de containers
├── package.json        # Dependências e scripts
└── vite.config.ts      # Config do Vite
```

---

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Porta em uso | Verifique se 2567, 3000, 7880 e 80/81 estão livres (`netstat -ano \| findstr :3000` no Windows) |
| LiveKit não conecta | Confira se o container está rodando: `docker compose ps`. Verifique se as chaves no `.env` batem com `config/livekit.yaml` |
| Erro no build Docker | `docker compose build --no-cache` para forçar rebuild limpo |
| Testes falhando | Rode `npm install` — pode ter dependência nova após um pull |
| `ts-node` não encontrado | Certifique-se de ter rodado `npm install` (é devDependency) |

---

## Scripts Úteis

```bash
node scripts/generate-avatar.js    # Gerar sprite de avatar
node scripts/generate-avatars.js   # Gerar todos os avatares
node scripts/generate-tileset.js   # Gerar tileset
node scripts/generate-map.js       # Gerar mapa

npm run build:client               # Build de produção (client)
npm run build:server               # Build de produção (server)
```

---

## Tech Stack

- **Frontend:** Phaser 3, React 18, Vite 5, livekit-client
- **Backend:** Express 4, Colyseus 0.15, livekit-server-sdk
- **Infra:** LiveKit (SFU), Docker Compose, Nginx Proxy Manager
- **Testes:** Vitest 2, Testing Library, jsdom
