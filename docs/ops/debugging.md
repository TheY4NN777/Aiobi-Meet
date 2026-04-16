# Debugging — investiguer un incident Aïobi Meet

Guide d'investigation cross-stack : **Grafana/Prometheus + Loki + GlitchTip**. Tu arrives sur un incident, tu ne sais pas par où commencer, ce doc te guide pas-à-pas.

Pré-requis : VPN WireGuard actif (`ping 10.13.13.1` répond). Sans ça, aucune UI monitoring n'est accessible.

---

## Philosophie — 3 outils, 3 questions

Chaque outil répond à une question distincte. Les utiliser ensemble donne une vision complète ; les utiliser seuls laisse toujours un angle mort.

| Outil | URL | Question à laquelle il répond | Format de données |
|---|---|---|---|
| **Grafana / Prometheus** | `10.13.13.1:3000` / `:9090` | **Quand et combien ?** Le système a-t-il changé d'état sur une période ? | Métriques numériques time-series (CPU %, req/s, latence P95, etc.) |
| **Loki** (via Grafana Explore) | `10.13.13.1:3000/explore` | **Qu'est-ce que le code a raconté en runtime ?** | Logs texte structurés avec labels (container, service, project) |
| **GlitchTip** | `10.13.13.1:8002` | **Qui a crashé, et où dans le code exactement ?** | Exceptions Python/JS avec stack trace source-mapped, contexte user, breadcrumbs |

**Règle mentale** : si ta question commence par "pourquoi", tu vas souvent enchaîner les 3. Si elle commence par "combien" ou "quand", Grafana suffit souvent.

---

## Arbre de décision — par où commencer selon le symptôme

| Symptôme user | Premier outil | Pourquoi |
|---|---|---|
| "Le site est lent" | Grafana Overview | Identifier si c'est CPU, RAM, DB, ou latence upstream |
| "Ça ne marche plus" | Grafana puis GlitchTip | Health global puis erreurs récentes |
| "J'ai vu une erreur à l'écran" | GlitchTip aiobi-frontend | Stack trace avec nom du composant React |
| "Une réunion s'est coupée" | Loki (container=livekit) + Grafana LiveKit | Logs realtime + métriques packet loss / participants |
| "Un enregistrement a échoué" | Loki (container=livekit-egress) + GlitchTip | Logs upload S3 + exceptions backend sur la tâche Celery |
| "Une transcription n'est pas arrivée" | Grafana Celery + Loki (whisper-*) | Queue depth + logs whisper |
| "500 sur une route" | GlitchTip aiobi-backend | Stack trace Django + vue + user + request |
| "Le CI a échoué" | GitLab pipeline logs (hors monitoring) | Les logs de build/deploy ne sont pas encore streamés dans Loki |
| "Un container redémarre" | Loki (container=X) + Grafana cAdvisor | Logs avant crash + métriques restart count |

---

## Scenario 1 — "Le site est lent"

### Étape 1 : Grafana Overview (santé globale)

Ouvre `10.13.13.1:3000` → dashboard **Aïobi Meet Overview**. Regarde dans l'ordre :

1. **CPU host %** (rangée 1) : > 80% soutenu = système sous-dimensionné ou loop bug
2. **RAM host %** : > 85% = risque OOM killer → aller voir quel container mange
3. **Django latence P95** : > 500ms = backend lent → où exactement ?
4. **Django req/s** : si très bas alors que CPU haut = quelque chose bloque ailleurs que l'API

### Étape 2 : identifier le coupable si CPU/RAM élevé

Dashboard **cAdvisor Docker** → panel "Top 10 containers CPU" + "Top 10 containers RAM" :

- Si **whisper-N** en tête = transcription tourne (normal à la demande, suspect si en continu)
- Si **backend** seul en rouge = investigue les requêtes actives
- Si **livekit** en rouge = charge réunions actives, check nb de rooms

### Étape 3 : DB lente ?

Ouvre la query PromQL suivante dans Prometheus (`10.13.13.1:9090/graph`) :

```promql
rate(pg_stat_database_tup_fetched{datname="aiobimeet"}[5m])
```

Pic important = scan lourd. Combine avec :

```promql
pg_locks_count{datname="aiobimeet"}
```

> 100 locks = contention probable.

### Étape 4 : rien d'anormal côté métriques ?

Si toutes les métriques sont vertes mais le user dit que c'est lent → **Loki** pour chercher des erreurs silencieuses :

```logql
{project="production"} |~ "(?i)slow|timeout|deadlock|retry"
```

Et **GlitchTip** → aiobi-frontend → regarde les performance transactions (si actives) ou les erreurs JS récentes (un bug de rendu peut donner une impression de lenteur sans impact serveur).

---

## Scenario 2 — "J'ai une erreur 500"

### Étape 1 : GlitchTip aiobi-backend

Ouvre `10.13.13.1:8002` → projet **aiobi-backend** → onglet **Issues**. Les dernières exceptions sont triées par dernière occurrence.

Chaque issue donne :
- **Message** (ex: `IntegrityError at /api/v1.0/rooms/`)
- **Nombre d'occurrences** (1 = cas isolé, 50+ = bug systématique)
- **Utilisateurs affectés** (compteur unique)
- **Timeline** (graphique des occurrences par heure)
- **Stack trace complète** avec locals (variables à chaque frame)
- **Request context** : URL, méthode, user agent, user ID/email si authentifié, headers

### Étape 2 : cross-ref Loki sur le même timestamp

Copie le timestamp de la première occurrence de l'issue. Dans Grafana Explore :

```logql
{container="production-backend-1"}
```

Time range : **30 sec avant** à **30 sec après** le timestamp de l'erreur. Tu vas voir les lignes de log Django autour de la stack trace — requêtes HTTP entrantes, queries SQL, appels à LiveKit/Keycloak, qui peuvent expliquer le contexte du crash.

### Étape 3 : est-ce isolé ou symptôme d'un incident plus large ?

Grafana **Aïobi Meet Overview** → panel **Django taux 5xx** — regarde la courbe. Pic ponctuel = cas isolé. Courbe qui monte continûment = dégradation en cours.

Puis :
```promql
sum(rate(django_http_responses_total_by_status_total{status=~"5.."}[5m])) by (status, view)
```

Te dit quelle vue précisément génère les 5xx.

### Étape 4 : résolution / triage

Dans GlitchTip, chaque issue a un bouton :
- **Resolve** : tu as pushé un fix. Next occurrence = reopens (regression detection auto).
- **Ignore** : tu considères que c'est hors scope (ex: crawler bot mal formé). Silencie les alertes futures.
- **Assign** : délègue. Utile même à 1 dev pour garder une mental log.

---

## Scenario 3 — "LiveKit déconnecte les users"

### Étape 1 : Grafana LiveKit dashboard

Regarde :
- **Participants actifs** : chute brutale = incident SFU
- **Packet loss %** : > 2% = problème réseau
- **Room duration** : distribution anormalement courte = déconnexions forcées

### Étape 2 : Loki logs LiveKit

Dans Grafana Explore :

```logql
{container="production-livekit-1"} |~ "(?i)disconnect|aborted|timeout"
```

Tu verras les events `participant_connection_aborted`, `departure timeout`, etc. Chaque ligne a `roomID` et `participantID` en JSON structuré → tu peux croiser avec les complaints users (ID participant match leur session).

### Étape 3 : cause probable en fonction du pattern

| Pattern log | Cause probable | Action |
|---|---|---|
| `participant_connection_aborted` massif sur une plage | Problème réseau côté nombreux users | Probably côté CDN / uplink host, rien côté code |
| `departure timeout` sur la même room | Bug client côté frontend (handshake cassé) | Check GlitchTip aiobi-frontend |
| `clock skew against media path` fréquent | Drift horloge client OU host | Si récurrent sur host → `systemd-timesyncd` sur le serveur |
| `webhook failed` vers backend | Backend ne répond pas aux callbacks LiveKit | Check Loki backend + GlitchTip backend |

---

## Scenario 4 — "Une exception Python est apparue en prod"

### Étape 1 : GlitchTip

Comme scenario 2. Stack trace Python avec nom du fichier, ligne, frames.

### Étape 2 : si la stack trace est dans du code tiers

Tu vois `ValueError at celery/app/base.py:...` — pas TON code. Remonte la stack jusqu'à la première frame de `meet/` ou `core/` (notre code). C'est là que le bug a été déclenché. Les frames plus profondes sont juste la cascade interne du framework.

### Étape 3 : reproduire localement

Chaque event GlitchTip contient les **request params** sérialisés (body, query, headers). Copie-les, relance en local avec les mêmes params → tu reproduis à 95%.

---

## Scenario 5 — "Une tâche Celery a échoué silencieusement"

Celery catch parfois les exceptions sans les relever jusqu'à Sentry. Pour investiguer :

### Étape 1 : Grafana Celery Tasks

Panel **failed tasks by name** → identifie la task. Panel **retries** → combien de retries avant fail.

### Étape 2 : Loki celery logs

```logql
{service="celery"} |~ "(?i)task.*failed|exception|traceback"
```

Si un `Traceback` apparaît, Celery a loggé la stack mais ne l'a pas envoyé à Sentry. Tu peux voir la cause.

### Étape 3 : si aucune trace nulle part

Parfois Celery kill le worker (SIGKILL, OOM). Aucune stack trace possible — juste un worker qui meurt. Check :

```promql
container_memory_working_set_bytes{name=~"production-celery.*"} / 1024 / 1024
```

Si la RAM monte en flèche juste avant la disparition = OOM killer. Augmenter memory limit dans compose.yaml ou identifier la fuite mémoire.

---

## LogQL — syntaxe essentielle

Quelques exemples utiles à connaître pour naviguer dans Loki rapidement.

### Filtrer par label

```logql
{container="production-backend-1"}
{service="celery"}
{project="production", container=~"production-whisper-.*"}
```

### Filtrer par contenu de ligne

- `|=` contient texte brut
- `|~` contient regex (case sensitive, ajoute `(?i)` pour case-insensitive)
- `!=` ne contient pas
- `!~` ne matche pas regex

```logql
{container="production-backend-1"} |= "ERROR"
{container="production-backend-1"} |~ "5[0-9]{2}"
{container="production-nginx-1"} |~ "(?i)glitchtip" |~ "200"
```

### Extraire et utiliser un champ JSON

```logql
{container="production-livekit-1"} | json | room="abc-123"
```

Ici `| json` parse le body JSON de la ligne de log et expose tous les champs comme labels utilisables ensuite.

### Compter les occurrences (aggregate)

```logql
count_over_time({container="production-backend-1"} |~ "ERROR"[5m])
```

Donne le nb d'erreurs sur les 5 dernières minutes.

---

## Cross-référencement entre outils

### Timestamp universel

**Tout est en UTC** côté Grafana, Loki, GlitchTip. Si tu vois une issue à 13:42:15 UTC dans GlitchTip, même timestamp dans Loki et Prometheus.

### Liens pratiques à garder

Après avoir identifié une erreur dans GlitchTip, construis à la main l'URL Loki pour voir les logs :

`http://10.13.13.1:3000/explore?left={"datasource":"loki","queries":[{"expr":"{container=\"production-backend-1\"}"}],"range":{"from":"<ts-30s>","to":"<ts+30s>"}}`

Pour des besoins fréquents on pourra plus tard ajouter un lien direct dans la stack GlitchTip → Loki (via déeplink). Pas encore automatisé.

### Release / version

Si un jour tu ajoutes un versionning type `v1.2.3`, GlitchTip peut te dire si une issue apparaît UNIQUEMENT sur une release donnée = régression introduite par un deploy. Actuellement `get_release()` renvoie "NA" → pas exploité.

---

## Cas "tout est silencieux"

Parfois un bug ne touche AUCUN des 3 outils :

- **Container planté au boot** : avant même de pouvoir log, exit immédiat. Pas de Loki, pas de GlitchTip.
- **Mémoire saturée avant capture** : Sentry SDK a besoin de RAM pour sérialiser → OOM prévient l'envoi.
- **Crash hors code instrumenté** : un segfault natif (codec FFmpeg dans egress) est invisible côté app.

Dans ces cas :

```bash
sudo docker compose ps
sudo docker compose logs --tail=100 <service>
dmesg | tail -50   # pour OOM killer host-level
```

Les containers en `Exited (137)` = OOM. `Exited (139)` = segfault. `Restarting` en boucle = check logs du container.

---

## Bonnes pratiques

1. **Avant de patcher** : assure-toi d'avoir identifié la CAUSE via les 3 outils. Fix à l'aveugle = retour du bug.
2. **Résous uniquement quand tu as déployé le fix** — pas avant. Sinon la prochaine occurrence réouvre l'issue et tu perds le contexte.
3. **Ignore sans hésiter les bots / crawlers** qui génèrent du bruit (ex: `Unsupported protocol X-Y-Z`). Mais en masse, c'est peut-être un DoS — comparer avec cAdvisor network pour contextualiser.
4. **Un incident = un doc**. Pas ce guide, mais un doc post-mortem court (5 lignes) dans `docs/incidents/YYYY-MM-DD.md` pour capitaliser.

---

## Roadmap outils de debug (pas encore livré)

- **Alerting automatisé** — Phase 2, une fois les baselines connues (2-4 semaines de data). GlitchTip peut déjà envoyer des emails sur nouvelle issue, pas besoin d'attendre.
- **Uptime Kuma** (M3) — probing externe pour savoir si le site répond depuis internet, complémentaire à Prometheus qui probe depuis l'intérieur.
- **Plausible Analytics** (M3) — stats d'usage (quelles vues utilisées, funnel, etc.). Pas un outil de debug technique mais utile pour comprendre "est-ce que les users utilisent vraiment X ?".
