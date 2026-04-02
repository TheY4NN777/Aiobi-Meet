# Aiobi Meet — Guide de deploiement production

> **Serveur** : Aiobi Master (207.180.255.229) — serveur applicatif partage (1.8 TB, 251 GB RAM, 20 cores)
> **Domaines** : `meet.aiobi.world` / `id.aiobi.world` / `lkt.aiobi.world`
> **Derniere mise a jour** : 31 mars 2026
>
> **Note importante** : Ce serveur heberge toutes les apps Aiobi. Meet est la premiere
> app deployee. Le reverse proxy **Traefik v3.6** est deja en place sur 80/443 et gere
> le TLS automatiquement via Let's Encrypt. Meet s'integre via des labels Docker.

---

## Table des matieres

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture technique](#2-architecture-technique)
3. [Les deux compose files et pourquoi](#3-les-deux-compose-files-et-pourquoi)
4. [Reseaux Docker](#4-reseaux-docker)
5. [Decisions d'architecture et justifications](#5-decisions-darchitecture-et-justifications)
6. [Routing HTTP — comment le trafic circule](#6-routing-http--comment-le-trafic-circule)
7. [Description de chaque service](#7-description-de-chaque-service)
8. [Fichiers d'environnement](#8-fichiers-denvironnement)
9. [Gestion des secrets](#9-gestion-des-secrets)
10. [TLS / Let's Encrypt](#10-tls--lets-encrypt)
11. [Ports et firewall](#11-ports-et-firewall)
12. [Performance tuning](#12-performance-tuning)
13. [Procedure de deploiement pas a pas](#13-procedure-de-deploiement-pas-a-pas)
14. [Procedure de mise a jour (CI/CD)](#14-procedure-de-mise-a-jour-cicd)
15. [Commandes utiles](#15-commandes-utiles)
16. [Diagnostic et depannage](#16-diagnostic-et-depannage)
17. [Replication DB (futur)](#17-replication-db-futur)
18. [Differences avec le staging](#18-differences-avec-le-staging)
19. [Modifications manuelles serveur](#19-modifications-manuelles-serveur)

---

## 1. Vue d'ensemble

L'environnement de production heberge Aiobi Meet sur le serveur applicatif partage Aiobi.
Il est le point d'acces principal pour les utilisateurs finaux.

### Flux de deploiement global

```
Developpeur (branche develop)
        |
        v
    GitLab CI/CD (self-hosted, VPN)
        |
        v
    Staging (aiobi-meet.duckdns.org:8443)
        |
        v   (merge develop -> main)
    Production (meet.aiobi.world)
```

### Workflow CI/CD

- **Push sur `develop`** -> build local + deploy staging (runner tag: `dev`)
- **Push sur `main`** -> build + push GitLab Registry + deploy production (runner tag: `aiobi-prod`)

Les images sont buildees, poussees au GitLab Container Registry, puis pullees sur
le serveur de prod. Cela permet le versioning et le rollback facile.

---

## 2. Architecture technique

### Diagramme global

```
                        Internet
                           |
                           v
                    +--------------+
                    |   Traefik    |  :80 (HTTP redirect)
                    |   (existant) |  :443 (HTTPS TLS termination)
                    +------+-------+
                           |
              +------------+------------+------------+
              |                         |            |
              v                         v            v
    +-------------------+    +----------------+  +-------------------+
    |    frontend        |    |   keycloak     |  |     livekit       |
    | (nginx interne)    |    |   (OIDC SSO)   |  | (SFU WebRTC)      |
    | :8083              |    |   :8080        |  | :47880 signaling  |
    | meet.aiobi.world   |    | id.aiobi.world |  | :47881 ICE TCP    |
    +---+-----+---+      |    +-------+--------+  | :47882 media UDP  |
        |     |   |      |            |            | lkt.aiobi.world   |
        |     |   |      |            |            +--------+----------+
        v     v   v      |            v                     |
   +----+ +----+ +----+  |      +-----------+               v
   |SPA | |API | |MinIO|  |      |kc-postgres|          +-------+
   |React| |Dj.| |media|  |      +-----------+          | redis |
   +----+ +----+ +----+  |                              +-------+
              |           |
     +--------+--------+  |
     |        |        |  |
     v        v        v  |
  +----+  +-----+  +-----+
  |PgSQL| |Redis|  |MinIO|
  +----+  +-----+  +-----+
```

### Difference majeure vs staging

- **Staging** : nginx-proxy Docker dedie sur ports 8880/8443, Keycloak route par le frontend (path-based)
- **Production** : **Traefik existant** sur 80/443 (partage avec les autres apps Aiobi), Keycloak sur sous-domaine dedie (`id.aiobi.world`), integration via labels Docker

### Composants

| Composant | Role | Image Docker |
|-----------|------|-------------|
| **Traefik** | Reverse proxy TLS existant, routing par labels Docker | `traefik:v3.6` (gere separement) |
| **frontend** | SPA React servie par Nginx, reverse proxy interne vers le backend et MinIO | GitLab Registry |
| **backend** | API Django avec Gunicorn (6 workers, timeout 90s) | GitLab Registry |
| **celery** | Worker asynchrone (emails, traitement) — concurrency 4 | Meme image que backend |
| **keycloak** | Serveur d'identite SSO/OIDC sur sous-domaine dedie | `quay.io/keycloak/keycloak:20.0.1` |
| **livekit** | Serveur SFU WebRTC pour la visioconference temps reel | `livekit/livekit-server:latest` |
| **postgresql** | Base de donnees de l'application (shared_buffers=4GB) | `postgres:16` |
| **kc-postgresql** | Base de donnees dediee a Keycloak | `postgres:16` |
| **redis** | Cache + message broker (maxmemory 2GB) | `redis:5` |
| **minio** | Stockage objet S3 pour les enregistrements et fichiers | `minio/minio` |
| **mailcatcher** | Intercepteur d'emails temporaire (remplacer par SMTP reel) | `sj26/mailcatcher` |

---

## 3. Les deux compose files et pourquoi

Le deploiement est decoupe en **deux fichiers Docker Compose** independants. Chaque
fichier peut etre redemarre sans impacter l'autre.

**Pas de compose.nginx-proxy.yaml** — Traefik est deja en place sur le serveur et gere
par l'infra Aiobi. Meet s'integre via des labels Docker sur les conteneurs.

### `compose.keycloak.yaml` — L'authentification

Keycloak + sa base de donnees dediee. Separe parce que :

- Keycloak a son propre cycle de vie (mises a jour de securite independantes).
- Sa base de donnees ne doit pas etre mixee avec celle de l'application.
- On peut le redemarrer sans couper la visioconference en cours.
- Keycloak est sur le reseau `aiobi-public` avec un label Traefik pour `id.aiobi.world`.

**IMPORTANT** : Ne jamais `--force-recreate` ce compose (preserve les sessions et la DB).

### `compose.yaml` — L'application

Frontend, backend, celery, livekit, postgresql, redis, minio, mailcatcher.
C'est le compose qu'on redemarre le plus souvent lors des mises a jour.

### Ordre de demarrage

```bash
# 1. Keycloak (prerequis pour l'auth OIDC)
docker compose -f compose.keycloak.yaml up -d

# 2. Application (depend de Keycloak pour fonctionner)
docker compose -f compose.yaml up -d
```

---

## 4. Reseaux Docker

| Reseau | Cree par | Services | Role |
|--------|----------|----------|------|
| `aiobi-public` | Infra Aiobi (externe) | Traefik, frontend, keycloak, livekit | Traefik route le trafic Internet vers les services avec labels |
| `prod-app` | compose.keycloak.yaml | keycloak, backend, frontend | Communication Keycloak - Backend (OIDC server-to-server) |
| `default` | chaque compose | tous les services internes | Communication interne entre services du meme compose |

**Points cles :**
- Le backend n'est **PAS** sur `aiobi-public` — il est accessible uniquement via le frontend nginx.
- Keycloak est sur `aiobi-public` **ET** `prod-app` — il doit etre accessible par Traefik
  (pour le sous-domaine) ET par le backend (pour les appels OIDC internes).
- `aiobi-public` est un reseau **externe** partage avec les autres apps Aiobi sur le serveur.

---

## 5. Decisions d'architecture et justifications

### 5.1 Pourquoi Traefik au lieu de nginx-proxy ?

Le serveur Aiobi Master a deja Traefik v3.6 en place sur les ports 80/443, partage entre
toutes les apps Aiobi (GitLab, Teleport, Vault, etc.). Deployer un deuxieme reverse proxy
serait un conflit de ports et une duplication inutile.

> **Note (31 mars 2026)** : Traefik a ete mis a jour de v3.3 a v3.6 suite a l'upgrade
> du daemon Docker vers v29.x (API 1.54). Traefik v3.3 embarque un client Docker trop
> ancien (API 1.24) qui est rejete par le daemon v29.x avec l'erreur
> `client version 1.24 is too old. Minimum supported API version is 1.40`.
> La mise a jour vers Traefik v3.6 resout le probleme nativement. La variable
> `DOCKER_API_VERSION=1.45` a egalement ete ajoutee par securite.

L'integration se fait via des **labels Docker** sur les conteneurs :
```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.meet.rule=Host(`meet.aiobi.world`)"
  - "traefik.http.routers.meet.entrypoints=websecure"
  - "traefik.http.routers.meet.tls.certresolver=letsencrypt"
  - "traefik.http.services.meet.loadbalancer.server.port=8083"
```

Traefik detecte automatiquement les conteneurs avec `traefik.enable=true` sur le reseau
`aiobi-public` et genere la configuration de routing + TLS.

### 5.2 Pourquoi Keycloak sur un sous-domaine dedie ?

En staging, Keycloak est route par le frontend nginx via des paths (`/realms/`, `/js/`,
`/resources/`, `/admin/master/`, `/admin/realms/`). Cela fonctionne mais :

- Le nginx du frontend doit connaitre Keycloak (couplage).
- 5 blocs de routing supplementaires dans la config nginx.
- Conflits potentiels entre `/admin` Django et `/admin` Keycloak.

En production, Keycloak a son propre sous-domaine (`id.aiobi.world`). Traefik le route
directement via label. Le nginx du frontend ne connait plus Keycloak du tout.

### 5.3 Pourquoi les endpoints OIDC server-to-server sont en HTTP ?

Les endpoints OIDC se divisent en deux categories :

- **Browser-facing** (authorization, logout) : le navigateur appelle directement Keycloak
  -> doit utiliser HTTPS public (`https://id.aiobi.world/realms/...`).
- **Server-to-server** (JWKS, token, userinfo) : le backend Django appelle Keycloak
  en interne dans le reseau Docker -> utilise HTTP interne (`http://keycloak:8080/realms/...`).

Utiliser HTTPS pour le server-to-server causerait des erreurs `SSL_CERTIFICATE_VERIFY_FAILED`
car le backend essaierait de verifier le certificat Let's Encrypt en passant par Traefik
au lieu d'appeler directement Keycloak. Cette lecon a ete apprise en staging (erreur #1).

### 5.4 Pourquoi le placeholder `__LIVEKIT_API_SECRET__` dans livekit-server.yaml ?

L'image LiveKit est basee sur scratch (pas de shell). Cependant, l'entrypoint est
overridee dans le compose pour utiliser `/bin/sh` avec `sed` pour remplacer le placeholder
par la vraie valeur au demarrage. La variable `${VARIABLE}` ne fonctionne pas car
LiveKit ne fait pas de substitution d'env dans son YAML.

### 5.5 Pourquoi les proxy buffers 16k ?

Les tokens JWT de Keycloak font ~2KB. Lors du logout, le token est passe dans l'URL.
Les buffers par defaut de Nginx (4KB) sont trop petits, causant une erreur 502
"upstream sent too big header". Les buffers 16k sont configures dans
`default.conf.template` (nginx interne du frontend).

### 5.6 Pourquoi les ports LiveKit custom (47880/47881/47882) ?

Les ports par defaut de LiveKit (7880/7881/7882) sont bien connus. Utiliser des ports
custom est une mesure de securite supplementaire (security through obscurity) qui
reduit la surface d'attaque contre les scans automatises.

### 5.7 Pourquoi GitLab Container Registry en production ?

En staging, les images sont buildees localement sur le serveur. En production :

- Les images sont **versionnees** (tag par commit SHA).
- Le **rollback** est simple : changer `IMAGE_TAG` et `docker compose pull`.
- Le serveur de prod **ne fait pas de build** (moins de charge CPU pendant le deploy).
- Les images sont **reproductibles** (meme image testee en CI = image deployee).

### 5.8 Pourquoi le .env est genere par le CI ?

Les secrets sont stockes dans les **variables CI/CD de GitLab** (proteges, masques).
Le pipeline genere le fichier `.env` a chaque deploy. Avantages :

- Pas de fichier de secrets qui traine sur le serveur a maintenir manuellement.
- Source unique de verite (GitLab CI/CD Variables).
- Changement de secret = changer la variable GitLab + re-deploy.

### 5.9 Pourquoi la CI configure Keycloak via API REST apres chaque deploy ?

Le fichier `realm.json` sert uniquement a l'import initial du realm (premiere creation).
Il contient des secrets de developpement qui ne doivent pas etre utilises en production.

Apres chaque deploy, la CI configure automatiquement Keycloak via son API REST admin :
- **Secret OIDC** : synchronise depuis la variable CI `OIDC_RP_CLIENT_SECRET`
- **Redirect URIs** : configurees pour l'environnement (meet.aiobi.world en prod)
- **Locale** : francais uniquement, pas de dropdown de langue

Cela garantit que meme apres un destroy+recreate complet de Keycloak (perte du volume
PostgreSQL), un simple re-deploy via la CI reconfigure tout automatiquement sans
intervention manuelle. Le realm.json reste un template propre sans secrets en dur.

---

## 6. Routing HTTP — comment le trafic circule

### meet.aiobi.world (frontend + backend)

```
Client -> Traefik (:443) -> frontend nginx (:8083)
    / -> SPA React (:8080, try_files)
    /api -> backend Django (:8000)
    /admin -> backend Django (:8000)
    /static -> backend Django (:8000)
    /media/ -> MinIO (:9000) via auth_request
```

### id.aiobi.world (Keycloak)

```
Client -> Traefik (:443) -> keycloak (:8080)
    /realms/ -> Keycloak OIDC
    /resources/ -> Keycloak static
    /js/ -> Keycloak JS
    /admin/ -> Keycloak admin console
```

### lkt.aiobi.world (LiveKit)

```
Client -> Traefik (:443) -> livekit (:47880) [signaling WebSocket]
Client -> livekit (:47882/udp) [media direct, pas de proxy]
Client -> livekit (:47881/tcp) [ICE TCP fallback]
```

---

## 7. Description de chaque service

### backend

- **Image** : GitLab Registry (`$CI_REGISTRY_IMAGE/backend:$SHA`)
- **Workers** : 6 Gunicorn workers (via `GUNICORN_CMD_ARGS=--workers=6`)
- **Timeout** : 90s (graceful shutdown)
- **Healthcheck** : `python manage.py check` toutes les 15s
- **Depends on** : postgresql (healthy), redis (started), livekit (started)

### frontend

- **Image** : GitLab Registry (`$CI_REGISTRY_IMAGE/frontend:$SHA`)
- **Ports internes** : 8080 (SPA), 8083 (routing proxy)
- **Traefik** : label `Host(meet.aiobi.world)` -> port 8083
- **Volumes** : `default.conf.template` monte depuis le host

### keycloak

- **Image** : `quay.io/keycloak/keycloak:20.0.1`
- **Traefik** : label `Host(id.aiobi.world)` -> port 8080
- **Volumes** : `realm.json` (import initial), theme Aiobi (login branding)
- **Reseau** : `aiobi-public` + `prod-app` + `default`

### livekit

- **Image** : `livekit/livekit-server:latest`
- **Ports exposes** : 47881/tcp, 47882/udp (ICE, pas de proxy)
- **Traefik** : label `Host(lkt.aiobi.world)` -> port 47880 (signaling)
- **Config** : `livekit-server.yaml` avec placeholder sed

### postgresql

- **Image** : `postgres:16`
- **Tuning** : `shared_buffers=4GB`, `effective_cache_size=12GB`, `work_mem=64MB`, `maintenance_work_mem=512MB`
- **Volumes** : `./data/databases/backend`

### redis

- **Image** : `redis:5`
- **Tuning** : `maxmemory 2gb`, `maxmemory-policy allkeys-lru`

### celery

- **Image** : Meme que backend
- **Concurrency** : 4 workers
- **Commande** : `celery -A meet.celery_app worker -l INFO --concurrency=4`

---

## 8. Fichiers d'environnement

### Structure

```
docker/production/
+-- .env                          # Genere par le CI (NON versionne)
+-- .env.example                  # Template de reference
+-- env.d/
|   +-- hosts                     # Domaines et noms de services
|   +-- common                    # Django, OIDC, LiveKit, features
|   +-- keycloak                  # Config Keycloak (KC_HOSTNAME, proxy)
|   +-- postgresql                # DB backend (credentials, host)
|   +-- kc_postgresql             # DB Keycloak (credentials, host)
+-- compose.yaml                  # Services applicatifs
+-- compose.keycloak.yaml         # Keycloak + sa DB
+-- default.conf.template         # Config nginx frontend
+-- livekit-server.yaml           # Config LiveKit (placeholder sed)
```

### Variables cles dans `env.d/common`

| Variable | Valeur | Explication |
|----------|--------|-------------|
| `DJANGO_CONFIGURATION` | `Production` | Active les settings de securite (HSTS, secure cookies, etc.) |
| `MEET_BASE_URL` | `https://meet.aiobi.world` | Pas de port (standard 443) |
| `OIDC_OP_AUTHORIZATION_ENDPOINT` | `https://id.aiobi.world/realms/...` | Browser-facing, sous-domaine |
| `OIDC_OP_JWKS_ENDPOINT` | `http://keycloak:8080/realms/...` | Server-to-server, HTTP interne |
| `LIVEKIT_API_URL` | `https://lkt.aiobi.world` | URL publique LiveKit |

---

## 9. Gestion des secrets

Les secrets sont stockes dans les **variables CI/CD de GitLab** (Settings -> CI/CD -> Variables).
Le pipeline genere le `.env` a chaque deploy.

Variables a configurer dans GitLab :

| Variable | Type | Protege | Masque |
|----------|------|---------|--------|
| `MEET_HOST` | Variable | Oui | Non |
| `KEYCLOAK_HOST` | Variable | Oui | Non |
| `LIVEKIT_HOST` | Variable | Oui | Non |
| `DJANGO_SECRET_KEY` | Variable | Oui | Oui |
| `POSTGRES_PASSWORD` | Variable | Oui | Oui |
| `KC_POSTGRES_PASSWORD` | Variable | Oui | Oui |
| `KC_BOOTSTRAP_ADMIN_PASSWORD` | Variable | Oui | Oui |
| `OIDC_RP_CLIENT_SECRET` | Variable | Oui | Oui |
| `LIVEKIT_API_SECRET` | Variable | Oui | Oui |

Generer chaque secret avec : `openssl rand -base64 32`

---

## 10. TLS / Let's Encrypt

Les certificats sont generes **automatiquement par Traefik** via le certresolver `letsencrypt`
configure dans `/opt/aiobi/traefik/config/traefik.yml`.

Chaque conteneur avec un label `traefik.http.routers.*.tls.certresolver=letsencrypt`
obtient automatiquement un certificat Let's Encrypt pour son domaine.

Domaines certifies :
- `meet.aiobi.world` (frontend)
- `id.aiobi.world` (keycloak)
- `lkt.aiobi.world` (livekit)

**Aucune action manuelle requise** — Traefik demande et renouvelle les certificats
automatiquement. Les certificats sont stockes dans `/opt/aiobi/traefik/certs/acme.json`.

### 10.1 Prerequis iptables pour ACME (outbound Internet)

Traefik doit pouvoir joindre les serveurs Let's Encrypt (ACME) depuis le reseau Docker
`aiobi-public` (subnet `172.18.0.0/16`). Si `"iptables": false` est configure dans
`/etc/docker/daemon.json` ou si un restart Docker a reinitialise les regles, Traefik
echouera avec `dial tcp 172.65.32.248:443: i/o timeout`.

Regles iptables necessaires :

```bash
# Autoriser le trafic sortant et entrant pour le reseau aiobi-public
iptables -I DOCKER-USER -s 172.18.0.0/16 -j ACCEPT
iptables -I DOCKER-USER -d 172.18.0.0/16 -j ACCEPT

# NAT pour le trafic sortant (acces Internet depuis les conteneurs)
iptables -t nat -A POSTROUTING -s 172.18.0.0/16 ! -o docker0 -j MASQUERADE
```

Pour persister ces regles apres un reboot :

```bash
apt install iptables-persistent
netfilter-persistent save
```

Les fichiers sauvegardes sont dans `/etc/iptables/rules.v4` et `/etc/iptables/rules.v6`.

---

## 11. Ports et firewall

| Port | Protocole | Service | Expose sur Internet |
|------|-----------|---------|---------------------|
| 80 | TCP | Traefik (HTTP redirect) | Oui (gere par infra) |
| 443 | TCP | Traefik (HTTPS) | Oui (gere par infra) |
| 47881 | TCP | LiveKit ICE TCP | Oui |
| 47882 | UDP | LiveKit media | Oui |

Les ports 80/443 sont geres par l'infra Aiobi (Traefik). Seuls 47881/47882 sont
specifiques a Meet.

---

## 12. Performance tuning

### Configs appliquees

| Service | Config | Valeur | Pourquoi |
|---------|--------|--------|----------|
| **Gunicorn** | workers | 6 | 6 requetes API en parallele (via `GUNICORN_CMD_ARGS`) |
| **PostgreSQL** | shared_buffers | 4GB | Cache des donnees en RAM, reduit les lectures disque |
| **PostgreSQL** | effective_cache_size | 12GB | Indique au planner combien de RAM est disponible |
| **PostgreSQL** | work_mem | 64MB | Memoire par operation de tri/jointure |
| **PostgreSQL** | maintenance_work_mem | 512MB | Pour VACUUM, CREATE INDEX, etc. |
| **Redis** | maxmemory | 2GB | Limite la consommation memoire, eviction LRU |
| **Celery** | concurrency | 4 | 4 taches asynchrones en parallele |
| **LiveKit** | Pas de limite | - | Utilise autant de CPU/RAM que necessaire |

### Sysctl (configure sur le host)

```bash
net.core.rmem_max=5000000   # Buffer UDP pour LiveKit
```

### Scaler si necessaire

1. **Backend** : augmenter `GUNICORN_CMD_ARGS=--workers=9`
2. **Celery** : augmenter `--concurrency=8`
3. **Replicas** : `docker compose up -d --scale backend=3` (Traefik load balance auto)
4. **LiveKit** : scaler verticalement (plus de CPU/RAM)

---

## 13. Procedure de deploiement pas a pas

### Prerequis serveur (deja fait)

- [x] Docker installe (v29.3)
- [x] GitLab Runner enregistre (aiobi-master-prod, tags: `aiobi-prod`/`docker`)
- [x] `network_mode = "host"` dans `/etc/gitlab-runner/config.toml` (runner accede au host network pour GitLab)
- [x] `insecure-registries: ["10.13.13.1:5050"]` dans `/etc/docker/daemon.json` (GitLab Registry HTTP)
- [x] `iptables-persistent` installe et regles sauvegardees (section 10.1)
- [x] Repertoires `/opt/aiobi-meet/production/` crees
- [x] Sysctl `net.core.rmem_max=5000000`
- [x] Firewall : 47881/tcp + 47882/udp
- [x] DNS : meet/id/lkt.aiobi.world -> 207.180.255.229
- [ ] Variables CI/CD configurees dans GitLab

### Premier deploiement

1. Configurer les variables CI/CD dans GitLab (section 9)
2. Merger `develop` dans `main` et pusher
3. Le pipeline CI/CD fait le reste : build -> push registry -> deploy

---

## 14. Procedure de mise a jour (CI/CD)

Chaque push sur `main` declenche automatiquement :

1. **Build** : `build-backend-prod` et `build-frontend-prod` (en parallele)
   - Build Docker `--no-cache` (assets toujours a jour)
   - Push au GitLab Registry avec tags `:$SHA` et `:latest`
2. **Deploy** : `deploy-production` (apres les builds)
   - Genere `.env` depuis les variables CI/CD GitLab
   - Copie les configs du CI vers le host
   - Keycloak : `up -d` (preserve sessions)
   - Pull les nouvelles images
   - App : `up -d --force-recreate` (nouvelles images + env)
   - Migrations Django automatiques
   - **Configuration Keycloak automatique** via API REST :
     - Synchronise le secret OIDC client depuis la variable CI `OIDC_RP_CLIENT_SECRET`
     - Configure les redirect URIs et post_logout_redirect_uris pour l'environnement
     - Met la locale du realm en francais uniquement (pas de dropdown de langue)
   - Verification Traefik routing

### Rollback

```bash
cd /opt/aiobi-meet/production

# Changer IMAGE_TAG dans .env vers un SHA precedent
sed -i 's/IMAGE_TAG=.*/IMAGE_TAG=abc123de/' .env

# Pull et relancer
docker compose -f compose.yaml pull backend frontend
docker compose -f compose.yaml up -d --force-recreate
```

---

## 15. Commandes utiles

```bash
cd /opt/aiobi-meet/production

# --- Etat des services ---
docker compose -f compose.yaml ps
docker compose -f compose.keycloak.yaml ps

# --- Logs ---
docker compose -f compose.yaml logs -f backend
docker compose -f compose.yaml logs -f frontend
docker compose -f compose.yaml logs -f livekit
docker compose -f compose.keycloak.yaml logs -f keycloak

# --- Redemarrer un service ---
docker compose -f compose.yaml restart backend

# --- Migrations ---
docker compose -f compose.yaml exec -T backend python manage.py migrate --noinput

# --- Shell Django ---
docker compose -f compose.yaml exec backend python manage.py shell

# --- PostgreSQL shell ---
docker compose -f compose.yaml exec postgresql psql -U aiobi -d meet

# --- Stats ressources ---
docker stats --no-stream

# --- Traefik routing ---
docker logs traefik 2>&1 | grep "meet\|keycloak\|livekit" | tail -20
```

---

## 16. Diagnostic et depannage

### Erreur 502 au logout

Cause : buffers nginx trop petits pour le JWT Keycloak dans l'URL de logout.
Solution : verifier que `default.conf.template` contient `proxy_buffer_size 16k`.

### SSL_CERTIFICATE_VERIFY_FAILED sur le callback OIDC

Cause : le backend essaie d'appeler Keycloak via HTTPS au lieu de HTTP interne.
Solution : verifier que `OIDC_OP_JWKS_ENDPOINT`, `OIDC_OP_TOKEN_ENDPOINT` et
`OIDC_OP_USER_ENDPOINT` dans `env.d/common` utilisent `http://keycloak:8080/...`.

### Traefik ne route pas vers un service

Cause : le conteneur n'est pas sur le reseau `aiobi-public` ou n'a pas le label `traefik.enable=true`.
Solution :
```bash
# Verifier les reseaux du conteneur
docker inspect <conteneur> --format '{{json .NetworkSettings.Networks}}' | python3 -m json.tool

# Verifier les labels
docker inspect <conteneur> --format '{{json .Config.Labels}}' | python3 -m json.tool

# Verifier que Traefik voit le service
docker logs traefik 2>&1 | tail -50
```

### LiveKit "livekit-server: not found"

Cause : l'image LiveKit est basee sur scratch, le binaire est a `/livekit-server` pas dans PATH.
Solution : utiliser le chemin absolu dans l'entrypoint du compose.

### Camera "loading" au lieu du prompt de permission

Cause : Firefox ne supporte pas `navigator.permissions.query({name: 'camera'})`.
Solution : le frontend catch l'erreur et set la permission a `'prompt'` (deja corrige).

### Traefik API version mismatch apres upgrade Docker

Cause : apres un upgrade du daemon Docker vers v29.x (API 1.54), Traefik v3.3 utilise un
client Docker avec API 1.24, rejete par le daemon (`client version 1.24 is too old`).
Solution : mettre a jour Traefik vers v3.6 dans `/opt/aiobi/docker-compose.yml`. Ajouter
`DOCKER_API_VERSION=1.45` en variable d'environnement par securite.

### iptables rules perdues apres restart Docker

Cause : quand `"iptables": false` est dans `daemon.json` et que Docker redemarre, les
regles iptables manuelles pour les reseaux custom (ex: `172.18.0.0/16`) sont perdues.
Les conteneurs perdent l'acces a Internet (ACME timeout, pas de DNS, etc.).
Solution : re-appliquer les regles (voir section 10.1) et persister avec
`iptables-persistent` / `netfilter-persistent save`.

### Volume bind mount cree comme dossier au lieu de fichier

Cause : si le fichier source d'un bind mount n'existe pas sur le host au moment du
`docker compose up`, Docker cree un **dossier** a la place. Le conteneur voit alors un
dossier vide au lieu du fichier attendu (ex: `realm.json` monte comme dossier).
Solution : s'assurer que le fichier existe sur le host avant le premier `up`. Verifier
les chemins relatifs dans le compose (attention aux `../../` qui se resolvent depuis
le working directory du compose, pas depuis la racine du repo).

### Silent login cause un ecran blanc de 5 secondes

Cause : `FRONTEND_IS_SILENT_LOGIN_ENABLED=True` (valeur par defaut) provoque une
redirection pleine page vers Keycloak pour un check d'auth silencieux avant le rendu
de l'application. L'utilisateur voit un ecran blanc pendant ~5 secondes.
Solution : desactiver avec `FRONTEND_IS_SILENT_LOGIN_ENABLED=False` dans `env.d/common`.

---

## 17. Replication DB (futur)

La replication PostgreSQL vers un serveur de backup est prevue. Les configs sont
preparees pour faciliter le branchement :

- `DB_HOST` dans `env.d/postgresql` pointe vers `postgresql` (conteneur local).
  Pour basculer vers le PG centralise du serveur, changer en `postgresql` du reseau `aiobi-internal`.
- `DB_PORT` est explicitement declare (5432).

Migration prevue : quand l'infra de backup sera en place, les bases Meet et Keycloak
seront migrees vers le PostgreSQL centralise du serveur (actuellement sur le reseau
`aiobi-internal`, port 15432). Cela permettra un backup unifie de toutes les apps Aiobi.

---

## 18. Differences avec le staging

| Aspect | Staging | Production |
|--------|---------|------------|
| Domaines | `aiobi-meet.duckdns.org` | `meet.aiobi.world`, `id.aiobi.world`, `lkt.aiobi.world` |
| Ports | 8880/8443 (non-standard) | 80/443 (standard, via Traefik) |
| Reverse proxy | nginx-proxy Docker dedie | Traefik existant (partage) |
| Keycloak routing | Path-based via frontend nginx | Sous-domaine dedie via Traefik labels |
| Images | Build local sur le serveur | GitLab Container Registry (push/pull) |
| DNS | DuckDNS dynamique (cron 5min) | A records fixes |
| TLS | acme-companion + nginx-proxy | Traefik certresolver automatique |
| Secrets | `.env` manuel sur le serveur | Genere par CI depuis variables GitLab |
| Gunicorn | 3 workers (defaut) | 6 workers |
| PostgreSQL | Config defaut | shared_buffers=4GB, cache=12GB |
| Redis | Config defaut | maxmemory 2GB, LRU |
| Celery | Concurrency defaut | Concurrency 4 |
| CI trigger | Push sur `develop` | Push sur `main` |
| Runner tag | `dev` | `aiobi-prod` |
| Serveur | Partage avec autres apps (nginx natif) | Partage avec autres apps (Traefik) |

---

## 19. Modifications manuelles serveur

Ce registre documente toutes les modifications faites directement sur le serveur
Aiobi Master (207.180.255.229) en dehors du pipeline CI/CD, avec leur justification.

### 19.1 `/etc/gitlab-runner/config.toml`

| Parametre | Valeur | Justification |
|-----------|--------|---------------|
| `url` | `http://127.0.0.1:8929` | Le runner avec `network_mode = "host"` accede a GitLab via localhost |
| `clone_url` | `http://127.0.0.1:8929` | Meme raison — evite le VPN IP `10.13.13.1` inaccessible depuis le conteneur |
| `network_mode` | `"host"` | Le runner doit acceder a GitLab sur `127.0.0.1:8929` et au Docker socket |
| `tags` | `["aiobi-prod", "docker"]` | Tag `prod` renomme en `aiobi-prod` pour eviter les conflits avec `bbs-master-runner` |

### 19.2 `/etc/docker/daemon.json`

```json
{
  "insecure-registries": ["10.13.13.1:5050"]
}
```

**Justification** : le GitLab Container Registry ecoute en HTTP sur `10.13.13.1:5050`.
Sans cette config, Docker refuse de pull/push avec `http: server gave HTTP response to
HTTPS client`. Necessite un restart du daemon Docker (`systemctl restart docker`).

### 19.3 `/opt/aiobi/docker-compose.yml` (Traefik)

| Modification | Avant | Apres | Justification |
|-------------|-------|-------|---------------|
| Image Traefik | `traefik:v3.3` | `traefik:v3.6` | Traefik v3.3 embarque un client Docker API 1.24, rejete par Docker v29.x (minimum API 1.40) |
| Env var | — | `DOCKER_API_VERSION=1.45` | Securite supplementaire pour forcer la version API (non strictement necessaire avec v3.6) |

### 19.4 iptables (persiste via `iptables-persistent`)

```bash
# Trafic entrant/sortant pour le reseau aiobi-public (172.18.0.0/16)
iptables -I DOCKER-USER -s 172.18.0.0/16 -j ACCEPT
iptables -I DOCKER-USER -d 172.18.0.0/16 -j ACCEPT

# NAT pour l'acces Internet (ACME Let's Encrypt, DNS, etc.)
iptables -t nat -A POSTROUTING -s 172.18.0.0/16 ! -o docker0 -j MASQUERADE
```

**Justification** : avec `"iptables": false` dans `daemon.json`, Docker ne gere pas
les regles iptables. Les conteneurs sur le reseau custom `aiobi-public` n'ont pas acces
a Internet par defaut. Sans ces regles, Traefik ne peut pas resoudre le challenge ACME
(`dial tcp: i/o timeout`). Regles persistees avec `netfilter-persistent save`.

### 19.5 `/opt/docker/` (copies manuelles interim)

| Fichier | Source | Justification |
|---------|--------|---------------|
| `/opt/docker/auth/realm.json` | `docker/auth/realm.json` du repo | Le compose.keycloak.yaml utilisait `../../docker/auth/realm.json` qui se resout a `/opt/docker/auth/realm.json` depuis `/opt/aiobi-meet/production/`. Copie manuelle en attendant le fix du path dans le compose. |
| `/opt/docker/keycloak/themes/aiobi/` | `docker/keycloak/themes/aiobi/` du repo | Meme probleme de path `../../`. Copie manuelle pour que le theme Aiobi s'affiche sur la page login Keycloak. |

> **A retirer** : ces copies manuelles devront etre supprimees une fois que les paths
> dans `compose.keycloak.yaml` seront corriges (`../../` -> `../`) et redeployes via CI.
