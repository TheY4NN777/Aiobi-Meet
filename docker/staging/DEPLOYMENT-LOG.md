# Journal de deploiement staging — Erreurs et solutions

> Ce document trace toutes les erreurs rencontrees lors de la mise en place du CI/CD
> et du deploiement staging. Il sert de reference pour eviter de repeter les memes
> erreurs et pour donner du contexte aux prochaines sessions de travail.

---

## Erreur 1 — Ports LiveKit au-dela de 65535

**Date** : 25 mars 2026
**Contexte** : L'admin (Aziz) a demande d'ajouter "1 1 1" aux ports LiveKit standards (7880 → 78180).
**Erreur** : `ERROR: Bad port` — les ports 78180, 78181, 78182 depassent la limite max TCP/UDP (65535).
**Solution** : Utilise la serie 47880/47881/47882 a la place.
**Commit** : Ports documentes dans `livekit-server.yaml` et `README.md`.

---

## Erreur 2 — Auto DevOps GitLab

**Date** : 26 mars 2026
**Contexte** : Premier push sur GitLab, pas de `.gitlab-ci.yml` dans le repo.
**Erreur** : GitLab a lance Auto DevOps automatiquement (pipeline #1), 3 jobs echoues (test, code_quality, build).
**Solution** : Auto DevOps etait deja decoche dans Settings. Ajout d'un `.gitlab-ci.yml` custom pour remplacer.
**Commit** : `dcd730d6` — `ci(gitlab) add CI/CD pipeline with build and staging deployment`

---

## Erreur 3 — Docker-in-Docker (dind) ne demarre pas

**Date** : 26 mars 2026 — Pipeline #2
**Erreur** :
```
Service runner-*-docker-0 probably didn't start properly.
mount: permission denied (are you root?)
Could not mount /sys/kernel/security.
```
**Cause** : Le runner `dev-serv-runner` utilise un executor Docker mais n'a pas le mode `privileged = true` necessaire pour Docker-in-Docker.
**Solution** : Abandon de dind. Utilisation du Docker socket du host (`/var/run/docker.sock`) monte dans le runner.
**Config runner** : `volumes = ["/var/run/docker.sock:/var/run/docker.sock", ...]`
**Commit** : `aca6a280` — `fix(ci) use Docker socket instead of dind and local images instead of registry`

---

## Erreur 4 — Registry GitLab inaccessible (timeout)

**Date** : 26 mars 2026 — Pipeline #2
**Erreur** :
```
Get "https://10.13.13.1:5050/v2/": net/http: request canceled while waiting for connection
```
**Cause** : Le port 5050 du registry GitLab est occupe par un autre service (`support-api`) sur le serveur. De plus, la tentative venait du conteneur dind qui n'avait pas demarre.
**Solution** : Abandon du registry. Les images sont buildees et stockees localement sur le serveur de staging (meme machine que le runner).
**Commit** : `aca6a280`

---

## Erreur 5 — Docker socket non monte dans le runner

**Date** : 26 mars 2026 — Pipeline #3
**Erreur** :
```
ERROR: Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```
**Cause** : La config du runner n'avait pas le Docker socket dans ses volumes.
**Solution** : Modification de `/opt/gitlab-runner/config/config.toml` pour ajouter `/var/run/docker.sock:/var/run/docker.sock` dans la liste `volumes`, puis restart du runner.
**Lecon** : C'est un one-time setup du runner, comme installer Docker.

---

## Erreur 6 — Image docker/compose:2.24.0 introuvable

**Date** : 26 mars 2026 — Pipeline #5
**Erreur** :
```
manifest for docker/compose:2.24.0 not found: manifest unknown
```
**Cause** : L'image `docker/compose` n'est plus publiee sur Docker Hub. Docker Compose v2 est un plugin CLI, pas une image.
**Solution** : Utilisation de l'image `docker:24` avec installation du plugin `docker-cli-compose` via `apk add`.
**Commit** : `e500d232` — `fix(ci) fix deploy image and env generation`

---

## Erreur 7 — Port 80 deja occupe

**Date** : 26 mars 2026 — Pipeline #6
**Erreur** :
```
failed to bind host port 0.0.0.0:80/tcp: address already in use
```
**Cause** : Le nginx natif du serveur utilise deja le port 80 pour les autres applications (ERPNext, Eshu, etc.).
**Solution** : nginx-proxy Docker ecoute sur les ports 8880 (HTTP) et 8443 (HTTPS). Un fichier `nginx-host-proxy.conf` configure le nginx natif pour proxier les challenges ACME.
**Commit** : `207b11b9` — `fix(staging) use port 8443 for HTTPS to coexist with existing nginx on 80/443`

---

## Erreur 8 — Variable CI PROJECT_DIR non resolue

**Date** : 26 mars 2026 — Pipeline #7
**Erreur** :
```
cp: can't create '/docker/auth/realm.json': No such file or directory
```
**Cause** : La variable `PROJECT_DIR` definie dans la section `variables:` du YAML n'etait pas resolue dans le contexte du script. Le chemin devenait `/docker/auth/` au lieu de `/home/ogu/.../docker/auth/`.
**Solution** : Utilisation de `export` dans le script au lieu de la section `variables:` YAML.
**Commit** : `c54181ed` — `fix(ci) use export for host paths instead of CI variables`

---

## Erreur 9 — git fetch echoue (Host key verification)

**Date** : 26 mars 2026 — Pipeline #8
**Erreur** :
```
Host key verification failed.
fatal: Could not read from remote repository.
```
**Cause** : Le container CI tentait un `git fetch origin` mais n'avait pas les cles SSH pour acceder au repo GitHub.
**Solution** : Abandon du `git fetch` dans le CI. Les fichiers sont copies directement du workspace CI vers le repertoire host via `cp`.
**Commit** : `c54181ed`

---

## Erreur 10 — Reseau staging-app non trouve (external)

**Date** : 26 mars 2026 — Pipeline #9 et #10
**Erreur** :
```
network staging-app declared as external, but could not be found
```
**Cause** : `compose.keycloak.yaml` declarait `staging-app` comme `external: true`, ce qui signifie "ce reseau doit deja exister". Mais `compose.yaml` qui le cree est lance apres. Et `docker network create staging-app` dans le CI ne fonctionnait pas correctement.
**Solution** : Remplacement de `external: true` par `name: staging-app` dans `compose.keycloak.yaml`. Ainsi chaque compose file peut creer le reseau s'il n'existe pas.
**Commit** : `13867d49` — `fix(ci) auto-create staging-app network via compose`

---

## Erreur 11 — Port 80 deja occupe par nginx natif

**Date** : 26 mars 2026 — Pipeline #6
**Erreur** :
```
failed to bind host port 0.0.0.0:80/tcp: address already in use
```
**Cause** : Le nginx natif du serveur utilise les ports 80/443 pour ERPNext, Eshu, Traccar, etc.
**Solution** : nginx-proxy Docker ecoute sur 8880 (HTTP) et 8443 (HTTPS). Fichier `nginx-host-proxy.conf` installe dans le nginx natif pour proxier les challenges ACME.
**Commit** : `207b11b9`

---

## Erreur 12 — Keycloak KC_HOSTNAME double https:// et port

**Date** : 26 mars 2026
**Erreur** : `GET https://https//aiobi-meet.duckdns.org:8443:8443/js/keycloak.js net::ERR_NAME_NOT_RESOLVED`
**Cause** : `KC_HOSTNAME=https://${MEET_HOST}:8443` — Keycloak ajoutait le schema lui-meme, ce qui doublait le `https://`.
**Solution** : Utiliser `KC_HOSTNAME_URL=https://${MEET_HOST}:8443` et `KC_HOSTNAME_ADMIN_URL` pour Keycloak 20.x.
**Commit** : `518df9ef` puis `efd689e4`

---

## Erreur 13 — Django admin intercepte /admin/master/console/

**Date** : 26 mars 2026
**Erreur** : L'URL `/admin/master/console/` affichait "Administration de Django" au lieu de Keycloak admin.
**Cause** : Le `location /admin` dans nginx routait tout vers Django, y compris les paths Keycloak admin.
**Solution** : Ajout de `location /admin/master/` et `location /admin/realms/` avant `location /admin` pour router vers Keycloak en priorite.
**Commit** : `8e8ad5ed`

---

## Erreur 14 — KEYCLOAK_ADMIN vs KC_BOOTSTRAP_ADMIN (Keycloak 20.x)

**Date** : 26 mars 2026
**Erreur** : Login admin Keycloak echoue avec "Invalid credentials".
**Cause** : Keycloak 20.0.1 utilise `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`, pas `KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD` (introduit en KC 21+).
**Solution** : Mapper les variables dans `env.d/keycloak` : `KEYCLOAK_ADMIN=${KC_BOOTSTRAP_ADMIN_USERNAME}`.
**Commit** : `999c71c6`

---

## Erreur 15 — Client OIDC secret mismatch

**Date** : 26 mars 2026
**Erreur** : OIDC login echoue — `invalid_client` ou `redirect_uri` invalide.
**Cause** : Le `realm.json` importe le secret `ThisIsAnExampleKeyForDevPurposeOnly` mais le backend utilise la valeur de `OIDC_RP_CLIENT_SECRET` du `.env`.
**Solution** : Mise a jour du secret via l'API REST Keycloak admin (curl PUT sur `/admin/realms/meet/clients/{id}`).

---

## Erreur 16 — Mixed Content bloque Keycloak admin console

**Date** : 26 mars 2026
**Erreur** : `Mixed Content: loaded over HTTPS, but requested insecure XMLHttpRequest endpoint http://aiobi-meet.duckdns.org:8083/admin/realms/`
**Cause** : Keycloak fait des appels internes via HTTP que le navigateur bloque en contexte HTTPS.
**Solution** : Configuration du client via l'API REST Keycloak (`curl` en interne via `docker exec`) au lieu de l'interface web.

---

## Erreur 17 — Frontend 502 Bad Gateway (upstream meet_frontend)

**Date** : 26 mars 2026
**Erreur** : `502 Bad Gateway` sur toutes les pages.
**Cause** : Le `default.conf.template` definissait un upstream `frontend:8080` mais le template remplacait la config SPA originale qui ecoutait sur 8080. Le port 8080 n'existait plus.
**Solution** : Dual-server nginx config — un server sur 8080 (SPA statique) et un sur 8083 (reverse proxy). Le proxy route `/` vers `127.0.0.1:8080` (local).
**Commit** : `a3caf7c8`

---

## Erreur 18 — Backend SSL cert verify failed sur JWKS endpoint

**Date** : 26 mars 2026
**Erreur** :
```
SSLError(SSLCertVerificationError(1, '[SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed'))
HTTPSConnectionPool(host='aiobi-meet.duckdns.org', port=8443) /realms/meet/protocol/openid-connect/certs
```
**Cause** : Les endpoints OIDC serveur-a-serveur (JWKS, token, userinfo) utilisaient l'URL publique HTTPS. Le backend Django devait valider le certificat TLS via le reseau externe, ce qui echouait avec les certificats de test Let's Encrypt.
**Solution** : Passer les 3 endpoints serveur-a-serveur en URL interne Docker (`http://keycloak:8080`). Seuls `authorization` et `logout` (appeles par le navigateur) restent en HTTPS publique.
**Commit** : `16910b93`

---

## Erreur 19 — Logout "Invalid redirect uri"

**Date** : 26 mars 2026
**Erreur** : Keycloak affiche "We are sorry... Invalid redirect uri" lors du logout.
**Cause** : Le client Keycloak n'avait pas les URLs de staging dans `post.logout.redirect.uris`. Seules les URLs localhost etaient configurees.
**Solution** : Ajout de `https://aiobi-meet.duckdns.org:8443/*` et `https://meet.aiobi.world/*` via l'API REST Keycloak et dans `realm.json`.
**Commit** : `16910b93`

---

## Erreur 20 — Logout 502 "upstream sent too big header" (double proxy)

**Date** : 26 mars 2026
**Erreur** : `upstream sent too big header while reading response header from upstream` dans nginx-proxy.
**Cause** : L'URL de logout contient un `id_token_hint` JWT (~2KB). Le flux traverse 2 proxys : nginx-proxy (port 8443) → frontend nginx (port 8083) → keycloak. Les buffers par defaut (4K) etaient trop petits aux **deux** niveaux.
**Solution** :
- `default.conf.template` : ajout `proxy_buffer_size 16k` dans le server block 8083
- `vhost.d/aiobi-meet.duckdns.org` : config custom pour nginx-proxy avec buffers 16k
- Mount du fichier vhost dans `compose.nginx-proxy.yaml`
**Commit** : `640e3051` (frontend) + commit courant (nginx-proxy)

---

## Erreur 21 — Docker build cache sert les anciens assets

**Date** : 26 mars 2026
**Erreur** : Apres mise a jour du logo et des favicons, l'image Docker frontend servait toujours les anciens fichiers.
**Cause** : `docker build` sans `--no-cache` reutilise les layers en cache. Les fichiers COPY ne sont pas detectes comme changes si le layer hash ne change pas.
**Solution** : Ajout de `--no-cache` aux commandes `docker build` dans `.gitlab-ci.yml`.
**Commit** : `2dc8ce61`

---

## Erreur 22 — Docker API version mismatch (docker:24 trop ancien)

**Date** : 26 mars 2026
**Erreur** :
```
Error: client version 1.43 is too old. Minimum supported API version is 1.44
```
**Cause** : L'image `docker:24` dans la CI utilise l'API Docker 1.43. Le daemon du serveur (Docker 29.2.1) requiert minimum API 1.44.
**Solution** : Passage de `docker:24` a `docker:27` dans `.gitlab-ci.yml`.
**Commit** : `adefd0d9`

---

## Erreur 23 — TLS symlinks manquants apres deploy

**Date** : 26 mars 2026
**Erreur** : `ERR_SSL_UNRECOGNIZED_NAME_ALERT` — le site est inaccessible en HTTPS.
**Cause** : nginx-proxy utilise des symlinks (`.crt`, `.key`) au niveau racine de `/etc/nginx/certs/`. Les vrais certificats existaient dans les sous-dossiers mais les symlinks n'etaient pas recrees apres un redeploy. De plus, acme-companion ne regenerait pas les symlinks car "Contents did not change".
**Solution** : Ajout d'une etape post-deploy dans la CI qui :
1. Verifie l'existence des fichiers fullchain.pem
2. Cree/repare systematiquement les symlinks `.crt`, `.key`, `.chain.pem`
3. Supprime les dossiers `_test_*` residuels
4. Si aucun cert n'existe, force un restart d'acme-companion
5. Reload nginx-proxy apres correction

---

## Erreur 24 — LIVEKIT_API_URL sans port 8443

**Date** : 26 mars 2026
**Erreur** : `ERR_CONNECTION_REFUSED` lors de la connexion WebSocket a LiveKit.
**Cause** : `LIVEKIT_API_URL=https://aiobi-livekit.duckdns.org` (port 443 implicite). nginx-proxy ecoute sur 8443, pas 443. Le navigateur se connectait au mauvais port.
**Solution** : Ajout du port dans `env.d/common` : `LIVEKIT_API_URL=https://${LIVEKIT_HOST}:8443`.
**Commit** : `649740bc`

---

## Erreur 25 — Logo SVG invisible dans le header

**Date** : 26 mars 2026
**Erreur** : Le logo n'apparait pas du tout dans le header malgre le bon fichier SVG.
**Cause** : Le SVG du designer n'avait pas d'attributs `width` et `height`, seulement `viewBox`. Avec `maxWidth` en CSS sur un `<img>`, le navigateur ne connait pas les dimensions intrinseques et rend l'image a 0px.
**Solution** : Ajout de `width="1420" height="476"` dans le tag `<svg>` du logo.
**Commit** : `649740bc`

---

## Erreur 26 — LiveKit "invalid token: error in cryptographic primitive"

**Date** : 26 mars 2026
**Erreur** : `ConnectionError: invalid token` lors de la connexion a une salle LiveKit.
**Cause** : Le fichier `livekit-server.yaml` contenait `${LIVEKIT_API_SECRET}` comme secret. LiveKit ne fait pas de substitution de variables d'environnement dans son YAML — il lisait la chaine litterale `${LIVEKIT_API_SECRET}` comme secret. Le backend signait les tokens avec le vrai secret → mismatch.
**Solution** : Le fichier YAML est monte comme template (`/config.template.yaml`). Un entrypoint `envsubst` resout les variables au demarrage du conteneur, puis `exec livekit-server` lance avec le fichier resolu. L'env var `LIVEKIT_API_SECRET` est passee au conteneur via le compose.
**Commit** : `4cf61168`

---

## Erreur 27 — DuckDNS non actualise (ERR_NAME_NOT_RESOLVED)

**Date** : 26 mars 2026
**Erreur** : `ERR_NAME_NOT_RESOLVED` pour `aiobi-livekit.duckdns.org`.
**Cause** : Le script `duckdns-update.sh` existait mais n'etait pas installe dans le crontab. L'IP du serveur n'etait plus a jour chez DuckDNS.
**Solution** : La pipeline CI/CD installe automatiquement le cron (`*/5 * * * *`) et execute une mise a jour immediate lors de chaque deploy.

---

## Erreur 28 — LiveKit entrypoint "livekit-server: not found"

**Date** : 26 mars 2026
**Erreur** : `exec: line 2: livekit-server: not found` — conteneur en restart loop (exit 127).
**Cause** : L'image `livekit/livekit-server` est minimaliste (scratch/distroless). Le binaire est a `/livekit-server` (racine), pas dans le PATH. De plus, `envsubst` et `apk` n'existent pas dans l'image.
**Solution** : Chemin absolu `/livekit-server` et remplacement de `envsubst` par `sed` avec un placeholder `__LIVEKIT_API_SECRET__` dans le template YAML.
**Commit** : `2b0d2f54`

---

## Erreur 29 — sed shell escaping corrompt le secret LiveKit

**Date** : 26 mars 2026
**Erreur** : Le secret resolu dans LiveKit (`qG1V8cph...`) ne matchait pas le `.env` (`hxzc1kNc...`).
**Cause** : Le pattern `${LIVEKIT_API_SECRET}` dans le template YAML se melangeait avec l'expansion shell dans la commande `sed`. Les `$` etaient interpretes avant que sed ne les voie.
**Solution** : Utiliser un placeholder plain text `__LIVEKIT_API_SECRET__` sans caracteres speciaux shell. Le `sed` remplace simplement le texte sans ambiguite.
**Commit** : `c0ea5d77`

---

## Erreur 30 — Variable GitLab CI override le .env du serveur

**Date** : 26 mars 2026
**Erreur** : Le secret LiveKit dans le conteneur etait different de celui dans le `.env`. Le backend et LiveKit avaient des secrets differents → `invalid token`.
**Cause** : Les variables CI/CD GitLab sont injectees dans l'environnement du job. `docker compose up` herite de ces variables, qui prennent priorite sur le `.env`. La variable `LIVEKIT_API_SECRET` dans GitLab avait une valeur differente de celle du `.env`.
**Solution** : Mise a jour de la variable `LIVEKIT_API_SECRET` dans GitLab CI/CD Variables pour matcher la valeur du `.env` du serveur.

---

## Fix — Permission camera "loading" infini sur certains navigateurs

**Date** : 26 mars 2026
**Symptome** : L'ecran pre-join affiche "La camera va demarrer..." indefiniment au lieu du message "Autorisez l'acces a la camera et au micro".
**Cause** : Firefox ne supporte pas `navigator.permissions.query({ name: 'camera' })`. L'appel throw une erreur, mais le catch ne mettait pas les permissions a un etat valide — elles restaient `undefined`. L'UI ne detectait ni `denied` ni `prompt` et tombait dans le cas `cameraStarting`.
**Solution** : Dans le catch de `useWatchPermissions.ts`, si les permissions sont `undefined` apres erreur, les mettre a `prompt`. L'UI affiche alors le message d'autorisation avec le bouton.
**Commit** : `4562cf65`

---

## Etat actuel (27 mars 2026, 00h)

**Pipeline CI/CD** : docker:27, --no-cache, deploy robuste (TLS check, DuckDNS cron, LiveKit sed)
**nginx-proxy** : Ports 8880/8443, vrais certificats Let's Encrypt R12, buffers 16k via vhost.d
**Keycloak** : Realm "meet", locale FR uniquement, OIDC client avec post_logout_redirect_uris
**Backend Django** : Healthy, endpoints OIDC internes (http://keycloak:8080), migrations auto
**Frontend** : Logo designer (Aiobi Meet SVG), favicons Aiobi-head, lang="fr", permissions fix
**LiveKit** : Secret resolu via sed + placeholder, WebRTC connecte, audio/video fonctionnels
**OIDC** : Login OK, logout OK (buffers 16k double proxy)
**DuckDNS** : Cron automatique toutes les 5 minutes
**Visioconference** : Testee et fonctionnelle (connexion WebRTC, publication audio/video)

---

## Erreur 31 — faster-whisper-server image tag inexistant

**Date** : 1 avril 2026
**Erreur** : `docker pull fedirz/faster-whisper-server:latest` → manifest unknown
**Cause** : Docker Hub n'a que les tags `:latest-cpu` et `:latest-cuda` pour cette image.
**Solution** : Utiliser `fedirz/faster-whisper-server:latest-cpu`.
**Commit** : `40bc2d79`

---

## Erreur 32 — WHISPERX_ALLOWED_LANGUAGES parsing pydantic

**Date** : 1 avril 2026
**Erreur** : `error parsing value for field 'whisperx_allowed_languages' from source 'EnvSettingsSource'`
**Cause** : pydantic-settings attend un JSON array, pas une string comma-separated (`en,fr`).
**Solution** : Changer `en,fr` en `["en","fr"]` dans `env.d/summary`.
**Commit** : `b4dbda09`

---

## Erreur 33 — LiveKit Egress permission denied sur config

**Date** : 1 avril 2026
**Erreur** : `cannot create /egress-config.yaml: Permission denied` + `exec: /egress: not found`
**Cause** : L'image egress a un entrypoint fixe. Tenter un entrypoint custom avec sed echoue.
**Solution** : Injecter les secrets via CI sed avant le deploy, monter le fichier en read-only.
**Commit** : `b4dbda09`

---

## Erreur 34 — Webhooks LiveKit 400 (ALLOWED_HOSTS)

**Date** : 5 avril 2026
**Erreur** : Tous les webhooks LiveKit retournent **400** — reponse HTML Django (pas JSON DRF).
**Cause** : LiveKit envoie les webhooks a `http://backend:8000`. Le hostname `backend` n'est pas dans `DJANGO_ALLOWED_HOSTS` → Django rejette avec `DisallowedHost`.
**Diagnostic** : Le 400 etait une erreur Django (HTML), pas notre code webhook. Le fix Bearer token (erreur 36) etait correct mais en amont de ce probleme.
**Solution** : Ajouter `backend` dans `DJANGO_ALLOWED_HOSTS` : `DJANGO_ALLOWED_HOSTS=${MEET_HOST},backend`.
**Commit** : `91cad120`

---

## Erreur 35 — Webhooks LiveKit 301 (SECURE_SSL_REDIRECT)

**Date** : 5 avril 2026
**Erreur** : Apres fix ALLOWED_HOSTS, les webhooks retournent **301** au lieu de 200.
**Cause** : `SECURE_SSL_REDIRECT=True` redirige toute requete HTTP vers HTTPS. Les appels Docker internes (LiveKit, MinIO, summary) arrivent en HTTP → redirect infini.
**Solution** : Ajouter les URLs internes a `SECURE_REDIRECT_EXEMPT` dans `settings.py` :
```python
SECURE_REDIRECT_EXEMPT = [
    "^__lbheartbeat__",
    "^__heartbeat__",
    r"^api/v1\.0/rooms/webhooks-livekit/",
    r"^api/v1\.0/recordings/",
]
```
**Commit** : `91cad120`

---

## Erreur 36 — Bearer prefix dans le token LiveKit

**Date** : 4 avril 2026
**Erreur** : `jwt.decode()` echoue avec "Invalid header padding".
**Cause** : LiveKit server v1.8+ envoie `Authorization: Bearer <jwt>` mais `TokenVerifier.verify()` attend le JWT brut sans prefixe.
**Solution** : Strip du prefixe `Bearer ` avant verification dans `livekit_events.py`.
**Commit** : `c28dbbeb`

---

## Erreur 37 — DRF authentication 401 sur webhook

**Date** : 5 avril 2026
**Erreur** : Webhook retourne **401** "Token verification failed".
**Cause** : `webhooks_livekit` avait `permission_classes=[]` mais pas `authentication_classes=[]`. DRF tentait d'interpreter le Bearer token LiveKit comme un token utilisateur Django.
**Solution** : Ajouter `authentication_classes=[]` au decorateur de l'action.
**Commit** : `894cf402`

---

## Erreur 38 — Download recording 404 (media-auth mauvais endpoint)

**Date** : 5 avril 2026
**Erreur** : `GET /api/v1.0/files/media-auth/` retourne **404**.
**Cause** : Le nginx routait `/media-auth` vers `files/media-auth` (FileViewSet, gate par feature flag `file_upload`) au lieu de `recordings/media-auth` (RecordingViewSet, pas de gate).
**Solution** : Ajout d'un location nginx separe `/media/recordings/` avec auth vers `/recording-media-auth` → `recordings/media-auth`.
**Commit** : `d8158318`

---

## Erreur 39 — Download recording 403 (X-Original-URL manquant)

**Date** : 5 avril 2026
**Erreur** : Backend retourne **403** "Missing HTTP_X_ORIGINAL_URL header".
**Cause** : `_auth_get_original_url()` lit le header `X-Original-URL` que nginx doit transmettre. Notre config ne l'envoyait pas.
**Solution** : Ajout de `proxy_set_header X-Original-URL $request_uri` dans `/recording-media-auth`.
**Commit** : `d8158318`

---

## Erreur 40 — Download recording 403 (MinIO rejette sans S3 auth)

**Date** : 5 avril 2026
**Erreur** : Backend retourne 200 pour l'auth mais MinIO retourne **403** pour le fichier.
**Cause** : Le backend genere des headers S3 SigV4 (`Authorization`, `X-Amz-Date`, `X-Amz-Content-SHA256`) dans la reponse auth. Nginx ne les transmettait pas a MinIO.
**Solution** : Utilisation de `auth_request_set` pour capturer les headers de la reponse auth et `proxy_set_header` pour les transmettre a MinIO :
```nginx
auth_request_set $s3_auth $upstream_http_authorization;
auth_request_set $s3_date $upstream_http_x_amz_date;
auth_request_set $s3_sha  $upstream_http_x_amz_content_sha256;
proxy_set_header Authorization $s3_auth;
proxy_set_header X-Amz-Date $s3_date;
proxy_set_header X-Amz-Content-SHA256 $s3_sha;
```
**Commit** : `d8158318`

---

## Erreur 41 — Summary service SSLError sur callback backend

**Date** : 5 avril 2026
**Erreur** : `SSLError: HTTPSConnectionPool(host='backend', port=8000)` dans celery-transcribe.
**Cause** : Deux problemes combines :
1. `webhook_service.py` ne montait le retry adapter que sur `https://`, pas `http://`
2. `SECURE_SSL_REDIRECT` redigeait le POST HTTP vers HTTPS → requests suivait la redirection vers un port HTTP en HTTPS
**Solution** : (a) Monter l'adapter sur `http://` aussi. (b) Exempter `/api/v1.0/recordings/` du SSL redirect.
**Commit** : `d8158318`

---

## Erreur 42 — Transcription vide "Aucun contenu audio detecte"

**Date** : 5 avril 2026
**Erreur** : Toutes les transcriptions affichent "Aucun contenu audio n'a ete detecte" malgre audio audible.
**Cause** : `faster-whisper-server` retourne un objet `Transcription` avec `.text` (texte brut). Le code cherchait `.segments` (format verbose_json avec speaker labels) → None → message "vide".
**Diagnostic** : Test manuel confirme que Whisper transcrit correctement ("Ok. La, on va faire un test rapide pour voir si l'enregistrement et puis la transcription fonctionnent...").
**Solution** : Ajout d'un fallback dans `transcript_formatter.py` : si `segments` absent, utiliser `transcription.text`.
**Commit** : `ac8cf387`

---

## Erreur 43 — Pas de timestamps dans la transcription

**Date** : 5 avril 2026
**Contexte** : Enhancement, pas un bug.
**Cause** : L'API Whisper en mode defaut retourne du texte brut sans timing.
**Solution** : Ajout de `response_format="verbose_json"` a l'appel Whisper. Retourne des segments avec `.start` et `.end`. Formatte en `[MM:SS]` par segment.
**Commit** : `8ffaec3f`

---

## Etat actuel (5 avril 2026)

**Recording pipeline** : LiveKit Egress → MinIO upload → backend webhook → tout en 200
**Transcription pipeline** : Summary service → Whisper (faster-whisper large-v3 CPU) → MinIO → backend webhook → email notification
**Download** : nginx auth subrequest → S3 SigV4 headers → MinIO proxy → fichier servi
**Emails** : Templates francais (transcription + recording), signature alignee a droite
**Timestamps** : `[MM:SS]` par segment dans les transcriptions

### Decision strategique — Approche B (LLM centralise)

**Date** : 5 avril 2026
**Decision** : On passe directement sur l'Approche B (LLM centralise multi-applications) au lieu de l'Approche A (Docker Model Runner par app).
**Modele** : Gemma 4 31B (~19 GB RAM Q4) — licence Apache 2.0 (changement vs Gemma 1-3 qui avaient des restrictions), plus leger que Qwen 3 32B, meilleur raisonnement.
**Runtime** : Ollama (mode serveur permanent, file de requetes concurrentes) — pas Docker Model Runner (concu pour du charge/decharge idle).
**Raison** : L'ecosysteme Aiobi (Meet, ERP futur, Mail futur) necessitera un LLM partage. Autant poser l'infra des maintenant plutot que de migrer plus tard.

### Ce qui reste

1. Deployer via CI (tous les fixes sont commites et pushes)
2. Tester le flow complet post-deploiement (record → transcription → download)
3. Phase 2 — LLM summarization (Gemma 4 31B via Ollama, service centralise)
4. Speaker diarization (pyannote, si besoin futur)
