# Aïobi Meet — Guide complet d'architecture et d'infrastructure

> Ce document est destine a l'equipe infrastructure et au lead technique. Il decrit en profondeur le fonctionnement de chaque brique de la plateforme, comment elles communiquent entre elles, pourquoi elles sont configurees de cette maniere, et ce qu'il faut savoir pour deployer en production avec Docker Compose sur `meet.aiobi.world`.
>
> Derniere mise a jour : 2026-03-24 — Sprint 1

---

## Table des matieres

1. [Qu'est-ce que Aiobi Meet ?](#1-quest-ce-que-aiobi-meet)
2. [Vue d'ensemble de l'architecture](#2-vue-densemble-de-larchitecture)
3. [Description detaillee de chaque service](#3-description-detaillee-de-chaque-service)
4. [Comment les services communiquent entre eux](#4-comment-les-services-communiquent-entre-eux)
5. [Le flux d'authentification en detail](#5-le-flux-dauthentification-en-detail)
6. [Le flux video en detail](#6-le-flux-video-en-detail)
7. [Le flux d'enregistrement et d'IA](#7-le-flux-denregistrement-et-dia)
8. [Le flux de telechargement de fichiers](#8-le-flux-de-telechargement-de-fichiers)
9. [Le reverse proxy et la terminaison TLS](#9-le-reverse-proxy-et-la-terminaison-tls)
10. [Les reseaux Docker](#10-les-reseaux-docker)
11. [Le stockage et la persistance des donnees](#11-le-stockage-et-la-persistance-des-donnees)
12. [Les variables d'environnement expliquees](#12-les-variables-denvironnement-expliquees)
13. [Les ports et le firewall](#13-les-ports-et-le-firewall)
14. [Les specifications hardware](#14-les-specifications-hardware)
15. [Le scaling et le load balancing](#15-le-scaling-et-le-load-balancing)
16. [La securite en production](#16-la-securite-en-production)
17. [La strategie de backup](#17-la-strategie-de-backup)
18. [Procedure de deploiement pas a pas](#18-procedure-de-deploiement-pas-a-pas)
19. [Procedure de mise a jour](#19-procedure-de-mise-a-jour)
20. [Differences entre dev et production](#20-differences-entre-dev-et-production)
21. [Diagnostic et depannage](#21-diagnostic-et-depannage)

---

## 1. Qu'est-ce que Aiobi Meet ?

Aiobi Meet est une plateforme de visioconference souveraine destinee a l'ecosysteme tech africain. C'est un fork rebrandise de La Suite Numerique Meet (construit par la DINUM, sous licence MIT).

La plateforme permet a des utilisateurs de creer des salles de reunion video, d'y inviter des participants, et optionnellement d'enregistrer les sessions, de les transcrire et d'en generer des resumes via l'IA.

Contrairement a Zoom ou Google Meet, Aiobi Meet est auto-heberge : c'est nous qui controlons les serveurs, les donnees, et l'infrastructure. C'est le sens du mot "souverain" — aucune donnee ne sort de notre infrastructure.

---

## 2. Vue d'ensemble de l'architecture

Aiobi Meet est compose de 5 briques principales qui fonctionnent ensemble. Chaque brique a un role precis et ne peut pas fonctionner sans les autres (sauf le service IA qui est optionnel).

```
                        Internet
                           |
                    +------v------+
                    | Nginx Proxy |  <-- Terminaison TLS (Let's Encrypt)
                    | ports 80+443|  <-- Distribue le trafic selon le domaine
                    +------+------+
                           |
          +----------------+----------------+
          |                |                |
   +------v------+  +-----v------+  +------v------+
   |  Frontend   |  |  Keycloak  |  |  LiveKit    |
   | meet.aiobi  |  | id.aiobi   |  | livekit.    |
   | .world      |  | .world     |  | aiobi.world |
   | React SPA   |  | OIDC SSO   |  | WebRTC SFU  |
   +------+------+  +-----+------+  +------+------+
          |                |                |
          |         +------v------+         |
          +-------->|   Backend   |<--------+
                    | Django API  |
                    | Gunicorn    |
                    +------+------+
                           |
          +----------------+----------------+
          |                |                |
   +------v------+  +-----v------+  +------v------+
   | PostgreSQL  |  |   Redis    |  |   MinIO     |
   | Base de     |  | Cache +    |  | Stockage    |
   | donnees     |  | files      |  | fichiers S3 |
   +-------------+  +-----+------+  +-------------+
```

Voici ce que fait chaque brique, en une phrase :

- **Frontend** : L'interface utilisateur (React). C'est ce que l'utilisateur voit dans son navigateur.
- **Backend** : Le cerveau de l'application (Django). Gere les utilisateurs, les salles, les permissions, et coordonne tout.
- **Keycloak** : Le service d'identite (SSO). Gere les comptes utilisateurs, les mots de passe, et delivre des tokens d'acces.
- **LiveKit** : Le serveur video (SFU). Recoit les flux audio/video des participants et les redistribue aux autres.
- **PostgreSQL** : La base de donnees. Stocke les utilisateurs, les salles, les enregistrements, les permissions.
- **Redis** : Le cache et la file d'attente. Stocke les sessions temporaires et permet la communication asynchrone entre services.
- **MinIO** : Le stockage de fichiers (compatible S3). Stocke les enregistrements video, les transcriptions, les fichiers uploades.
- **Nginx Proxy** : Le point d'entree unique. Recoit tout le trafic HTTPS et le distribue au bon service selon le domaine.

---

## 3. Description detaillee de chaque service

### 3.1 Frontend — L'interface utilisateur

Le frontend est une Single Page Application (SPA) construite avec React 18, bundlee par Vite, et servie par un serveur Nginx interne au container.

Quand un utilisateur ouvre `https://meet.aiobi.world` dans son navigateur, il telecharge un fichier HTML et des fichiers JavaScript. A partir de la, tout se passe dans le navigateur de l'utilisateur : les appels API vers le backend, les connexions WebSocket vers LiveKit, etc. Le frontend ne fait "que" de l'affichage et de la coordination.

En production, le frontend est un container Docker qui contient :
- Les fichiers HTML/JS/CSS pre-compiles (build statique)
- Un serveur Nginx qui sert ces fichiers et qui proxie les requetes `/api/*` vers le backend

Le template Nginx de production (`default.conf.template`) definit les regles de routage :

```nginx
location /     -> frontend (fichiers statiques React)
location /api  -> backend (API Django)
location /admin -> backend (interface admin Django)
location /static -> backend (fichiers statiques Django)
```

C'est important a comprendre : **en production, le frontend et le backend partagent le meme domaine** (`meet.aiobi.world`). Le Nginx interne du frontend decide si la requete va vers les fichiers statiques React ou vers l'API Django. C'est different du dev ou les deux services ont des ports differents (3000 vs 8071).

**Image Docker** : `lasuite/meet-frontend:latest` (a remplacer par `aiobi/meet-frontend` quand notre registry sera pret)
**Port interne** : 8080
**Port expose** : via le reverse proxy sur 443

### 3.2 Backend — Le cerveau de l'application

Le backend est une application Django 5 servie par Gunicorn (un serveur WSGI Python performant). C'est le composant central de la plateforme — il orchestre tout.

Voici ce que le backend fait concretement :

- **Gestion des utilisateurs** : Cree et met a jour les profils utilisateurs quand ils se connectent via Keycloak
- **Gestion des salles** : Cree les salles de reunion, genere les slugs uniques, gere les permissions (qui peut rejoindre, qui est admin)
- **Generation de tokens LiveKit** : Quand un utilisateur rejoint une salle, le backend genere un token JWT signe qui autorise la connexion au serveur LiveKit
- **Gestion des enregistrements** : Demarre/arrete les enregistrements via l'API LiveKit Egress, recoit les webhooks de completion
- **Envoi d'emails** : Invitations de reunion, notifications d'enregistrement disponible
- **API REST** : Fournit toutes les endpoints JSON que le frontend consomme

Le backend est configure via Gunicorn avec ces parametres de production :

```python
bind = ["0.0.0.0:8000"]    # Ecoute sur toutes les interfaces, port 8000
workers = 3                 # 3 processus paralleles pour gerer les requetes
timeout = 90                # Une requete qui prend plus de 90s est tuee
graceful_timeout = 90       # Delai pour finir proprement avant d'etre tue
```

Le nombre de workers (3) est adapte a un serveur 2-4 CPU. La formule recommandee est `2 * CPU + 1`. Sur un serveur 8 CPU, on passerait a 17 workers.

Le backend a besoin de pouvoir communiquer avec :
- PostgreSQL (pour lire/ecrire les donnees)
- Redis (pour les sessions et les taches asynchrones)
- Keycloak (pour valider les tokens OIDC)
- LiveKit (pour generer des tokens et recevoir des webhooks)
- MinIO (pour lire/ecrire des fichiers)
- Le service SMTP (pour envoyer des emails)

**Image Docker** : `lasuite/meet-backend:latest`
**Port interne** : 8000
**Port expose** : via le Nginx du frontend (pas directement expose a Internet)

### 3.3 Celery — Le travailleur asynchrone

Celery est un worker qui execute des taches en arriere-plan. Il utilise la meme image Docker que le backend, mais au lieu de lancer Gunicorn, il lance le processus Celery qui ecoute les taches dans Redis.

Pourquoi Celery est necessaire : certaines operations sont trop longues pour etre executees pendant une requete HTTP (qui doit repondre en quelques secondes). Par exemple :
- Envoyer un email d'invitation prend 1-5 secondes (connexion SMTP, envoi, attente de confirmation)
- Finaliser un enregistrement peut prendre 10-30 secondes (verification du fichier, mise a jour de la DB, notification)
- Declencher une transcription IA est une tache qui peut durer des minutes

Au lieu de bloquer l'utilisateur, le backend met ces taches dans une file Redis, et Celery les execute en arriere-plan.

**Image Docker** : meme que backend
**Commande** : `celery -A meet.celery_app worker -l INFO`
**Depend de** : Redis (comme broker de messages)

### 3.4 PostgreSQL — La base de donnees

PostgreSQL 16 est la base de donnees relationnelle qui stocke toutes les donnees de l'application. Voici ce qu'elle contient :

- **Table `meet_user`** : Les utilisateurs (id, email, sub OIDC, nom complet, langue, preferences)
- **Table `core_room`** : Les salles de reunion (id, slug, nom, niveau d'acces, configuration JSON, code PIN)
- **Table `core_recording`** : Les enregistrements (id, salle, statut, mode, worker_id LiveKit)
- **Table `core_resourceaccess`** : Les permissions (qui a acces a quoi, avec quel role : membre, admin, proprietaire)
- **Table `core_file`** : Les fichiers uploades (metadata, taille, type MIME, etat d'upload)
- **Tables Django** : Sessions, migrations, contenttypes, auth, sites

Le point important est que la base de donnees **doit etre persistante**. Si le volume Docker est perdu, toutes les donnees utilisateurs sont perdues. C'est pourquoi le compose de production monte un volume persistant :

```yaml
volumes:
  - ./data/databases/backend:/var/lib/postgresql/data
```

En dev, **il n'y a pas de volume persistant**, ce qui explique pourquoi un `docker compose down` suivi d'un `up` perd toutes les donnees (c'est ce qui s'est passe aujourd'hui avec l'erreur `meet_user does not exist`).

**Image Docker** : `postgres:16`
**Port interne** : 5432
**Port expose** : PAS expose en production (uniquement accessible depuis les autres containers)
**Credentials production** : configures dans `env.d/postgresql`

### 3.5 Keycloak — Le service d'identite

Keycloak est un serveur d'identite open-source qui implemente les protocoles OpenID Connect (OIDC) et OAuth 2.0. En termes simples, c'est lui qui gere les comptes utilisateurs, les mots de passe, et qui delivre les "passeports" (tokens) aux utilisateurs connectes.

Pourquoi utiliser Keycloak plutot que gerer les mots de passe directement dans Django ? Plusieurs raisons :

1. **Separation des responsabilites** : Le backend Django ne touche jamais aux mots de passe. Il recoit un token signe et fait confiance a Keycloak.
2. **SSO (Single Sign-On)** : Si Aiobi lance d'autres services (chat, wiki, etc.), les utilisateurs pourront se connecter une seule fois sur Keycloak et acceder a tous les services.
3. **Federation d'identite** : Keycloak peut se connecter a des annuaires LDAP, des providers sociaux (Google, GitHub), ou d'autres OIDC providers.
4. **Securite** : Keycloak est audite et maintenu par Red Hat. Gerer soi-meme l'authentification est risque.

Keycloak a sa propre base de donnees PostgreSQL (separee de celle de l'application) pour stocker les realms, les utilisateurs, les sessions, et les configurations de clients.

En production, Keycloak est accessible sur un domaine dedie (`id.aiobi.world`) et est configure pour fonctionner derriere un reverse proxy avec TLS :

```env
KC_HOSTNAME=https://id.aiobi.world
KC_PROXY_HEADERS=xforwarded   # Fait confiance aux headers X-Forwarded-* du proxy
KC_HTTP_ENABLED=true           # Accepte HTTP en interne (le TLS est gere par le proxy)
```

Le realm "meet" contient :
- Le client OIDC "meet" (avec son client_secret)
- Les utilisateurs enregistres
- Les roles (user, admin)
- Le theme de login Aiobi (le CSS custom qu'on a travaille aujourd'hui)

**Image Docker** : `quay.io/keycloak/keycloak:latest`
**Port interne** : 8080
**Port expose** : via le reverse proxy sur `id.aiobi.world:443`
**Base de donnees** : PostgreSQL dedie (separee de la DB applicative)

### 3.6 LiveKit — Le serveur video

LiveKit est un SFU (Selective Forwarding Unit) — un serveur specialise dans le temps reel video/audio. Il est ecrit en Go et est tres performant.

Pour comprendre ce que fait un SFU, comparons avec les alternatives :

- **Peer-to-peer (P2P)** : Chaque participant envoie son flux a tous les autres. Ca marche pour 2-3 personnes, mais au-dela c'est insoutenable (une reunion de 10 personnes = 90 flux).
- **MCU (Multipoint Control Unit)** : Un serveur recoit tous les flux, les mixe en un seul, et le renvoie. Tres couteux en CPU car il faut tout transcoder.
- **SFU (ce que fait LiveKit)** : Chaque participant envoie son flux UNE seule fois au serveur. Le serveur le redistribue tel quel aux autres participants. Pas de transcodage, donc tres economique en CPU.

LiveKit supporte le simulcast : chaque participant envoie 3 qualites de video (basse, moyenne, haute). Le serveur choisit quelle qualite envoyer a chaque destinataire selon sa bande passante.

Les ports LiveKit sont importants a comprendre :

- **Port 7880/tcp (WebSocket)** : C'est le canal de signalisation. Les navigateurs se connectent ici en WebSocket securise (wss://) pour negocier les connexions WebRTC (echanger les offres/reponses SDP et les candidats ICE).
- **Port 7881/tcp** : Fallback ICE sur TCP. Quand UDP est bloque (certains reseaux d'entreprise), WebRTC peut passer par TCP sur ce port.
- **Port 7882/udp** : C'est le port principal pour le media. Tous les flux audio/video passent par ici en UDP. C'est le port le plus important en termes de bande passante.

En production, le port 7880 est expose via le reverse proxy (sur `livekit.aiobi.world:443`), mais les ports 7881 et 7882 sont exposes directement car ils ne peuvent pas passer par un proxy HTTP.

LiveKit utilise Redis pour stocker l'etat des salles en temps reel (qui est connecte, qui publie quoi). C'est aussi via Redis que LiveKit communique avec LiveKit Egress pour les enregistrements.

**Image Docker** : `livekit/livekit-server:latest`
**Ports internes** : 7880 (WS), 7881 (TCP), 7882 (UDP)
**Ports exposes** : 7880 via proxy, 7881 et 7882 directement

### 3.7 LiveKit Egress — Le service d'enregistrement

LiveKit Egress est un service separe qui se connecte a LiveKit pour capturer les flux video/audio et les encoder en fichiers (MP4, OGG). Quand un administrateur de salle clique "Enregistrer", voici ce qui se passe :

 1. Le backend envoie une requete a l'API LiveKit pour demarrer un "egress" (sortie)
2. LiveKit transmet la demande a LiveKit Egress
3. Egress se connecte a la salle comme un participant invisible
4. Egress capture tous les flux, les compose en un seul ecran, et encode en MP4
5. Egress uploade le fichier fini vers MinIO (S3)
6. MinIO notifie le backend via un webhook

C'est un service gourmand en CPU car il fait de l'encodage video en temps reel. En dev il est toujours present, en production il n'est necessaire que si la fonctionnalite d'enregistrement est activee.

**Image Docker** : `livekit/egress:latest`
**Port expose** : aucun (communique uniquement en interne via Redis et WebSocket)

### 3.8 MinIO — Le stockage de fichiers

MinIO est un serveur de stockage compatible S3 (Amazon Simple Storage Service). On l'utilise parce que l'API S3 est un standard de facto pour le stockage d'objets, et que toutes les librairies Python/JS savent parler S3.

MinIO stocke :
- Les enregistrements video (`.mp4`, `.ogg`)
- Les transcriptions et resumes (JSON)
- Les fichiers uploades par les utilisateurs

Tout est dans un seul bucket nomme `meet-media-storage`.

MinIO a une fonctionnalite cle : les **webhooks**. Quand un fichier est uploade (evenement PUT) dans le prefixe `recordings/`, MinIO envoie une notification au backend Django. C'est comme ca que le backend sait qu'un enregistrement a fini d'etre uploade par LiveKit Egress.

En production, MinIO n'est necessaire que si l'enregistrement ou l'upload de fichiers est active. Si on ne fait que de la visio simple, il n'est pas requis.

**Image Docker** : `minio/minio`
**Ports internes** : 9000 (API S3), 9001 (console web)
**Port expose** : PAS expose directement en production (accessible uniquement via le Nginx du backend pour les fichiers autorises)

### 3.9 Redis — Le cache et la file d'attente

Redis est une base de donnees en memoire (RAM) ultra-rapide. Dans Aiobi Meet, il remplit 3 roles simultanement :

1. **Cache de sessions Django** : Quand un utilisateur se connecte, sa session est stockee dans Redis. Ca evite d'interroger PostgreSQL a chaque requete.
2. **Broker Celery** : Les taches asynchrones (emails, etc.) sont mises dans une file Redis. Les workers Celery lisent cette file et executent les taches.
3. **State store LiveKit** : LiveKit stocke l'etat des salles (participants connectes, flux publies) dans Redis. Cela permettrait theoriquement d'avoir plusieurs instances LiveKit en cluster.

Redis est configure sans persistance (les donnees sont en RAM uniquement). Si Redis redmarre, les sessions utilisateurs sont perdues (les utilisateurs doivent se reconnecter), mais aucune donnee permanente n'est perdue.

**Image Docker** : `redis:5`
**Port interne** : 6379
**Port expose** : PAS expose en production

### 3.10 Nginx Proxy — Le point d'entree

Le reverse proxy est le seul composant expose directement a Internet. Il recoit tout le trafic HTTPS et le distribue au bon service en se basant sur le nom de domaine (le header `Host`).

On utilise `nginxproxy/nginx-proxy` qui est un Nginx specialise avec de l'auto-discovery Docker : quand un container a la variable `VIRTUAL_HOST`, nginx-proxy le detecte automatiquement et cree la regle de routage.

Associe a `nginxproxy/acme-companion`, il gere aussi les certificats TLS Let's Encrypt : creation automatique, renouvellement automatique avant expiration.

Voici comment le trafic est distribue :

```
Requete entrante sur port 443 (HTTPS)
  |
  +-- Host: meet.aiobi.world     --> Frontend container (port 8083)
  |                                   Le Nginx interne du frontend route :
  |                                     /       --> fichiers React statiques
  |                                     /api/*  --> Backend Django
  |                                     /admin  --> Backend Django
  |
  +-- Host: id.aiobi.world       --> Keycloak container (port 8080)
  |                                   Pages de login, API OIDC
  |
  +-- Host: livekit.aiobi.world  --> LiveKit container (port 7880)
                                      Signalisation WebSocket
```

Les ports 7881/tcp et 7882/udp de LiveKit ne passent PAS par le proxy — ils sont exposes directement sur la machine hote. C'est parce que le trafic WebRTC media (UDP) ne peut pas transiter par un proxy HTTP. Le navigateur se connecte directement a `livekit.aiobi.world:7882` pour le media.

**Images Docker** : `nginxproxy/nginx-proxy` + `nginxproxy/acme-companion`
**Ports exposes** : 80 (HTTP, pour ACME challenges) et 443 (HTTPS, tout le trafic)

### 3.11 Service Summary (IA) — Optionnel

Le service de transcription et de resume est un pipeline FastAPI + Celery separe qui utilise des APIs externes (WhisperX pour la transcription, un LLM pour le resume).

Il fonctionne avec :
- **app-summary** : API FastAPI qui recoit les demandes de transcription
- **celery-summary-transcribe** : Worker qui appelle l'API WhisperX
- **celery-summary-summarize** : Worker qui appelle l'API LLM
- **redis-summary** : Instance Redis dediee (separee du Redis principal pour eviter les interferences)

Ce service est optionnel et ne sera pas deploye dans la premiere version.

---

## 4. Comment les services communiquent entre eux

Tous les services sont dans le meme reseau Docker (`default`). A l'interieur de ce reseau, chaque service est accessible par son nom de service comme hostname. Par exemple, le backend peut joindre PostgreSQL a l'adresse `postgresql:5432`, Redis a `redis:6379`, etc.

Voici la matrice complete de qui parle a qui :

### Le backend parle a tout le monde

Le backend est le hub central. Il a besoin de communiquer avec tous les autres services :

- **Backend → PostgreSQL** (TCP 5432) : Pour lire et ecrire les donnees (users, rooms, recordings)
- **Backend → Redis** (TCP 6379) : Pour les sessions utilisateurs et la file Celery
- **Backend → Keycloak via Nginx** (HTTP 8083) : Pour valider les tokens OIDC (token exchange, JWKS, userinfo)
- **Backend → LiveKit** (HTTP 7880) : Pour generer des tokens et recevoir des webhooks
- **Backend → MinIO** (HTTP 9000) : Pour uploader/telecharger des fichiers, generer des URLs pre-signees
- **Backend → SMTP** : Pour envoyer des emails

### LiveKit parle a Redis et au backend

- **LiveKit → Redis** (TCP 6379) : Pour stocker l'etat des salles
- **LiveKit → Backend** (HTTP) : Pour envoyer des webhooks (participant rejoint/quitte, enregistrement termine)

### Le navigateur parle au frontend, au backend (via frontend), et a LiveKit

- **Navigateur → Frontend** (HTTPS 443) : Pour charger l'interface
- **Navigateur → Backend via Frontend** (HTTPS 443, chemin /api/) : Pour les appels API
- **Navigateur → LiveKit** (WSS 443 + UDP 7882) : Pour la signalisation et le media video/audio

### Keycloak est isole

Keycloak ne parle qu'a sa propre base de donnees et repond aux requetes entrantes :

- **Keycloak → kc_postgresql** (TCP 5432) : Pour stocker les users et la config du realm
- **Backend → Keycloak** : Le backend envoie des requetes OIDC (token exchange)
- **Navigateur → Keycloak** : L'utilisateur est redirige vers Keycloak pour s'authentifier

---

## 5. Le flux d'authentification en detail

L'authentification utilise le protocole OpenID Connect (OIDC), une surcouche d'OAuth 2.0. Voici le flux complet, etape par etape, de ce qui se passe quand un utilisateur clique "Se connecter" :

**Etape 1 — L'utilisateur clique "Se connecter"**

Le frontend React appelle l'URL `/api/v1.0/authenticate/?returnTo=https://meet.aiobi.world/`. Le backend Django recoit cette requete.

**Etape 2 — Le backend prepare la requete OIDC**

Django genere un `state` (token anti-CSRF), un `nonce` (anti-replay), et les stocke dans la session Redis de l'utilisateur. Puis il redirige (HTTP 302) le navigateur vers Keycloak :

```
https://id.aiobi.world/realms/meet/protocol/openid-connect/auth
  ?client_id=meet
  &response_type=code
  &scope=openid email
  &redirect_uri=https://meet.aiobi.world/api/v1.0/callback/
  &state=<token_anti_csrf>
  &nonce=<token_anti_replay>
```

**Etape 3 — Keycloak affiche la page de login**

L'utilisateur arrive sur `id.aiobi.world` et voit la page de login avec le theme Aiobi (le CSS qu'on a travaille). Il entre ses identifiants.

**Etape 4 — Keycloak valide et redirige**

Si les identifiants sont corrects, Keycloak genere un **code d'autorisation** (valable 60 secondes) et redirige le navigateur vers le callback du backend :

```
https://meet.aiobi.world/api/v1.0/callback/?code=<code>&state=<state>
```

**Etape 5 — Le backend echange le code contre des tokens**

C'est l'etape critique. Le backend (pas le navigateur) envoie une requete serveur-a-serveur vers Keycloak pour echanger le code contre des tokens :

```
POST https://id.aiobi.world/realms/meet/protocol/openid-connect/token
  client_id=meet
  client_secret=<secret>
  grant_type=authorization_code
  code=<code>
```

Keycloak repond avec :
- **access_token** : Permet d'acceder aux ressources (valable 5 min)
- **id_token** : Contient les infos de l'utilisateur (email, sub, nom) signe en RS256
- **refresh_token** : Permet de renouveler l'access_token

**Etape 6 — Le backend cree l'utilisateur local**

Le backend utilise le `sub` (sujet) du id_token pour chercher l'utilisateur dans la DB Django. Si l'utilisateur n'existe pas (premiere connexion), il est cree. Les champs email, nom complet, et nom court sont mis a jour depuis les claims OIDC.

**Etape 7 — Session Django creee**

Le backend cree une session Django (stockee dans Redis), pose un cookie de session sur le navigateur, et redirige vers `https://meet.aiobi.world/`.

**Etape 8 — L'utilisateur est connecte**

Le frontend charge, appelle `/api/v1.0/users/me/` avec le cookie de session, et recoit les infos de l'utilisateur. L'interface s'affiche en mode connecte.

### Le silent login

Quand un utilisateur revient sur le site et que sa session Django a expire, le frontend tente un "silent login" : il redirige vers le backend avec `?silent=true`. Le backend redirige vers Keycloak, qui (si la session Keycloak est encore valide, idle timeout = 30 min) renvoie un code automatiquement sans demander les identifiants. L'utilisateur est re-authentifie de maniere transparente.

---

## 6. Le flux video en detail

### Comment un utilisateur rejoint une salle

**Etape 1 — Recuperation du token LiveKit**

Quand un utilisateur connecte ouvre une salle (`https://meet.aiobi.world/salle-abc`), le frontend appelle `GET /api/v1.0/rooms/salle-abc/`. Le backend :

1. Verifie que l'utilisateur a le droit d'acceder a la salle
2. Genere un **token JWT LiveKit** signe avec `LIVEKIT_API_SECRET`
3. Le token contient : l'identite (le `sub` OIDC), les permissions (publier camera, micro, ecran), le role (admin ou non), une couleur aleatoire, et la salle de destination

Le backend retourne :
```json
{
  "livekit": {
    "url": "wss://livekit.aiobi.world",
    "room": "uuid-de-la-salle",
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Etape 2 — Connexion WebSocket**

Le navigateur ouvre une connexion WebSocket vers `wss://livekit.aiobi.world` avec le token en parametre. LiveKit verifie la signature du token (avec la meme cle secrete partagee) et accepte la connexion.

**Etape 3 — Negociation WebRTC**

A travers le WebSocket, le navigateur et LiveKit echangent des messages de signalisation ICE (Interactive Connectivity Establishment) pour etablir une connexion directe UDP :

1. Le navigateur genere une "offre" SDP (Session Description Protocol) qui decrit ses capacites (codecs, bande passante)
2. LiveKit repond avec une "reponse" SDP
3. Les deux cotes echangent des "candidats ICE" (adresses IP/ports par lesquels ils peuvent communiquer)
4. Une connexion UDP est etablie sur le port 7882

**Etape 4 — Flux media**

Une fois la connexion etablie, les flux audio et video circulent en UDP entre le navigateur et LiveKit. LiveKit redistribue (forward) les flux vers les autres participants. Grace au simulcast, chaque participant envoie 3 qualites et LiveKit choisit la meilleure pour chaque destinataire.

### Pourquoi 3 domaines DNS sont necessaires

- `meet.aiobi.world` : Le site web (HTTP/HTTPS classique)
- `id.aiobi.world` : Keycloak (les redirections OIDC se font dans le navigateur, donc Keycloak doit etre accessible depuis Internet)
- `livekit.aiobi.world` : LiveKit (le navigateur doit pouvoir se connecter directement au serveur WebRTC)

On ne peut pas tout mettre sur un seul domaine parce que LiveKit a besoin de ses propres ports UDP, et que Keycloak doit etre un domaine separe pour la securite OIDC (isolation des cookies et des sessions).

---

## 7. Le flux d'enregistrement et d'IA

L'enregistrement est une fonctionnalite optionnelle qui necessite LiveKit Egress et MinIO. Voici le flux complet :

**Demarrage de l'enregistrement**

1. L'admin de la salle clique "Enregistrer" dans le frontend
2. Le frontend appelle `POST /api/v1.0/rooms/{id}/start-recording/`
3. Le backend cree un objet `Recording` en DB (statut = INITIATED)
4. Le backend appelle l'API LiveKit Egress : "commence a enregistrer la salle X, encode en MP4, uploade vers MinIO"
5. LiveKit Egress se connecte a la salle, capture les flux, commence l'encodage
6. Le statut passe a ACTIVE

**Arret et sauvegarde**

7. L'admin clique "Arreter" → `POST /api/v1.0/rooms/{id}/stop-recording/`
8. Le backend appelle LiveKit Egress : "arrete l'enregistrement"
9. Egress finalise le fichier MP4 et l'uploade vers MinIO dans le bucket `meet-media-storage`
10. MinIO recoit le fichier et declenche un webhook vers `POST /api/v1.0/recordings/storage-hook/`
11. Le backend met a jour le statut : SAVED

**Transcription et resume (optionnel)**

12. Le backend enqueue une tache Celery vers le service Summary
13. Le worker `celery-summary-transcribe` telecharge l'audio depuis MinIO, appelle WhisperX, stocke le transcript
14. Le worker `celery-summary-summarize` lit le transcript, appelle un LLM, stocke le resume
15. Les resultats sont accessibles via l'API

---

## 8. Le flux de telechargement de fichiers

Quand un utilisateur veut telecharger un enregistrement ou un fichier, le flux passe par une verification d'autorisation :

1. Le navigateur demande `GET https://meet.aiobi.world/media/{cle-du-fichier}`
2. Le Nginx de dev (port 8083) recoit la requete sur `/media/`
3. **Avant de servir le fichier**, Nginx fait un appel interne (`auth_request`) vers le backend : `GET /api/v1.0/files/media-auth/`
4. Le backend verifie : l'utilisateur est-il connecte ? A-t-il le droit d'acceder a ce fichier ?
5. Si oui, le backend retourne un code 200 avec des headers d'authentification S3 (Authorization, X-Amz-Date, X-Amz-Content-SHA256)
6. Nginx copie ces headers et proxie la requete vers MinIO
7. MinIO verifie les headers S3 et sert le fichier

Ce mecanisme est elegant parce que le fichier va directement de MinIO au navigateur — le backend ne sert que d'autorite d'autorisation, il ne touche jamais au flux de donnees du fichier. Ca evite de saturer la memoire du backend avec des fichiers volumineux.

---

## 9. Le reverse proxy et la terminaison TLS

### Pourquoi un reverse proxy ?

En production, on ne peut pas exposer directement chaque service sur Internet. Les raisons :
- **Securite** : On ne veut pas que PostgreSQL, Redis, ou MinIO soient accessibles depuis Internet
- **TLS** : Chaque service ne gere pas lui-meme le HTTPS. Le proxy centralise la terminaison TLS
- **Simplification** : Un seul point d'entree avec un seul certificat wildcard (ou plusieurs certificats par domaine)

### Comment ca marche avec nginx-proxy

`nginxproxy/nginx-proxy` est un container Nginx qui surveille le socket Docker (`/var/run/docker.sock`). Quand un container demarre avec la variable `VIRTUAL_HOST=meet.aiobi.world`, nginx-proxy le detecte et cree automatiquement une regle :

```nginx
server {
    listen 443 ssl;
    server_name meet.aiobi.world;
    location / {
        proxy_pass http://<container_ip>:<VIRTUAL_PORT>;
    }
}
```

`nginxproxy/acme-companion` travaille avec nginx-proxy pour generer les certificats TLS via Let's Encrypt. Quand un container a `LETSENCRYPT_HOST=meet.aiobi.world`, le companion :
1. Cree un challenge ACME (fichier temporaire accessible sur le port 80)
2. Let's Encrypt verifie que le domaine pointe bien vers notre serveur
3. Le certificat est emis et stocke dans le volume `certs`
4. Le certificat est renouvele automatiquement avant expiration (90 jours)

### Les 3 domaines en production

```yaml
# Frontend (meet.aiobi.world)
frontend:
  environment:
    - VIRTUAL_HOST=meet.aiobi.world
    - VIRTUAL_PORT=8083
    - LETSENCRYPT_HOST=meet.aiobi.world

# Keycloak (id.aiobi.world)
keycloak:
  environment:
    - VIRTUAL_HOST=id.aiobi.world
    - VIRTUAL_PORT=8080
    - LETSENCRYPT_HOST=id.aiobi.world

# LiveKit (livekit.aiobi.world) — signalisation WSS uniquement
livekit:
  environment:
    - VIRTUAL_HOST=livekit.aiobi.world
    - VIRTUAL_PORT=7880
    - LETSENCRYPT_HOST=livekit.aiobi.world
  ports:
    - "7881:7881/tcp"    # ICE TCP — expose directement
    - "7882:7882/udp"    # Media UDP — expose directement
```

---

## 10. Les reseaux Docker

Le compose de production utilise 2 reseaux :

### Reseau `default`

C'est le reseau principal ou tous les services applicatifs communiquent. PostgreSQL, Redis, MinIO, le backend, le frontend, LiveKit — ils sont tous la-dedans. Les hostnames (comme `postgresql`, `redis`, `backend`) sont resolus automatiquement par Docker DNS.

### Reseau `proxy-tier`

C'est le reseau qui connecte nginx-proxy aux services qui doivent etre exposes. Seuls les services avec `VIRTUAL_HOST` ont besoin d'etre sur ce reseau. C'est un reseau `external: true`, ce qui signifie qu'il est partage entre le compose principal et le compose du nginx-proxy.

Il faut le creer avant de lancer les services :

```bash
docker network create proxy-tier
```

### Pourquoi cette separation ?

C'est une bonne pratique de securite. Le reverse proxy ne peut communiquer qu'avec les services sur `proxy-tier`. Il ne peut pas joindre PostgreSQL ou Redis directement, meme s'il etait compromis.

---

## 11. Le stockage et la persistance des donnees

### Donnees critiques (DOIVENT etre persistees)

| Volume | Chemin dans le container | Contenu | Impact si perdu |
|--------|--------------------------|---------|-----------------|
| `./data/databases/backend` | `/var/lib/postgresql/data` | Base Django (users, rooms, recordings) | **PERTE TOTALE** des comptes et donnees |
| `./data/keycloak` | `/var/lib/postgresql/data/pgdata` | Base Keycloak (identites, realm) | **PERTE TOTALE** des comptes Keycloak |
| `certs` | `/etc/nginx/certs` | Certificats TLS | Regenerable via Let's Encrypt (delai ~1min) |

### Donnees optionnelles

| Volume | Contenu | Impact si perdu |
|--------|---------|-----------------|
| MinIO data | Enregistrements, fichiers | Perte des recordings (non critique si backup S3) |
| Redis | Sessions, cache | Utilisateurs deconnectes (se reconnectent) |

### Le piege du dev vs production

En dev (`compose.yml`), PostgreSQL n'a **pas de volume persistant**. Un `docker compose down` detruit les donnees. En production (`docs/examples/compose/compose.yaml`), le volume est explicitement monte :

```yaml
# Production — donnees persistantes
postgresql:
  volumes:
    - ./data/databases/backend:/var/lib/postgresql/data

# Dev — PAS de volume → donnees ephemeres
postgresql:
  # (pas de section volumes)
```

C'est pourquoi on a eu l'erreur `meet_user does not exist` aujourd'hui : un redemarrage en dev a perdu les tables Django, mais les enregistrements de migrations etaient dans une couche Docker ephemere.

---

## 12. Les variables d'environnement expliquees

### Fichier `.env` (domaines et hostnames)

Ce fichier definit les noms DNS et les hostnames internes Docker. C'est le seul fichier ou on configure les domaines.

```env
MEET_HOST=meet.aiobi.world           # Domaine public du frontend
KEYCLOAK_HOST=id.aiobi.world         # Domaine public de Keycloak
LIVEKIT_HOST=livekit.aiobi.world     # Domaine public de LiveKit
BACKEND_INTERNAL_HOST=backend         # Hostname Docker du backend (reseau interne)
FRONTEND_INTERNAL_HOST=frontend       # Hostname Docker du frontend
LIVEKIT_INTERNAL_HOST=livekit         # Hostname Docker de LiveKit
REALM_NAME=meet                       # Nom du realm Keycloak
```

### Fichier `env.d/common` (configuration applicative)

C'est le fichier le plus important. Il contient tous les secrets et toutes les URLs.

**Django** :
```env
DJANGO_SECRET_KEY=<cle secrete>       # Sert a signer les cookies et les tokens CSRF
DJANGO_ALLOWED_HOSTS=meet.aiobi.world # Django refuse les requetes avec un autre Host
DJANGO_CONFIGURATION=Production       # Active le mode production (DEBUG=False, etc.)
```

**OIDC** (connexion a Keycloak) :
```env
OIDC_RP_CLIENT_ID=meet                # Identifiant du client OIDC dans Keycloak
OIDC_RP_CLIENT_SECRET=<secret>        # Secret partage entre Django et Keycloak
OIDC_RP_SIGN_ALGO=RS256               # Algorithme de signature des tokens
```

Les endpoints OIDC sont construits dynamiquement a partir de `KEYCLOAK_HOST` et `REALM_NAME` :
```env
OIDC_OP_TOKEN_ENDPOINT=https://${KEYCLOAK_HOST}/realms/${REALM_NAME}/protocol/openid-connect/token
```

**LiveKit** :
```env
LIVEKIT_API_KEY=meet                   # Identifiant API LiveKit
LIVEKIT_API_SECRET=<cle secrete>       # Cle partagee pour signer les tokens JWT LiveKit
LIVEKIT_API_URL=https://${LIVEKIT_HOST}  # URL publique du serveur LiveKit
```

**Email** :
```env
DJANGO_EMAIL_HOST=smtp.provider.com    # Serveur SMTP
DJANGO_EMAIL_HOST_USER=apikey          # User SMTP
DJANGO_EMAIL_HOST_PASSWORD=<password>  # Password SMTP
DJANGO_EMAIL_PORT=587                  # Port SMTP (587=TLS, 465=SSL, 25=non chiffre)
```

### Fichier `env.d/postgresql` (base de donnees)

```env
DB_HOST=postgresql    # Hostname du container PostgreSQL
DB_NAME=meet          # Nom de la base
DB_USER=meet          # Utilisateur PostgreSQL
DB_PASSWORD=<pass>    # Mot de passe (doit etre fort en production)
DB_PORT=5432          # Port PostgreSQL
```

### Fichier `env.d/keycloak` (identite)

```env
KC_BOOTSTRAP_ADMIN_USERNAME=admin      # Compte admin initial (ne sert qu'au premier lancement)
KC_BOOTSTRAP_ADMIN_PASSWORD=<pass>     # Mot de passe admin Keycloak
KC_HOSTNAME=https://id.aiobi.world     # URL publique de Keycloak
KC_PROXY_HEADERS=xforwarded            # Fait confiance aux headers du proxy
KC_HTTP_ENABLED=true                   # Le TLS est gere par le proxy, pas par Keycloak
```

### Les secrets a generer

Pour chaque secret, utiliser `openssl rand -hex 32` :

```bash
# Django
openssl rand -hex 32  # → DJANGO_SECRET_KEY

# OIDC
openssl rand -hex 24  # → OIDC_RP_CLIENT_SECRET (doit correspondre dans Keycloak)

# LiveKit
openssl rand -hex 24  # → LIVEKIT_API_SECRET (doit correspondre dans livekit-server.yaml)

# Bases de donnees
openssl rand -hex 16  # → DB_PASSWORD
openssl rand -hex 16  # → KC password dans env.d/kc_postgresql

# Keycloak admin
openssl rand -hex 12  # → KC_BOOTSTRAP_ADMIN_PASSWORD
```

---

## 13. Les ports et le firewall

### Ports a ouvrir sur le serveur

| Port | Protocole | Service | Pourquoi |
|------|-----------|---------|----------|
| 80 | TCP | nginx-proxy | Challenges ACME Let's Encrypt + redirect vers HTTPS |
| 443 | TCP | nginx-proxy | Tout le trafic HTTPS (frontend, API, Keycloak, LiveKit WS) |
| 7881 | TCP | LiveKit | WebRTC ICE fallback TCP (quand UDP est bloque) |
| 7882 | UDP | LiveKit | WebRTC media (audio/video) — c'est le plus important pour la qualite |

### Ports a NE PAS ouvrir

| Port | Service | Raison |
|------|---------|--------|
| 5432 | PostgreSQL | Acces base de donnees — uniquement interne |
| 6379 | Redis | Cache/sessions — uniquement interne |
| 9000 | MinIO | Stockage S3 — uniquement via Nginx avec auth |
| 8000 | Backend | API Django — uniquement via le proxy |
| 8080 | Keycloak/Frontend | Derriere le proxy |

### Configuration UFW

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp       # SSH (ne pas oublier !)
sudo ufw allow 80/tcp       # HTTP (Let's Encrypt)
sudo ufw allow 443/tcp      # HTTPS
sudo ufw allow 443/udp      # HTTPS UDP (certains cas WebRTC)
sudo ufw allow 7881/tcp     # WebRTC ICE TCP
sudo ufw allow 7882/udp     # WebRTC media UDP
sudo ufw enable
```

---

## 14. Les specifications hardware

### Petit deploiement (jusqu'a 50 utilisateurs simultanes)

Ce dimensionnement convient pour une equipe, un departement, ou une petite organisation.

| Ressource | Valeur | Explication |
|-----------|--------|-------------|
| CPU | 4 vCPU | LiveKit est le plus gourmand (encodage simulcast). Le backend et Keycloak sont legers. |
| RAM | 8 GB | PostgreSQL aime avoir du cache (2-3 GB). LiveKit utilise ~1 GB par salle active. Redis est minuscule. |
| Disque | 100 GB SSD | La DB est petite (~500 MB). Les recordings sont la majorite (1h de video ≈ 500 MB). |
| Bande passante | 100 Mbps symetrique | Chaque participant consomme ~2 Mbps en reception. 20 participants = 40 Mbps. |

### Deploiement moyen (50-200 utilisateurs simultanes)

Pour une organisation moyenne avec plusieurs reunions simultanees.

| Ressource | Valeur | Explication |
|-----------|--------|-------------|
| CPU | 8 vCPU | Permet 5-6 Gunicorn workers + LiveKit confortable |
| RAM | 16 GB | Plus de headroom pour les salles simultanees |
| Disque | 250 GB SSD | Plus de recordings a stocker |
| Bande passante | 500 Mbps symetrique | Marge pour les pics d'utilisation |

### Deploiement large (200-500 utilisateurs simultanes)

A ce stade, il faut envisager de separer LiveKit sur un serveur dedie.

| Ressource | Valeur | Explication |
|-----------|--------|-------------|
| Serveur 1 (app) | 8 CPU, 16 GB RAM | Frontend + Backend + Celery + Redis + PostgreSQL |
| Serveur 2 (media) | 16 CPU, 16 GB RAM | LiveKit + Egress (le gros de la charge) |
| Stockage | 500 GB SSD + S3 externe | Externaliser MinIO vers un S3 cloud pour la durabilite |
| Bande passante | 1 Gbps | LiveKit est tres gourmand en bande passante |

---

## 15. Le scaling et le load balancing

### Docker Compose n'est pas concu pour le scaling horizontal

Il faut etre honnete : Docker Compose est un outil de developpement et de petites productions. Pour du vrai load balancing avec replicas, Kubernetes est l'outil adapte.

Cela dit, voici ce qu'on peut faire avec Compose :

### Scaling vertical (la methode simple)

Augmenter les ressources du serveur et ajuster les parametres :

```python
# Gunicorn — plus de workers = plus de requetes paralleles
workers = 2 * CPU_COUNT + 1  # Sur 8 CPU → 17 workers
```

Redis et PostgreSQL profitent directement de plus de RAM (plus de cache).

### Scaling horizontal partiel

On peut lancer plusieurs instances du backend :

```bash
docker compose up -d --scale backend=3
```

Mais il faut alors un load balancer devant. nginx-proxy fait du round-robin automatiquement quand il detecte plusieurs containers avec le meme `VIRTUAL_HOST`. C'est un load balancing basique (pas de health checks, pas de sessions stickies).

### Les limites

- **PostgreSQL** : Une seule instance. Pour scaler, il faudrait un cluster PostgreSQL externe (RDS, Crunchy, Patroni).
- **Redis** : Une seule instance. Pour scaler, Redis Cluster ou Redis Sentinel.
- **LiveKit** : Une seule instance peut gerer ~200-500 participants. Au-dela, il faut un cluster LiveKit (plusieurs SFU avec Redis comme coordinateur) ou LiveKit Cloud.

### Recommandation

Pour Aiobi Meet en Sprint 1, un **seul serveur avec scaling vertical** est largement suffisant. On passera au multi-serveur quand on depassera 100 utilisateurs simultanes reguliers.

---

## 16. La securite en production

### Checklist avant deploiement

**Secrets :**
- [ ] `DJANGO_SECRET_KEY` genere avec `openssl rand -hex 32` (pas celui du dev)
- [ ] `OIDC_RP_CLIENT_SECRET` genere et configure dans Keycloak
- [ ] `LIVEKIT_API_SECRET` genere et mis dans `livekit-server.yaml` et `env.d/common`
- [ ] `DB_PASSWORD` fort pour PostgreSQL app
- [ ] `KC_DB_PASSWORD` fort pour PostgreSQL Keycloak
- [ ] `KC_BOOTSTRAP_ADMIN_PASSWORD` fort pour l'admin Keycloak
- [ ] Aucun fichier `.env` commite dans Git

**TLS :**
- [ ] HTTPS actif sur les 3 domaines
- [ ] Certificats Let's Encrypt en place et renouvellement automatique verifie
- [ ] Keycloak configure avec `KC_HOSTNAME=https://id.aiobi.world` (pas http)

**Reseau :**
- [ ] Firewall actif (UFW) avec uniquement les ports necessaires ouverts
- [ ] PostgreSQL et Redis PAS accessibles depuis Internet
- [ ] MinIO PAS accessible directement (uniquement via Nginx avec auth)

**Django :**
- [ ] `DJANGO_ALLOWED_HOSTS` = domaine exact (pas `*`)
- [ ] `DJANGO_CONFIGURATION=Production` (active DEBUG=False)

**Keycloak :**
- [ ] `KC_PROXY_HEADERS=xforwarded` (mode proxy)
- [ ] `KC_HTTP_ENABLED=true` (TLS au proxy)
- [ ] Redirect URIs du client "meet" = `https://meet.aiobi.world/*` uniquement

---

## 17. La strategie de backup

### Ce qu'il faut sauvegarder

| Donnee | Frequence | Methode | Retention |
|--------|-----------|---------|-----------|
| PostgreSQL (app) | Quotidien | `pg_dump` | 30 jours |
| PostgreSQL (KC) | Quotidien | `pg_dump` | 30 jours |
| MinIO (media) | Quotidien | `mc mirror` ou sync S3 | Selon politique |
| Configuration (.env, yaml) | A chaque changement | Git ou copie manuelle | Permanent |

### Script de backup

```bash
#!/bin/bash
# backup.sh — a executer quotidiennement via cron
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/backups/aiobi-meet

mkdir -p ${BACKUP_DIR}

# Backup PostgreSQL app
docker compose exec -T postgresql \
  pg_dump -U meet meet | gzip > ${BACKUP_DIR}/meet_db_${DATE}.sql.gz

# Backup PostgreSQL Keycloak
docker compose -f keycloak/compose.yaml exec -T postgresql \
  pg_dump -U keycloak keycloak | gzip > ${BACKUP_DIR}/keycloak_db_${DATE}.sql.gz

# Nettoyage des backups de plus de 30 jours
find ${BACKUP_DIR} -name "*.sql.gz" -mtime +30 -delete

echo "Backup complete: ${DATE}"
```

Ajouter au crontab : `0 3 * * * /opt/scripts/backup.sh >> /var/log/backup-aiobi.log 2>&1`

### Restauration

```bash
# Restaurer la DB app
gunzip -c backup_meet_20260324.sql.gz | docker compose exec -T postgresql psql -U meet meet

# Restaurer la DB Keycloak
gunzip -c backup_kc_20260324.sql.gz | docker compose exec -T kc_postgresql psql -U keycloak keycloak
```

---

## 18. Procedure de deploiement pas a pas

### Pre-requis

- Un serveur Ubuntu 22.04+ avec Docker Engine et Docker Compose v2
- 3 enregistrements DNS A pointant vers l'IP du serveur :
  - `meet.aiobi.world` → `<IP>`
  - `id.aiobi.world` → `<IP>`
  - `livekit.aiobi.world` → `<IP>`
- Les ports 80, 443, 7881/tcp, 7882/udp ouverts

### Etape 1 — Preparer l'environnement

```bash
# Creer les repertoires
mkdir -p /opt/aiobi-meet && cd /opt/aiobi-meet
mkdir -p env.d data/databases/backend data/keycloak

# Telecharger les fichiers de configuration
# (ou cloner le repo et copier les exemples)
git clone https://github.com/TheY4NN777/Aiobi-Meet.git /tmp/aiobi-repo
cp /tmp/aiobi-repo/docs/examples/compose/compose.yaml .
cp /tmp/aiobi-repo/docker/files/production/default.conf.template .
cp /tmp/aiobi-repo/env.d/production.dist/hosts .env
cp /tmp/aiobi-repo/env.d/production.dist/common env.d/common
cp /tmp/aiobi-repo/env.d/production.dist/postgresql env.d/postgresql
```

### Etape 2 — Generer les secrets

```bash
echo "DJANGO_SECRET_KEY: $(openssl rand -hex 32)"
echo "OIDC_RP_CLIENT_SECRET: $(openssl rand -hex 24)"
echo "LIVEKIT_API_SECRET: $(openssl rand -hex 24)"
echo "DB_PASSWORD: $(openssl rand -hex 16)"
echo "KC_DB_PASSWORD: $(openssl rand -hex 16)"
echo "KC_ADMIN_PASSWORD: $(openssl rand -hex 12)"
```

Reporter chaque secret dans le fichier .env correspondant.

### Etape 3 — Configurer les domaines

Editer `.env` :
```env
MEET_HOST=meet.aiobi.world
KEYCLOAK_HOST=id.aiobi.world
LIVEKIT_HOST=livekit.aiobi.world
```

### Etape 4 — Configurer Keycloak

Preparer les fichiers Keycloak :
```bash
mkdir -p keycloak/env.d
cp /tmp/aiobi-repo/env.d/production.dist/keycloak keycloak/env.d/keycloak
cp /tmp/aiobi-repo/env.d/production.dist/kc_postgresql keycloak/env.d/kc_postgresql
cp /tmp/aiobi-repo/docs/examples/compose/keycloak/compose.yaml keycloak/compose.yaml
```

Editer les secrets dans `keycloak/env.d/keycloak` et `keycloak/env.d/kc_postgresql`.

### Etape 5 — Configurer LiveKit

```bash
cp /tmp/aiobi-repo/docs/examples/livekit/server.yaml livekit-server.yaml
```

Editer `livekit-server.yaml` — mettre la cle API et le secret generes, et l'URL du webhook backend.

### Etape 6 — Configurer le reverse proxy

```bash
# Creer le reseau partage
docker network create proxy-tier

# Demarrer le proxy
cp -r /tmp/aiobi-repo/docs/examples/compose/nginx-proxy .
cd nginx-proxy && docker compose up -d && cd ..
```

Decommmenter les sections `environment` et `networks` dans `compose.yaml` pour le frontend et LiveKit.

### Etape 7 — Configurer le firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw allow 7881/tcp
sudo ufw allow 7882/udp
sudo ufw enable
```

### Etape 8 — Lancer les services

```bash
# Demarrer Keycloak d'abord
cd keycloak && docker compose up -d && cd ..

# Attendre que Keycloak soit pret (~30s)
sleep 30

# Demarrer l'application
docker compose up -d
```

### Etape 9 — Initialiser la base de donnees

```bash
docker compose run --rm backend python manage.py migrate
docker compose run --rm backend python manage.py createsuperuser \
  --email admin@aiobi.world --password <motdepasse>
```

### Etape 10 — Configurer le realm Keycloak

1. Ouvrir `https://id.aiobi.world` dans le navigateur
2. Se connecter avec les credentials admin
3. Creer un realm nomme "meet"
4. Dans le realm, creer un client :
   - Client ID : `meet`
   - Client authentication : ON
   - Valid redirect URIs : `https://meet.aiobi.world/*`
   - Web origins : `https://meet.aiobi.world`
5. Dans l'onglet Credentials du client, copier le Client Secret
6. Reporter le secret dans `env.d/common` → `OIDC_RP_CLIENT_SECRET`
7. Redemarrer le backend : `docker compose restart backend`

### Etape 11 — Verifier

```bash
curl -I https://meet.aiobi.world      # → 200
curl -I https://id.aiobi.world        # → 200
curl -I https://livekit.aiobi.world   # → 200 (ou upgrade websocket)
```

Ouvrir `https://meet.aiobi.world`, cliquer "Se connecter", verifier le flux OIDC complet.

---

## 19. Procedure de mise a jour

### Avant la mise a jour

1. Consulter `UPGRADE.md` pour les instructions specifiques a la version
2. Consulter `CHANGELOG.md` pour le resume des changements
3. Faire un backup des bases de donnees (voir section 17)

### Procedure

```bash
cd /opt/aiobi-meet

# 1. Mettre a jour les tags d'images dans compose.yaml
#    (remplacer :latest par la version cible, ex: :v1.2.0)

# 2. Pull les nouvelles images
docker compose pull

# 3. Redemarrer les services
docker compose up -d

# 4. Appliquer les migrations
docker compose run --rm backend python manage.py migrate

# 5. Verifier les logs
docker compose logs -f --tail=50
```

---

## 20. Differences entre dev et production

| Aspect | Developpement | Production |
|--------|---------------|------------|
| **Backend** | `python manage.py runserver` (1 thread, hot reload) | Gunicorn (3+ workers, pas de hot reload) |
| **Frontend** | Build a chaque requete (Vite dev server) ou build statique | Build statique pre-compile |
| **PostgreSQL** | Pas de volume persistant | Volume monte (`./data/databases/backend`) |
| **Keycloak** | Mode `start-dev`, realm importe automatiquement | Mode `start`, realm configure manuellement |
| **LiveKit** | Flag `--dev`, cles hardcodees | Config production, cles securisees |
| **TLS** | Pas de HTTPS (HTTP sur localhost) | HTTPS obligatoire avec Let's Encrypt |
| **Secrets** | Tous hardcodes dans `.dist` files | Generes et stockes securisement |
| **Debug** | `DEBUG=True`, logs verbeux | `DEBUG=False`, logs info |
| **Proxy** | Nginx dev sur port 8083 (Keycloak + media auth) | nginx-proxy sur 80/443 (tout le trafic) |
| **Ports** | Tout expose (3000, 8071, 8080, etc.) | Seuls 80, 443, 7881, 7882 exposes |
| **Email** | MailCatcher (capture les emails, ne les envoie pas) | SMTP reel |

---

## 21. Diagnostic et depannage

### "relation meet_user does not exist"

**Cause** : Les tables Django n'existent pas dans PostgreSQL. Cela arrive quand :
- Le volume PostgreSQL a ete perdu (`docker compose down -v` ou recreation du container sans volume)
- Les migrations n'ont pas ete executees

**Fix** :
```bash
# Si les tables existent mais les migrations sont desynchronisees
docker compose run --rm backend python manage.py migrate

# Si la DB est vide (premiere installation ou volume perdu)
docker compose exec postgresql psql -U meet -d meet -c "\dt"  # Lister les tables
# Si aucune table → les migrations n'ont pas ete lancees
docker compose run --rm backend python manage.py migrate
```

### "OIDC callback state not found in session"

**Cause** : La session Django a expire entre le debut du login et le callback. Cela arrive quand :
- L'utilisateur met trop de temps a se connecter sur Keycloak
- Redis a ete redemarre (les sessions sont en RAM)
- L'utilisateur a copie-colle une vieille URL de callback

**Fix** : Retourner sur la page d'accueil et se reconnecter normalement.

### Le reverse proxy ne route pas vers le bon service

**Cause** : `VIRTUAL_HOST` n'est pas configure ou le reseau `proxy-tier` n'est pas connecte.

**Fix** :
```bash
# Verifier que nginx-proxy detecte les containers
docker logs nginx-proxy | grep "meet.aiobi.world"

# Verifier les reseaux
docker network inspect proxy-tier
```

### LiveKit : "could not connect"

**Cause** : Le navigateur ne peut pas joindre le serveur LiveKit. Souvent un probleme de firewall (port 7882/udp bloque) ou de DNS.

**Fix** :
```bash
# Verifier que LiveKit ecoute
docker compose logs livekit | tail -20

# Verifier les ports depuis Internet
nc -zv livekit.aiobi.world 7881
```

### Les recordings ne fonctionnent pas

**Cause** : LiveKit Egress, MinIO, ou le webhook ne sont pas configures.

**Fix** : Verifier que `RECORDING_ENABLE=True` dans `env.d/common`, que MinIO est accessible, et que le webhook est configure.

---

*Ce document sera mis a jour au fil des sprints. Pour toute question, contacter l'equipe technique.*
