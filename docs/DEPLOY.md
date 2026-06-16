# 7Gather - Guia de Deploy Público

Guia completo para disponibilizar a plataforma 7Gather na internet, desde a criação de conta no provedor até a plataforma acessível via navegador com HTTPS.

---

## Sumário

- [Requisitos Mínimos de Infraestrutura](#requisitos-mínimos-de-infraestrutura)
- [Opção 1: Oracle Cloud Free Tier (Recomendado)](#opção-1-oracle-cloud-free-tier-recomendado)
- [Opção 2: Fly.io](#opção-2-flyio)
- [Opção 3: Railway](#opção-3-railway)
- [Opção 4: AWS EC2](#opção-4-aws-ec2)
- [Migração Oracle Cloud → AWS](#migração-oracle-cloud--aws)
- [Configuração de Domínio Público](#configuração-de-domínio-público)
- [Configuração Let's Encrypt (SSL/TLS)](#configuração-lets-encrypt-ssltls)
- [Troubleshooting SSL](#troubleshooting-ssl)
- [Verificação Pós-Deploy](#verificação-pós-deploy)
- [Resumo de Custos](#resumo-de-custos)

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

## Opção 4: AWS EC2

Amazon Web Services (AWS) é uma alternativa quando a Oracle Cloud Free Tier não possui instâncias Compute disponíveis na sua região. Com uma instância EC2, você mantém a mesma arquitetura Docker Compose (Nginx Proxy Manager, Colyseus, LiveKit e client estático) com capacidade para **5 salas × 20 participantes (100 usuários simultâneos)**.

Diferente da Oracle Cloud, o AWS EC2 é um serviço pago, mas oferece controle total sobre a infraestrutura, IPs estáticos (Elastic IP) e Security Groups que eliminam a necessidade de configurar `iptables` manualmente.

### Passo 1: Criar conta AWS e configurar IAM

1. Acesse [aws.amazon.com](https://aws.amazon.com) e clique em **Criar uma conta da AWS**
2. Preencha email, nome da conta e senha
3. Adicione informações de pagamento (cartão de crédito obrigatório)
4. Confirme sua identidade via SMS ou chamada de voz
5. Selecione o plano **Basic Support (Free)**
6. Aguarde a ativação da conta (geralmente imediata, pode levar até 24h)

> **Importante:** A conta criada acima é a conta **root**. Ela tem acesso irrestrito a todos os serviços e configurações de billing. **Não use a conta root para operações do dia a dia.** Reserve-a exclusivamente para tarefas de billing e gerenciamento de conta.

#### Criar usuário IAM para operações

7. Faça login no [Console AWS](https://console.aws.amazon.com) com a conta root
8. Vá em **IAM → Users → Create user**
9. Defina um nome de usuário (ex: `7gather-admin`)
10. Em **Permissions options**, selecione **Attach policies directly**
11. Adicione as seguintes políticas:
    - `AmazonEC2FullAccess` — gerenciamento completo de instâncias EC2
    - `AmazonVPCFullAccess` — gerenciamento de redes VPC, subnets e Security Groups
12. Clique **Next → Create user**
13. Acesse o usuário criado e em **Security credentials → Create access key**, gere credenciais para CLI (se necessário)
14. Anote o **Console sign-in URL** do usuário IAM para logins futuros

> **Dica:** A partir deste ponto, faça login com o usuário IAM (`7gather-admin`) para todas as operações. Use a conta root apenas para alterações de billing ou criação de outros usuários IAM.

#### Ativar MFA (Autenticação Multifator)

15. **Para a conta root:** Vá em **IAM → Dashboard → Security recommendations** e clique em **Enable MFA** para o root user. Recomenda-se usar um app autenticador (Google Authenticator, Authy) ou chave de segurança física.
16. **Para o usuário IAM:** Acesse **IAM → Users → 7gather-admin → Security credentials → Assign MFA device**. Configure com o mesmo tipo de dispositivo (app autenticador recomendado).

> **Importante:** Habilitar MFA em ambas as contas (root e IAM) é essencial para proteger sua infraestrutura contra acessos não autorizados. Sem MFA, uma senha comprometida dá acesso total aos seus recursos AWS.

### Passo 2: Criar instância EC2

#### Tipos de instância recomendados (região sa-east-1 — São Paulo)

| Tipo | vCPUs | RAM | Rede | Custo aprox./mês | Uso |
|------|-------|-----|------|------------------|-----|
| t3.medium | 2 | 4 GB | Até 5 Gbps | ~US$ 42 | Mínimo viável |
| t3.large | 2 | 8 GB | Até 5 Gbps | ~US$ 60 | Alternativa econômica |
| **t3.xlarge** | **4** | **16 GB** | **Até 5 Gbps** | **~US$ 85** | **Recomendado** |

> **Nota:** O t3.xlarge oferece 4 vCPUs e 16 GB RAM — margem confortável para 5 salas × 20 participantes em áudio-only com overhead para picos de uso. O mínimo absoluto (t3.medium: 2 vCPU / 4 GB) funciona para testes, mas pode ficar limitado em produção com todas as salas ativas.

#### Criar a instância via Console AWS

1. Faça login no [Console AWS](https://console.aws.amazon.com) com o usuário IAM (`7gather-admin`)
2. No canto superior direito, selecione a região **São Paulo (sa-east-1)**
3. Vá em **EC2 → Instances → Launch instances**
4. Configure:

   **Nome e tags:**
   - **Name:** `7gather-server`

   **Imagem de máquina (AMI):**
   - Selecione **Ubuntu Server 22.04 LTS** ou **Ubuntu Server 24.04 LTS**
   - Arquitetura: **64-bit (x86)**

   > **Importante:** Escolha a AMI x86_64 (não ARM). As imagens Docker de terceiros (livekit/livekit-server, jc21/nginx-proxy-manager) publicam variantes x86_64 por padrão.

   **Tipo de instância:**
   - Selecione **t3.xlarge** (recomendado) ou t3.large/t3.medium conforme seu orçamento

   **Par de chaves (Key Pair):**

5. Clique em **Create new key pair**
6. Configure:
   - **Key pair name:** `7gather-key`
   - **Key pair type:** **ED25519** (recomendado — mais seguro e compacto)
   - Alternativa: RSA com 4096 bits caso precise de compatibilidade com clientes SSH antigos
   - **Private key file format:** `.pem`
7. Clique **Create key pair** — o arquivo `7gather-key.pem` será baixado automaticamente

> **⚠️ Atenção:** O arquivo `.pem` é a **única forma** de acessar sua instância via SSH. Guarde-o em local seguro e nunca o compartilhe. Se perdê-lo, você não conseguirá mais acessar a instância. Recomenda-se armazenar uma cópia em gerenciador de senhas ou cofre digital.

8. Após criar o Key Pair, recomenda-se desabilitar autenticação por senha no SSH. Após o primeiro acesso à instância, edite `/etc/ssh/sshd_config`:
   ```
   PasswordAuthentication no
   ```
   E reinicie o serviço: `sudo systemctl restart sshd`

   **Configurações de rede:**

9. Em **Network settings**, clique em **Edit**
10. Mantenha a VPC padrão e selecione uma subnet na zona `sa-east-1a` (ou qualquer zona disponível)
11. **Auto-assign public IP:** Enable
12. Em **Firewall (security groups)**, selecione **Create security group**
    - Nomeie como `7gather-sg`
    - Deixe apenas a regra SSH (porta 22) por enquanto — o Security Group completo será configurado no **Passo 3**

   **Configurar armazenamento (EBS):**

13. Em **Configure storage**, defina:
    - **Tamanho:** 30 GB (mínimo) — recomenda-se 40 GB para logs e imagens Docker
    - **Tipo de volume:** **gp3** (melhor custo-benefício: 3000 IOPS e 125 MB/s de throughput inclusos)

14. Revise todas as configurações e clique **Launch instance**
15. Aguarde o status da instância mudar para **Running** (geralmente 1-2 minutos)
16. Anote o **Public IPv4 address** atribuído (será substituído por Elastic IP no Passo 4)

#### Primeiro acesso SSH

```bash
# Ajustar permissões do arquivo de chave (obrigatório)
chmod 400 7gather-key.pem

# Conectar à instância
ssh -i 7gather-key.pem ubuntu@<IP_PUBLICO>
```

> **Dica:** No Windows, use o terminal PowerShell ou WSL. Se o arquivo `.pem` tiver permissões abertas, o SSH recusará a conexão. No PowerShell:
> ```powershell
> icacls 7gather-key.pem /inheritance:r /grant:r "$($env:USERNAME):R"
> ```

### Passo 3: Configurar Security Group

Security Groups da AWS funcionam como firewalls virtuais **stateful** — ou seja, se uma conexão de entrada é permitida, a resposta de saída é liberada automaticamente. Diferente da Oracle Cloud, **não é necessário configurar `iptables`** dentro da instância. Todas as regras de rede são gerenciadas exclusivamente pelo Security Group.

#### Acessar o Security Group

1. No [Console AWS](https://console.aws.amazon.com), vá em **EC2 → Network & Security → Security Groups**
2. Localize e selecione o Security Group `7gather-sg` (criado no Passo 2)
3. Clique na aba **Inbound rules → Edit inbound rules**

#### Adicionar regras de entrada (Inbound)

Adicione todas as regras abaixo. Para as regras restritas, substitua `<seu_ip>` pelo seu IP público atual:

```bash
# Para descobrir seu IP público atual:
curl ifconfig.me
```

#### Tabela completa de regras

| Direção | Porta | Protocolo | Origem | Descrição |
|---------|-------|-----------|--------|-----------|
| Inbound | 22 | TCP | `<seu_ip>/32` | SSH (restrito) |
| Inbound | 80 | TCP | 0.0.0.0/0 | HTTP |
| Inbound | 81 | TCP | `<seu_ip>/32` | Nginx Proxy Manager admin (restrito) |
| Inbound | 443 | TCP | 0.0.0.0/0 | HTTPS |
| Inbound | 7881 | TCP | 0.0.0.0/0 | LiveKit TCP signaling |
| Inbound | 50000-60000 | UDP | 0.0.0.0/0 | WebRTC media (LiveKit) |
| Inbound | 5349 | TCP | 0.0.0.0/0 | TURN TLS (quando habilitado) |
| Inbound | 3478 | UDP | 0.0.0.0/0 | TURN UDP (quando habilitado) |
| Outbound | All | All | 0.0.0.0/0 | Todo tráfego de saída |

#### Configurar regras de entrada

4. Para cada linha da tabela acima com direção **Inbound**, clique em **Add rule** e configure:
   - **Type:** Custom TCP (ou Custom UDP para portas UDP)
   - **Port range:** a porta ou faixa indicada
   - **Source:** o endereço indicado na coluna Origem
   - **Description:** a descrição correspondente

5. Para as regras de SSH (porta 22) e NPM admin (porta 81), use **My IP** no campo Source — a AWS preencherá automaticamente com seu IP em notação CIDR `/32`

6. Para as portas TURN (5349/TCP e 3478/UDP), adicione-as somente se pretende habilitar TURN relay no LiveKit para suportar participantes atrás de NATs restritivos

7. Clique **Save rules**

#### Configurar regras de saída (Outbound)

8. Clique na aba **Outbound rules → Edit outbound rules**
9. Verifique que existe a regra padrão:
   - **Type:** All traffic
   - **Destination:** 0.0.0.0/0
   - **Description:** Todo tráfego de saída
10. Se a regra não existir, adicione-a e clique **Save rules**

> **Nota:** Ao contrário da Oracle Cloud, onde é necessário configurar tanto Security Lists (nível VCN) quanto regras `iptables` dentro da instância, na AWS os Security Groups são o **único mecanismo de firewall** necessário. Nenhuma configuração de `iptables` é requerida na instância EC2.

### Passo 4: Alocar Elastic IP

Um **Elastic IP** é um endereço IPv4 público estático da AWS que persiste mesmo quando a instância é parada e reiniciada. Diferente da Oracle Cloud, onde o IP público pode mudar ao fazer stop/start da instância, o Elastic IP garante um endereço fixo permanente — essencial para configuração de DNS.

1. No Console AWS, vá em **EC2 → Network & Security → Elastic IPs**
2. Clique em **Allocate Elastic IP address**
3. Em **Network Border Group**, mantenha `sa-east-1` selecionado
4. Em **Public IPv4 address pool**, selecione **Amazon's pool of IPv4 addresses**
5. Clique em **Allocate**
6. Selecione o Elastic IP recém-alocado → clique em **Actions → Associate Elastic IP address**
7. Em **Instance**, selecione a instância `7gather-server`
8. Clique em **Associate**

> **Anote o endereço Elastic IP** — ele será usado na configuração de DNS (registros A dos subdomínios `gather`, `ws` e `livekit`).

> **⚠️ Custo:** Elastic IPs são **gratuitos** enquanto estiverem associados a uma instância **em execução**. Porém, se o IP estiver alocado mas não associado a nenhuma instância, ou se a instância associada estiver **parada (stopped)**, a AWS cobra ~US$ 3,60/mês (~US$ 0,005/hora). Libere IPs não utilizados para evitar cobranças desnecessárias.

### Passo 5: Instalar Docker e Docker Compose

Diferente da Oracle Cloud, onde o Docker é instalado via script convenience (`get.docker.com`), aqui usaremos o repositório oficial `apt` do Docker para ter maior controle sobre versões e atualizações.

> **Nota:** Na AWS, **não é necessário configurar `iptables`** para liberar portas. Os Security Groups (configurados no Passo 3) gerenciam todas as regras de firewall externamente. Isso elimina o "Passo 5: Configurar iptables" exigido na Oracle Cloud.

#### Instalar Docker Engine e Docker Compose plugin

Conecte via SSH à instância e execute os comandos abaixo:

```bash
ssh -i 7gather-key.pem ubuntu@<ELASTIC_IP>

# Atualizar pacotes do sistema
sudo apt update && sudo apt upgrade -y

# Instalar dependências necessárias
sudo apt install -y ca-certificates curl gnupg

# Adicionar chave GPG oficial do Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Adicionar repositório apt oficial do Docker
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Atualizar índice de pacotes com o novo repositório
sudo apt update

# Instalar Docker Engine, CLI, containerd e plugins
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

#### Adicionar usuário ao grupo docker

Para executar comandos Docker sem `sudo`:

```bash
# Adicionar usuário ubuntu ao grupo docker
sudo usermod -aG docker ubuntu

# Aplicar a mudança de grupo na sessão atual (ou faça logout/login)
newgrp docker
```

> **Importante:** Se `newgrp docker` não funcionar em todos os terminais, faça logout completo da sessão SSH e reconecte:
> ```bash
> exit
> ssh -i 7gather-key.pem ubuntu@<ELASTIC_IP>
> ```

#### Verificação da instalação

Execute os comandos abaixo **sem `sudo`** para confirmar que tudo está funcionando:

```bash
# Verificar versão do Docker Engine (esperado: 24.0+)
docker --version
# Saída esperada: Docker version 24.x.x (ou superior)

# Verificar versão do Docker Compose plugin (esperado: 2.20+)
docker compose version
# Saída esperada: Docker Compose version v2.20.x (ou superior)

# Teste funcional — baixar e executar imagem hello-world
docker run --rm hello-world
# Saída esperada: "Hello from Docker!"
```

Todos os três comandos devem completar com sucesso (exit code 0). Se as versões exibidas forem iguais ou superiores às indicadas e o `hello-world` imprimir a mensagem "Hello from Docker!", a instalação está correta.

#### Troubleshooting

Se algum comando de verificação falhar:

**`docker --version` retorna erro ou "command not found":**

```bash
# Verificar se o serviço Docker está ativo
sudo systemctl status docker

# Se estiver inativo/falhou, iniciar e habilitar:
sudo systemctl start docker
sudo systemctl enable docker
```

**"permission denied" ao executar `docker` sem sudo:**

```bash
# Verificar se o usuário está no grupo docker
groups
# A saída deve incluir "docker" na lista de grupos

# Se "docker" não aparecer na lista:
# 1. Confirme que o usermod foi executado:
sudo usermod -aG docker ubuntu

# 2. Faça logout e login novamente (obrigatório para ativar o grupo):
exit
ssh -i 7gather-key.pem ubuntu@<ELASTIC_IP>

# 3. Verifique novamente:
groups
```

### Passo 6: Configurar LiveKit para produção AWS

O LiveKit precisa de configurações específicas de rede para funcionar corretamente em produção na AWS, onde a instância EC2 está atrás de NAT com um Elastic IP. Sem essas configurações, os clientes WebRTC não conseguem estabelecer conexões de mídia.

#### Alterações no config/livekit.yaml

Edite o arquivo `config/livekit.yaml` com as configurações de produção:

```yaml
port: 7880

rtc:
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
  tcp_port: 7881
  # node_ip: removido — auto-detecta via EC2 metadata service

turn:
  enabled: true
  domain: livekit.seudominio.com
  tls_port: 5349
  udp_port: 3478
```

**Explicação de cada configuração:**

- **`rtc.use_external_ip: true`** — Indica ao LiveKit que a instância está atrás de NAT (como toda EC2 com Elastic IP). O LiveKit consultará o EC2 metadata service para descobrir o IP público e anunciá-lo nos candidatos ICE. Sem isso, clientes remotos receberão o IP privado da instância e não conseguirão conectar.

- **`rtc.node_ip`** — Removido (ou comentado). Quando ausente, o LiveKit auto-detecta o IP público via EC2 metadata service (`http://169.254.169.254/latest/meta-data/public-ipv4`). Alternativamente, você pode defini-lo explicitamente com o Elastic IP: `node_ip: <ELASTIC_IP>`. Na configuração de desenvolvimento, este campo estava definido como `127.0.0.1`.

- **`rtc.port_range_start` / `rtc.port_range_end`** — Define o range de portas UDP usadas para tráfego WebRTC (mídia de áudio/vídeo). O range 50000-60000 (10.000 portas) é o padrão recomendado pelo LiveKit para produção, oferecendo capacidade suficiente para múltiplos participantes simultâneos. O range de desenvolvimento (7882-7932) é muito pequeno para produção.

- **`turn.enabled: true`** — Habilita o relay TURN integrado do LiveKit para participantes atrás de NATs restritivos (redes corporativas, hotéis) que não conseguem estabelecer conexão UDP direta.

- **`turn.domain`** — O domínio usado para o certificado TLS do TURN. Deve corresponder ao domínio do LiveKit com certificado SSL válido.

- **`turn.tls_port: 5349`** — Porta TCP para conexões TURN sobre TLS. Permite relay seguro para participantes com firewall que bloqueia UDP.

- **`turn.udp_port: 3478`** — Porta UDP padrão do protocolo TURN/STUN.

#### Alterações no docker-compose.yml

Atualize o mapeamento de portas UDP do serviço LiveKit no `docker-compose.yml`:

**Desenvolvimento (atual):**

```yaml
ports:
  - "7882-7932:7882-7932/udp"
```

**Produção AWS:**

```yaml
ports:
  - "50000-60000:50000-60000/udp"
```

Este mapeamento corresponde ao `port_range_start` / `port_range_end` definido no `livekit.yaml`. Os ranges devem ser idênticos.

#### Configurar LIVEKIT_URL no .env

Em produção, a variável `LIVEKIT_URL` no arquivo `.env` **deve usar o scheme `wss://`** (WebSocket Secure) seguido do domínio público:

```bash
# Desenvolvimento (default):
LIVEKIT_URL=ws://livekit:7880

# Produção AWS:
LIVEKIT_URL=wss://livekit.seudominio.com
```

O scheme `wss://` é obrigatório em produção porque:
- O tráfego passa pelo Nginx Proxy Manager com TLS
- Navegadores bloqueiam conexões `ws://` em páginas servidas via HTTPS (mixed content)
- O domínio público resolve para o Elastic IP, não para o nome interno do container

> **Nota:** O Security Group já tem as portas UDP 50000-60000 abertas desde o Passo 3. Não é necessário nenhuma configuração adicional de firewall — diferente da Oracle Cloud, onde seria necessário adicionar regras `iptables` para o novo range.

### Passo 7: Deploy da aplicação

Com Docker instalado, LiveKit configurado e Security Group aberto, é hora de fazer o deploy da aplicação.

#### Clonar o repositório

```bash
ssh -i 7gather-key.pem ubuntu@<ELASTIC_IP>

# Clonar o repositório
git clone https://github.com/seu-org/7gather.git
cd 7gather
```

#### Configurar variáveis de ambiente

```bash
# Criar arquivo .env a partir do exemplo
cp .env.example .env
nano .env
```

Edite o `.env` com as variáveis obrigatórias de produção:

```bash
# LiveKit - conexão e autenticação
LIVEKIT_URL=wss://livekit.seudominio.com
LIVEKIT_API_KEY=sua_api_key_aqui
LIVEKIT_API_SECRET=sua_api_secret_aqui

# Domínio e SSL
DOMAIN=gather.seudominio.com
CERTBOT_EMAIL=admin@seudominio.com
```

> **Dica:** Gere chaves seguras para o LiveKit com `openssl rand`:
> ```bash
> # Gerar API Key (32 caracteres hexadecimais)
> openssl rand -hex 16
>
> # Gerar API Secret (64 caracteres hexadecimais)
> openssl rand -hex 32
> ```
> Copie os valores gerados e cole nos campos `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` do `.env`.

**Variáveis obrigatórias:**

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `LIVEKIT_URL` | URL WebSocket seguro do LiveKit (deve usar `wss://`) | `wss://livekit.seudominio.com` |
| `LIVEKIT_API_KEY` | Chave de API para autenticação no LiveKit | (gerado com `openssl rand -hex 16`) |
| `LIVEKIT_API_SECRET` | Secret para assinatura de tokens LiveKit | (gerado com `openssl rand -hex 32`) |
| `DOMAIN` | Domínio principal da aplicação | `gather.seudominio.com` |
| `CERTBOT_EMAIL` | Email para notificações de certificados SSL | `admin@seudominio.com` |

#### Iniciar os serviços

```bash
# Subir todos os containers em modo detached
docker compose up -d

# Verificar status dos containers
docker compose ps
```

A saída do `docker compose ps` deve mostrar todos os serviços com status **"running"**. Aguarde ~30 segundos para que todos os serviços inicializem completamente.

#### Troubleshooting: containers em "restarting"

Se ao executar `docker compose ps` um ou mais containers aparecerem com status **"restarting"** ou **"exited"** dentro de 60 segundos após o `docker compose up -d`, verifique as seguintes causas:

**1. Conflito de portas — outra aplicação usando as mesmas portas:**

```bash
# Verificar se há processos ocupando as portas necessárias
sudo lsof -i :80
sudo lsof -i :443
sudo lsof -i :81
sudo lsof -i :2567
sudo lsof -i :7880

# Alternativa: listar todas as portas em escuta
sudo ss -tlnp
```

Se algum processo já estiver usando essas portas, pare-o antes de subir o Docker Compose.

**2. Memória insuficiente:**

```bash
# Verificar memória disponível
free -h
```

Se a memória total disponível for inferior a **4 GB**, os containers podem ser mortos pelo OOM killer do Linux. Considere:
- Fechar outros processos que consomem memória
- Fazer upgrade para uma instância com mais RAM (t3.large ou t3.xlarge)

**3. Docker daemon não está rodando:**

```bash
# Verificar status do serviço Docker
sudo systemctl status docker

# Se estiver inativo, iniciar:
sudo systemctl start docker
sudo systemctl enable docker
```

**4. Verificar logs dos containers para identificar o erro:**

```bash
# Ver logs de um serviço específico
docker compose logs <service>

# Exemplos:
docker compose logs livekit
docker compose logs colyseus
docker compose logs nginx

# Ver logs de todos os serviços com timestamps
docker compose logs -t --tail=50
```

Os logs geralmente indicam a causa exata da falha (porta em uso, variável de ambiente ausente, arquivo de configuração inválido, etc.).

### Passo 8: Configurar Nginx Proxy Manager

Com todos os containers rodando, configure o Nginx Proxy Manager (NPM) para rotear o tráfego HTTPS para os serviços internos.

#### Acesso inicial

1. Acesse `http://<ELASTIC_IP>:81` no navegador
2. Faça login com as credenciais padrão:
   - **Email:** `admin@example.com`
   - **Senha:** `changeme`
3. **Mude a senha imediatamente** — o NPM solicitará novo email e senha no primeiro login

> **Nota:** A porta 81 está restrita ao seu IP no Security Group (configurado no Passo 3). Se não conseguir acessar, verifique se seu IP público atual corresponde à regra de entrada da porta 81 no Security Group `7gather-sg`.

#### Criar Proxy Hosts

Para cada serviço acessível externamente, crie um Proxy Host no NPM. Vá em **Hosts → Proxy Hosts → Add Proxy Host** e configure conforme a tabela:

| Domínio | Scheme | Forward Hostname | Forward Port | WebSocket Support | SSL |
|---------|--------|-----------------|--------------|-------------------|-----|
| `gather.seudominio.com` | http | `client` | 80 | ❌ | ✅ |
| `ws.seudominio.com` | http | `colyseus` | 2567 | ✅ | ✅ |
| `livekit.seudominio.com` | http | `livekit` | 7880 | ✅ | ✅ |

**Passos para criar cada proxy host:**

1. Na aba **Details**:
   - **Domain Names:** insira o domínio correspondente (ex: `gather.seudominio.com`)
   - **Scheme:** `http`
   - **Forward Hostname / IP:** o nome do container Docker (ex: `client`, `colyseus` ou `livekit`)
   - **Forward Port:** a porta interna do serviço
   - Para `ws.seudominio.com` e `livekit.seudominio.com`, marque **Websockets Support** ✅

2. Na aba **SSL**:
   - Selecione **Request a new SSL Certificate**
   - Marque **Force SSL** (redireciona HTTP → HTTPS automaticamente)
   - Marque **HTTP/2 Support**
   - Informe o email para notificações do Let's Encrypt
   - Aceite os termos e clique **Save**

> **Detalhes completos sobre certificados SSL:** consulte a seção [Configuração Let's Encrypt (SSL/TLS)](#configuração-lets-encrypt-ssltls) para troubleshooting de certificados, rate limits e renovação automática.

> **Importante:** O Forward Hostname usa o **nome do container** (não `localhost` ou IP), pois todos os serviços compartilham a mesma rede Docker Compose e se comunicam por nome de serviço.

### Passo 9: Configurar DNS

Com a aplicação rodando e o Nginx Proxy Manager configurado, é necessário apontar os registros DNS dos seus subdomínios para o Elastic IP da instância EC2. Isso permite que os usuários acessem a plataforma pelo domínio ao invés do IP direto.

> **Referência:** Se ainda não tem um domínio registrado, consulte a seção [Configuração de Domínio Público](#configuração-de-domínio-público) para opções de registro.

#### Registros DNS necessários

No painel do seu provedor DNS (Cloudflare, Namecheap, Registro.br, etc.), crie ou atualize os seguintes registros A apontando para o Elastic IP da sua instância:

| Tipo | Nome | Valor | TTL |
|------|------|-------|-----|
| A | `gather.seudominio.com` | `<ELASTIC_IP>` | 300 |
| A | `ws.gather.seudominio.com` | `<ELASTIC_IP>` | 300 |
| A | `livekit.gather.seudominio.com` | `<ELASTIC_IP>` | 300 |

Substitua `<ELASTIC_IP>` pelo endereço Elastic IP alocado no **Passo 4** e `seudominio.com` pelo seu domínio real.

O TTL de 300 segundos (5 minutos) permite que alterações futuras de IP propaguem rapidamente.

#### Verificação de propagação DNS

Após criar os registros, verifique se a propagação completou com o comando `dig`:

```bash
dig gather.seudominio.com +short
dig ws.gather.seudominio.com +short
dig livekit.gather.seudominio.com +short
# Todos devem retornar o Elastic IP
```

Alternativa com `nslookup` (disponível no Windows):

```bash
nslookup gather.seudominio.com
nslookup ws.gather.seudominio.com
nslookup livekit.gather.seudominio.com
```

A propagação DNS **geralmente completa em menos de 1 hora**, mas em alguns casos pode levar até **48 horas** dependendo do provedor e dos caches intermediários.

#### Migração: atualizar registros da Oracle Cloud

Se você está migrando da Oracle Cloud para a AWS, os registros DNS para os três subdomínios (`gather`, `ws` e `livekit`) provavelmente já existem apontando para o IP público da instância Oracle Cloud. Neste caso:

1. **Não crie novos registros** — edite os existentes
2. Substitua o IP da Oracle Cloud pelo **Elastic IP** da AWS em todos os três registros A
3. Mantenha o TTL em 300 para permitir rollback rápido caso necessário

> **Dica:** Somente atualize o DNS após verificar que a aplicação está funcionando corretamente na AWS (todos os containers rodando, HTTPS e WebSocket acessíveis via Elastic IP direto). Isso garante zero downtime na migração.

#### Troubleshooting: DNS não propaga após 48h

Se após 48 horas o comando `dig` ainda não retorna o Elastic IP esperado:

1. **Verifique a configuração do registro A no provedor DNS:**
   - Confirme que o tipo é **A** (não CNAME)
   - Confirme que o valor é o Elastic IP correto (sem espaços ou caracteres extras)
   - Confirme que o nome do host está correto (incluindo subdomínio)

2. **Verifique se há registros conflitantes:**
   - Procure por registros CNAME para o mesmo hostname (CNAME e A não podem coexistir)
   - Verifique se existem registros AAAA (IPv6) que podem ter precedência em alguns resolvers
   - Remova registros duplicados ou conflitantes

3. **Teste com resolvers DNS públicos:**
   ```bash
   # Testar com Google DNS
   dig @8.8.8.8 gather.seudominio.com +short

   # Testar com Cloudflare DNS
   dig @1.1.1.1 gather.seudominio.com +short
   ```

   Se os resolvers públicos retornam o IP correto mas sua máquina local não, o problema é cache local.

4. **Limpar cache DNS local:**
   ```bash
   # Linux (systemd-resolved)
   sudo systemd-resolve --flush-caches

   # macOS
   sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder

   # Windows (PowerShell como admin)
   ipconfig /flushdns
   ```

### Verificação Pós-Deploy (AWS)

Após completar os passos 1–9, execute esta checklist específica para validar que a plataforma está totalmente operacional na AWS. **Todos os itens devem passar** antes de prosseguir com migração de DNS (se estiver migrando da Oracle Cloud) ou liberar acesso aos usuários.

#### 1. Serviços rodando

Verifique que todos os 4 serviços do Docker Compose estão com status "running":

```bash
docker compose ps
```

**PASS:** Todos os 4 serviços (nginx, colyseus, livekit, client) aparecem com status **"running"**.
**FAIL:** Qualquer serviço com status "exited", "restarting" ou ausente. Consulte o troubleshooting do Passo 7.

#### 2. Health check Colyseus

Confirme que o servidor Colyseus responde corretamente no endpoint de health:

```bash
curl -f http://localhost:2567/health
```

**PASS:** Resposta HTTP **200** (exit code 0 do curl).
**FAIL:** Timeout, connection refused ou código de resposta diferente de 200. Verifique os logs com `docker compose logs colyseus`.

#### 3. Acesso HTTPS ao client

Abra o domínio principal no navegador:

```
https://gather.seudominio.com
```

**PASS:** A aplicação client (tela de seleção de avatar / entrada na sala) carrega normalmente com cadeado HTTPS no navegador.
**FAIL:** Erro de certificado SSL, timeout ou página em branco. Verifique os certificados no Nginx Proxy Manager e a propagação DNS.

#### 4. WebSocket upgrade (Colyseus)

Teste a capacidade de upgrade WebSocket para o servidor Colyseus:

```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  https://ws.gather.seudominio.com/
```

**PASS:** Resposta contém **HTTP/1.1 101 Switching Protocols**.
**FAIL:** Resposta 400, 502 ou timeout. Verifique que "Websockets Support" está habilitado no proxy host do NPM para `ws.gather.seudominio.com`.

#### 5. LiveKit signaling (wss:// na porta 7881)

Confirme que o LiveKit está acessível via WebSocket seguro na porta de signaling:

```bash
curl -f https://livekit.seudominio.com/
```

**PASS:** LiveKit responde (qualquer resposta HTTP válida — confirma que o serviço está acessível via wss:// na porta 7881 através do proxy).
**FAIL:** Timeout ou connection refused. Verifique que a porta 7881 está aberta no Security Group e que o proxy host para `livekit.seudominio.com` está configurado no NPM.

#### 6. UDP connectivity (WebRTC media)

De **outra máquina** (não a própria instância EC2), teste a conectividade UDP no range de mídia:

```bash
nc -zuv <ELASTIC_IP> 50000
```

**PASS:** Pelo menos uma porta no range 50000-60000 responde (indica que o tráfego UDP está chegando à instância).
**FAIL:** Todas as portas timeout. Verifique a regra UDP 50000-60000 no Security Group (`7gather-sg`) e confirme que o LiveKit está escutando no range correto (`docker compose logs livekit | grep port`).

#### Tabela resumo de verificação

| # | Item | Comando | Critério de Aprovação (Pass) | Status |
|---|------|---------|------------------------------|--------|
| 1 | Serviços rodando | `docker compose ps` | 4 serviços com status "running" | ✅/❌ |
| 2 | Health check Colyseus | `curl -f http://localhost:2567/health` | HTTP 200 | ✅/❌ |
| 3 | Acesso HTTPS | Abrir `https://gather.seudominio.com` | Client carrega com HTTPS | ✅/❌ |
| 4 | WebSocket upgrade | curl com headers Upgrade | HTTP 101 Switching Protocols | ✅/❌ |
| 5 | LiveKit signaling | `curl -f https://livekit.seudominio.com/` | Resposta válida (wss:// acessível) | ✅/❌ |
| 6 | UDP connectivity | `nc -zuv <ELASTIC_IP> 50000` | Pelo menos 1 porta responde | ✅/❌ |

> **⚠️ Importante:** Todos os 6 itens devem estar com ✅ antes de atualizar os registros DNS para apontar ao Elastic IP da AWS. Se estiver migrando da Oracle Cloud, mantenha o DNS apontando para o IP Oracle até que toda a checklist passe na AWS — isso garante zero downtime durante a migração.

### Segurança e Boas Práticas

A seguir estão as recomendações mínimas de segurança para manter sua infraestrutura AWS protegida em produção. Várias dessas práticas já foram configuradas nos passos anteriores — esta seção consolida e reforça os pontos mais importantes.

1. **Usar usuário IAM (não root)** — Use o usuário IAM criado no Passo 1 (`7gather-admin`) para todas as operações do dia a dia (console, CLI, gerenciamento de instâncias). Reserve a conta root exclusivamente para tarefas de billing e gerenciamento de conta (ex: alterar plano de suporte, fechar conta). A conta root tem acesso irrestrito e não pode ter suas permissões limitadas — qualquer comprometimento dá acesso total.

2. **Habilitar MFA (Autenticação Multifator)** — Ative MFA em ambas as contas: root e IAM (já configurado no Passo 1). Use um app autenticador (Google Authenticator, Authy, Microsoft Authenticator) ou, para segurança máxima, uma chave de segurança física (YubiKey). Sem MFA, uma senha vazada ou phishing dá acesso completo aos seus recursos AWS.

3. **Key Pair e SSH seguro** — Use um Key Pair ED25519 (recomendado) ou RSA com mínimo de 4096 bits para acesso SSH (já configurado no Passo 2). Adicionalmente:
   - Desabilite autenticação por senha no SSH editando `/etc/ssh/sshd_config`:
     ```
     PasswordAuthentication no
     ```
     E reinicie o serviço: `sudo systemctl restart sshd`
   - Restrinja o acesso SSH (porta 22) apenas ao IP do operador no Security Group (já configurado no Passo 3)
   - Guarde o arquivo `.pem` em local seguro (gerenciador de senhas ou cofre digital)

4. **Restringir porta do NPM admin** — A porta 81 (Nginx Proxy Manager admin) deve ser acessível **somente** a partir do IP do operador. Isso já foi configurado no Passo 3 com a regra de inbound `<seu_ip>/32` para a porta 81. Periodicamente, verifique se seu IP público mudou e atualize a regra no Security Group conforme necessário.

5. **Backups automatizados (EBS Snapshots)** — Configure snapshots automáticos do volume EBS para recuperação de desastres. Isso protege os dados dos containers Docker, configurações e certificados SSL:

   **Opção A: AWS Backup (recomendado)**

   1. No Console AWS, vá em **AWS Backup → Backup plans → Create backup plan**
   2. Selecione **Build a new plan**
   3. Configure o plano:
      - **Backup plan name:** `7gather-daily-backup`
      - **Backup rule name:** `daily-7day-retention`
      - **Backup frequency:** Daily
      - **Backup window:** Use defaults (janela padrão de madrugada)
      - **Retention period:** 7 days (mínimo recomendado)
      - **Lifecycle → Transition to cold storage:** Never (para snapshots rápidos)
   4. Em **Resource assignments**, clique **Assign resources**:
      - **Resource assignment name:** `7gather-ebs-volume`
      - **Resource type:** EBS
      - Selecione o volume EBS da instância `7gather-server`
   5. Clique **Create plan**

   **Opção B: EC2 Lifecycle Manager (alternativa mais simples)**

   1. No Console AWS, vá em **EC2 → Elastic Block Store → Lifecycle Manager**
   2. Clique **Create lifecycle policy**
   3. Configure:
      - **Policy type:** EBS snapshot policy
      - **Target resource type:** Volume
      - **Target resource tags:** adicione tag `Name: 7gather-server` ao volume EBS
      - **Schedule:** Every 24 hours
      - **Retention type:** Count → 7 (mantém os últimos 7 snapshots)
   4. Clique **Create policy**

   > **Dica:** Com retenção de 7 dias e frequência diária, você terá sempre 7 pontos de restauração disponíveis. Em caso de falha catastrófica, basta criar um novo volume a partir do snapshot mais recente e associá-lo a uma nova instância.

> **Nota:** Estas são as recomendações mínimas para uma infraestrutura de produção. Para plataformas com dados sensíveis ou requisitos de compliance, considere adicionalmente: habilitar VPC Flow Logs para monitorar tráfego de rede, ativar AWS CloudTrail para auditoria de ações na conta, e configurar Amazon GuardDuty para detecção de ameaças.

---

## Migração Oracle Cloud → AWS

Esta seção é destinada a operadores que já possuem o 7Gather rodando na Oracle Cloud Free Tier e desejam migrar para AWS EC2. Aqui você encontrará as diferenças entre as duas plataformas, como as imagens Docker se adaptam automaticamente, e a confirmação de que nenhum arquivo de código precisa ser modificado.

### Tabela Comparativa

| Aspecto | Oracle Cloud | AWS |
|---------|-------------|-----|
| Firewall | iptables + Security Lists (dupla camada) | Security Groups (stateful, camada única) |
| Arquitetura | ARM (Ampere A1) | x86_64 |
| Atribuição de IP | VCN + Public IP (pode mudar em stop/start) | VPC + Elastic IP (persiste entre stop/start) |
| Configuração de portas | Security List + regras iptables | Security Group inbound rules apenas |
| Custo | Always Free (4 OCPU / 24 GB) | Pago (~US$ 85/mês para t3.xlarge) |
| Docker images | Builds ARM (aarch64) | Builds x86_64 (default) |

### Imagens Docker

A mudança de arquitetura (ARM → x86_64) **não requer alteração nos Dockerfiles ou no docker-compose.yml**. As imagens se adaptam automaticamente:

- **Imagens customizadas (client e server):** As base images `node:20-alpine` e `nginx:alpine` são multi-arch — ao executar `docker compose up --build` na instância x86_64, o Docker automaticamente baixa e builda a variante x86_64 sem nenhuma modificação nos Dockerfiles.
- **Imagens de terceiros:** `livekit/livekit-server` e `jc21/nginx-proxy-manager` já publicam variantes x86_64 no Docker Hub — o pull acontece normalmente sem alterações.
- **Primeiro deploy:** Ao executar `docker compose up --build` na AWS, todas as imagens serão automaticamente construídas/baixadas para a arquitetura x86_64 da instância.

### Arquivos sem modificação

Os seguintes arquivos do repositório **NÃO precisam de nenhuma modificação** para a migração:

- **`docker/client/Dockerfile`** — nenhuma alteração necessária (base images multi-arch)
- **`docker/server/Dockerfile`** — nenhuma alteração necessária (base images multi-arch)
- **`docker-compose.yml`** — nenhuma alteração necessária (a alteração do port range UDP é uma configuração de produção documentada no Passo 6, não uma modificação específica da migração)

**O que difere entre os ambientes é apenas configuração específica do provedor:**

- Arquivo **`.env`** — valores de `LIVEKIT_URL` (domínio com Elastic IP) e `DOMAIN` (domínio público)
- **Regras de firewall** — Security Groups da AWS substituem a combinação Security Lists + iptables da Oracle Cloud

> **Resumo:** A migração Oracle → AWS é uma mudança de infraestrutura, não de código. Os Dockerfiles, docker-compose.yml e código-fonte permanecem idênticos. Apenas as configurações de ambiente (.env) e as regras de rede (Security Groups vs iptables) diferem entre os dois provedores. Consulte os Passos 1-9 da seção [Opção 4: AWS EC2](#opção-4-aws-ec2) para o procedimento completo de provisionamento.

### Sequência de Migração

Siga os passos abaixo **na ordem indicada** para uma migração com zero downtime. A estratégia é manter a instância Oracle Cloud em operação (com DNS apontando para ela) enquanto a AWS é provisionada e validada em paralelo. Somente após a verificação completa na AWS o DNS é atualizado.

1. **Provisionar instância EC2** — Siga os Passos 1–4 da Opção 4 acima: criar conta AWS/IAM, criar instância EC2 (t3.xlarge recomendado, Ubuntu 22.04/24.04 LTS x86_64), configurar Security Group (`7gather-sg`) e alocar Elastic IP.

2. **Configurar Security Groups** — Garanta que todas as regras de porta do Security Group correspondam às portas abertas na Oracle Cloud (Passo 3). Confira a tabela de regras: portas 80, 443, 7881/TCP abertas ao público, portas 22 e 81/TCP restritas ao IP do operador, e UDP 50000-60000 aberto ao público para mídia WebRTC.

3. **Clonar repositório e configurar .env** — Clone o repositório na instância EC2, copie os valores do `.env` de produção (especialmente `LIVEKIT_URL` com scheme `wss://`, `DOMAIN`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET`), e ajuste a configuração do LiveKit em `config/livekit.yaml` com `use_external_ip: true` e range de portas 50000-60000 (Passos 5–6).

4. **Build e deploy** — Execute `docker compose up --build -d`. O primeiro build criará as imagens para arquitetura x86_64 automaticamente via base images multi-arch (`node:20-alpine`, `nginx:alpine`). Aguarde todos os 4 serviços atingirem status "running".

5. **Verificação contra IP AWS** — Execute **toda** a checklist "[Verificação Pós-Deploy (AWS)](#verificação-pós-deploy-aws)" usando o Elastic IP diretamente (não via DNS). Todos os 6 itens devem passar: serviços rodando, health check Colyseus, HTTPS, WebSocket upgrade, LiveKit signaling e conectividade UDP.

6. **Atualizar DNS** — Aponte os 3 registros A (`gather`, `ws` e `livekit`) para o novo Elastic IP (Passo 9). Com TTL 300, a propagação ocorre em ~5 minutos. **Somente atualize o DNS após todos os itens de verificação passarem.**

7. **Decomissionar Oracle Cloud** — Somente após a AWS operar de forma estável por **24–48 horas** sem incidentes, encerre a instância Oracle Cloud. Antes disso, mantenha-a disponível como fallback.

### Rollback

#### Se a Verificação Pós-Deploy falhar ANTES do cutover DNS

Se qualquer item da checklist de verificação falhar contra a instância AWS (Etapa 5 acima):

- **Mantenha o DNS apontando para a Oracle Cloud** — o serviço continua funcionando normalmente para os usuários, sem interrupção
- Investigue e corrija o problema na AWS:
  - Verifique logs dos containers: `docker compose logs -t --tail=100`
  - Confira regras do Security Group (portas abertas, protocolo correto)
  - Valide a configuração do LiveKit (`use_external_ip`, `port_range`, TURN)
  - Verifique variáveis de ambiente no `.env` (especialmente `LIVEKIT_URL` com `wss://`)
- Após corrigir, re-execute a checklist de verificação
- **Só prossiga para o cutover DNS (Etapa 6) quando todos os 6 itens passarem**

#### Se problemas forem encontrados APÓS o cutover DNS

Se o sistema apresentar problemas após a atualização dos registros DNS para o Elastic IP da AWS:

1. **Reverter imediatamente os 3 registros DNS A** (`gather`, `ws`, `livekit`) para o IP público da instância Oracle Cloud
2. Com TTL de 300 segundos, a reversão propaga em aproximadamente **5 minutos** — durante esse período, alguns usuários podem ser direcionados à AWS enquanto outros já acessam a Oracle Cloud
3. Investigue e corrija os problemas na instância AWS (usando o Elastic IP diretamente, sem afetar os usuários)
4. Re-execute toda a checklist de verificação contra o IP AWS
5. Quando todos os itens passarem novamente, repita o cutover DNS

> **Dica:** Monitoramento nas primeiras 24–48h após o cutover é essencial. Mantenha a instância Oracle Cloud ativa nesse período como rede de segurança. Acompanhe os logs (`docker compose logs -f`) e o uso de recursos (`docker stats`) na AWS para identificar problemas antes dos usuários.

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
| **AWS EC2 (t3.xlarge)** | **~US$ 85-100/mês** | x86_64; 4 vCPU / 16 GB RAM; LiveKit self-hosted com UDP completo; Elastic IP incluso |
| Fly.io | ~$10-20/mês | UDP limitado; precisa de LiveKit Cloud separado |
| Railway | ~$15-30/mês | Sem UDP; precisa de LiveKit Cloud separado |
| LiveKit Cloud (addon) | ~$0.01/participante/min | Recomendado para Fly.io e Railway |

> **Recomendação:** Para deploy gratuito e completo (incluindo LiveKit self-hosted com UDP), use **Oracle Cloud Free Tier**. Se a Oracle Cloud não tiver instâncias disponíveis na sua região, **AWS EC2** é a melhor alternativa — oferece a mesma arquitetura completa com LiveKit self-hosted e UDP nativo. Para maior facilidade de deploy com menor controle, use Fly.io ou Railway com LiveKit Cloud.
