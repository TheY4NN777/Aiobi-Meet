# Aiobi Meet — Guide de deploiement production

> **Serveur** : Serveur applicatif partage Aiobi (1.8 TB, 200+ GB RAM)
> **Domaines** : `meet.aiobi.world` / `id.aiobi.world` / `lkt.aiobi.world`
> **Derniere mise a jour** : 29 mars 2026
>
> **Note importante** : Ce serveur est le serveur applicatif principal d'Aiobi.
> Il heberge(ra) toutes les apps Aiobi. Meet est la premiere app deployee.
> nginx-proxy Docker ecoute sur les ports standard **80/443** (pas de proxy natif).

---

## Table des matieres

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture technique](#2-architecture-technique)
3. [Les trois compose files et pourquoi](#3-les-trois-compose-files-et-pourquoi)
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

---

## 1. Vue d'ensemble

L'environnement de production heberge Aiobi Meet sur le serveur applicatif partage Aiobi.
Il est le point d'acces principal pour les utilisateurs finaux.

### Flux de deploiement global

```
Developpeur (branche develop)
        |
        v
    GitLab CI/CD
        |
        v
    Staging (aiobi-meet.duckdns.org:8443)
        |
        v   (merge develop -> main)
    Production (meet.aiobi.world)
```

### Workflow CI/CD

- **Push sur `develop`** → build local + deploy staging (runner tag: `dev`)
- **Push sur `main`** → build + push GitLab Registry + deploy production (runner tag: `prod`)

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
                    | nginx-proxy  |  :80 (HTTP redirect)
                    |              |  :443 (HTTPS TLS termination)
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

En staging, **Keycloak est route par le frontend nginx** (path-based : `/realms/`, `/js/`,
`/resources/`). En production, **Keycloak a son propre sous-domaine** (`id.aiobi.world`)
et est route directement par nginx-proxy. Cela simplifie la config nginx du frontend
et rend Keycloak independant.

### Composants

| Composant | Role | Image Docker |
|-----------|------|-------------|
| **nginx-proxy** | Reverse proxy TLS, decouverte automatique via Docker socket | `nginxproxy/nginx-proxy` |
| **acme-companion** | Generation et renouvellement automatique des certificats Let's Encrypt | `nginxproxy/acme-companion` |
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

## 3. Les trois compose files et pourquoi

Le deploiement est decoupe en **trois fichiers Docker Compose** independants. Chaque
fichier peut etre redemarre sans impacter les autres.

### `compose.nginx-proxy.yaml` — Le point d'entree

Reverse proxy + Let's Encrypt. Premier a demarrer, dernier a s'arreter.

- Ecoute sur les ports **80** (HTTP) et **443** (HTTPS) de la machine hote.
- Detecte automatiquement les conteneurs avec `VIRTUAL_HOST` et genere la config Nginx.
- acme-companion demande et renouvelle les certificats TLS pour 3 domaines :
  `meet.aiobi.world`, `id.aiobi.world`, `lkt.aiobi.world`.

**IMPORTANT** : Ne jamais `--force-recreate` ce compose. Les certificats TLS sont dans
les volumes Docker. Recreer le conteneur ne les supprime pas, mais peut casser les symlinks.

### `compose.keycloak.yaml` — L'authentification

Keycloak + sa base de donnees dediee. Separe parce que :

- Keycloak a son propre cycle de vie (mises a jour de securite independantes).
- Sa base de donnees ne doit pas etre mixee avec celle de l'application.
- On peut le redemarrer sans couper la visioconference en cours.
- **En production, Keycloak est sur le reseau `proxy-tier`** pour avoir son propre sous-domaine
  (`id.aiobi.world`). En staging, il etait route par le frontend nginx (path-based).

### `compose.yaml` — L'application

Frontend, backend, celery, livekit, postgresql, redis, minio, mailcatcher.
C'est le compose qu'on redemarre le plus souvent lors des mises a jour.

### Ordre de demarrage

```bash
# 1. Reverse proxy (prerequis pour TLS)
docker compose -f compose.nginx-proxy.yaml up -d

# 2. Keycloak (prerequis pour l'auth OIDC)
docker compose -f compose.keycloak.yaml up -d

# 3. Application (depend de Keycloak pour fonctionner)
docker compose -f compose.yaml up -d
```

---

## 4. Reseaux Docker

| Reseau | Cree par | Services | Role |
|--------|----------|----------|------|
| `proxy-tier` | compose.nginx-proxy.yaml | nginx-proxy, acme, frontend, keycloak, livekit | Permet a nginx-proxy de decouvrir et router vers les services |
| `prod-app` | compose.keycloak.yaml | keycloak, backend, frontend | Communication Keycloak ↔ Backend (OIDC server-to-server) |
| `default` | chaque compose | tous sauf nginx-proxy | Communication interne entre services du meme compose |

**Points cles :**
- Le backend n'est **PAS** sur `proxy-tier` — il est accessible uniquement via le frontend nginx.
- Keycloak est sur `proxy-tier` **ET** `prod-app` — il doit etre accessible par nginx-proxy
  (pour le sous-domaine) ET par le backend (pour les appels OIDC internes).

---

## 5. Decisions d'architecture et justifications

### 5.1 Pourquoi Keycloak sur un sous-domaine dedie ?

En staging, Keycloak est route par le frontend nginx via des paths (`/realms/`, `/js/`,
`/resources/`, `/admin/master/`, `/admin/realms/`). Cela fonctionne mais :

- Le nginx du frontend doit connaitre Keycloak (couplage).
- 5 blocs de routing supplementaires dans la config nginx.
- Conflits potentiels entre `/admin` Django et `/admin` Keycloak.

En production, Keycloak a son propre sous-domaine (`id.aiobi.world`). nginx-proxy le
route directement. Le nginx du frontend ne connait plus Keycloak du tout.

### 5.2 Pourquoi les endpoints OIDC server-to-server sont en HTTP ?

Les endpoints OIDC se divisent en deux categories :

- **Browser-facing** (authorization, logout) : le navigateur appelle directement Keycloak
  → doit utiliser HTTPS public (`https://id.aiobi.world/realms/...`).
- **Server-to-server** (JWKS, token, userinfo) : le backend Django appelle Keycloak
  en interne dans le reseau Docker → utilise HTTP interne (`http://keycloak:8080/realms/...`).

Utiliser HTTPS pour le server-to-server causerait des erreurs `SSL_CERTIFICATE_VERIFY_FAILED`
car le backend essaierait de verifier le certificat Let's Encrypt en passant par nginx-proxy
au lieu d'appeler directement Keycloak. Cette lecon a ete apprise en staging (erreur #1).

### 5.3 Pourquoi le placeholder `__LIVEKIT_API_SECRET__` dans livekit-server.yaml ?

L'image LiveKit est basee sur scratch (pas de shell). Cependant, l'entrypoint est
overridee dans le compose pour utiliser `/bin/sh` avec `sed` pour remplacer le placeholder
par la vraie valeur au demarrage. La variable `${VARIABLE}` ne fonctionne pas car
LiveKit ne fait pas de substitution d'env dans son YAML.

### 5.4 Pourquoi les proxy buffers 16k ?

Les tokens JWT de Keycloak font ~2KB. Lors du logout, le token est passe dans l'URL.
Les buffers par defaut de Nginx (4KB) sont trop petits, causant une erreur 502
"upstream sent too big header". Les buffers 16k sont configures a deux niveaux :

- Dans `vhost.d/` (pour nginx-proxy → frontend/keycloak).
- Dans `default.conf.template` (pour le nginx interne du frontend → backend).

### 5.5 Pourquoi les ports LiveKit custom (47880/47881/47882) ?

Les ports par defaut de LiveKit (7880/7881/7882) sont bien connus. Utiliser des ports
custom est une mesure de securite supplementaire (security through obscurity) qui
reduit la surface d'attaque contre les scans automatises.

### 5.6 Pourquoi GitLab Container Registry en production ?

En staging, les images sont buildees localement sur le serveur. En production :

- Les images sont **versionnees** (tag par commit SHA).
- Le **rollback** est simple : changer `IMAGE_TAG` et `docker compose pull`.
- Le serveur de prod **ne fait pas de build** (moins de charge CPU pendant le deploy).
- Les images sont **reproductibles** (meme image testee en CI = image deployee).

---

## 6. Routing HTTP — comment le trafic circule

### meet.aiobi.world (frontend + backend)

```
Client → nginx-proxy (:443) → frontend nginx (:8083)
    / → SPA React (:8080, try_files)
    /api → backend Django (:8000)
    /admin → backend Django (:8000)
    /static → backend Django (:8000)
    /media/ → MinIO (:9000) via auth_request
```

### id.aiobi.world (Keycloak)

```
Client → nginx-proxy (:443) → keycloak (:8080)
    /realms/ → Keycloak OIDC
    /resources/ → Keycloak static
    /js/ → Keycloak JS
    /admin/ → Keycloak admin console
```

### lkt.aiobi.world (LiveKit)

```
Client → nginx-proxy (:443) → livekit (:47880) [signaling WebSocket]
Client → livekit (:47882/udp) [media direct, pas de proxy]
Client → livekit (:47881/tcp) [ICE TCP fallback]
```

---

## 7. Description de chaque service

### backend

- **Image** : GitLab Registry (`$CI_REGISTRY_IMAGE/backend:latest`)
- **Workers** : 6 Gunicorn workers (via `GUNICORN_CMD_ARGS=--workers=6`)
- **Timeout** : 90s (graceful shutdown)
- **Healthcheck** : `python manage.py check` toutes les 15s
- **Depends on** : postgresql (healthy), redis (started), livekit (started)

### frontend

- **Image** : GitLab Registry (`$CI_REGISTRY_IMAGE/frontend:latest`)
- **Ports internes** : 8080 (SPA), 8083 (routing proxy)
- **VIRTUAL_HOST** : `meet.aiobi.world`
- **Volumes** : `default.conf.template` monte depuis le host

### keycloak

- **Image** : `quay.io/keycloak/keycloak:20.0.1`
- **VIRTUAL_HOST** : `id.aiobi.world` (sous-domaine dedie)
- **Volumes** : `realm.json` (import initial), theme Aiobi (login branding)
- **Reseau** : `proxy-tier` + `prod-app` + `default`

### livekit

- **Image** : `livekit/livekit-server:latest`
- **Ports exposes** : 47881/tcp, 47882/udp (ICE, pas de proxy)
- **VIRTUAL_HOST** : `lkt.aiobi.world` (signaling WebSocket via proxy)
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
├── .env                          # Secrets (NON versionne)
├── .env.example                  # Template des secrets
├── env.d/
│   ├── hosts                     # Domaines et noms de services
│   ├── common                    # Django, OIDC, LiveKit, features
│   ├── keycloak                  # Config Keycloak (KC_HOSTNAME, proxy)
│   ├── postgresql                # DB backend (credentials, host)
│   └── kc_postgresql             # DB Keycloak (credentials, host)
├── compose.yaml                  # Services applicatifs
├── compose.keycloak.yaml         # Keycloak + sa DB
├── compose.nginx-proxy.yaml      # Reverse proxy + Let's Encrypt
├── default.conf.template         # Config nginx frontend
├── livekit-server.yaml           # Config LiveKit (placeholder sed)
└── vhost.d/
    ├── meet.aiobi.world          # Proxy buffers nginx-proxy
    └── id.aiobi.world            # Proxy buffers nginx-proxy
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

Tous les secrets sont dans le fichier `.env` (non versionne). Generer chaque secret avec :

```bash
openssl rand -base64 32
```

Secrets a generer :
- `DJANGO_SECRET_KEY`
- `POSTGRES_PASSWORD`
- `KC_POSTGRES_PASSWORD`
- `KC_BOOTSTRAP_ADMIN_PASSWORD`
- `OIDC_RP_CLIENT_SECRET`
- `LIVEKIT_API_SECRET`

**Important** : Les memes variables doivent etre configurees dans les variables CI/CD
de GitLab pour que le pipeline puisse deployer. Si les valeurs divergent entre `.env`
et GitLab, les variables GitLab prennent la priorite (les variables d'env du runner
overrident celles du `.env`).

---

## 10. TLS / Let's Encrypt

Les certificats sont generes automatiquement par acme-companion pour les 3 domaines :

- `meet.aiobi.world` (frontend)
- `id.aiobi.world` (keycloak)
- `lkt.aiobi.world` (livekit)

Les certificats sont stockes dans le volume Docker `certs` et renouveles automatiquement.

**Pas de `LETSENCRYPT_TEST`** — les vrais certificats Let's Encrypt sont generes
des le premier deploy (pas de certificats de test comme en staging).

### Depannage TLS

Si les certificats ne se generent pas :

```bash
# Verifier les logs acme-companion
docker logs nginx-proxy-acme

# Verifier que les domaines pointent vers le serveur
dig meet.aiobi.world
dig id.aiobi.world
dig lkt.aiobi.world

# Forcer la regeneration
docker restart nginx-proxy-acme
```

---

## 11. Ports et firewall

| Port | Protocole | Service | Expose sur Internet |
|------|-----------|---------|---------------------|
| 80 | TCP | nginx-proxy (HTTP redirect) | Oui |
| 443 | TCP | nginx-proxy (HTTPS) | Oui |
| 47881 | TCP | LiveKit ICE TCP | Oui |
| 47882 | UDP | LiveKit media | Oui |

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 47881/tcp
sudo ufw allow 47882/udp
```

---

## 12. Performance tuning

### Configs appliquees

| Service | Config | Valeur | Pourquoi |
|---------|--------|--------|----------|
| **Gunicorn** | workers | 6 | 6 requetes API en parallele (via `GUNICORN_CMD_ARGS`) |
| **PostgreSQL** | shared_buffers | 4GB | Cache des donnees en RAM, reduit les lectures disque |
| **PostgreSQL** | effective_cache_size | 12GB | Indique au planner combien de RAM est disponible pour le cache OS |
| **PostgreSQL** | work_mem | 64MB | Memoire par operation de tri/jointure |
| **PostgreSQL** | maintenance_work_mem | 512MB | Pour VACUUM, CREATE INDEX, etc. |
| **Redis** | maxmemory | 2GB | Limite la consommation memoire, eviction LRU |
| **Celery** | concurrency | 4 | 4 taches asynchrones en parallele |
| **LiveKit** | Pas de limite | - | Utilise autant de CPU/RAM que necessaire pour les flux video |

### Sysctl (a configurer sur le host)

```bash
# Buffer UDP pour LiveKit — ameliore les performances WebRTC
echo "net.core.rmem_max=5000000" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Scaler si necessaire

Si la charge augmente :

1. **Backend** : augmenter `GUNICORN_CMD_ARGS=--workers=9` (ou plus)
2. **Celery** : augmenter `--concurrency=8`
3. **Replicas** : `docker compose up -d --scale backend=3` (nginx-proxy load balance auto)
4. **LiveKit** : scaler verticalement (plus de CPU/RAM) — LiveKit ne se scale pas en replicas

---

## 13. Procedure de deploiement pas a pas

### Prerequis serveur

```bash
# 1. Installer Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 2. Installer GitLab Runner
curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash
sudo apt-get install gitlab-runner

# 3. Enregistrer le runner
sudo gitlab-runner register \
  --url https://gitlab.com \
  --token $RUNNER_TOKEN \
  --executor docker \
  --docker-image docker:27 \
  --tag-list "prod,docker" \
  --docker-volumes "/var/run/docker.sock:/var/run/docker.sock" \
  --docker-volumes "/opt/aiobi-meet:/opt/aiobi-meet" \
  --docker-volumes "/cache"

# 4. Creer la structure de repertoires
sudo mkdir -p /opt/aiobi-meet/production/{env.d,vhost.d,data/{databases/{backend,keycloak},media}}

# 5. Copier le .env.example et remplir les secrets
cp .env.example /opt/aiobi-meet/production/.env
# Editer et remplir chaque secret avec : openssl rand -base64 32

# 6. Configurer sysctl
echo "net.core.rmem_max=5000000" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# 7. Configurer le firewall
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 47881/tcp
sudo ufw allow 47882/udp

# 8. Configurer les DNS A records
# meet.aiobi.world    A    <IP_SERVEUR>
# id.aiobi.world      A    <IP_SERVEUR>
# lkt.aiobi.world     A    <IP_SERVEUR>
```

### Premier deploiement

Merger `develop` dans `main` et pusher. Le pipeline CI/CD fait le reste :
build → push registry → deploy.

---

## 14. Procedure de mise a jour (CI/CD)

Chaque push sur `main` declenche automatiquement :

1. **Build** : `build-backend-prod` et `build-frontend-prod` (en parallele)
   - Build Docker `--no-cache` (assets toujours a jour)
   - Push au GitLab Registry avec tags `:$SHA` et `:latest`
2. **Deploy** : `deploy-production` (apres les builds)
   - Copie les configs du CI vers le host
   - nginx-proxy : `up -d` (preserve certs)
   - Keycloak : `up -d` (preserve sessions)
   - Pull les nouvelles images
   - App : `up -d --force-recreate` (nouvelles images + env)
   - Migrations Django automatiques
   - Verification TLS + reparation symlinks si necessaire

### Rollback

```bash
cd /opt/aiobi-meet/production

# Voir les tags disponibles
docker image ls $CI_REGISTRY_IMAGE/backend

# Revenir a une version precedente
IMAGE_TAG=abc123de docker compose -f compose.yaml up -d --force-recreate
```

---

## 15. Commandes utiles

```bash
cd /opt/aiobi-meet/production

# --- Etat des services ---
docker compose -f compose.yaml ps
docker compose -f compose.keycloak.yaml ps
docker compose -f compose.nginx-proxy.yaml ps

# --- Logs ---
docker compose -f compose.yaml logs -f backend        # Backend Django
docker compose -f compose.yaml logs -f frontend        # Frontend nginx
docker compose -f compose.yaml logs -f livekit         # LiveKit
docker compose -f compose.keycloak.yaml logs -f keycloak  # Keycloak

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
```

---

## 16. Diagnostic et depannage

### Erreur 502 au logout

Cause : buffers nginx trop petits pour le JWT Keycloak dans l'URL de logout.
Solution : verifier que `vhost.d/meet.aiobi.world` et `vhost.d/id.aiobi.world`
contiennent `proxy_buffer_size 16k`.

### SSL_CERTIFICATE_VERIFY_FAILED sur le callback OIDC

Cause : le backend essaie d'appeler Keycloak via HTTPS public au lieu de HTTP interne.
Solution : verifier que `OIDC_OP_JWKS_ENDPOINT`, `OIDC_OP_TOKEN_ENDPOINT` et
`OIDC_OP_USER_ENDPOINT` dans `env.d/common` utilisent `http://keycloak:8080/...`
et pas `https://id.aiobi.world/...`.

### LiveKit "livekit-server: not found"

Cause : l'image LiveKit est basee sur scratch, le binaire est a `/livekit-server` pas dans PATH.
Solution : utiliser le chemin absolu dans l'entrypoint du compose.

### Camera "loading" au lieu du prompt de permission

Cause : Firefox ne supporte pas `navigator.permissions.query({name: 'camera'})`.
Solution : le frontend catch l'erreur et set la permission a `'prompt'` (deja corrige).

### Images pas a jour apres un deploy

Cause : cache Docker.
Solution : les builds CI utilisent `--no-cache`. Si le probleme persiste, verifier
que `IMAGE_TAG` dans `.env` est bien `latest` et que `docker compose pull` fonctionne.

---

## 17. Replication DB (futur)

La replication PostgreSQL vers un serveur de backup est prevue. Les configs sont
preparees pour faciliter le branchement :

- `DB_HOST` dans `env.d/postgresql` pointe vers `postgresql` (conteneur local).
  Pour basculer vers un replica externe, changer en l'IP du serveur de backup.
- `DB_PORT` est explicitement declare (5432).
- La configuration PostgreSQL (shared_buffers, etc.) est passee via `command:` dans
  le compose, pas dans un fichier monte — facile a adapter par serveur.

Pour activer la replication :
1. Configurer le serveur de backup avec PostgreSQL streaming replication
2. Changer `DB_HOST` dans `env.d/postgresql` vers l'IP du primary/replica
3. Relancer le backend : `docker compose -f compose.yaml up -d --force-recreate backend`

---

## 18. Differences avec le staging

| Aspect | Staging | Production |
|--------|---------|------------|
| Domaines | `aiobi-meet.duckdns.org` | `meet.aiobi.world`, `id.aiobi.world`, `lkt.aiobi.world` |
| Ports | 8880/8443 (non-standard) | 80/443 (standard) |
| Keycloak routing | Path-based via frontend nginx | Sous-domaine dedie (`id.aiobi.world`) |
| Images | Build local sur le serveur | GitLab Container Registry (push/pull) |
| DNS | DuckDNS dynamique (cron 5min) | A records fixes |
| TLS | `LETSENCRYPT_TEST=true` au debut | Vrais certs des le depart |
| Gunicorn | 3 workers (defaut) | 6 workers |
| PostgreSQL | Config defaut | shared_buffers=4GB, cache=12GB |
| Redis | Config defaut | maxmemory 2GB, LRU |
| Celery | Concurrency defaut | Concurrency 4 |
| CI trigger | Push sur `develop` | Push sur `main` |
| Runner tag | `dev` | `prod` |
| Proxy host natif | Oui (port 80 → 8880) | Non (nginx-proxy direct sur 80/443) |
