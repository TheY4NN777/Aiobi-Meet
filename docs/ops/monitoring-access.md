# Monitoring — accès et utilisation

Documentation opérationnelle de la stack observabilité Aïobi Meet (lots M1 + M2).

Pour **investiguer un incident** (cross-stack Grafana + Loki + GlitchTip), voir [`debugging.md`](./debugging.md).

**Principe** : toute l'observabilité est accessible **uniquement via le réseau WireGuard interne** (`10.13.13.0/24`). Rien n'est exposé sur internet. UFW sur le host prod restreint les ports monitoring au subnet VPN uniquement, identique au pattern déjà utilisé pour GitLab, Vault et Teleport.

---

## Pré-requis

Pour accéder à Grafana/Prometheus, il te faut :

1. **Un peer WireGuard configuré** sur ta machine (Aiobi-006 ou autre)
2. **Une connexion VPN active** sur cette machine (via `wg-quick up wg0` ou équivalent)

Si `ping 10.13.13.1` ne répond pas depuis ta machine → le VPN n'est pas up, rien d'autre n'est accessible.

---

## Services déployés

| Composant | Rôle | Port | Exposé |
|---|---|---|---|
| Prometheus | Collecte + stockage métriques (TSDB 30 jours) | `9090` | VPN (UFW) |
| Grafana | Dashboards + UI + Explore (logs Loki) | `3000` | VPN (UFW) |
| node-exporter | Métriques host (CPU/RAM/disk/net) | `9100` | Interne Docker |
| cAdvisor | Métriques par container | `8080` | Interne Docker |
| postgres-exporter | Métriques PostgreSQL | `9187` | Interne Docker |
| redis-exporter (main + summary) | Métriques Redis | `9121` | Interne Docker |
| celery-exporter | Events Celery | `9808` | Interne Docker |
| nginx-exporter | Métriques Nginx frontend | `9113` | Interne Docker |
| **Loki** (M2) | Agrégation logs, rétention 14j | `3100` | Interne Docker (scrape via Grafana) |
| **Promtail** (M2) | Ship logs de tous les containers vers Loki via Docker SD | — | Interne Docker |
| **GlitchTip** (M2) | Error tracking Python (aiobi-backend) + JS (aiobi-frontend) | `8002` | VPN (UFW) pour UI ; `/glitchtip/` public via nginx pour ingestion |
| GlitchTip Postgres | DB dédiée (isolée de l'app) | `5432` | Interne Docker |
| GlitchTip Redis | Queue Celery interne GlitchTip | `6379` | Interne Docker |
| GlitchTip Worker | Traitement async events + retention | — | Interne Docker |

Les exporters + Loki + Promtail sont scrape-only via le réseau Docker interne. Seuls **Grafana**, **Prometheus** et **GlitchTip UI** ont un port exposé (VPN only).

**Ingestion GlitchTip** : les DSN frontend pointent vers `https://meet.aiobi.world/glitchtip/...`, routé via nginx (location `/glitchtip/`) vers le container. Les browsers externes y envoient leurs erreurs JS. Le backend Python les envoie aussi par le même chemin (hairpin NAT → fonctionne).

---

## Accès quotidien

### Grafana (dashboards)

Depuis n'importe quel peer WG :

- URL : **http://10.13.13.1:3000**
- Login : `admin`
- Password : variable CI GitLab `GF_SECURITY_ADMIN_PASSWORD` (visible dans Settings > CI/CD > Variables, masked)

Si tu perds le password :
1. Générer un nouveau : `openssl rand -base64 32`
2. Mettre à jour la variable CI `GF_SECURITY_ADMIN_PASSWORD`
3. Relancer la pipeline de deploy prod (ou `docker compose restart grafana` sur le host après update de `.env`)

### Prometheus (debug / queries custom)

- URL : **http://10.13.13.1:9090**
- Pas de login (isolé par UFW)
- Onglets utiles :
  - `/targets` → état UP/DOWN de chaque cible scrape
  - `/graph` → éditeur de requêtes PromQL pour tester
  - `/config` → config chargée (copie de `prometheus.yml`)
  - `/status` → runtime info

### Loki (logs centralisés) — via Grafana Explore

Pas d'UI dédiée Loki en phase 1. L'accès se fait par Grafana :

1. Grafana → icône **Explore** (loupe dans sidebar)
2. Sélecteur datasource en haut → **Loki**
3. Query builder par label ou query LogQL directe

Exemples rapides :

```logql
{project="production"}                              # tous les logs de l'app (tous containers)
{container="production-backend-1"}                  # logs Django seulement
{service="celery"} |~ "ERROR|Traceback"             # erreurs worker Celery
{container=~"production-whisper-.*"}                # logs de tous les workers whisper
```

Rétention : **14 jours**. Au-delà, les logs sont supprimés automatiquement par Loki (config `retention_period: 336h`).

Pour toute la syntaxe LogQL + scénarios d'usage, voir [`debugging.md`](./debugging.md).

### GlitchTip (error tracking)

- URL UI : **http://10.13.13.1:8002** (VPN only)
- Signup du premier compte = auto-superuser de l'organisation
- 2 projects à pré-configurer (déjà fait si tu lis ce doc) :
  - `aiobi-backend` (platform: Python) — reçoit les exceptions Django
  - `aiobi-frontend` (platform: JavaScript) — reçoit les erreurs JS/React

Les DSN sont injectés au build / deploy via les CI vars GitLab :
- `GLITCHTIP_DSN_BACKEND` → scope `production` → écrit dans `env.d/common` → lu par Django settings.py
- `VITE_GLITCHTIP_DSN_FRONTEND` → scope `production` → `--build-arg` au build frontend → inline dans le bundle JS

Pour savoir si une erreur arrive de prod, va dans la project → **Issues** → trié par dernière occurrence.

---

## Dashboards disponibles

Tous dans le folder **Aïobi Meet** de la sidebar Grafana.

### 1. Aïobi Meet Overview ⭐

Vue unifiée en 14 panels. **Le dashboard à ouvrir en premier** quand tu veux savoir "tout va bien ?" :

- Rangée 1 : CPU host %, RAM host %, Disk /, containers up (stats avec seuils vert/jaune/rouge)
- Rangée 2 : Django req/s, latence P95, taux 5xx
- Rangée 3 : Celery queue depth transcribe, tasks success/fail, durée P95
- Rangée 4 : LiveKit rooms + participants actifs
- Rangée 5 : top 10 containers CPU + RAM

### 2. Node Exporter Full

60+ panels sur le host Xeon : CPU par core, RAM buckets, disk I/O par device, network par interface, load, context switches. Pour diagnostics infra profonds.

### 3. cAdvisor Docker

Vue par container : CPU, RAM, réseau, disk I/O, restarts, uptime.

### 4. Redis Dashboard

Hit ratio, commands/s, memory usage, connected clients, keyspace stats, I/O réseau.

### 5. Celery Tasks

Tasks sent/received/started/succeeded/failed, latence par task, queue depth par queue.

### 6. LiveKit Server Overview

Rooms, participants, bandwidth in/out, packet loss.

---

## Cas d'usage concrets

### "Un user dit que le site est lent"

1. Ouvre **Aïobi Meet Overview**
2. Stats haut : CPU/RAM > 80% → problème ressources
3. Panel **Django latence P95** : découpé par view → identifie la route lente
4. Panel **Django taux 5xx** : des erreurs backend ? → investigate

### "Une transcription est bloquée"

1. **Aïobi Meet Overview** → panel **Celery queue depth (transcribe)**
   - Vert (< 3) = normal
   - Jaune (3-10) = charge pointe
   - Rouge (> 10) = backlog, intervention
2. Panel **Celery tasks success vs failure** : des FAIL ?
3. Panel **Celery tasks durée P95** : anormalement long ? → vérifier whisper

### "Un container redémarre en boucle"

1. Dashboard **cAdvisor Docker** → panel "Container restarts"
2. Identifie le coupable, check les logs sur le host :
   ```bash
   sudo docker compose logs --tail=100 <nom_container>
   ```

---

## Règles UFW sur le host prod

Installées une fois après le premier deploy :

```bash
sudo ufw allow from 10.13.13.0/24 to any port 3000 comment 'Grafana-VPN'
sudo ufw allow from 10.13.13.0/24 to any port 9090 comment 'Prometheus-VPN'
sudo ufw allow from 10.13.13.0/24 to any port 8002 comment 'GlitchTip-VPN'
sudo ufw reload
```

Pour vérifier à tout moment :

```bash
sudo ufw status verbose | grep -E "^3000|^9090|^8002"
```

Attendu :
```
3000    ALLOW IN    10.13.13.0/24    # Grafana-VPN
9090    ALLOW IN    10.13.13.0/24    # Prometheus-VPN
8002    ALLOW IN    10.13.13.0/24    # GlitchTip-VPN
```

Si les règles disparaissent (après reinstall de l'OS, etc.), re-applique avec la version idempotente :

```bash
sudo ufw status | grep -q "^3000.*10\.13\.13\.0/24" || \
  sudo ufw allow from 10.13.13.0/24 to any port 3000 comment 'Grafana-VPN'
sudo ufw status | grep -q "^9090.*10\.13\.13\.0/24" || \
  sudo ufw allow from 10.13.13.0/24 to any port 9090 comment 'Prometheus-VPN'
sudo ufw status | grep -q "^8002.*10\.13\.13\.0/24" || \
  sudo ufw allow from 10.13.13.0/24 to any port 8002 comment 'GlitchTip-VPN'
sudo ufw reload
```

Note : **Loki** n'a pas de règle UFW car pas exposé (port 3100 interne seulement). L'accès aux logs passe par Grafana Explore, qui utilise la datasource Loki en réseau Docker interne.

---

## Emplacement des configs sur le host prod

Tous les fichiers sont synchronisés depuis le repo Git à chaque deploy CI, sous `/opt/aiobi-meet/production/monitoring/` :

```
monitoring/
├── prometheus.yml              # config Prometheus (scrape jobs)
├── loki-config.yml             # config Loki (schema TSDB v13, retention 14j)
├── promtail-config.yml         # config Promtail (Docker SD, labels)
├── minio-token.txt             # JWT bearer MinIO (GENERE par CI depuis MINIO_PROMETHEUS_TOKEN, EXCLU du rsync --delete)
└── grafana/
    ├── provisioning/
    │   ├── datasources/
    │   │   ├── prometheus.yml          # datasource Prometheus uid=prometheus
    │   │   └── loki.yml                # datasource Loki uid=loki
    │   └── dashboards/default.yml      # provider dashboards (folder "Aïobi Meet")
    └── dashboards/
        ├── aiobi-overview.json
        ├── cadvisor-docker.json
        ├── celery-tasks.json
        ├── livekit.json
        ├── node-exporter-full.json
        └── redis.json
```

**Important** : **ne jamais modifier ces fichiers directement sur le host**. Ils sont écrasés au prochain deploy via `rsync -a --delete` (sauf `minio-token.txt` qui est préservé via `--exclude` car généré CI-side à partir de la CI var `MINIO_PROMETHEUS_TOKEN`).

**Note bind-mount** : le rsync préserve les inodes (vs le `rm -rf + cp -r` d'origine qui les changeait), évite le bug zombie inode observé le 2026-04-15 où Grafana/Loki/Promtail continuaient à voir l'ancienne config après un deploy. Détails dans le commentaire de `.gitlab-ci.yml:553`.

Pour toute modif :
1. Modifier dans `docker/production/monitoring/` du repo
2. Commit + push sur main (origin + gitlab)
3. CI deploy automatique, avec restart auto de Prometheus si `prometheus.yml` change, ou de Grafana si `grafana/**` change (cf bloc `4b` du `.gitlab-ci.yml`)

---

## Ajouter une métrique custom

### Ajouter un scrape target

Édite `docker/production/monitoring/prometheus.yml` :

```yaml
- job_name: my-new-service
  static_configs:
    - targets: ['my-new-service:8080']
```

Le service doit être sur le réseau Docker `default`. Commit + push → Prometheus redémarre auto et scrape la nouvelle cible.

### Ajouter un dashboard custom

1. Créer le dashboard dans l'UI Grafana (settings > edit → save JSON)
2. Exporter : Dashboard settings > JSON Model > Save to file
3. Poser dans `docker/production/monitoring/grafana/dashboards/mon-dashboard.json`
4. **Remplacer `${DS_PROMETHEUS}` par `prometheus`** dans le JSON (Grafana provisioning veut l'UID direct, pas un placeholder)
5. Commit + push → Grafana pick up sous 10s

### Instrumenter un nouveau service

**Django** : déjà via `django-prometheus`, aucune action.

**FastAPI (nouveau service)** :
```python
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)
```

**Celery** : auto via `celery-exporter` qui lit les events du broker Redis summary.

---

## Troubleshooting

### Grafana inaccessible sur `http://10.13.13.1:3000`

Dans l'ordre :

1. **VPN up ?** `ping 10.13.13.1` répond ?
2. **Container up ?** Sur Aiobi-Master : `sudo docker compose ps | grep grafana` → doit être "Up"
3. **Port ouvert par UFW ?** `sudo ufw status | grep 3000` → doit avoir la règle VPN
4. **Container bind sur 0.0.0.0 ?** `sudo docker ps | grep grafana` → ligne doit contenir `0.0.0.0:3000->3000/tcp`
5. **Logs container** : `sudo docker compose logs grafana --tail=50`

### Prometheus target en DOWN

1. Tunnel WG, ouvre `http://10.13.13.1:9090/targets`
2. Identifie le target DOWN, clique "Last Error"
3. `connection refused` → service cible pas up ou mauvais port (port mapping compose ≠ port bind du service dans son container — cas typique vu avec GlitchTip :8080 vs :8000)
4. `context deadline exceeded` → timeout (scrape > 10s)
5. `http: server gave HTTP response to HTTPS client` → `SECURE_SSL_REDIRECT` côté Django qui renvoie 301 HTTPS. Fix : ajouter `^metrics$` à `SECURE_REDIRECT_EXEMPT` dans settings.py (déjà fait pour `/metrics`)
6. `permission denied` sur un token file → le container scrape tourne en user non-root (ex: prometheus = `nobody` UID 65534), le token doit être chmod 644 (pas 600)
7. `dial tcp: lookup X: no such host` → service pas sur le même réseau Docker que Prometheus (réseau `default`). Vérifier la section `networks:` du service dans `compose.yaml`
8. **Port 7980 piège LiveKit Egress** → Egress utilise 7980 en interne pour son template HTTP server (cf. `template_base` passé à Chrome). Si on configure aussi `prometheus_port: 7980`, conflit silencieux : Chrome reçoit du JSON Prometheus au lieu de la page HTML composite → recording cassé, **aucune erreur visible dans les logs**. Toujours utiliser un port différent pour Prometheus (on a choisi **7981**). Incident documenté le 2026-04-16, commit fix `1417a3f2`.

### Loki ne voit pas les logs d'un container

1. Check Promtail logs : `sudo docker compose logs promtail --tail=50`
2. Vérifier que le container cible est présent dans la Docker Service Discovery :
   ```logql
   {container="production-promtail-1"} |~ "<nom_container_cherché>"
   ```
   Si aucun match, Promtail ne l'a pas découvert → peut-être que le container est sur un autre compose project.
3. Vérifier la rétention : un log plus vieux que 14j a été supprimé. `count_over_time({container="X"}[24h])` pour confirmer qu'il log actif.

### GlitchTip n'affiche pas une erreur

1. **Vérifier l'ingestion** : logs nginx frontend devraient montrer un POST 200 vers `/glitchtip/api/X/envelope/` :
   ```bash
   sudo docker compose logs --tail=50 frontend | grep glitchtip
   ```
2. Si 400 "Cannot parse request body" → compression mismatch. Le backend Python force gzip via `_experiments={"transport_compression_algo": "gzip"}` dans `sentry_sdk.init()` parce que GlitchTip ne décompresse pas brotli. Le frontend JS (via `@sentry/react` + fetch) utilise toujours gzip natif, pas d'équivalent à faire.
3. Si 200 mais pas d'issue en UI : latence async, le worker Celery GlitchTip traite les events. Refresh la page Issues après 5-30s.
4. Si `env | grep SENTRY_DSN` vide dans le container backend : CI var `GLITCHTIP_DSN_BACKEND` pas setée ou scope `production` sans que le job CI ne déclare `environment: production`.

### Grafana lent, queries qui timeout

1. Réduit la fenêtre temporelle (bouton haut droit — par défaut 1h, essaie 15min)
2. Si un panel spécifique est lent : check sa query PromQL, agrandir le range `[5m]` → `[15m]` réduit la charge

### Plus de place disque

Prometheus garde 30j (flag `--storage.tsdb.retention.time=30d` dans `compose.yaml`). À ~1 GB/semaine actuellement. Pour réduire :

```yaml
# compose.yaml, service prometheus
command:
  - --storage.tsdb.retention.time=7d   # au lieu de 30d
```

---

## Requêtes PromQL utiles (pour Prometheus direct)

À coller dans `http://10.13.13.1:9090/graph` :

```promql
# Req/s Django par view (5 dernières minutes)
sum(rate(django_http_requests_total_by_view_transport_method_total[5m])) by (view)

# Latence P99 Django par view
histogram_quantile(0.99, sum(rate(django_http_requests_latency_seconds_by_view_method_bucket[5m])) by (le, view))

# Nb tasks Celery actives par type
celery_task_active

# CPU par container (%)
sum(rate(container_cpu_usage_seconds_total{name!=""}[2m])) by (name) * 100

# RAM par container (GB)
container_memory_working_set_bytes{name!=""} / 1024 / 1024 / 1024

# Taux 5xx Django sur 15 min
sum(rate(django_http_responses_total_by_status_total{status=~"5.."}[15m]))

# Rooms LiveKit actives
livekit_room_current

# Queue Celery transcribe depth
celery_queue_length{queue_name="transcribe-queue"}
```

---

## Roadmap

### Livré
- **Lot M1** — Prometheus + Grafana + 9 exporters + 6 dashboards
- **Lot M2** — Loki + Promtail (logs centralisés) + GlitchTip (error tracking Python/JS)

### À venir
- **Lot M3** — Uptime Kuma (probing externe HTTP) + Plausible (analytics web) + table `core.ProductEvent` (events produit backend)
- **Lot M4** — Extraction stack monitoring vers repo platform dédié, réutilisable pour autres services Aïobi

### Alerting
Pas automatisé en phase 1. À ajouter une fois les seuils vraiment connus (2-4 semaines de baselines), surtout :
- Celery queue depth > 10 (backlog transcription)
- Host CPU > 90% soutenu
- 5xx rate > 0.1/s
- Disk / > 85%

En attendant :
- **GlitchTip** envoie déjà des **emails sur nouvelle issue** — pas besoin d'attendre, c'est actionnable dès jour 1 (configurer dans Project Settings → Alerts).
- **Grafana** supporte les alertes par panel (clic panel → Alert → Create alert rule) + notif via email SMTP ou Telegram bot. Préfère définir sur des métriques à seuils évidents (ex: "disk > 95%") plutôt que des métriques à dérive (ex: latence P95).
