# Aïobi Meet — Guide de deploiement staging

> **Serveur** : 161.97.179.176 (12 vCPU, 48 GB RAM, 485 GB SSD)
> **Domaines** : `aiobi-meet.duckdns.org:8443` / `aiobi-livekit.duckdns.org:8443`
> **Derniere mise a jour** : 26 mars 2026
>
> **Note importante** : Le staging utilise le port **8443** pour HTTPS (pas 443).
> Le port 443 est deja occupe par le nginx natif du serveur qui sert d'autres
> applications. Le nginx natif proxy les challenges ACME (port 80) vers
> nginx-proxy Docker (port 8880) pour que Let's Encrypt fonctionne.

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
10. [DuckDNS — DNS dynamique](#10-duckdns--dns-dynamique)
11. [TLS / Let's Encrypt](#11-tls--lets-encrypt)
12. [Ports et firewall](#12-ports-et-firewall)
13. [Procedure de deploiement pas a pas](#13-procedure-de-deploiement-pas-a-pas)
14. [Procedure de mise a jour](#14-procedure-de-mise-a-jour)
15. [Commandes utiles](#15-commandes-utiles)
16. [Diagnostic et depannage](#16-diagnostic-et-depannage)
17. [Passage en production](#17-passage-en-production)

---

## 1. Vue d'ensemble

L'environnement de staging reproduit fidelement l'architecture de production d'Aïobi Meet sur un seul serveur. Son objectif est double :

- **Valider** chaque deploiement avant de le pousser sur le serveur Aïobi Master (production).
- **Permettre aux equipes** (dev, infra, QA) de tester les fonctionnalites en conditions reelles : HTTPS, authentification OIDC, visioconference WebRTC, enregistrement.

Le staging utilise des sous-domaines DuckDNS temporaires (gratuits) avec des certificats Let's Encrypt automatiques. Lorsque le domaine final `meet.aiobi.world` sera configure, la migration sera une simple modification de variables d'environnement.

### Flux de deploiement global

```
Developpeur (branche develop)
        |
        v
    GitLab CI/CD (self-hosted, VPN)
        |
        v
    Staging (161.97.179.176) — aiobi-meet.duckdns.org
        |
        v   (validation manuelle ou automatisee)
    Production (Server Aïobi Master) — meet.aiobi.world
```

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
              +------------+------------+
              |                         |
              v                         v
    +-------------------+    +-------------------+
    |    frontend        |    |     livekit       |
    | (nginx interne)    |    | (SFU WebRTC)      |
    | :8083              |    | :47880 signaling  |
    | aiobi-meet.        |    | :47881 ICE TCP    |
    | duckdns.org        |    | :47882 media UDP  |
    +---+-----+-----+---+    | aiobi-livekit.    |
        |     |     |        | duckdns.org       |
        |     |     |        +--------+----------+
        |     |     |                 |
        v     v     v                 v
   +----+ +----+ +----+         +-------+
   |SPA | |API | | KC |         | redis |
   |React| |Dj.| |OIDC|         +-------+
   +----+ +----+ +----+
              |
     +--------+--------+
     |        |        |
     v        v        v
  +----+  +-----+  +-----+
  |PgSQL| |Redis|  |MinIO|
  +----+  +-----+  +-----+
```

### Composants

| Composant | Role | Image Docker |
|-----------|------|-------------|
| **nginx-proxy** | Reverse proxy TLS, decouverte automatique via Docker socket | `nginxproxy/nginx-proxy` |
| **acme-companion** | Generation et renouvellement automatique des certificats Let's Encrypt | `nginxproxy/acme-companion` |
| **frontend** | SPA React servie par Nginx, fait aussi office de reverse proxy interne vers le backend, Keycloak et MinIO | `aiobi/meet-frontend-aiobi` (build local) |
| **backend** | API Django avec Gunicorn (3 workers, timeout 90s) | `aiobi/meet-backend` (build local) |
| **celery** | Worker asynchrone pour les taches en arriere-plan (envoi d'emails, traitement d'enregistrements) | Meme image que backend |
| **keycloak** | Serveur d'identite SSO/OIDC, gere l'authentification et l'inscription des utilisateurs | `quay.io/keycloak/keycloak:20.0.1` |
| **livekit** | Serveur SFU WebRTC pour la visioconference temps reel (audio, video, partage d'ecran) | `livekit/livekit-server:latest` |
| **postgresql** | Base de donnees principale de l'application (salles, utilisateurs, enregistrements) | `postgres:16` |
| **kc-postgresql** | Base de donnees dediee a Keycloak (realms, utilisateurs OIDC, sessions) | `postgres:16` |
| **redis** | Cache applicatif + message broker pour Celery et LiveKit | `redis:5` |
| **minio** | Stockage objet compatible S3 pour les enregistrements et fichiers uploades | `minio/minio` |
| **mailcatcher** | Intercepteur d'emails de staging — tous les mails envoyes sont captures et consultables via une interface web (aucun email n'est reellement envoye) | `sj26/mailcatcher` |

---

## 3. Les trois compose files et pourquoi

Le staging est decoupe en **trois fichiers Docker Compose** independants. Ce n'est pas arbitraire — chaque fichier peut etre redemarre sans impacter les autres, ce qui facilite la maintenance et le debuggage.

### `compose.nginx-proxy.yaml` — Le point d'entree

Ce compose contient uniquement le reverse proxy et son companion Let's Encrypt. Il est le premier a demarrer et le dernier a s'arreter. C'est lui qui :

- Ecoute sur les ports **8880** (HTTP) et **8443** (HTTPS) de la machine hote. Ces ports non-standards sont necessaires car le nginx natif du serveur occupe deja 80/443 pour les autres applications (ERPNext, Eshu, etc.).
- Detecte automatiquement les conteneurs qui ont des variables `VIRTUAL_HOST` et genere la configuration Nginx correspondante.
- Via acme-companion, demande et renouvelle les certificats TLS pour chaque `LETSENCRYPT_HOST` detecte.
- Un fichier `nginx-host-proxy.conf` doit etre installe dans le nginx natif pour proxier les challenges ACME depuis le port 80 vers le port 8880.

**Pourquoi separe ?** Parce qu'on ne veut jamais redemarrer le reverse proxy quand on met a jour l'application ou Keycloak. Si nginx-proxy tombe, plus rien n'est accessible.

**Pourquoi les ports 8880/8443 ?** Le serveur de staging heberge temporairement d'autres applications qui utilisent les ports 80/443. Quand ces apps seront migrees, on pourra remettre nginx-proxy sur 80/443 et supprimer le fichier `nginx-host-proxy.conf`.

### `compose.keycloak.yaml` — L'authentification

Keycloak et sa base de donnees dediee. Separe parce que :

- Keycloak a son propre cycle de vie (mises a jour de securite independantes).
- Sa base de donnees ne doit pas etre mixee avec celle de l'application.
- On peut le redemarrer sans couper la visioconference en cours (les tokens JWT deja emis restent valides).

### `compose.yaml` — L'application

Tout le reste : frontend, backend, celery, livekit, postgresql, redis, minio, mailcatcher. C'est le compose qu'on redemarre le plus souvent lors des mises a jour applicatives.

### Ordre de demarrage

```bash
# 1. Reverse proxy (prerequis pour TLS)
docker compose -f compose.nginx-proxy.yaml up -d

# 2. Keycloak (prerequis pour l'auth OIDC)
docker compose -f compose.keycloak.yaml up -d

# 3. Application (depend de Keycloak pour fonctionner)
docker compose -f compose.yaml up -d
```

L'ordre inverse pour l'arret :

```bash
docker compose -f compose.yaml down
docker compose -f compose.keycloak.yaml down
docker compose -f compose.nginx-proxy.yaml down
```

---

## 4. Reseaux Docker

Trois reseaux Docker interconnectent les services. Chaque reseau a un role precis pour isoler les flux tout en permettant la communication necessaire.

### `proxy-tier` — Reseau du reverse proxy

Cree par `compose.nginx-proxy.yaml`. Seuls les services qui doivent etre accessibles depuis Internet y sont connectes :

- `nginx-proxy` et `acme-companion` (toujours)
- `frontend` (recoit le trafic HTTPS pour `aiobi-meet.duckdns.org`)
- `livekit` (recoit le trafic HTTPS pour `aiobi-livekit.duckdns.org`)

**Pourquoi ?** nginx-proxy utilise le Docker socket pour detecter les conteneurs avec `VIRTUAL_HOST`. Seuls les conteneurs sur `proxy-tier` sont decouverts. Cela empeche par exemple que PostgreSQL ou Redis soient accidentellement exposes.

### `staging-app` — Reseau inter-compose

Cree par `compose.yaml`. Permet la communication entre les services de `compose.yaml` et ceux de `compose.keycloak.yaml` :

- `frontend` peut atteindre `keycloak` pour le proxy des endpoints `/realms/`.
- `backend` peut atteindre `keycloak` pour la validation des tokens OIDC (endpoint interne `http://keycloak:8080`).

**Pourquoi un reseau separe ?** Les services dans des compose files differents ne partagent pas le meme reseau `default`. Sans `staging-app`, le frontend ne pourrait pas router vers Keycloak.

### `default` — Reseau interne de chaque compose

Chaque compose file a son propre reseau `default` implicite. Les services internes (postgresql, redis, minio, celery) n'ont pas besoin d'etre accessibles en dehors de leur compose. Ils restent sur `default`.

### Schema des reseaux

```
proxy-tier          staging-app         default (compose.yaml)
+-----------+       +-----------+       +------------------+
| nginx-    |       | frontend  |       | postgresql       |
|  proxy    |       | backend   |       | redis            |
| acme-     |       | keycloak  |       | minio            |
|  companion|       |           |       | celery           |
| frontend  |       |           |       | mailcatcher      |
| livekit   |       |           |       | livekit          |
+-----------+       +-----------+       | frontend         |
                                        | backend          |
                                        +------------------+

                                        default (compose.keycloak.yaml)
                                        +------------------+
                                        | kc-postgresql    |
                                        | keycloak         |
                                        +------------------+
```

---

## 5. Decisions d'architecture et justifications

Cette section documente les choix techniques majeurs et leurs justifications. Elle sert de reference pour l'equipe et pour les decisions futures.

### Pourquoi 3 reseaux Docker et pas un seul ?

**Decision** : Utiliser 3 reseaux isoles (`proxy-tier`, `staging-app`, `default`) au lieu d'un reseau unique partage.

**Alternative consideree** : Un seul reseau `aiobi-staging` ou tous les services communiquent librement. Plus simple a configurer et a debugger.

**Pourquoi on a choisi la separation** :

1. **Principe du moindre privilege** — PostgreSQL, Redis et MinIO n'ont aucune raison d'etre visibles depuis nginx-proxy. Un reseau unique exposerait ces services a tout conteneur du reseau, y compris nginx-proxy qui monte le Docker socket (surface d'attaque).

2. **Coherence avec la production** — Le staging doit reproduire l'architecture de production. En prod sur le Server Aïobi Master, la separation reseau sera obligatoire. Tester avec un reseau unique en staging masquerait des bugs de connectivite qui apparaitraient en prod.

3. **Isolation des bases de donnees** — La base Keycloak (`kc-postgresql`) et la base applicative (`postgresql`) sont sur des reseaux `default` differents. Un probleme de securite sur l'application ne compromet pas les donnees d'authentification.

4. **Blast radius** — Si un service est compromis, l'attaquant ne peut atteindre que les services du meme reseau. Avec un reseau unique, un seul service compromis donne acces a tout.

**Quand changer** : Jamais. Cette architecture sera identique en production.

### Pourquoi 3 compose files et pas un seul ?

**Decision** : Separer en `compose.nginx-proxy.yaml`, `compose.keycloak.yaml` et `compose.yaml`.

**Pourquoi** :

1. **Cycles de vie independants** — On met a jour l'app (compose.yaml) a chaque sprint. Keycloak est mis a jour rarement (patches securite). nginx-proxy ne change quasiment jamais. Un seul fichier forcerait a tout redemarrer pour un changement mineur.

2. **Resilience** — Un `docker compose down` sur l'app ne coupe pas Keycloak. Les tokens JWT deja emis restent valides, donc les utilisateurs en visio ne sont pas deconnectes.

3. **Debuggage** — Quand un service ne repond pas, on peut isoler le probleme en redemarrant un seul compose au lieu de tout relancer.

### Pourquoi les ports 8443/8880 et pas 443/80 ?

**Decision** : nginx-proxy Docker ecoute sur 8880 (HTTP) et 8443 (HTTPS) au lieu des ports standards.

**Raison** : Le serveur de staging (161.97.179.176) heberge temporairement d'autres applications (ERPNext, Eshu, Traccar) qui utilisent le nginx natif sur les ports 80/443. Donner ces ports a nginx-proxy Docker casserait ces applications.

**Solution** : Un fichier `nginx-host-proxy.conf` configure le nginx natif pour :
- Proxier les challenges ACME Let's Encrypt (port 80 → 8880) pour que les certificats TLS soient emis.
- Rediriger les visiteurs HTTP vers HTTPS sur le port 8443.

**Quand changer** : Quand les autres applications seront migrees du serveur de staging. A ce moment, nginx-proxy pourra reprendre les ports 80/443 et le fichier `nginx-host-proxy.conf` sera supprime.

### Pourquoi des images locales et pas un registry ?

**Decision** : Les images Docker sont buildees et stockees localement sur le serveur de staging, pas poussees vers le GitLab Container Registry.

**Raison** : Le runner CI (`dev-serv-runner`) tourne sur le meme serveur que le staging. Builder localement evite le cycle build → push → pull qui est lent et inutile quand le build et le deploiement sont sur la meme machine.

**En production** : Les images seront poussees vers le GitLab Container Registry (`10.13.13.1:5050/aiobi/ogun/aiobi-meet`) car le runner de build (staging) et le serveur de deploiement (Aïobi Master) sont differents.

### Pourquoi les ports LiveKit 47880/47881/47882 ?

**Decision** : Utiliser les ports 47880-47882 au lieu des ports standards LiveKit 7880-7882.

**Raison** : Demande de l'administrateur systeme (Abdoul-Aziz Ousmane KABORE) pour eviter le scan automatise sur les ports connus. Les ports standards de LiveKit sont facilement identifiables par les scanners de ports.

**Impact** : La configuration `livekit-server.yaml` et les regles UFW utilisent ces ports custom. En production, les memes ports seront utilises sauf decision contraire de l'equipe infra.

### Pourquoi Keycloak sur le meme domaine (path-based) et pas un sous-domaine dedie ?

**Decision** : Keycloak est accessible via `aiobi-meet.duckdns.org:8443/realms/*` (path-based routing) au lieu d'un sous-domaine comme `auth.aiobi-meet.duckdns.org`.

**Raison** : DuckDNS est limite en nombre de sous-domaines gratuits. On utilise 2 sous-domaines (meet + livekit), et LiveKit a besoin du sien pour les WebSockets. Keycloak peut fonctionner derriere un path-based proxy sans probleme.

**En production** : Le domaine `id.aiobi.world` sera dedie a Keycloak (sous-domaine complet) comme prevu dans `env.d/production.dist/hosts`. Le path-based routing est specifique au staging avec DuckDNS.

### Pourquoi le .env est sur le serveur et pas genere par le CI ?

**Decision** : Le fichier `.env` avec les secrets est maintenu manuellement sur le serveur, pas genere par le pipeline CI.

**Raison** :

1. **Les secrets ne changent pas a chaque deploiement** — Les mots de passe DB, cles API et tokens sont stables. Les regenerer a chaque push corromprait les donnees existantes (nouveau mot de passe PostgreSQL = base inaccessible).

2. **Separation des responsabilites** — Le CI deploie le code. Les secrets sont geres par les maintainers du serveur.

3. **Variables CI/CD GitLab** — Les secrets sont aussi stockes dans GitLab CI/CD Variables comme backup et pour reference, mais le `.env` du serveur fait autorite.

---

## 6. Routing HTTP — comment le trafic circule

Le trafic HTTP suit un chemin precis avec deux niveaux de proxy. Comprendre ce chemin est essentiel pour debugger les problemes d'acces.

### Requete vers `https://aiobi-meet.duckdns.org:8443/`

```
Client (navigateur)
  |
  | HTTPS :443
  v
nginx-proxy
  | Detecte VIRTUAL_HOST=aiobi-meet.duckdns.org sur le conteneur "frontend"
  | Dechiffre TLS (terminaison SSL)
  | Forwarde en HTTP vers frontend:8083
  v
frontend (nginx interne, port 8083)
  | Lit le default.conf.template
  | Route selon le path :
  |
  |--- /            --> SPA React (fichiers statiques locaux)
  |--- /api/*       --> backend:8000 (Gunicorn Django)
  |--- /admin/*     --> backend:8000 (Django admin)
  |--- /static/*    --> backend:8000 (collectstatic)
  |--- /realms/*    --> keycloak:8080 (OIDC endpoints)
  |--- /resources/* --> keycloak:8080 (assets du theme)
  |--- /js/*        --> keycloak:8080 (JavaScript Keycloak)
  |--- /media/*     --> minio:9000 (via auth_request sur le backend)
```

### Requete vers `https://aiobi-livekit.duckdns.org/`

```
Client (navigateur/SDK)
  |
  | WSS :443 (WebSocket Secure)
  v
nginx-proxy
  | Detecte VIRTUAL_HOST=aiobi-livekit.duckdns.org sur le conteneur "livekit"
  | Dechiffre TLS
  | Forwarde en WS vers livekit:47880
  v
livekit (port 47880)
  | Etablit la session WebRTC
  | Negocie les flux media via ICE
  |
  |--- ICE TCP :47881 (fallback si UDP bloque)
  |--- Media UDP :47882 (audio/video RTP — connexion directe client ↔ serveur)
```

### Le flux d'authentification OIDC en detail

Quand un utilisateur clique "Se connecter" :

```
1. Frontend           --> Backend /api/v1.0/auth/          (demande de login)
2. Backend            --> 302 Redirect vers Keycloak
3. Client (navigateur)--> https://aiobi-meet.duckdns.org:8443/realms/meet/protocol/openid-connect/auth
4. nginx-proxy        --> frontend:8083 --> keycloak:8080   (proxy chain)
5. Keycloak           --> Affiche la page de login (theme Aïobi)
6. Utilisateur        --> Saisit ses identifiants
7. Keycloak           --> 302 Redirect vers Backend /api/v1.0/auth/callback/
8. Backend            --> Echange le code contre un token (appel interne http://keycloak:8080)
9. Backend            --> Cree la session Django, 302 vers le frontend
10. Frontend          --> Utilisateur connecte
```

**Point important** : A l'etape 8, le backend appelle Keycloak en interne (`http://keycloak:8080`) via le reseau `staging-app`, pas via l'URL publique. C'est pourquoi `OIDC_OP_TOKEN_ENDPOINT` dans `env.d/common` pointe vers `http://keycloak:8080` (interne) alors que les autres endpoints OIDC pointent vers `https://${MEET_HOST}` (public, car le navigateur y accede directement).

---

## 7. Description de chaque service

### Frontend (`frontend`)

Le frontend est une SPA (Single Page Application) React buildee avec Vite.js et servie par Nginx. En staging, on utilise l'image `aiobi/meet-frontend-aiobi` qui inclut le branding Aïobi (logo, polices HK Grotesk/Roboto, couleurs Violet/Lilas).

Le Nginx du frontend joue un double role :
- Il sert les fichiers statiques de la SPA (HTML, JS, CSS).
- Il agit comme **reverse proxy interne** pour router les requetes `/api`, `/realms`, `/media` vers les bons services.

Cette architecture "frontend-as-gateway" est celle recommandee par le projet upstream (La Suite Numerique). Elle permet a nginx-proxy de ne voir qu'un seul service par domaine, simplifiant la configuration TLS.

**Build** : `docker/aiobi-frontend/Dockerfile` (target `frontend-production`). Le build Vite injecte `VITE_API_BASE_URL` et `VITE_APP_TITLE` au moment du build, pas au runtime.

### Backend (`backend`)

API Django servie par Gunicorn (3 workers, timeout 90s). Gere :
- L'API REST pour les salles de reunion, utilisateurs, enregistrements.
- L'authentification OIDC (echange de tokens avec Keycloak).
- L'autorisation d'acces aux fichiers media (auth_request pour MinIO).
- Les webhooks LiveKit (notifications de connexion/deconnexion des participants).

**Configuration** : `DJANGO_CONFIGURATION=Production` active les settings de production (DEBUG=False, HTTPS, cookies securises).

### Celery (`celery`)

Worker asynchrone utilisant la meme image Docker que le backend. Traite les taches en arriere-plan :
- Envoi d'emails (via mailcatcher en staging).
- Traitement post-enregistrement (si le service summary est active).
- Nettoyage periodique des sessions expirees.

Redis sert de message broker entre le backend et Celery.

### Keycloak (`keycloak`)

Serveur d'identite compatible OpenID Connect. En staging :
- Demarre avec `--import-realm` pour charger automatiquement le realm "meet" depuis `realm.json`.
- Utilise le theme Aïobi personnalise (pages de login/register brandees).
- Tourne en mode production (`start` et non `start-dev`), derriere le proxy nginx.

**Attention** : L'import du realm ne se fait qu'au **premier demarrage** (quand la base de donnees Keycloak est vide). Pour reinitialiser : supprimer le volume `data/databases/keycloak/` et relancer.

Le client OIDC "meet" doit etre configure dans Keycloak avec :
- Client ID : valeur de `OIDC_RP_CLIENT_ID` dans `.env`
- Client Secret : valeur de `OIDC_RP_CLIENT_SECRET` dans `.env`
- Valid Redirect URIs : `https://aiobi-meet.duckdns.org:8443/*`

### LiveKit (`livekit`)

Serveur SFU (Selective Forwarding Unit) pour la visioconference WebRTC. LiveKit recoit les flux audio/video de chaque participant et les redistribue aux autres, sans transcoder (economie de CPU).

**Ports custom** (demande de l'administrateur systeme) :
- `47880/tcp` : Signaling WebSocket (proxie par nginx-proxy via TLS).
- `47881/tcp` : ICE TCP fallback — utilise quand le reseau du participant bloque l'UDP.
- `47882/udp` : Transport media RTP/RTCP — c'est par la que passent les flux audio/video reels.

Les ports TCP 47881 et UDP 47882 sont exposes **directement** sur la machine hote (pas de proxy nginx). C'est obligatoire car le transport media WebRTC a besoin d'une latence minimale que le proxy HTTP ne peut pas garantir.

`use_external_ip: true` dans `livekit-server.yaml` indique a LiveKit de detecter automatiquement l'IP publique via STUN et de l'annoncer aux clients pour la negotiation ICE.

### PostgreSQL (`postgresql` + `kc-postgresql`)

Deux instances separees :
- `postgresql` : Base de l'application (salles, utilisateurs, fichiers).
- `kc-postgresql` : Base de Keycloak (realms, comptes OIDC, sessions).

La separation garantit qu'un probleme sur une base n'affecte pas l'autre, et facilite les backups/restaurations independants.

### Redis (`redis`)

Cache et message broker partage entre :
- Le backend Django (cache de sessions, throttling).
- Celery (file d'attente des taches asynchrones).
- LiveKit (coordination des rooms entre noeuds, si scale horizontale future).

### MinIO (`minio`)

Stockage objet compatible S3. Stocke les enregistrements video et les fichiers uploades par les utilisateurs. Le bucket `meet-media-storage` est cree automatiquement au premier demarrage par le service `createbuckets`.

L'acces aux fichiers passe par le backend Django (via `auth_request` dans Nginx), garantissant qu'un utilisateur ne peut telecharger que les fichiers auxquels il a droit.

### Mailcatcher (`mailcatcher`)

En staging, aucun email n'est envoye pour de vrai. Mailcatcher intercepte tous les emails SMTP et les affiche dans une interface web. Pour consulter les emails captures, acceder a `http://161.97.179.176:1081` (port non expose publiquement, accessible uniquement via SSH ou VPN).

---

## 8. Fichiers d'environnement

### Structure

```
docker/staging/
├── .env                 # Secrets (NON commite, genere a partir de .env.example)
├── .env.example         # Template des secrets (commite)
└── env.d/
    ├── common           # Configuration Django : URLs OIDC, LiveKit, email, features
    ├── hosts            # Noms de domaine et hosts internes
    ├── postgresql       # Credentials de la base applicative
    ├── kc_postgresql    # Credentials de la base Keycloak + config JDBC
    └── keycloak         # Admin Keycloak + config proxy
```

### Comment les variables sont resolues

Docker Compose resout les variables en cascade :

1. **`.env`** est lu en premier (secrets, domaines).
2. Chaque service charge ses `env_file` dans l'ordre declare.
3. Les `environment` inline dans le compose ecrasent les valeurs precedentes.

Exemple concret pour le service `backend` :

```
.env                → MEET_HOST=aiobi-meet.duckdns.org
env.d/common        → DJANGO_ALLOWED_HOSTS=${MEET_HOST}  → resolu en aiobi-meet.duckdns.org
env.d/postgresql    → DB_HOST=postgresql
env.d/hosts         → REALM_NAME=meet
```

### Variables critiques a verifier

| Variable | Fichier | Impact si mal configuree |
|----------|---------|------------------------|
| `DJANGO_SECRET_KEY` | `.env` | Sessions Django invalides, faille de securite |
| `OIDC_RP_CLIENT_SECRET` | `.env` | Login OIDC echoue (401 Unauthorized) |
| `LIVEKIT_API_SECRET` | `.env` | Impossible de rejoindre une visio (token JWT invalide) |
| `KC_HOSTNAME` | `env.d/keycloak` | Redirections OIDC cassees, boucle de login |
| `OIDC_OP_TOKEN_ENDPOINT` | `env.d/common` | Doit pointer vers l'URL interne `http://keycloak:8080` |

---

## 9. Gestion des secrets

### Generer les secrets

Tous les secrets doivent etre generes avec un generateur cryptographique :

```bash
# Generer tous les secrets d'un coup
echo "DJANGO_SECRET_KEY=$(openssl rand -base64 50 | tr -d '\n=')"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n=')"
echo "KC_POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '\n=')"
echo "KC_BOOTSTRAP_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '\n=')"
echo "OIDC_RP_CLIENT_SECRET=$(openssl rand -base64 32 | tr -d '\n=')"
echo "LIVEKIT_API_SECRET=$(openssl rand -base64 32 | tr -d '\n=')"
```

Copier chaque valeur dans `.env`. Ne jamais reutiliser les memes secrets entre staging et production.

### Regles de securite

- **`.env` ne doit jamais etre commite.** Il est dans `.gitignore`.
- Les fichiers `env.d/*` sont commites car ils contiennent des references (`${VAR}`) et non des valeurs en clair.
- En cas de compromission d'un secret, le regenerer et redemarrer les services concernes.
- Le mot de passe admin Keycloak (`KC_BOOTSTRAP_ADMIN_PASSWORD`) n'est utilise qu'au premier demarrage. Apres, le changer via l'interface admin Keycloak.

---

## 10. DuckDNS — DNS dynamique

DuckDNS est un service DNS dynamique gratuit. Nos deux sous-domaines pointent vers l'IP publique du serveur de staging.

### Configuration initiale

1. Creer un compte sur [duckdns.org](https://www.duckdns.org) (login via GitHub, Google, etc.).
2. Creer les sous-domaines `aiobi-meet` et `aiobi-livekit`.
3. Entrer l'IPv4 `161.97.179.176` pour les deux.
4. Copier le token (UUID affiche en haut du dashboard) dans `.env` (`DUCKDNS_TOKEN`).

### Mise a jour automatique

Meme avec une IP fixe, il est recommande de configurer un cron de mise a jour. Si l'IP change (migration de serveur, changement de fournisseur), le DNS sera mis a jour automatiquement.

```bash
# Rendre le script executable
chmod +x duckdns-update.sh

# Tester manuellement
./duckdns-update.sh

# Ajouter au crontab (mise a jour toutes les 5 minutes)
(crontab -l 2>/dev/null; echo "*/5 * * * * $(pwd)/duckdns-update.sh >> /var/log/duckdns.log 2>&1") | crontab -
```

### Verification

```bash
# Verifier la resolution DNS
dig aiobi-meet.duckdns.org +short
# Doit retourner : 161.97.179.176

dig aiobi-livekit.duckdns.org +short
# Doit retourner : 161.97.179.176
```

---

## 11. TLS / Let's Encrypt

### Fonctionnement

Le couple `nginx-proxy` + `acme-companion` automatise entierement la gestion TLS :

1. Quand un conteneur avec `LETSENCRYPT_HOST=aiobi-meet.duckdns.org` demarre, acme-companion detecte la variable via le Docker socket.
2. Il lance un challenge HTTP-01 : Let's Encrypt envoie une requete sur `http://aiobi-meet.duckdns.org:8443/.well-known/acme-challenge/xxx`.
3. nginx-proxy sert la reponse depuis le volume `html` partage.
4. Let's Encrypt valide et emet le certificat.
5. Le certificat est stocke dans le volume `certs` et nginx-proxy recharge automatiquement sa configuration.
6. Renouvellement automatique toutes les 60 jours (verification toutes les heures).

### Mode test

Au premier deploiement, utiliser `LETSENCRYPT_TEST=true` dans `.env`. Cela utilise le serveur staging de Let's Encrypt qui :
- N'a pas de rate limit (le serveur de production limite a 5 certificats par domaine par semaine).
- Emet des certificats non reconnus par les navigateurs (avertissement de securite).
- Permet de tester sans risque de se faire bloquer.

### Passer en certificats reels

Une fois que tout fonctionne avec les certificats de test :

```bash
# 1. Modifier .env
# LETSENCRYPT_TEST=false

# 2. Supprimer les certificats de test
docker compose -f compose.nginx-proxy.yaml down
docker volume rm staging_certs staging_acme

# 3. Relancer
docker compose -f compose.nginx-proxy.yaml up -d
# Attendre ~2 minutes que les certificats soient emis
docker compose -f compose.keycloak.yaml up -d
docker compose -f compose.yaml up -d
```

---

## 12. Ports et firewall

### Ports requis

| Port | Protocole | Service | Direction | Expose a |
|------|-----------|---------|-----------|----------|
| 80 | TCP | HTTP (ACME challenge via nginx natif) | Entrant | Internet (deja ouvert) |
| 8443 | TCP | HTTPS (nginx-proxy TLS termination) | Entrant | Internet |
| 8880 | TCP | HTTP interne (nginx-proxy, ACME) | Interne | nginx natif seulement |
| 47880 | TCP | LiveKit WebSocket signaling | Entrant | Internet (via nginx-proxy) |
| 47881 | TCP | LiveKit ICE TCP fallback | Entrant | Internet (direct) |
| 47882 | UDP | LiveKit media RTP/RTCP | Entrant | Internet (direct) |

### Ports internes (non exposes)

Ces ports sont utilises uniquement entre conteneurs Docker sur les reseaux internes :

| Port | Service |
|------|---------|
| 8000 | Backend (Gunicorn) |
| 8080 | Keycloak |
| 8083 | Frontend (Nginx interne) |
| 5432 | PostgreSQL (app) |
| 5432 | PostgreSQL (Keycloak) |
| 6379 | Redis |
| 9000 | MinIO (API) |
| 9001 | MinIO (console admin) |
| 1025 | Mailcatcher (SMTP) |
| 1080 | Mailcatcher (interface web) |

### Regles UFW appliquees

```
[4]  443/tcp    ALLOW IN  Anywhere   # HTTPS - Aiobi Meet Staging
[24] 47880/tcp  ALLOW IN  Anywhere   # LiveKit WebSocket - Aiobi Meet
[25] 47881/tcp  ALLOW IN  Anywhere   # LiveKit TCP ICE - Aiobi Meet
[26] 47882/udp  ALLOW IN  Anywhere   # LiveKit UDP Media - Aiobi Meet
```

---

## 13. Procedure de deploiement pas a pas

### Prerequis

- Docker Engine 24+ et Docker Compose v2
- Ports 80, 443, 47880, 47881, 47882 ouverts
- Sous-domaines DuckDNS crees et pointant vers l'IP du serveur

### Etape 1 — Cloner et se placer dans le dossier staging

```bash
cd /home/ogu/theY4NN/AïobiMeet/docker/staging
```

### Etape 2 — Configurer les secrets

```bash
cp .env.example .env
# Editer .env et remplir toutes les valeurs (voir section 8)
nano .env
```

### Etape 3 — Configurer DuckDNS

```bash
chmod +x duckdns-update.sh
./duckdns-update.sh
# Verifier : la reponse doit contenir "OK"

# Ajouter le cron
(crontab -l 2>/dev/null; echo "*/5 * * * * $(pwd)/duckdns-update.sh >> /var/log/duckdns.log 2>&1") | crontab -
```

### Etape 4 — Installer le proxy nginx hote

Le nginx natif du serveur doit proxier les challenges ACME vers nginx-proxy Docker :

```bash
sudo cp nginx-host-proxy.conf /etc/nginx/sites-enabled/aiobi-meet-staging
sudo nginx -t
sudo systemctl reload nginx
```

Ouvrir le port 8443 dans le firewall :

```bash
sudo ufw allow 8443/tcp comment "HTTPS Aiobi Meet Staging"
```

### Etape 5 — Creer le reseau proxy

```bash
docker network create proxy-tier
```

### Etape 6 — Lancer le reverse proxy

```bash
docker compose -f compose.nginx-proxy.yaml up -d

# Verifier que les conteneurs tournent
docker compose -f compose.nginx-proxy.yaml ps
```

### Etape 6 — Lancer Keycloak

```bash
docker compose -f compose.keycloak.yaml up -d

# Attendre que Keycloak soit pret (30-60 secondes)
docker compose -f compose.keycloak.yaml logs -f keycloak
# Chercher : "Keycloak ... started in Xs"
```

### Etape 7 — Builder et lancer l'application

```bash
# Builder les images (premiere fois ou apres changement de code)
docker compose -f compose.yaml build

# Lancer
docker compose -f compose.yaml up -d

# Verifier la sante du backend
docker compose -f compose.yaml ps
# Le backend doit etre "healthy"
```

### Etape 8 — Initialiser la base de donnees

```bash
# Appliquer les migrations Django
docker compose -f compose.yaml exec backend python manage.py migrate

# Creer un superutilisateur admin
docker compose -f compose.yaml exec backend python manage.py createsuperuser
```

### Etape 9 — Configurer le client OIDC dans Keycloak

Si le realm n'a pas ete importe automatiquement :

1. Acceder a `https://aiobi-meet.duckdns.org:8443/admin/master/console/`
2. Se connecter avec les credentials admin de `.env`
3. Selectionner le realm "meet" (ou le creer)
4. Aller dans Clients > Creer un client
5. Client ID : `meet`, Client Protocol : `openid-connect`
6. Valid Redirect URIs : `https://aiobi-meet.duckdns.org:8443/*`
7. Copier le Client Secret genere dans `.env` (`OIDC_RP_CLIENT_SECRET`)
8. Redemarrer le backend : `docker compose -f compose.yaml restart backend`

### Etape 10 — Verifier

```bash
# Frontend accessible
curl -sI https://aiobi-meet.duckdns.org | head -5

# API backend
curl -s https://aiobi-meet.duckdns.org:8443/api/v1.0/ | head -20

# Keycloak
curl -sI https://aiobi-meet.duckdns.org:8443/realms/meet/ | head -5

# LiveKit (WebSocket)
curl -sI https://aiobi-livekit.duckdns.org | head -5

# Certificats TLS
echo | openssl s_client -connect aiobi-meet.duckdns.org:443 2>/dev/null | openssl x509 -noout -subject -dates
```

---

## 14. Procedure de mise a jour

### Mise a jour du code applicatif

```bash
cd /home/ogu/theY4NN/AïobiMeet

# Recuperer les derniers changements
git pull origin develop

# Rebuilder les images
cd docker/staging
docker compose -f compose.yaml build

# Appliquer les migrations si necessaire
docker compose -f compose.yaml exec backend python manage.py migrate

# Redemarrer les services
docker compose -f compose.yaml up -d
```

### Mise a jour de Keycloak

```bash
cd docker/staging

# Editer compose.keycloak.yaml pour changer la version de l'image
# Puis :
docker compose -f compose.keycloak.yaml pull
docker compose -f compose.keycloak.yaml up -d
```

### Mise a jour de LiveKit

```bash
docker compose -f compose.yaml pull livekit
docker compose -f compose.yaml up -d livekit
```

---

## 15. Commandes utiles

### Logs

```bash
# Logs en temps reel d'un service
docker compose -f compose.yaml logs -f backend
docker compose -f compose.yaml logs -f frontend
docker compose -f compose.keycloak.yaml logs -f keycloak

# Logs du reverse proxy (debug TLS / routing)
docker compose -f compose.nginx-proxy.yaml logs -f nginx-proxy

# Logs combines de tous les services app
docker compose -f compose.yaml logs -f --tail=100
```

### Administration

```bash
# Shell Django
docker compose -f compose.yaml exec backend python manage.py shell

# Shell PostgreSQL
docker compose -f compose.yaml exec postgresql psql -U aiobi -d meet

# Verifier l'etat de sante
docker compose -f compose.yaml ps
docker compose -f compose.keycloak.yaml ps
docker compose -f compose.nginx-proxy.yaml ps
```

### Arret / Demarrage

```bash
# Redemarrer un seul service
docker compose -f compose.yaml restart backend

# Tout arreter (sans supprimer les volumes)
docker compose -f compose.yaml stop
docker compose -f compose.keycloak.yaml stop

# Tout arreter ET supprimer les conteneurs
docker compose -f compose.yaml down
docker compose -f compose.keycloak.yaml down

# ATTENTION — supprime aussi les donnees :
docker compose -f compose.yaml down -v
```

---

## 16. Diagnostic et depannage

### Le site ne charge pas (ERR_CONNECTION_REFUSED)

1. Verifier que nginx-proxy tourne : `docker compose -f compose.nginx-proxy.yaml ps`
2. Verifier le firewall : `sudo ufw status | grep 443`
3. Verifier le DNS : `dig aiobi-meet.duckdns.org +short` (doit retourner l'IP)
4. Verifier les certificats TLS : `docker compose -f compose.nginx-proxy.yaml logs acme-companion`

### Erreur 502 Bad Gateway

Le reverse proxy fonctionne mais le service cible ne repond pas.

1. Verifier quel service est concerne (frontend ? keycloak ?).
2. `docker compose -f compose.yaml ps` — le service est-il "healthy" ?
3. `docker compose -f compose.yaml logs frontend` — erreurs Nginx ?
4. Verifier les reseaux : `docker network inspect proxy-tier` — le service est-il bien connecte ?

### Login OIDC echoue (boucle de redirection)

1. Verifier `KC_HOSTNAME` dans `env.d/keycloak` — doit etre `https://aiobi-meet.duckdns.org` (avec https).
2. Verifier que `OIDC_OP_TOKEN_ENDPOINT` utilise l'URL **interne** `http://keycloak:8080` et non l'URL publique.
3. Verifier que le client "meet" existe dans Keycloak avec le bon redirect URI.
4. Verifier les logs backend : `docker compose -f compose.yaml logs backend | grep -i oidc`

### LiveKit ne connecte pas les participants

1. Verifier que les ports 47881 et 47882 sont ouverts : `sudo ufw status | grep 478`
2. Verifier les logs LiveKit : `docker compose -f compose.yaml logs livekit`
3. Tester le WebSocket : `curl -I https://aiobi-livekit.duckdns.org`
4. Verifier `LIVEKIT_API_SECRET` — doit etre identique dans `.env` et `livekit-server.yaml`

### La base de donnees est vide apres un redemarrage

Si `docker compose down` a ete execute au lieu de `docker compose stop`, les conteneurs sont supprimes mais les volumes persistent. En revanche, `docker compose down -v` **supprime les volumes et donc les donnees**.

Verifier : `docker volume ls | grep staging` — les volumes doivent exister.

### Keycloak affiche "Invalid parameter: redirect_uri"

Le redirect URI configure dans le client Keycloak ne correspond pas a l'URL du site. Aller dans Keycloak admin > Clients > meet > Settings et ajouter `https://aiobi-meet.duckdns.org:8443/*` dans Valid Redirect URIs.

---

## 17. Passage en production

Quand le serveur Aïobi Master sera pret, la migration staging → production se resume a :

1. **Changer les domaines** dans `.env` :
   ```
   MEET_HOST=meet.aiobi.world
   LIVEKIT_HOST=livekit.aiobi.world
   ```

2. **Changer le hostname Keycloak** dans `env.d/keycloak` :
   ```
   KC_HOSTNAME=https://meet.aiobi.world
   ```

3. **Mettre a jour les redirect URIs** dans Keycloak admin.

4. **Regenerer tous les secrets** (ne jamais reutiliser ceux du staging).

5. **Configurer le vrai SMTP** dans `env.d/common` (remplacer mailcatcher).

6. **Configurer la replication DB** vers le serveur DB Fallback (gere par le CTO).

7. **Retirer `LETSENCRYPT_TEST`** (ou le mettre a `false`).

Les fichiers compose, la configuration Nginx et la config LiveKit restent identiques — seules les variables d'environnement changent. C'est l'avantage de cette architecture parametree.
