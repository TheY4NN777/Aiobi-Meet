# Aiobi Meet — Production Deployment Log

> Ce fichier documente les erreurs rencontrees et les corrections apportees
> lors du deploiement en production sur `meet.aiobi.world`.
> Serveur : **Aiobi Master** (207.180.255.229) — Contabo — 1.8 TB SSD / 251 GB RAM / 20 cores
> Docker Engine v29.3.0

---

## Erreur 1 — Runner execute le mauvais runner (bbs-master-runner)

**Date** : 30 mars 2026
**Erreur** : Le pipeline CI/CD s'execute sur `bbs-master-runner` au lieu de `aiobi-master-prod`.
**Cause** : Les deux runners etaient enregistres avec les memes tags `prod, docker`. GitLab assigne le premier runner disponible qui matche les tags, sans distinction de projet.
**Solution** : Changement du tag en `aiobi-prod` dans la configuration du runner (`/etc/gitlab-runner/config.toml`) et dans `.gitlab-ci.yml`. Le runner `aiobi-master-prod` est desormais le seul a matcher le tag `aiobi-prod`.

---

## Erreur 2 — Runner ne peut pas cloner le repo (10.13.13.1:8929 inatteignable)

**Date** : 30 mars 2026
**Erreur** :
```
fatal: unable to access 'http://10.13.13.1:8929/theY4NN/AiobiMeet.git/': Failed to connect to 10.13.13.1 port 8929
```
**Cause** : Le runner etait enregistre avec l'IP VPN `10.13.13.1`, mais le conteneur Docker du runner n'a pas acces au reseau VPN. L'IP `10.13.13.1` est inatteignable depuis l'interieur du conteneur.
**Tentative 1** : Changement de `url` et `clone_url` vers `127.0.0.1:8929` dans `config.toml`. Mais le conteneur runner utilise son propre namespace reseau — `127.0.0.1` pointe vers le conteneur lui-meme, pas vers le host.
**Tentative 2** : Changement vers `172.17.0.1` (bridge Docker). Mais GitLab n'ecoute pas sur cette interface.
**Solution finale** : Configuration de `network_mode = "host"` dans `config.toml` pour que le conteneur runner partage le namespace reseau du host. Avec cette configuration, `127.0.0.1:8929` atteint bien le GitLab local.

```toml
# /etc/gitlab-runner/config.toml
[runners.docker]
  network_mode = "host"
```
```toml
url = "http://127.0.0.1:8929"
clone_url = "http://127.0.0.1:8929"
```

---

## Erreur 3 — Docker login au registry echoue (HTTPS sur registry HTTP)

**Date** : 30 mars 2026
**Erreur** :
```
http: server gave HTTP response to HTTPS client
```
Le `docker login 10.13.13.1:5050` echoue lors de l'etape de push des images.
**Cause** : Le GitLab Container Registry (port 5050) ecoute en HTTP. Le client Docker tente une connexion HTTPS par defaut vers tout registry non-Docker Hub.
**Solution** : Ajout du registry dans la liste des registries non securises dans `/etc/docker/daemon.json` :
```json
{
  "insecure-registries": ["10.13.13.1:5050"]
}
```
**Impact** : La modification de `daemon.json` necessite un redemarrage du daemon Docker (`systemctl restart docker`), ce qui arrete temporairement **tous** les conteneurs en cours d'execution sur le serveur (GitLab, Traefik, les autres services).

---

## Erreur 4 — Traefik API version mismatch (client 1.24 trop ancien)

**Date** : 31 mars 2026
**Erreur** :
```
client version 1.24 is too old. Minimum supported API version is 1.40
```
Traefik ne demarre plus apres le redemarrage de Docker.
**Cause** : Le redemarrage du daemon Docker (pour l'erreur 3) a mis a jour l'API Docker vers la version 1.54 (Docker Engine v29.3.0). Traefik v3.3 embarquait un client Docker trop ancien (API 1.24) qui n'est plus compatible avec cette version du daemon.
**Solution** : Mise a jour de Traefik de v3.3 vers v3.6 dans `/opt/aiobi/docker-compose.yml`. La version 3.6 embarque un client Docker compatible avec l'API 1.40+.
```yaml
# /opt/aiobi/docker-compose.yml
services:
  traefik:
    image: traefik:v3.6
    environment:
      - DOCKER_API_VERSION=1.45  # securite supplementaire, pas strictement necessaire avec v3.6
```

---

## Erreur 5 — Traefik ne peut pas atteindre Let's Encrypt (iptables)

**Date** : 31 mars 2026
**Erreur** :
```
dial tcp 172.65.32.248:443: i/o timeout
```
Traefik echoue a obtenir les certificats TLS via ACME (Let's Encrypt).
**Cause** : La configuration `"iptables": false` dans `daemon.json` empeche Docker de gerer automatiquement les regles iptables. Le redemarrage du daemon Docker a perdu les regles iptables manuelles qui existaient pour les reseaux custom. Les conteneurs sur le reseau `aiobi-public` (subnet `172.18.0.0/16`) n'ont plus acces a Internet.
**Solution** : Ajout manuel des regles iptables pour le reseau Docker `aiobi-public` :
```bash
# Autoriser le trafic entrant et sortant du reseau aiobi-public
iptables -I DOCKER-USER -s 172.18.0.0/16 -j ACCEPT
iptables -I DOCKER-USER -d 172.18.0.0/16 -j ACCEPT

# NAT pour l'acces Internet sortant
iptables -t nat -A POSTROUTING -s 172.18.0.0/16 ! -o docker0 -j MASQUERADE
```
Persistance avec `iptables-persistent` :
```bash
apt install iptables-persistent
netfilter-persistent save
```

---

## Erreur 6 — KEYCLOAK_HOST vide a cause d'une typo dans GitLab

**Date** : 31 mars 2026
**Erreur** : Le fichier `.env` genere par la CI montre `KEYCLOAK_HOST=` (vide). Keycloak ne repond pas sur le bon domaine.
**Cause** : La variable dans GitLab CI/CD Variables etait nommee `KEYCLOACK_HOST` (avec un **C** en trop) au lieu de `KEYCLOAK_HOST`. Le script de generation du `.env` cherchait `KEYCLOAK_HOST` qui n'existait pas, d'ou la valeur vide.
**Solution** : Correction du nom de la variable dans GitLab UI : Settings > CI/CD > Variables > renommer `KEYCLOACK_HOST` en `KEYCLOAK_HOST`.

---

## Erreur 7 — realm.json monte comme repertoire (pas comme fichier)

**Date** : 31 mars 2026
**Erreur** : Keycloak affiche `Realm does not exist` au demarrage. Un `ls -la` dans le conteneur montre que `realm.json` est un **repertoire** vide au lieu d'un fichier.
**Cause** : Dans `compose.keycloak.yaml`, le volume bind mount utilisait le chemin `../../docker/auth/realm.json`. Depuis le repertoire de travail `/opt/aiobi-meet/production/`, `../../` remonte a `/opt/`, ce qui donne le chemin `/opt/docker/auth/realm.json`. Ce fichier n'existant pas sur le host, Docker cree automatiquement un **repertoire** vide a la place (comportement par defaut des bind mounts vers un chemin inexistant).
**Solution** :
- **Fix immediat** : Copie manuelle du fichier `realm.json` vers `/opt/docker/auth/realm.json` sur le serveur.
- **Fix definitif** : Correction du chemin dans `compose.keycloak.yaml` de `../../docker/auth/realm.json` vers `../docker/auth/realm.json` (a commiter).

---

## Erreur 8 — KC_HOSTNAME double https:// et port 8443

**Date** : 31 mars 2026
**Erreur** : L'endpoint OIDC retourne un issuer invalide :
```
issuer: https://https//id.aiobi.world:8443/realms/meet
```
Le navigateur tente de charger des ressources depuis une URL malformee.
**Cause** : La variable d'environnement etait configuree comme `KC_HOSTNAME=https://${KEYCLOAK_HOST}`. Or, Keycloak ajoute automatiquement le schema `https://` quand il construit ses URLs publiques. Le resultat est un doublement : `https://https//...`.
**Solution** : Remplacement par `KC_HOSTNAME_URL=https://${KEYCLOAK_HOST}` dans `env.d/keycloak`. La variable `KC_HOSTNAME_URL` (introduite dans Keycloak 20.x) prend l'URL complete sans que Keycloak ajoute le schema.

---

## Erreur 9 — Client OIDC secret mismatch

**Date** : 31 mars 2026
**Erreur** :
```
Invalid client or Invalid client credentials
```
Le backend Django recoit une erreur 500 lors de l'echange du code d'autorisation contre un token (`/token` endpoint).
**Cause** : Le fichier `realm.json` importe le realm avec le secret de developpement (`ThisIsAnExampleKeyForDevPurposeOnly`). Le backend Django utilise la valeur de la variable CI `OIDC_RP_CLIENT_SECRET` qui est differente. Les deux secrets ne correspondent pas, Keycloak refuse l'authentification du client.
**Solution** : Mise a jour du secret directement via l'API REST admin de Keycloak :
```bash
# Recuperer l'ID du client "meet"
CLIENT_ID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  http://keycloak:8080/admin/realms/meet/clients?clientId=meet \
  | jq -r '.[0].id')

# Mettre a jour le secret
curl -X PUT -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"secret": "<valeur-du-secret-CI>"}' \
  http://keycloak:8080/admin/realms/meet/clients/$CLIENT_ID
```

---

## Erreur 10 — Theme Keycloak non monte (meme probleme de chemin ../../)

**Date** : 31 mars 2026
**Erreur** : La page de login Keycloak affiche le theme par defaut (bleu Keycloak) au lieu du theme Aiobi.
**Cause** : Meme probleme que l'erreur 7 — le chemin `../../docker/keycloak/themes/aiobi/` dans le volume bind mount de `compose.keycloak.yaml` resout vers `/opt/docker/keycloak/themes/aiobi/` qui n'existe pas. Docker cree un repertoire vide.
**Solution** :
- **Fix immediat** : Copie manuelle du repertoire theme vers `/opt/docker/keycloak/themes/aiobi/` sur le serveur. Attention au double nesting avec `cp -r` (verifier que le contenu est directement dans `aiobi/` et non dans `aiobi/aiobi/`).
- **Fix definitif** : Correction du chemin dans `compose.keycloak.yaml` (meme commit que l'erreur 7).

---

## Erreur 11 — Frontend ecran blanc de 5 secondes au chargement

**Date** : 31 mars 2026
**Erreur** : A chaque chargement de page, l'utilisateur voit un ecran blanc pendant environ 5 secondes avant que l'interface ne s'affiche.
**Cause** : La variable `FRONTEND_IS_SILENT_LOGIN_ENABLED=True` (valeur par defaut) active le "silent login". Cette fonctionnalite effectue une redirection pleine page vers Keycloak dans un iframe invisible pour verifier si l'utilisateur a une session active. Le round-trip vers Keycloak (DNS + TLS + rendu) prend ~5 secondes avant que le frontend puisse enfin rendre la page.
**Solution** : Desactivation du silent login dans `env.d/common` :
```
FRONTEND_IS_SILENT_LOGIN_ENABLED=False
```
Le login se fait desormais uniquement quand l'utilisateur clique sur le bouton de connexion.

---

## Etat actuel (31 mars 2026)

| Composant | Statut |
|---|---|
| **Pipeline CI/CD** | Green — image `docker:27`, runner `aiobi-master-prod`, tag `aiobi-prod`, `network_mode: host` |
| **Traefik** | v3.6, routing OK, certificats TLS Let's Encrypt R12 |
| **Keycloak** | Realm `meet` importe, locale FR, client secret synchronise, theme Aiobi |
| **Backend Django** | Healthy, 6 workers Gunicorn, endpoints OIDC internes (`http://keycloak:8080`) |
| **Frontend** | Logo Aiobi Meet, `lang=fr`, silent login desactive |
| **LiveKit** | Running, signaling via Traefik OK, ports WebRTC ouverts |
| **DNS** | A records `meet.aiobi.world`, `id.aiobi.world`, `lkt.aiobi.world` → 207.180.255.229 |

### Modifications manuelles sur le serveur

1. `/etc/gitlab-runner/config.toml` — `url` + `clone_url` = `http://127.0.0.1:8929`, `network_mode = "host"`, tags `["aiobi-prod", "docker"]`
2. `/etc/docker/daemon.json` — `"insecure-registries": ["10.13.13.1:5050"]`
3. `/opt/aiobi/docker-compose.yml` — Traefik `v3.3` → `v3.6`, env `DOCKER_API_VERSION=1.45`
4. iptables (persiste via `iptables-persistent`) — DOCKER-USER ACCEPT + MASQUERADE pour `172.18.0.0/16`
5. `/opt/docker/auth/realm.json` — Copie manuelle (fix interim pour le path `../../`)
6. `/opt/docker/keycloak/themes/aiobi/` — Copie manuelle (meme raison)

### Ce qui reste

1. Commiter et deployer le fix du chemin `../../` → `../` dans `compose.keycloak.yaml`
2. Commiter et deployer le fix `KC_HOSTNAME_URL` dans `env.d/keycloak`
3. Tester une visioconference complete (appel WebRTC multi-participants)
4. Configurer le buffer UDP : `net.core.rmem_max=5000000` (sysctl pour LiveKit)
5. Ajouter `post_logout_redirect_uris` pour la production dans `realm.json`
