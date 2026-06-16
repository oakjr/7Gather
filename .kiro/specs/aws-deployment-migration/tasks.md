# Implementation Plan: AWS Deployment Migration

## Overview

Add a comprehensive AWS EC2 deployment section ("Opção 4: AWS EC2") and a migration comparison section to the existing `docs/DEPLOY.md`. This is a documentation-only feature — no application code changes. The deliverable is structured Markdown content covering account setup, EC2 provisioning, Security Groups, Docker installation, LiveKit configuration, application deploy, DNS, costs, security best practices, and Oracle → AWS migration guidance.

## Tasks

- [x] 1. Add AWS EC2 section header and account setup steps
  - [x] 1.1 Add "Opção 4: AWS EC2" section with introduction and Passo 1 (IAM/account setup)
    - Insert new section after "Opção 3: Railway" in docs/DEPLOY.md
    - Add section introduction describing AWS EC2 as deployment target for 5 salas × 20 participants
    - Document Passo 1: Criar conta AWS e configurar IAM — account creation, IAM user, MFA recommendations
    - _Requirements: 9.1, 9.2_

  - [x] 1.2 Add Passo 2: Criar instância EC2
    - Document AMI selection (Ubuntu 22.04 or 24.04 LTS x86_64)
    - Document instance type recommendation (t3.xlarge: 4 vCPU / 16 GB) with minimum (t3.medium: 2 vCPU / 4 GB)
    - Document Key Pair creation (ED25519 or RSA 4096-bit)
    - Document EBS volume configuration (minimum 30 GB gp3)
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 9.3_


  - [x] 1.3 Add Passo 3: Configurar Security Group
    - Document Security Group creation with all inbound rules in tabular format
    - Include restricted rules for SSH (port 22) and NPM admin (port 81) to operator IP/32
    - Include open rules for HTTP (80), HTTPS (443), LiveKit TCP (7881), WebRTC UDP (50000-60000)
    - Document all outbound traffic allowed
    - Include TURN ports (5349/TCP, 3478/UDP) when TURN is enabled
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.5, 9.4_

  - [x] 1.4 Add Passo 4: Alocar Elastic IP
    - Document Elastic IP allocation and association to the EC2 instance
    - Note that Elastic IP persists across stop/start unlike Oracle Cloud public IP
    - _Requirements: 1.4_

- [ ] 2. Add Docker installation and LiveKit configuration steps
  - [x] 2.1 Add Passo 5: Instalar Docker e Docker Compose
    - Provide commands to install Docker Engine (24.0+) and Docker Compose plugin (2.20+) from official apt repository
    - Document adding ubuntu user to docker group with newgrp/re-login instruction
    - Include verification step: docker --version, docker compose version, docker run --rm hello-world
    - Document troubleshooting if verification fails (systemctl status docker, group membership)
    - Note that NO iptables configuration is needed (unlike Oracle Cloud)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 7.3_


  - [x] 2.2 Add Passo 6: Configurar LiveKit para produção AWS
    - Document rtc.use_external_ip: true configuration
    - Document rtc.node_ip removal or setting to Elastic IP
    - Document rtc.port_range_start: 50000 and rtc.port_range_end: 60000
    - Document TURN configuration (domain, tls_port: 5349, udp_port: 3478)
    - Document docker-compose.yml port mapping change from 7882-7932 to 50000-60000/udp
    - Document LIVEKIT_URL must use wss:// scheme in production
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 7.1, 7.2, 7.4_

- [x] 3. Add application deploy, Nginx Proxy Manager, and DNS steps
  - [x] 3.1 Add Passo 7: Deploy da aplicação
    - Document clone, .env configuration (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, DOMAIN, CERTBOT_EMAIL)
    - Document docker compose up -d command
    - Document troubleshooting for containers exiting/restarting within 60s (port conflicts, memory, daemon)
    - _Requirements: 6.1, 6.4_

  - [x] 3.2 Add Passo 8: Configurar Nginx Proxy Manager
    - Document initial login on port 81, password change
    - Document proxy host creation with SSL for client, Colyseus WebSocket, and LiveKit signaling
    - Reference existing SSL/Let's Encrypt section for certificate details
    - _Requirements: 6.2_

  - [x] 3.3 Add Passo 9: Configurar DNS
    - Document three DNS A records pointing to Elastic IP (gather, ws, livekit subdomains) with TTL 300
    - Provide dig/nslookup verification commands for each subdomain
    - Note about updating existing Oracle Cloud DNS records to new Elastic IP
    - Document troubleshooting if DNS not propagating after 48h
    - _Requirements: 5.1, 5.2, 5.3, 5.4_


- [x] 4. Add verification checklist, costs, and security sections
  - [x] 4.1 Add post-deploy verification checklist within AWS section
    - Document pass/fail criteria: all 4 services running, HTTP 200 from /health, HTTPS client access, WebSocket upgrade (101), LiveKit wss:// on 7881, UDP probe
    - _Requirements: 6.3_

  - [x] 4.2 Add Estimativa de Custos subsection
    - Include monthly cost table for t3.xlarge in sa-east-1 (compute, storage, data transfer)
    - Note AWS Free Tier eligibility (12 months for t3 instances)
    - Compare against Oracle Cloud Free Tier (always free) baseline
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 4.3 Add Segurança e Boas Práticas subsection
    - Document IAM non-root user recommendation
    - Document MFA recommendation for root and IAM user
    - Document Key Pair best practices and sshd password auth disabled
    - Document NPM admin port restriction
    - Document automated EBS snapshots/AWS Backup (daily, 7-day retention minimum)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 5. Add migration section and update cost summary
  - [x] 5.1 Add "Migração Oracle Cloud → AWS" section
    - Add comparison table (firewall, architecture, IP assignment, port config, cost, Docker images)
    - Note that Docker images auto-build for x86_64 via multi-arch base images
    - Note Dockerfiles and docker-compose.yml require no modifications
    - _Requirements: 10.1, 10.2, 10.4_


  - [x] 5.2 Add migration sequence ordered checklist
    - Document 7 ordered steps: provision EC2, configure Security Groups, clone/configure .env, docker compose up --build, verify against AWS IP, update DNS, decommission Oracle
    - Document rollback: if verification fails, keep DNS on Oracle and troubleshoot AWS
    - _Requirements: 10.3, 10.5_

  - [x] 5.3 Update "Resumo de Custos" table with AWS row
    - Add AWS EC2 row to the existing cost comparison table at the end of DEPLOY.md
    - Include cost (~$85/mo for t3.xlarge) and limitations/notes
    - _Requirements: 8.1, 8.3_

- [x] 6. Update table of contents and final review
  - [x] 6.1 Update the Sumário (table of contents) at the top of DEPLOY.md
    - Add links for "Opção 4: AWS EC2" and "Migração Oracle Cloud → AWS"
    - Ensure all internal anchor links resolve correctly
    - _Requirements: 1.3, 10.1_

- [x] 7. Final checkpoint
  - Ensure all sections are present, internal links work, and all 10 requirements are covered. Ask the user if questions arise.

## Notes

- This is a documentation-only feature — no application code, Dockerfiles, or docker-compose.yml are modified
- The guide is written in Brazilian Portuguese following the existing DEPLOY.md style
- No property-based tests or unit tests apply since there is no executable code
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation of document structure and completeness
- The guide references but does not modify config/livekit.yaml, docker-compose.yml, and .env.example

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4"] },
    { "id": 3, "tasks": ["2.1", "2.2"] },
    { "id": 4, "tasks": ["3.1", "3.2", "3.3"] },
    { "id": 5, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 6, "tasks": ["5.1", "5.2", "5.3"] },
    { "id": 7, "tasks": ["6.1"] }
  ]
}
```
