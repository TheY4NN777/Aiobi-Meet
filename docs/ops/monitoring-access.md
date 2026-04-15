# Monitoring — accès et utilisation

Documentation opérationnelle de la stack observabilité Aïobi Meet (lot M1).

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
| Grafana | Dashboards + UI | `3000` | VPN (UFW) |
| node-exporter | Métriques host (CPU/RAM/disk/net) | `9100` | Interne Docker |
| cAdvisor | Métriques par container | `8080` | Interne Docker |
| postgres-exporter | Métriques PostgreSQL | `9187` | Interne Docker |
| redis-exporter (main + summary) | Métriques Redis | `9121` | Interne Docker |
| celery-exporter | Events Celery | `9808` | Interne Docker |
| nginx-exporter | Métriques Nginx frontend | `9113` | Interne Docker |

Les exporters sont scrape-only via le réseau Docker interne — jamais atteignables depuis le host ni le VPN. Seuls **Grafana** et **Prometheus** ont un port exposé.

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
sudo ufw reload
```

Pour vérifier à tout moment :

```bash
sudo ufw status verbose | grep -E "^3000|^9090"
```

Attendu :
```
3000    ALLOW IN    10.13.13.0/24    # Grafana-VPN
9090    ALLOW IN    10.13.13.0/24    # Prometheus-VPN
```

Si les règles disparaissent (après reinstall de l'OS, etc.), re-applique avec la version idempotente :

```bash
sudo ufw status | grep -q "^3000.*10\.13\.13\.0/24" || \
  sudo ufw allow from 10.13.13.0/24 to any port 3000 comment 'Grafana-VPN'
sudo ufw status | grep -q "^9090.*10\.13\.13\.0/24" || \
  sudo ufw allow from 10.13.13.0/24 to any port 9090 comment 'Prometheus-VPN'
sudo ufw reload
```

---

## Emplacement des configs sur le host prod

Tous les fichiers sont synchronisés depuis le repo Git à chaque deploy CI, sous `/opt/aiobi-meet/production/monitoring/` :

```
monitoring/
├── prometheus.yml              # config Prometheus (scrape jobs)
└── grafana/
    ├── provisioning/
    │   ├── datasources/prometheus.yml   # datasource auto uid: prometheus
    │   └── dashboards/default.yml       # provider dashboards
    └── dashboards/
        ├── aiobi-overview.json
        ├── cadvisor-docker.json
        ├── celery-tasks.json
        ├── livekit.json
        ├── node-exporter-full.json
        └── redis.json
```

**Important** : **ne jamais modifier ces fichiers directement sur le host**. Ils sont écrasés au prochain deploy (le CI fait un `rm -rf monitoring/` puis `cp -r` depuis le repo).

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
3. `connection refused` → service cible pas up ou mauvais port
4. `context deadline exceeded` → timeout (scrape > 10s)

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

## Roadmap (pas encore livré)

- **Lot M2** — Loki (logs centralisés) + GlitchTip (error tracking Python/JS)
- **Lot M3** — Uptime Kuma (probing externe) + Plausible (analytics web) + table `core.ProductEvent` (events produit backend)
- **Alerting** — pas automatisé en phase 1. À ajouter une fois les seuils vraiment connus (surtout Celery queue depth > 10, host CPU > 90%, 5xx rate > 0.1/s).

Pour alerting en attendant : Grafana supporte les alertes par panel (clic panel → Alert → Create alert rule) + notif via email SMTP ou Telegram bot.
