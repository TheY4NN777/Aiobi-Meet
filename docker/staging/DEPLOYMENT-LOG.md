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

## Etat actuel (26 mars 2026, 15h)

**Pipeline CI/CD** : Vert (build backend + frontend + deploy)
**nginx-proxy** : Fonctionnel (ports 8880/8443, certificats Let's Encrypt test)
**Keycloak** : Fonctionnel, realm "meet" importe, client OIDC configure
**Backend Django** : Fonctionnel (healthy), migrations appliquees
**Frontend** : Fonctionnel, SPA charge sur `https://aiobi-meet.duckdns.org:8443`
**OIDC** : Client secret synchronise, redirect URIs configures

### Ce qui reste

1. Passer en vrais certificats TLS (`LETSENCRYPT_TEST=false`)
2. Configurer le cron DuckDNS
3. Tester le flux complet : login OIDC → creation de salle → visioconference
4. Tester LiveKit (WebRTC) via `aiobi-livekit.duckdns.org:8443`
