# Requirements Document

## Introduction

Migração da infraestrutura de deploy do 7Gather da Oracle Cloud Free Tier para Amazon Web Services (AWS). A motivação é a indisponibilidade de criação de instâncias compute na Oracle Cloud na região do usuário. O objetivo é recriar a mesma arquitetura (Docker Compose com Nginx Proxy Manager, Colyseus, LiveKit e client estático) em uma instância EC2, mantendo capacidade para 5 salas × 20 participantes (100 usuários simultâneos).

## Glossary

- **EC2_Instance**: Instância Amazon Elastic Compute Cloud que hospeda todos os containers Docker da plataforma 7Gather
- **Security_Group**: Conjunto de regras de firewall virtual da AWS que controla o tráfego de entrada e saída da EC2_Instance
- **Elastic_IP**: Endereço IPv4 público estático da AWS associado à EC2_Instance, que persiste entre stops/starts
- **Deploy_Guide**: Documento de referência (docs/DEPLOY.md) com instruções passo a passo para provisionamento e configuração da infraestrutura AWS
- **Docker_Compose_Stack**: Conjunto de serviços orquestrados pelo docker-compose.yml (Nginx Proxy Manager, Colyseus, LiveKit, Client)
- **LiveKit_Config**: Arquivo de configuração do LiveKit (config/livekit.yaml) com parâmetros de rede e TURN
- **Key_Pair**: Par de chaves SSH da AWS usado para acesso remoto à EC2_Instance

## Requirements

### Requirement 1: Provisionamento da Instância EC2

**User Story:** As a platform operator, I want a documented procedure for creating an AWS EC2 instance with adequate resources, so that I can host the 7Gather platform with equivalent capacity to the Oracle Cloud ARM instance.

#### Acceptance Criteria

1. THE Deploy_Guide SHALL specify an EC2 instance type with a minimum of 2 vCPUs and 4 GB RAM in the sa-east-1 (São Paulo) region
2. THE Deploy_Guide SHALL recommend an EC2 instance type with 4 vCPUs and 8 GB RAM for sustained operation of 5 rooms with 20 participants each using audio-only mode
3. THE Deploy_Guide SHALL document the steps to create an EC2 instance using the AWS Management Console, including AMI selection (Ubuntu 22.04 or 24.04 LTS x86_64), instance type selection, Key_Pair configuration, and Security Group creation with inbound rules for ports 22/TCP, 80/TCP, 443/TCP, 7881/TCP, and 50000-60000/UDP
4. THE Deploy_Guide SHALL document how to allocate and associate an Elastic_IP to the EC2_Instance
5. THE Deploy_Guide SHALL specify EBS volume configuration with a minimum of 30 GB gp3 storage

### Requirement 2: Configuração do Security Group

**User Story:** As a platform operator, I want a properly configured Security Group, so that all required network ports are open for the platform while maintaining security.

#### Acceptance Criteria

1. THE Deploy_Guide SHALL document the creation of a Security_Group with inbound rules for ports 80/TCP, 443/TCP, 7881/TCP, and 50000-60000/UDP from 0.0.0.0/0
2. THE Deploy_Guide SHALL document a restricted inbound rule for port 22/TCP limited to the operator's IP address in CIDR /32 notation
3. THE Deploy_Guide SHALL document a restricted inbound rule for port 81/TCP (Nginx Proxy Manager admin) limited to the operator's IP address in CIDR /32 notation
4. THE Security_Group SHALL allow all outbound traffic (0.0.0.0/0) on all ports and protocols
5. THE Deploy_Guide SHALL include a tabular summary of all Security_Group rules with direction, port, protocol, source, and description columns

### Requirement 3: Instalação do Ambiente Docker

**User Story:** As a platform operator, I want scripted instructions for installing Docker and Docker Compose on the EC2 instance, so that I can run the existing Docker Compose stack without modifications.

#### Acceptance Criteria

1. THE Deploy_Guide SHALL provide commands to install Docker Engine (version 24.0 or later) and Docker Compose plugin (version 2.20 or later) from the official Docker apt repository on Ubuntu 22.04 or 24.04 LTS (x86_64 architecture)
2. THE Deploy_Guide SHALL provide commands to add the `ubuntu` user to the `docker` group and instruct the operator to start a new shell session (via `newgrp docker` or re-login) to activate group membership
3. THE Deploy_Guide SHALL provide a verification step that confirms successful installation by executing `docker --version`, `docker compose version`, and `docker run --rm hello-world` as the `ubuntu` user without `sudo`, where each command must complete with exit code 0 and produce expected output (version string or "Hello from Docker!" message)
4. IF any verification command exits with a non-zero code or produces an error, THEN THE Deploy_Guide SHALL instruct the operator to check that the Docker service is running (`systemctl status docker`) and that group membership is active before retrying

### Requirement 4: Adaptação da Configuração LiveKit para Produção AWS

**User Story:** As a platform operator, I want the LiveKit configuration adapted for an AWS EC2 deployment, so that WebRTC media flows correctly with the instance's public IP.

#### Acceptance Criteria

1. THE Deploy_Guide SHALL document how to configure `rtc.use_external_ip: true` in the LiveKit_Config for AWS EC2 production deployment where the instance is behind NAT with an Elastic IP
2. THE Deploy_Guide SHALL document how to set `rtc.node_ip` to the Elastic_IP address or instruct removal of the field to allow auto-detection via the EC2 metadata service
3. WHEN TURN relay is required for participants behind restrictive NATs, THE Deploy_Guide SHALL document the configuration of TURN in LiveKit_Config specifying the `domain`, `tls_port` (5349/TCP), and `udp_port` (3478/UDP) fields, and list the corresponding firewall rules that must be opened
4. THE Deploy_Guide SHALL document updating `rtc.port_range_start` to 50000 and `rtc.port_range_end` to 60000 in the LiveKit_Config file and the corresponding UDP port mapping (`50000-60000:50000-60000/udp`) in docker-compose.yml, replacing the development range (7882-7932)
5. THE Deploy_Guide SHALL document the AWS Security Group ingress rules required for LiveKit media traffic: UDP ports 50000-60000 from 0.0.0.0/0, TCP port 7881 from 0.0.0.0/0, and TURN ports 5349/TCP and 3478/UDP from 0.0.0.0/0 when TURN is enabled

### Requirement 5: Configuração de DNS e Domínio

**User Story:** As a platform operator, I want clear DNS configuration instructions for the AWS deployment, so that my domain points to the new EC2 instance.

#### Acceptance Criteria

1. THE Deploy_Guide SHALL document three DNS A records pointing to the Elastic_IP: the main domain (gather.seudominio.com), the WebSocket subdomain (ws.gather.seudominio.com), and the LiveKit subdomain (livekit.gather.seudominio.com), each with a TTL of 300 seconds
2. THE Deploy_Guide SHALL provide a DNS verification command (dig or nslookup) for each of the three subdomains and state that propagation is confirmed when the command output returns the Elastic_IP address, noting that propagation typically completes within 1 hour but may take up to 48 hours
3. THE Deploy_Guide SHALL note that existing DNS records from the Oracle Cloud deployment must be updated to the new Elastic_IP for all three subdomains (main domain, WebSocket subdomain, and LiveKit subdomain)
4. IF the DNS verification command does not return the expected Elastic_IP after 48 hours, THEN THE Deploy_Guide SHALL provide troubleshooting steps including verifying the A record configuration at the DNS provider and checking for conflicting records

### Requirement 6: Deploy da Aplicação e Verificação

**User Story:** As a platform operator, I want a deployment procedure and verification checklist for AWS, so that I can confirm the platform is fully operational after migration.

#### Acceptance Criteria

1. THE Deploy_Guide SHALL document the procedure to clone the repository, configure the .env file with all mandatory production variables (LIVEKIT_URL using wss:// protocol, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, DOMAIN, and CERTBOT_EMAIL), and start the Docker_Compose_Stack on the EC2_Instance using `docker compose up -d`
2. THE Deploy_Guide SHALL document the Nginx Proxy Manager initial configuration steps: first login on port 81 with default credentials, immediate password change, and proxy host creation with SSL for each externally accessible service (client, Colyseus WebSocket, LiveKit signaling)
3. THE Deploy_Guide SHALL provide a post-deploy verification checklist with explicit pass/fail criteria for each item: all 4 services (nginx, colyseus, livekit, client) reporting "running" status via `docker compose ps`, HTTP 200 response from the Colyseus /health endpoint on port 2567, HTTPS access to the configured domain returning the client application, WebSocket upgrade (HTTP 101) to the Colyseus endpoint, LiveKit signaling reachable via wss:// on port 7881, and at least one UDP port in the media range responding to connectivity probe
4. IF one or more containers exit or remain in "restarting" state within 60 seconds after `docker compose up -d`, THEN THE Deploy_Guide SHALL document troubleshooting steps covering port conflicts (ports 80, 443, 81, 2567, 7880 already in use), insufficient memory (less than 4 GB available), and Docker daemon not running

### Requirement 7: Adaptação do docker-compose.yml para Produção AWS

**User Story:** As a platform operator, I want any necessary docker-compose.yml changes documented for AWS production, so that the stack runs correctly on the new infrastructure.

#### Acceptance Criteria

1. THE Deploy_Guide SHALL document the LiveKit UDP port range adjustment in docker-compose.yml from the dev mapping (7882-7932:7882-7932/udp) to the production mapping (50000-60000:50000-60000/udp), and the corresponding update in config/livekit.yaml setting rtc.port_range_start to 50000 and rtc.port_range_end to 60000
2. THE Deploy_Guide SHALL document that the environment variable LIVEKIT_URL must use the `wss://` scheme followed by the public domain name (e.g., `wss://livekit.example.com`) in production, replacing the dev default of `ws://livekit:7880`
3. WHEN deploying on AWS, THE Deploy_Guide SHALL note that no iptables configuration is required (unlike Oracle Cloud) because AWS Security Groups handle firewall rules externally, and SHALL specify that a Security Group inbound rule allowing UDP traffic on ports 50000-60000 from 0.0.0.0/0 must be created
4. THE Deploy_Guide SHALL document that in config/livekit.yaml the rtc.use_external_ip setting must be changed from false to true and the rtc.node_ip setting must be removed or set to the instance public IP address, so that remote WebRTC clients can reach the server

### Requirement 8: Estimativa de Custos AWS

**User Story:** As a platform operator, I want a cost estimate for running 7Gather on AWS, so that I can compare with other hosting options and plan my budget.

#### Acceptance Criteria

1. THE Deploy_Guide SHALL include a monthly cost estimate table for the recommended EC2 instance type in the São Paulo (sa-east-1) region, covering compute, storage, and data transfer
2. THE Deploy_Guide SHALL note the AWS Free Tier eligibility period (12 months for t3/t2 instances) and what is included
3. THE Deploy_Guide SHALL compare the AWS cost against the Oracle Cloud Free Tier (always free) baseline documented in the existing Deploy_Guide

### Requirement 9: Segurança e Boas Práticas AWS

**User Story:** As a platform operator, I want security best practices documented for the AWS deployment, so that the infrastructure follows AWS security recommendations.

#### Acceptance Criteria

1. THE Deploy_Guide SHALL recommend using a non-root IAM user for day-to-day AWS console and CLI operations, reserving the root account exclusively for billing and account-level tasks
2. THE Deploy_Guide SHALL recommend enabling MFA on both the AWS root account and the IAM user used for operations
3. THE Deploy_Guide SHALL document the use of an ED25519 or RSA (4096-bit minimum) Key_Pair for SSH access, recommend disabling password authentication in the sshd configuration, and recommend restricting SSH (port 22) to the operator's IP address in the Security_Group
4. THE Deploy_Guide SHALL recommend restricting the Nginx Proxy Manager admin port (81) to the operator's IP address in the Security_Group
5. THE Deploy_Guide SHALL recommend setting up automated EBS snapshots or AWS Backup with a minimum frequency of once per day and a retention period of at least 7 days for disaster recovery of the Docker data and configuration volume

### Requirement 10: Documentação de Migração Oracle → AWS

**User Story:** As a platform operator, I want a migration-specific section in the Deploy_Guide, so that I understand the differences between Oracle Cloud and AWS deployment and can execute the transition smoothly.

#### Acceptance Criteria

1. THE Deploy_Guide SHALL include a comparison table with one row per configuration aspect (firewall mechanism: iptables + Security Lists vs Security Groups; architecture: ARM Ampere A1 vs x86_64; IP assignment: OCI VCN + public IP vs VPC + Elastic IP; port configuration method: Security List ingress rules vs Security Group inbound rules) showing the Oracle Cloud value and the AWS equivalent
2. THE Deploy_Guide SHALL note that the custom Docker images (client and server) will be automatically built for x86_64 architecture via the multi-arch base images (node:20-alpine, nginx:alpine) on the first AWS deploy, and that third-party images (livekit/livekit-server, jc21/nginx-proxy-manager) already publish x86_64 variants requiring no changes
3. THE Deploy_Guide SHALL document the migration sequence as an ordered checklist: (1) provision AWS EC2 instance, (2) configure Security Groups with equivalent port rules, (3) clone repository and configure .env, (4) run docker compose up --build, (5) execute the Verificação Pós-Deploy checklist against the AWS IP, (6) update DNS records to point to the AWS Elastic IP, (7) decommission Oracle Cloud instance
4. THE Deploy_Guide SHALL state that the Dockerfiles and docker-compose.yml require no modifications for the migration, and that only environment-specific configuration differs (the .env file values for LIVEKIT_URL and DOMAIN, and the firewall rules)
5. IF the Verificação Pós-Deploy checklist fails against the AWS instance before DNS cutover, THEN THE Deploy_Guide SHALL instruct the operator to keep DNS pointing to the Oracle instance and troubleshoot the AWS deployment without service interruption
