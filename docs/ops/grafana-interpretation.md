# Lire Grafana pour Aïobi Meet

Guide pratique pour **interpréter** les dashboards et **décider si il faut agir**.

Ce guide complète `monitoring-access.md` (qui couvre l'installation et l'accès). Ici on suppose que tu es loggé dans Grafana sur `http://10.13.13.1:3000` et tu regardes les panels.

---

## 0. Pré-requis de lecture

### Timeframe — bouton en haut à droite

Par défaut "Last 1 hour". Les plages utiles :

| Fenêtre | À utiliser pour |
|---|---|
| Last 15min | Investigation live d'un incident en cours |
| Last 1h | Vérif quotidienne routine |
| Last 6h | Debugging "ça tournait bien ce matin, que s'est-il passé ?" |
| Last 24h | Repérer des patterns journaliers (heures de pointe) |
| Last 7d | Comparer cette semaine vs la précédente |
| Last 30d | Tendances long terme (growth traffic, disk usage) |

**Pièges** : tu regardes Last 30d et les données des 29 derniers jours sont vides → c'est normal, Prometheus a commencé à collecter seulement à partir du déploiement. Rétention max actuelle : 30 jours (flag `--storage.tsdb.retention.time=30d`).

### Refresh auto

En haut à droite, à côté du timeframe : intervalle de refresh (`Off`, `5s`, `30s`, `1m`...). Mets **30s** pour une supervision live, **Off** quand tu analyses un passé (sinon ton curseur temporel bouge).

### Comprendre `rate()[2m]`

Une query type `rate(metric_total[2m])` veut dire "taux moyen de cette métrique sur les 2 dernières minutes". La fenêtre `[2m]` doit être ≥ **2× scrape_interval** (scrape = 15s chez nous, donc ≥ 30s, mais 2m est plus lisse).

Cas concret : si tu vois un spike instantané sur `req/s` qui disparaît 2 min après, c'est que le burst réel a été **encore plus court** — `rate[2m]` étale sur 2 minutes.

---

## 1. Aïobi Meet Overview — panel par panel

C'est **le dashboard à ouvrir en premier** pour savoir si le système va bien.

### Rangée 1 — Stats santé (CPU / RAM / Disk / Containers)

Les 4 tiles prennent une couleur selon leur seuil. Lecture rapide :

#### CPU Host
- **Vert < 70%** : nominal
- **Jaune 70-90%** : système sous charge, attendre ou investiguer
- **Rouge > 90%** : vraie saturation

**Seuil Aïobi Meet réel (observé jusqu'ici)** : typiquement 5-25% en baseline. Whisper bursts peuvent pousser à 30-50% (4 cores saturés sur 20 = 20% + autres services). Si tu vois **90% soutenu sur plusieurs minutes, quelque chose de pas normal tourne** — probable : un whisper stuck en boucle, ou un script shell interactif lancé sur le host.

**Note importante** : le Xeon E5-2630 v4 n'a pas AVX-512 → whisper est CPU-bound. 4 transcriptions simultanées = 4 cores à 100% = 20% CPU host. Un pic 40-60% pendant une grosse charge de meetings qui se terminent est **normal**.

#### RAM Host
- **Vert < 70%** : nominal. Baseline attendu : 15-25% (40-60 GB / 251 GB) — on a beaucoup de marge
- **Jaune 70-90%** : inhabituel, vérifier si un container leak
- **Rouge > 90%** : OOM imminent, problème sérieux

**Seuil Aïobi Meet réel** : RAM reste très basse parce qu'on a 251 GB et que même whisper large-v3 × 4 tient dans ~12 GB, Postgres est configuré `shared_buffers=4GB`, LiveKit est léger. Pas vu monter > 30% jusqu'ici. Si ça monte à 80%, **y a un leak** (container à identifier via Top RAM, rangée 5).

#### Disk /
- **Vert < 75%** : OK
- **Jaune 75-90%** : commencer à réfléchir au nettoyage (logs, recordings archivés)
- **Rouge > 90%** : urgent, un service peut s'arrêter (Postgres refuse d'écrire)

Croissance attendue :
- Recordings MinIO : ~30-100 MB/h de meetings actifs (dépend du nombre de rooms enregistrées)
- Logs Docker : quelques GB/semaine si pas rotaté
- Postgres WAL : quelques MB/jour
- Prometheus TSDB : ~1 GB/semaine (on a mis retention 30d → cap ~4-5 GB)
- Whisper models HF cache : 3 GB figés

#### Containers up
- **Vert ≥ 20** : tous les services tournent
- **Jaune 10-20** : quelques containers sont down, pas bon
- **Rouge < 10** : catastrophe, plusieurs services morts

Compte attendu : ~25 containers (postgres, redis x2, minio, livekit, livekit-egress, backend, celery, frontend, summary, celery-transcribe, celery-summarize, whisper LB + whisper-1..4, mailcatcher, createbuckets, grafana, prometheus, node-exporter, cadvisor, 2× redis-exporter, celery-exporter, postgres-exporter, nginx-exporter).

### Rangée 2 — Django HTTP

#### Django req/s (par method)
Ligne temporelle avec 1 courbe par method HTTP (GET, POST, PUT, DELETE).

**Patterns à reconnaître** :
- **Plateau stable** = trafic nominal
- **Pic soudain** = un user script ou un burst d'activité (ex: beaucoup de users se connectent en même temps pour une réunion)
- **Drop à zéro** = soit personne n'utilise l'app, soit le backend est down / nginx ne proxy plus. Check aussi la tile "Containers up".

#### Django latence P95
P95 par view Django. **C'est P95 pas moyenne** : la moyenne ment, le P95 dit "la vraie pire expérience typique".

**Seuil attendu Aïobi Meet (à calibrer avec baselines)** :
- `/api/rooms/` POST (créer meeting) : < 500ms
- `/api/rooms/<slug>/invite/` : < 1s (envoie emails)
- `/api/v1.0/users/me/` : < 200ms (cache Redis)
- `/admin/...` : peut être 1-5s sous charge admin, pas critique

**Signal d'alerte** : une view qui monte à > 2s soutenu = problème (DB query lente, Redis saturé, backend overloaded). Croise avec Postgres dashboard (queries lentes) et Top containers (CPU backend).

#### Django taux 5xx
Bars chart. **Toute barre non-nulle est une erreur serveur** → un user a vu une page cassée.

**Baseline attendu** : 0 ou quasi-0. Tolérance : quelques 502/503 isolés (backend qui redémarre) = OK. Un 500 régulier = bug à investiguer dans GlitchTip (quand M2 sera en place) ou dans les logs backend.

### Rangée 3 — Pipeline transcription

#### Celery queue depth (transcribe)
**La métrique la plus importante du dashboard.**

- **Vert < 3** : les workers consomment aussi vite que les tâches arrivent. Nominal.
- **Jaune 3-10** : burst en cours. Normal si plusieurs meetings se terminent en même temps. Attendre 10-15 min avant de s'inquiéter.
- **Rouge > 10** : workers débordés ou bloqués. Investigate.

**Cas vécu (2026-04-14)** : la queue a explosé parce qu'un worker était wedgé à cause du `visibility_timeout` Celery. Solution : vérifier les logs `celery-transcribe`, redémarrer le worker si nécessaire.

#### Celery tasks — success vs failure
Barres OK (vert) vs FAIL (rouge) par minute, par task_name.

**Signaux** :
- Des FAIL occasionnels (1-2/jour) sur `transcribe_audio` = fichier corrompu, whisper timeout. Pas urgent.
- Des FAIL en cascade (toutes les tasks échouent pendant 5 min) = **urgent**. Probablement whisper down ou une dep externe indisponible.

#### Celery tasks durée P95
Temps de transcription P95 en secondes.

**Baseline Aïobi Meet sur Xeon sans AVX-512** : ratio ~1x realtime. Donc un meeting de 60 min prend ~60 min à transcrire.

**Signaux** :
- P95 = durée audio moyenne × 1 → normal
- P95 >> durée audio (ex: 2-3x) → whisper est en contention (trop de transcriptions parallèles sur les 4 backends ? CPU throttle thermique ?)
- P95 = 0 (pas de bar affichée) → pas de transcription récente, pas d'info

### Rangée 4 — LiveKit

#### Rooms actives
Nombre de salles de réunion avec au moins 1 participant à l'instant T.

**Pattern attendu** : variations fortes selon heures de pointe (pic midi, après-midi). 0 la nuit.

**Anomalie** : rooms à 0 en plein jour ouvré = soit vraiment personne, soit LiveKit a un problème de comptage. Vérifier dashboard LiveKit dédié.

#### Participants connectés
Somme des participants actifs sur toutes les rooms.

**Pattern** : monte/descend en gros en même temps que "rooms actives". Si tu vois rooms stable mais participants qui grimpe → c'est que les meetings deviennent plus grands (plus de monde par room).

### Rangée 5 — Top 10 containers CPU / RAM

Graphs avec 1 courbe par container top 10. **Le + utile pour diagnostic "qui consomme quoi"**.

**Patterns attendus** :
- `production-whisper-1..4` en CPU : spikes synchronisés quand des transcriptions sont actives. Si **un seul whisper bouffe tout** et les autres sont à 0 → le LB nginx ne balance plus (bug à investiguer).
- `production-backend-1` : stable ~5-10% CPU en baseline, spikes à 30-50% sur des bursts de requêtes
- `production-postgresql-1` : stable mais peut monter si queries lentes
- `production-livekit-1` : proportionnel au nombre de rooms/participants

**RAM** : les gros consommateurs constants sont whisper (~2-3 GB chacun), Postgres (~4 GB shared_buffers), backend (Gunicorn 6 workers × ~150 MB = ~900 MB).

---

## 2. Dashboards community — panels clés à regarder

Les dashboards community ont beaucoup de panels, tous intéressants mais pas tous critiques. Voici ceux à **absolument savoir lire**.

### Node Exporter Full — `Load Average`
Indicateur "le système est-il submergé ?".

- Load 1m, 5m, 15m → 3 courbes
- **Seuil sain** : load ≤ nb de cores physiques (20). Donc load < 20 = OK.
- **Seuil rouge** : load > 2× nb cores (40) → le noyau Linux queue des processus, latence générale dégradée

### Node Exporter Full — `Disk I/O Utilization`
% d'utilisation des disques physiques.

- **Vert < 70%** : pas de contention I/O
- **Rouge > 90%** : disque saturé, les writes Postgres/MinIO traînent

### cAdvisor — `Container restarts`
Barres des containers qui redémarrent. **Tout restart non-planifié = container qui crash**.

Check sur 24h : qui restart ? Si même container restart 5x par heure → crash loop, regarder ses logs immédiatement.

### Redis Dashboard — `Hit / Miss ratio`
**Ratio sain ≥ 80%**. Si ça tombe à 50% = cache mal utilisé ou TTL trop court. Dégrade les perfs Django (chaque miss = re-query DB).

### Celery Tasks — `Task runtime`
Heatmap typique : axe X = temps, axe Y = durée task, couleur = densité.

Permet de voir **des outliers** : si 95% des tasks sont à < 60s mais quelques-unes à > 10min → une catégorie de meetings pose problème (fichiers géants ? audio corrompu ?).

### LiveKit Server Overview — `Packet loss`
% de paquets audio/video perdus. Critique pour l'UX.

- **Seuil sain** < 2%
- **Seuil dégradé** 2-5% (users perdent du son/image par moments)
- **Seuil cassé** > 5% (meetings quasi-inutilisables)

Croise avec conditions réseau users (c'est souvent côté client : connexion mobile faible en Afrique).

---

## 3. Lire les patterns graphiques

Sur n'importe quelle courbe temporelle :

### Plateau stable
Métrique reste à peu près constante → **état nominal**. Rien à signaler.

### Spike (pic)
Montée brutale + redescente.
- Si court (< 2 min) et léger : burst normal, un user qui fait une action complexe ou un script qui passe
- Si long (> 10 min) : vrai événement → corréler avec autres panels à la même heure

### Plateau soudain à nouveau niveau
"Step up" ou "step down" brutal qui reste.
- Souvent : un deploy (change de version) → nouveau niveau de baseline
- Parfois : un bug introduit qui augmente la charge permanente

### Drop à zéro
- Container mort (check cAdvisor restarts)
- Ou scrape Prometheus cassé (check `/targets`)
- Ou vraiment personne n'utilise l'app (cohérent avec nuit/weekend)

### Sawtooth (dents de scie)
Montée progressive + chute brutale, cycliquement.
- Typique de "cache qui se remplit puis est flushé"
- Ou "disk utilisation qui monte puis cron de cleanup"

### Absence de data
Un panel affiche "No data" → la query ne renvoie rien. Causes :
- Le target Prometheus est down (pas de métrique écrite)
- Le nom de la métrique a changé (label renamed dans une version lib)
- La plage temporelle est avant le déploiement du scrape

---

## 4. Playbooks par symptôme

### "Un user dit que le site est lent"

1. Ouvre **Aïobi Meet Overview**, timeframe Last 1h
2. Stats haut : CPU/RAM rouges ? → saturation infra
3. Panel Django latence P95 : quelle view ? Clique la légende pour isoler
4. Panel Django 5xx : y a des erreurs corrélées ?
5. Top containers CPU : qui consomme ? Si `backend` est dans le top = Django surchargé (augmente les workers Gunicorn en temporaire)

### "Une transcription est bloquée"

1. **Aïobi Meet Overview** → panel "Celery queue depth transcribe"
2. Queue > 10 ? → backlog
3. Panel "Celery tasks success vs failure" : des FAIL récents ? → whisper down / erreur
4. Panel "Celery tasks durée P95" : durée anormalement longue ? → whisper lent
5. Top containers CPU : `whisper-1..4` à 100% = nominal si queue se vide. À 0% avec queue qui grossit = workers wedgés → `docker compose restart celery-transcribe`

### "Un container restart en boucle"

1. Dashboard **cAdvisor Docker** → panel "Container restarts"
2. Identifie le container coupable
3. Sur prod : `sudo docker compose logs <nom> --tail=100`
4. Si OOM : check cAdvisor "Container memory usage" pour voir ses patterns mémoire
5. Si dependency failed : vérifie que les services dont il dépend (Postgres, Redis) sont up

### "Disk qui se remplit"

1. **Aïobi Meet Overview** stat "Disk /"
2. Si > 80%, sur prod :
   ```bash
   sudo du -sh /opt/aiobi-meet/production/data/*/ 2>/dev/null | sort -h | tail
   ```
3. Coupables habituels :
   - `data/media/` (MinIO, recordings)
   - `/var/lib/docker/` (logs des containers non rotatés)
   - `/var/lib/docker/volumes/production_prometheus-data/` (TSDB)
4. Actions : archiver vieux recordings, purger anciens logs Docker, réduire `--storage.tsdb.retention.time`

---

## 5. Anti-patterns à éviter

### "Je regarde sur Last 5 minutes tout le temps"
→ Tu rates les tendances. Alterne 1h pour supervision, 24h pour tendances, 7d pour anomalies longues.

### "Je regarde une seule métrique en isolation"
→ La force du dashboard c'est la **corrélation**. Si latence Django pique ET Postgres queries slow pique au même moment → c'est la DB, pas Django.

### "Je fais confiance aux moyennes"
→ Toujours P95 ou P99 pour latence. La moyenne masque les outliers qui sont l'expérience user réelle.

### "Je fais des screenshots et je compare visuellement"
→ Utilise le **time comparison** natif Grafana : `Add query > B > offset -1d` pour superposer "hier à la même heure" sur le même panel.

### "Je configure des alertes sur des seuils arbitraires"
→ Attendre 2-4 semaines d'observation, puis calibrer sur P95/P99 réels + marge. Sinon alert fatigue.

---

## 6. Limitations actuelles (à savoir)

- **Retention Prometheus : 30 jours** → au-delà, les chiffres disparaissent. Si tu veux garder plus, brancher un Thanos/VictoriaMetrics (pas priorité actuelle).
- **Pas encore de logs centralisés (Loki)** → quand tu vois un problème dans Grafana, pour la stack trace faut SSH sur prod et `docker compose logs <nom>`. Le lot M2 résoudra ça (Grafana > Explore > Loki).
- **Pas encore d'error tracking (GlitchTip)** → les 5xx Django sont comptés mais la stack trace détaillée nécessite les logs. Lot M2 aussi.
- **Pas d'alerting automatique** → tu dois regarder les dashboards, ou à défaut surveiller le site manuellement. À calibrer dans 2-4 semaines avec vraies baselines.
- **Pas de dashboard pour Summary FastAPI** spécifique → il est scrape mais pas de panel dédié. Peut s'ajouter plus tard via provisioning.

---

## 7. Résumé — workflow quotidien

**Check matinal (2 min)** :
1. Ouvrir Aïobi Meet Overview, Last 24h
2. Scanner les 4 stats haut : tous verts ?
3. Regarder queue Celery : pic dans la nuit ?
4. Regarder top containers CPU : pattern normal ?

**Check incident (10 min)** :
1. Aïobi Meet Overview, Last 1h
2. Identifier le panel qui rouge
3. Dashboard community dédié pour creuser (Node, cAdvisor, Redis, Celery, LiveKit)
4. SSH prod pour les logs si nécessaire
5. Action corrective → vérifier que le graph revient à la normale

**Check hebdo (15 min)** :
1. Aïobi Meet Overview, Last 7d
2. Comparer cette semaine vs la précédente via time-shift
3. Tendances growth (rooms, participants, req/s)
4. Anticiper saturation (disk, DB connections, RAM)
