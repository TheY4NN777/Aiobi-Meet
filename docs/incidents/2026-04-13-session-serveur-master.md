# RAPPORT DE SESSION SERVEUR

**Aiobi Master Server — Diagnostic et correction reseau production**
**13 avril 2026**

---

## I. Informations de session

| | |
|---|---|
| **Serveur** | Aiobi Master (207.180.255.229) |
| **Date** | 13 avril 2026 |
| **Duree** | ~2 heures |
| **User** | yanis_tmp (sudo temporaire via Teleport) |
| **Objectif** | Diagnostiquer et corriger le blocage reseau empechant les emails Django et la transcription IA en production |

---

## II. Contexte

Suite au deploiement production d'Aiobi Meet v1.0.0 (9 avril), les emails transactionnels Django (invitations, notifications enregistrement/transcription) et le service Whisper (transcription IA) etaient inoperants. Le diagnostic a distance via le debug job CI avait identifie `[Errno 101] Network unreachable` depuis le container backend et un crash en boucle de Whisper (34 restarts). L'hypothese initiale etait un probleme de regles iptables pour le reseau Docker `default`.

---

## III. Etat du serveur decouvert

### III.1 Containers en production

| Container | Statut | Reseau |
|-----------|--------|--------|
| production-backend-1 | UP (healthy) | default + prod-app |
| production-frontend-1 | UP | default + aiobi-public |
| production-keycloak-1 | UP | aiobi-public + prod-app |
| production-livekit-1 | UP | default + aiobi-public |
| production-livekit-egress-1 | UP | default |
| production-summary-1 | UP | default |
| production-celery-transcribe-1 | UP | default |
| production-celery-summarize-1 | UP | default |
| production-whisper-1 | 34 restarts | default |
| production-minio-1 | UP (healthy) | default |
| production-postgresql-1 | UP (healthy) | default |
| production-redis-1 | UP | default |
| production-mailcatcher-1 | UP (inutile) | default |

### III.2 Reseaux Docker

| Reseau | Subnet | Acces Internet avant intervention |
|--------|--------|-----------------------------------|
| aiobi-public | 172.18.0.0/16 | Oui (regles iptables + MASQUERADE existantes) |
| prod-app | 172.21.0.0/16 | Non |
| production_default | 172.20.0.0/16 | Non |

### III.3 Regles firewall decouvertes

**UFW** : `Default: deny (incoming), allow (outgoing), deny (routed)`

Le forwarding (trafic route entre reseaux Docker et Internet) etait bloque par defaut par UFW. Seul le reseau `aiobi-public` (172.18.0.0/16) avait des regles dans DOCKER-USER et POSTROUTING pour contourner cette restriction.

**Doublons** : 7 paires de regles DOCKER-USER et 4 regles MASQUERADE identiques pour 172.18.0.0/16, ajoutees par les deploiements CI successifs sans verification d'existence.

---

## IV. Diagnostic

### IV.1 Test initial — DNS OK, TCP bloque

```
Backend DNS:    OK (smtp.gmail.com → 142.251.127.108)
Backend TCP:    TIMEOUT (smtp.gmail.com:465)
Keycloak TCP:   OK (0.006s vers smtp.gmail.com:465)
```

Le DNS resout correctement depuis le backend (Docker utilise un resolveur DNS interne 127.0.0.11). Mais les connexions TCP sortantes sont bloquees.

### IV.2 Hypothese 1 — Regles iptables manquantes pour 172.20.0.0/16

Ajout de regles DOCKER-USER, FORWARD et MASQUERADE pour le reseau `production_default` (172.20.0.0/16). Resultat : **toujours bloque** meme apres restart du backend.

### IV.3 Hypothese 2 — UFW bloque le forwarding

Ajout de regles `ufw route allow` pour 172.20.0.0/16. Resultat : **toujours bloque**. Les regles UFW s'ajoutent dans `ufw-user-forward` mais le trafic est deja DROP par la policy `deny (routed)` via d'autres chaines UFW.

### IV.4 Hypothese 3 — Mauvais reseau

Ajout de regles FORWARD directes (bypass UFW) pour 172.20.0.0/16. Resultat : **toujours bloque**. Tcpdump sur le bridge `br-b765421b8e00` ne montre **aucun paquet** sortant du container.

### IV.5 Decouverte de la cause racine

Inspection des routes du container backend :
```
default via 172.21.0.1 dev eth0        ← route par defaut = prod-app
172.20.0.0/16 dev eth1 scope link      ← production_default
172.21.0.0/16 dev eth0 scope link      ← prod-app
```

Le backend est connecte a **deux reseaux** (default + prod-app). Sa route par defaut passe par `172.21.0.0/16` (prod-app), pas par `172.20.0.0/16` (default). Toutes les regles appliquees pour 172.20 etaient sans effet car le trafic sortait par 172.21.

---

## V. Actions realisees

| # | Action | Statut | Commande |
|---|--------|--------|----------|
| 1 | Regle UFW : forwarding SMTP depuis 172.21.0.0/16 | OK | `ufw route allow from 172.21.0.0/16 to any port 465 proto tcp` |
| 2 | Regle UFW : forwarding HTTPS depuis 172.21.0.0/16 | OK | `ufw route allow from 172.21.0.0/16 to any port 443 proto tcp` |
| 3 | NAT MASQUERADE pour 172.21.0.0/16 | OK | `iptables -t nat -A POSTROUTING -s 172.21.0.0/16 ! -o docker0 -j MASQUERADE` |
| 4 | Cleanup : 12 regles DOCKER-USER doublons supprimees | OK | `iptables -D DOCKER-USER` (lignes 5-16 + 1-2) |
| 5 | Cleanup : 2 regles FORWARD manuelles supprimees | OK | `iptables -D FORWARD` (lignes 1-2) |
| 6 | Cleanup : 4 regles POSTROUTING doublons/inutiles supprimees | OK | `iptables -t nat -D POSTROUTING` (lignes 4-7) |
| 7 | Cleanup : 2 regles UFW pour 172.20 inutiles supprimees | OK | `ufw delete 22, 23` |
| 8 | Persistance des regles | OK | `netfilter-persistent save` |
| 9 | Restart Whisper (premier essai — toujours en crash, reseau default pas couvert) | OK | `docker restart production-whisper-1` |
| 10 | Regle UFW temporaire : forwarding HTTPS depuis 172.20.0.0/16 (reseau default, pour Whisper) | OK → supprimee | `ufw route allow from 172.20.0.0/16 to any port 443 proto tcp` |
| 11 | NAT MASQUERADE temporaire pour 172.20.0.0/16 | OK → supprimee | `iptables -t nat -A POSTROUTING -s 172.20.0.0/16 ! -o docker0 -j MASQUERADE` |
| 12 | Restart Whisper (deuxieme essai — succes, modele telecharge) | OK | `docker restart production-whisper-1` |
| 13 | Suppression regle UFW temporaire 172.20 | OK | `ufw delete 24` |
| 14 | Suppression MASQUERADE temporaire 172.20 | OK | `iptables -t nat -D POSTROUTING` |
| 15 | Persistance finale | OK | `netfilter-persistent save` |

---

## VI. Regles firewall ajoutees

| Regle | Type | Source | Port | Commentaire |
|-------|------|--------|------|-------------|
| ALLOW FWD | UFW route | 172.21.0.0/16 | 465/tcp | Docker-prod-app-SMTP |
| ALLOW FWD | UFW route | 172.21.0.0/16 | 443/tcp | Docker-prod-app-HTTPS |
| MASQUERADE | iptables nat | 172.21.0.0/16 | * | NAT sortant pour prod-app |

**Justification securite** : Seuls les ports 465 (SMTP) et 443 (HTTPS) sont autorises en forwarding depuis le reseau prod-app (172.21.0.0/16), pas tout le trafic. Le reseau production_default (172.20.0.0/16) n'a aucune regle permanente — une ouverture temporaire du port 443 a ete faite pour permettre a Whisper de telecharger le modele IA, puis immediatement supprimee. Le modele est desormais cache dans le volume Docker `whisper-models`.

---

## VII. Etat apres intervention

### VII.1 Tests de validation

| Test | Resultat |
|------|----------|
| DNS depuis backend (`smtp.gmail.com`) | OK (142.251.127.108) |
| TCP connect backend → smtp.gmail.com:465 | OK (0.05s) |
| SMTP login Gmail | OK (0.19s) |
| Envoi email complet | OK (0.68s total) |
| Whisper demarrage | OK — `Uvicorn running on http://0.0.0.0:8000` |
| Whisper modele telecharge | OK — via ouverture temporaire port 443 sur 172.20, supprimee apres |
| Debug job CI (validation complete) | OK — EMAIL SEND: OK, DNS 0.00s, TCP 0.05s |
| Cleanup users prod (gmail/yahoo → normal) | OK — seuls les company domains restent enterprise |

### VII.2 Etat firewall final

**DOCKER-USER** (propre) :
```
1  ACCEPT  0.0.0.0/0 → 172.18.0.0/16
2  ACCEPT  172.18.0.0/16 → 0.0.0.0/0
```

**POSTROUTING** (propre) :
```
1  MASQUERADE  172.17.0.0/16  (docker bridge)
2  MASQUERADE  0.0.0.0/0      (global)
3  MASQUERADE  172.18.0.0/16  (aiobi-public)
4  MASQUERADE  172.21.0.0/16  (prod-app)
```

**UFW FWD** (propre) :
```
[22] 465/tcp  ALLOW FWD  172.21.0.0/16  # Docker-prod-app-SMTP
[23] 443/tcp  ALLOW FWD  172.21.0.0/16  # Docker-prod-app-HTTPS
```

---

## VIII. Points d'attention pour l'equipe

1. **Les regles iptables DOCKER-USER sont volatiles** — Docker peut les reinitialiser au restart du daemon. Les regles UFW et MASQUERADE persistees via `netfilter-persistent` survivent aux reboots.

2. **La CI staging ajoute des regles iptables sans verifier l'existence** — c'est la cause des doublons. A corriger dans `.gitlab-ci.yml` pour eviter la pollution.

3. **Le port 443 sur prod-app (172.21)** reste ouvert en permanence. Il est utilise par le backend pour les appels HTTPS sortants. Si la politique de securite l'exige, on pourra restreindre a des destinations specifiques (smtp.gmail.com, etc.).

4. **Le reseau `prod-app` (172.21.0.0/16)** est la route par defaut du backend, pas `production_default` (172.20.0.0/16). Toute future regle reseau pour le backend doit cibler 172.21, pas 172.20.

5. **Le reseau `production_default` (172.20.0.0/16)** n'a aucune regle permanente. Si un nouveau service sur ce reseau a besoin d'Internet, il faudra ouvrir temporairement comme pour Whisper, puis fermer.

6. **Le modele Whisper (~3 GB)** est cache dans le volume Docker `whisper-models`. Tant que ce volume n'est pas supprime, Whisper n'a plus besoin d'Internet pour demarrer.

---

Ragnang-Newende Yanis Axel DABO
Developpeur Full-Stack AI / Mainteneur Staging & Production — @OGUN
yanisaxel.dabo@aiobi.world
