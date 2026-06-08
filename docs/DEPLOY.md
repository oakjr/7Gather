# 7Gather - Guia de Deploy Público

Guia completo para disponibilizar a plataforma 7Gather na internet, desde a criação de conta no provedor até a plataforma acessível via navegador com HTTPS.

---

## Sumário

- [Requisitos Mínimos de Infraestrutura](#requisitos-mínimos-de-infraestrutura)
- [Opção 1: Oracle Cloud Free Tier (Recomendado)](#opção-1-oracle-cloud-free-tier-recomendado)
- [Opção 2: Fly.io](#opção-2-flyio)
- [Opção 3: Railway](#opção-3-railway)
- [Configuração de Domínio Público](#configuração-de-domínio-público)
- [Configuração Let's Encrypt (SSL/TLS)](#configuração-lets-encrypt-ssltls)
- [Troubleshooting SSL](#troubleshooting-ssl)
- [Verificação Pós-Deploy](#verificação-pós-deploy)

---

## Requisitos Mínimos de Infraestrutura

### Capacidade alvo: 5 salas × 20 participantes (100 usuários simultâneos)

| Recurso | Mínimo | Recomendado | Justificativa |
|---------|--------|-------------|---------------|
| vCPUs | 2 | 4 | LiveKit SFU consome ~0.5 core por 20 streams de áudio; Colyseus ~0.3 core por sala ativa |
| RAM | 4 GB | 8 GB | LiveKit ~100MB/sala com áudio; Colyseus ~50MB/sala; Nginx ~100MB; overhead do OS |
| Armazenamento | 20 GB | 40 GB | Imagens Docker (~3GB), logs, certificados SSL, mapas |
| Banda de upload | 50 Mbps | 100 Mbps | Áudio Opus ~50kbps/participante × 100 = 5Mbps base; vídeo 720p ~1.5Mbps/stream |
| Banda de download | 10 Mbps | 50 Mbps | Upload domina em SFU; download para pull de imagens e atualizações |
| Portas abertas | 80, 443, 7881, 50000-60000/UDP | — | HTTP, HTTPS, LiveKit TCP, WebRTC media |

### Estimativas de consumo por componente

| Componente | CPU (por sala 20p) | RAM (por sala 20p) | Banda (por sala 20p) |
|------------|--------------------|--------------------|----------------------|
| Colyseus (estado) | ~0.3 vCPU | ~50 MB | ~200 kbps (delta binário 20 updates/sec) |
| LiveKit (áudio) | ~0.5 vCPU | ~100 MB | ~2 Mbps upload (20 streams Opus) |
| LiveKit (vídeo, se ativo) | ~1.0 vCPU | ~200 MB | ~30 Mbps upload (10 streams 720p) |
| Nginx (proxy) | ~0.1 vCPU | ~100 MB | passthrough |
| **Total (apenas áudio)** | **~1.0 vCPU** | **~300 MB** | **~2.5 Mbps** |
| **Total (5 salas, áudio)** | **~4.5 vCPU** | **~1.5 GB** | **~12 Mbps** |

> **Nota:** Vídeo e screen share são sob demanda. Com 5 salas em áudio-only, 4 vCPU e 8 GB RAM são confortáveis. Se vídeo 720p for frequente, considere 8 vCPU.

---

## Opção 1: Oracle Cloud Free Tier (Recomendado)

Oracle Cloud oferece uma instância ARM **Always Free** com 4 OCPU e 24 GB RAM — mais que suficiente para 5 salas × 20 participantes. É a melhor opção custo-benefício (gratuita permanentemente).

### Passo 1: Criar conta Oracle Cloud

1. Acesse [cloud.oracle.com/sign-up](https://cloud.oracle.com/sign-up)
2. Preencha nome, email e país
3. Verifique o email e configure senha
4. Adicione um cartão de crédito (necessário para verificação, **não será cobrado** no Always Free Tier)
5. Selecione a região mais próxima dos seus usuários (ex: `sa-saopaulo-1` para Brasil)
6. Aguarde a ativação da conta (pode levar até 24h)

### Passo 2: Criar instância Compute (Always Free ARM)

1. No console Oracle Cloud, vá em **Compute → Instances → Create Instance**
2. Configure:
   - **Name:** `7gather-server`
   - **Image:** Ubuntu 22.04 (Canonical)
   - **Shape:** Ampere A1 (ARM) — selecione **4 OCPU / 24 GB RAM** (Always Free)
   - **Boot volume:** 100 GB (Always Free permite até 200 GB total)
3. Em **Networking**:
   - Crie ou selecione uma VCN (Virtual Cloud Network)
   - Marque **Assign a public IPv4 address**
   - Anote o IP público atribuído
4. Em **Add SSH keys**:
   - Gere ou faça upload da sua chave SSH pública
5. Clique **Create**

### Passo 3: Configurar Security List (Firewall)

1. Vá em **Networking → Virtual Cloud Networks → sua VCN → Security Lists**
2. Adicione Ingress Rules:

| Porta | Protocolo | Origem | Descrição |
|-------|-----------|--------|-----------|
| 22 | TCP | Seu IP | SSH |
| 80 | TCP | 0.0.0.0/0 | HTTP (redirect para HTTPS) |
| 443 | TCP | 0.0.0.0/0 | HTTPS |
| 81 | TCP | Seu IP | Nginx Proxy Manager admin |
| 7881 | TCP | 0.0.0.0/0 | LiveKit TCP fallback |
| 50000-60000 | UDP | 0.0.0.0/0 | WebRTC media (LiveKit) |

> **Importante:** O firewall do Ubuntu (`iptables`) também precisa ser configurado. Veja Passo 5.

### Passo 4: Instalar Docker e Docker Compose

Conecte via SSH e execute:

```bash
ssh -i ~/.ssh/sua_chave ubuntu@<IP_PUBLICO>

# Atualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sudo sh

# Adicionar usuário ao grupo docker
sudo usermod -aG docker $USER

# Instalar Docker Compose plugin
sudo apt install docker-compose-plugin -y

# Verificar instalação
docker --version
docker compose version

# Logout e login novamente para aplicar grupo docker
exit
```

### Passo 5: Configurar iptables (Oracle Cloud ARM)

Oracle Cloud ARM usa `iptables` como firewall interno além da Security List. É necessário liberar as portas:

```bash
ssh -i ~/.ssh/sua_chave ubuntu@<IP_PUBLICO>

# Liberar portas no iptables
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 81 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 7881 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p udp --dport 50000:60000 -j ACCEPT

# Persistir regras
sudo apt install iptables-persistent -y
sudo netfilter-persistent save
```

### Passo 6: Deploy da aplicação

```bash
# Clonar repositório
git clone https://github.com/seu-org/7gather.git
cd 7gather

# Configurar variáveis de ambiente
cp .env.example .env
nano .env
```

Edite o `.env` para produção:

```bash
# LiveKit - gerar chaves seguras
LIVEKIT_URL=wss://livekit.seudominio.com
LIVEKIT_API_KEY=$(openssl rand -hex 16)
LIVEKIT_API_SECRET=$(openssl rand -hex 32)

# Domínio
DOMAIN=gather.seudominio.com
CERTBOT_EMAIL=admin@seudominio.com
```

> **Dica:** Gere as chaves LiveKit com: `openssl rand -hex 16` (key) e `openssl rand -hex 32` (secret)

Inicie os serviços:

```bash
docker compose up -d

# Verificar status
docker compose ps
docker compose logs -f --tail=50
```

### Passo 7: Configurar Nginx Proxy Manager

1. Acesse `http://<IP_PUBLICO>:81`
2. Login inicial: `admin@example.com` / `changeme`
3. **Mude a senha imediatamente**
4. Configure os proxy hosts conforme documentado em `config/nginx/README.md`
5. Ative SSL com Let's Encrypt para cada host (veja seção [Configuração Let's Encrypt](#configuração-lets-encrypt-ssltls))

---

## Opção 2: Fly.io

Fly.io oferece deploy simples com escala global. O tier gratuito inclui 3 VMs compartilhadas com 256 MB RAM. Para 7Gather em produção, será necessário o plano pago (~$5-15/mês).

### Passo 1: Criar conta e instalar CLI

1. Acesse [fly.io/app/sign-up](https://fly.io/app/sign-up)
2. Crie conta com GitHub ou email
3. Adicione cartão de crédito (necessário para VMs dedicadas)

```bash
# Instalar flyctl
curl -L https://fly.io/install.sh | sh

# Login
fly auth login
```

### Passo 2: Criar aplicação

```bash
cd 7gather

# Inicializar app Fly.io
fly launch --name 7gather --region gru --no-deploy
```

### Passo 3: Criar `fly.toml`

Crie o arquivo `fly.toml` na raiz do projeto:

```toml
app = "7gather"
primary_region = "gru"  # São Paulo

[build]
  dockerfile = "docker/server/Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "2567"

[http_service]
  internal_port = 2567
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1

  [http_service.concurrency]
    type = "connections"
    hard_limit = 200
    soft_limit = 150

[[services]]
  protocol = "udp"
  internal_port = 50000

  [[services.ports]]
    port = 50000

[[vm]]
  cpu_kind = "shared"
  cpus = 2
  memory_mb = 2048
```

### Passo 4: Configurar secrets

```bash
# Configurar variáveis sensíveis
fly secrets set LIVEKIT_API_KEY=$(openssl rand -hex 16)
fly secrets set LIVEKIT_API_SECRET=$(openssl rand -hex 32)
fly secrets set LIVEKIT_URL=wss://7gather-livekit.fly.dev
```

### Passo 5: Deploy

```bash
fly deploy
```

### Limitações do Fly.io

- **UDP:** Fly.io suporta UDP limitado. WebRTC media (portas 50000-60000/UDP) pode não funcionar diretamente. Use TURN relay como fallback.
- **Múltiplos serviços:** Cada serviço (Colyseus, LiveKit, client) precisa ser um app Fly separado ou usar processo multi-app.
- **LiveKit:** Considere usar [LiveKit Cloud](https://livekit.io/cloud) como serviço gerenciado em vez de self-hosted no Fly.io.
- **Recomendação:** Use Fly.io para Colyseus + Client, e LiveKit Cloud para mídia.

### Arquitetura recomendada no Fly.io

```
fly.io (7gather-app)     → Colyseus + Client (HTTP/WS)
fly.io (7gather-livekit) → LiveKit Server (ou LiveKit Cloud)
Fly.io Proxy             → TLS automático (não precisa de Nginx/Let's Encrypt)
```

> **Nota:** Fly.io provê TLS automaticamente em domínios `*.fly.dev` e em domínios custom via `fly certs add`.

### Passo 6: Domínio customizado no Fly.io

```bash
# Adicionar domínio
fly certs add gather.seudominio.com

# Verificar status do certificado
fly certs show gather.seudominio.com
```

Fly.io provisiona certificados SSL automaticamente — não é necessário configurar Let's Encrypt manualmente.

---

## Opção 3: Railway

Railway oferece deploy instantâneo a partir do repositório Git. Ideal para protótipos e equipes pequenas. O tier gratuito oferece $5/mês de crédito; o plano Pro custa $5/mês + uso.

### Passo 1: Criar conta

1. Acesse [railway.app](https://railway.app)
2. Crie conta com GitHub
3. Ative o plano Pro se precisar de mais de $5/mês de uso

### Passo 2: Criar projeto

1. Clique **New Project → Deploy from GitHub repo**
2. Selecione o repositório `7gather`
3. Railway detectará automaticamente o Dockerfile

### Passo 3: Configurar serviços

No painel do Railway, crie 3 serviços:

#### Serviço 1: Colyseus (Server)

- **Root Directory:** `/`
- **Dockerfile Path:** `docker/server/Dockerfile`
- **Port:** 2567
- **Variables:**
  ```
  LIVEKIT_URL=wss://livekit-<id>.up.railway.app
  LIVEKIT_API_KEY=<gerar>
  LIVEKIT_API_SECRET=<gerar>
  ```

#### Serviço 2: Client

- **Root Directory:** `/`
- **Dockerfile Path:** `docker/client/Dockerfile`
- **Port:** 80

#### Serviço 3: LiveKit (Docker Image)

- **Image:** `livekit/livekit-server:latest`
- **Port:** 7880
- **Variables:**
  ```
  LIVEKIT_KEYS=<api_key>:<api_secret>
  ```
- **Volume Mount:** Crie um volume e monte o `livekit.yaml` em `/etc/livekit.yaml`

### Passo 4: Configurar networking

1. Para cada serviço, em **Settings → Networking**:
   - Gere um domínio público Railway (`*.up.railway.app`)
   - Ou adicione domínio customizado

2. Habilite **HTTP → HTTPS redirect** (automático no Railway)

### Passo 5: Deploy

Railway faz deploy automático a cada push no branch configurado. Para deploy manual:

1. No painel do projeto, clique **Deploy**
2. Acompanhe logs em tempo real

### Limitações do Railway

- **UDP não suportado:** Railway não suporta portas UDP. WebRTC media precisa de TURN/TCP relay obrigatoriamente.
- **Custo:** Com 5 salas ativas, espere ~$15-30/mês dependendo do uso de CPU/RAM.
- **LiveKit:** Fortemente recomendado usar [LiveKit Cloud](https://livekit.io/cloud) em vez de self-hosted no Railway.
- **Ephemeral storage:** Volumes persistem, mas o filesystem do container é efêmero.

### Arquitetura recomendada no Railway

```
Railway Service 1 → Colyseus + Client
Railway Service 2 → LiveKit (ou LiveKit Cloud externo)
Railway Proxy     → TLS automático
```

---

## Configuração de Domínio Público

### Registrar domínio

Se ainda não tem um domínio, registre em:
- [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) — preço de custo
- [Namecheap](https://www.namecheap.com/) — domínios .com a partir de ~$9/ano
- [Registro.br](https://registro.br/) — domínios .com.br a partir de R$40/ano

### Configurar DNS

Crie os seguintes registros DNS apontando para o IP público do seu servidor:

| Tipo | Nome | Valor | TTL |
|------|------|-------|-----|
| A | `gather.seudominio.com` | `<IP_SERVIDOR>` | 300 |
| A | `ws.gather.seudominio.com` | `<IP_SERVIDOR>` | 300 |
| A | `livekit.gather.seudominio.com` | `<IP_SERVIDOR>` | 300 |

> **Alternativa single-domain:** Use apenas `gather.seudominio.com` com routing baseado em path (veja `config/nginx/README.md`).

### Verificar propagação DNS

```bash
# Verificar se o DNS propagou
dig gather.seudominio.com +short
nslookup gather.seudominio.com

# Deve retornar o IP do seu servidor
```

A propagação DNS pode levar de 5 minutos a 48 horas, mas geralmente completa em menos de 1 hora.

---

## Configuração Let's Encrypt (SSL/TLS)

### Via Nginx Proxy Manager (Recomendado)

O Nginx Proxy Manager automatiza todo o processo de certificados SSL:

1. Acesse o painel admin (`http://<IP>:81`)
2. Vá em **SSL Certificates → Add SSL Certificate → Let's Encrypt**
3. Ou, ao criar/editar um Proxy Host:
   - Aba **SSL** → **Request a new SSL Certificate**
   - Marque **Force SSL** (HTTP → HTTPS redirect automático)
   - Marque **HTTP/2 Support**
   - Informe email para notificações
   - Aceite os termos do Let's Encrypt
   - Clique **Save**

O Nginx Proxy Manager irá:
- ✅ Provisionar certificado automaticamente
- ✅ Renovar antes do vencimento (a cada ~60 dias)
- ✅ Redirecionar HTTP → HTTPS
- ✅ Configurar HTTP/2

### Via Certbot (Deploy manual sem Nginx Proxy Manager)

Se usar nginx tradicional (sem Proxy Manager):

```bash
# Instalar certbot
sudo apt install certbot -y

# Obter certificado (porta 80 deve estar livre)
sudo certbot certonly --standalone \
  -d gather.seudominio.com \
  -d ws.gather.seudominio.com \
  -d livekit.gather.seudominio.com \
  --email admin@seudominio.com \
  --agree-tos \
  --non-interactive

# Verificar certificado
sudo certbot certificates
```

### Renovação automática

Certbot instala automaticamente um timer systemd para renovação:

```bash
# Verificar timer de renovação
sudo systemctl status certbot.timer

# Testar renovação (dry-run)
sudo certbot renew --dry-run
```

Adicione hook para recarregar nginx após renovação:

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'SCRIPT'
#!/bin/bash
docker exec 7gather-nginx nginx -s reload
SCRIPT
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

---

## Troubleshooting SSL

### Problema: Certificado não é provisionado

**Sintomas:** Erro "Could not obtain certificate" no Nginx Proxy Manager ou certbot.

**Diagnóstico e soluções:**

| Causa | Verificação | Solução |
|-------|-------------|---------|
| DNS não propagado | `dig seudominio.com +short` retorna IP errado ou vazio | Aguardar propagação ou corrigir registro A |
| Porta 80 bloqueada | `curl -I http://seudominio.com` timeout | Liberar porta 80 no firewall/security group |
| Porta 80 em uso | `sudo lsof -i :80` mostra outro processo | Parar processo conflitante |
| Rate limit Let's Encrypt | Erro menciona "rate limit" | Aguardar 1 hora; usar staging para testes |
| Domínio incorreto | Certificado pedido para domínio diferente | Verificar domínio no proxy host |

### Problema: Certificado expirou

```bash
# Verificar data de expiração
echo | openssl s_client -connect gather.seudominio.com:443 2>/dev/null | openssl x509 -noout -dates

# Forçar renovação
sudo certbot renew --force-renewal

# Se usar Nginx Proxy Manager: deletar e recriar o certificado no painel
```

### Problema: Mixed content (HTTP em página HTTPS)

**Sintomas:** Navegador bloqueia WebSocket ou recursos.

**Solução:** Garantir que todas as URLs no cliente usem `wss://` (não `ws://`) e `https://`:

```bash
# No .env, usar wss:// para LiveKit em produção
LIVEKIT_URL=wss://livekit.seudominio.com
```

### Problema: WebSocket falha através do proxy

**Sintomas:** Conexão Colyseus/LiveKit fecha imediatamente ou após 60s.

**Diagnóstico:**

```bash
# Testar WebSocket diretamente (bypass nginx)
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  https://ws.seudominio.com/
```

**Soluções:**
1. Verificar que **Websockets Support** está ativado no proxy host
2. Adicionar no Advanced tab do Nginx Proxy Manager:
   ```nginx
   proxy_read_timeout 300s;
   proxy_send_timeout 300s;
   ```
3. Verificar que `proxy_http_version 1.1` está configurado

### Problema: ERR_SSL_PROTOCOL_ERROR no navegador

**Causas comuns:**
1. Certificado não cobre o subdomínio acessado
2. Nginx não está escutando na porta 443
3. Certificado corrompido

```bash
# Verificar certificado do servidor
openssl s_client -connect gather.seudominio.com:443 -servername gather.seudominio.com

# Verificar que nginx responde em 443
docker logs 7gather-nginx | grep -i "error\|ssl"
```

### Problema: Let's Encrypt rate limit atingido

Let's Encrypt tem limites:
- **50 certificados** por domínio registrado por semana
- **5 falhas** por hostname por hora
- **300 novas ordens** por conta por 3 horas

**Solução para testes:** Use o ambiente staging do Let's Encrypt:

```bash
# Certbot com staging (certificados não confiáveis, mas sem rate limit)
sudo certbot certonly --standalone \
  -d gather.seudominio.com \
  --staging \
  --email admin@seudominio.com \
  --agree-tos
```

No Nginx Proxy Manager, habilite "Use a DNS Challenge" se o domínio suportar para evitar dependência da porta 80.

### Problema: TURN/TLS não funciona (LiveKit)

**Sintomas:** Participantes atrás de NAT restritivo não conseguem áudio/vídeo.

```bash
# Verificar porta TURN
nc -zv seudominio.com 5349

# Verificar configuração LiveKit
docker exec 7gather-livekit cat /etc/livekit.yaml | grep -A5 turn
```

**Solução:** No `config/livekit.yaml`, configurar TURN com domínio TLS:

```yaml
turn:
  enabled: true
  domain: livekit.seudominio.com
  tls_port: 5349
  udp_port: 3478
```

E liberar portas 5349/TCP e 3478/UDP no firewall.

---

## Verificação Pós-Deploy

Após completar o deploy, execute esta checklist:

```bash
# 1. Verificar serviços rodando
docker compose ps

# 2. Verificar health do Colyseus
curl -f https://gather.seudominio.com/api/health
# Esperado: HTTP 200

# 3. Verificar SSL
echo | openssl s_client -connect gather.seudominio.com:443 2>/dev/null | openssl x509 -noout -subject -dates
# Esperado: subject com seu domínio, data válida

# 4. Verificar WebSocket Colyseus
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  https://ws.gather.seudominio.com/
# Esperado: HTTP 101 Switching Protocols

# 5. Verificar LiveKit
curl -f https://livekit.seudominio.com/
# Esperado: resposta do LiveKit

# 6. Verificar portas UDP (WebRTC)
# De outra máquina:
nc -zuv <IP_SERVIDOR> 50000

# 7. Teste funcional
# Abrir https://gather.seudominio.com no navegador
# - Selecionar avatar
# - Entrar na sala
# - Verificar áudio funciona
# - Abrir em segunda aba/navegador e verificar que ambos se veem
```

### Monitoramento contínuo

```bash
# Ver logs em tempo real
docker compose logs -f

# Ver uso de recursos
docker stats

# Ver espaço em disco
df -h

# Reiniciar serviço específico
docker compose restart colyseus

# Atualizar para nova versão
git pull
docker compose down
docker compose up -d --build
```

---

## Resumo de Custos

| Provedor | Custo (5 salas × 20p) | Limitações |
|----------|------------------------|------------|
| **Oracle Cloud Free Tier** | **Gratuito** | ARM (compatível com Docker); 4 OCPU / 24 GB RAM; 10 TB banda/mês |
| Fly.io | ~$10-20/mês | UDP limitado; precisa de LiveKit Cloud separado |
| Railway | ~$15-30/mês | Sem UDP; precisa de LiveKit Cloud separado |
| LiveKit Cloud (addon) | ~$0.01/participante/min | Recomendado para Fly.io e Railway |

> **Recomendação:** Para deploy gratuito e completo (incluindo LiveKit self-hosted com UDP), use **Oracle Cloud Free Tier**. Para maior facilidade de deploy com menor controle, use Fly.io ou Railway com LiveKit Cloud.
