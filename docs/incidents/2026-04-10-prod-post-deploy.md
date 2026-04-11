# Rapport d'incident 00 — Production Aiobi Meet v1.0.0

**Deploiement initial** : 10 avril 2026 -  01h25 soiree
**Constats** : 10 avril 2026, des 06h40
**Statut** : Partiellement resolu — bloque par un probleme d'acces reseau sur le serveur de production
**Intervenant** : Ragnang-Newende Yanis Axel DABO, OGUN

---

## 1. Resume

Suite au premier deploiement de Aiobi Meet v1.0.0 en production, plusieurs fonctionnalites critiques se sont revelees inoperantes : emails transactionnels Django, badge Enterprise, enregistrement video, transcription IA. L'investigation a dure toute la journee du 10 avril et a permis d'identifier et corriger la majorite des problemes. Un blocage reseau sur le serveur de production empeche encore les emails Django et la transcription IA de fonctionner.

### Pourquoi ce document

Ce rapport ne sert pas uniquement a documenter ce qui a casse. Il capture le **processus de diagnostic** — comment chaque probleme a ete decouvert, quelles hypotheses ont ete testees, ce qui a marche et ce qui n'a pas marche. Un premier deploiement en production revele toujours des problemes que le staging ne peut pas reproduire (reseau, secrets, variables d'environnement). Ce document est une reference pour les prochains deploiements d'applications sur l'infrastructure Aiobi, et un moyen de ne pas refaire les memes erreurs.

Il faut noter que ces problemes de divergence staging/production ne sont pas inevitables. Ils apparaissent principalement quand l'infrastructure de staging n'est pas configuree de maniere identique a celle de production — ce qui est le cas ici (serveurs differents, reseaux Docker differents, regles iptables differentes). Dans certaines architectures, des outils comme Terraform, Ansible ou Kubernetes permettent de garantir que les deux environnements partagent la meme configuration et les memes regles. Quand ce n'est pas le cas, des adaptations post-deploiement sont necessaires et ce type de rapport devient d'autant plus important pour les documenter.

Il a ete redige en fin de journee a partir des logs git, de notes personnelles, des logs CI, et des conversations en temps reel avec le product owner. Idealement, il aurait du etre construit au fil de l'investigation — chaque decouverte notee au moment ou elle est faite, chaque hypothese consignee avant d'etre testee. Construire un rapport d'incident en temps reel plutot qu'apres coup permet de ne pas perdre le contexte, de ne pas retester des hypotheses deja invalidees, et de communiquer le statut a l'equipe a tout moment.

---

## 2. Deroulement

### Deploiement et premiers signalements

Le deploiement CI a reussi : tous les containers demarrent, le site est accessible sur meet.aiobi.world, id.aiobi.world et lkt.aiobi.world. Le product owner teste le lendemain matin et signale des 06h40 qu'il ne recoit pas l'email de verification pour se connecter. Il a une reunion imminente.

Investigation immediate. Le deploiement est retrigger, un plan B est prepare (desactivation temporaire de la verification email pour debloquer la connexion en attendant). Le product owner finit par se connecter mais constate que le badge Enterprise ne s'affiche pas et que les invitations par email ne partent pas.

### Investigation des emails Keycloak

Le premier reflexe est de verifier la configuration SMTP de Keycloak en production. La CI configure le SMTP via l'API REST de Keycloak a chaque deploiement, en utilisant les variables GitLab CI. En inspectant les variables CI, on decouvre qu'elles etaient **scopees uniquement pour l'environnement staging**. La pipeline prod ne les recevait donc pas, et Keycloak se retrouvait sans aucune config SMTP.

Le flow technique : la CI fait un `PUT /admin/realms/meet` avec la config `smtpServer` qui contient le host, port, user, password. Si les variables sont vides, la config SMTP est vide → Keycloak n'envoie rien.

**Resolution** : Unscope des variables email dans GitLab CI (passage de "staging" a "All (default)"). Apres retrigger de la pipeline, Keycloak envoie correctement les emails de verification.

### Investigation du badge Enterprise

Le product owner est connecte mais son `account_tier` reste `normal` en base Django, malgre le role `enterprise` assigne dans l'admin Keycloak (id.aiobi.world).

Pour comprendre, il faut connaitre le flow de synchronisation du tier :
1. L'utilisateur se connecte via OIDC → Keycloak emet un token
2. Le backend Django appelle le endpoint **userinfo** de Keycloak avec ce token
3. Le backend lit `realm_access.roles` dans la reponse userinfo
4. Si `enterprise` est dans la liste → `account_tier = enterprise`. Sinon → `normal`.

Ce flow est execute a **chaque login** par une methode custom `_sync_account_tier` dans `core/authentication/backends.py`.

L'investigation se deroule en plusieurs etapes :

**Etape 1 — Verification du mapper Keycloak**. On verifie sur id.aiobi.world que le mapper "realm roles" dans le client scope "roles" est bien configure avec "Add to userinfo: ON". Il l'est.

**Etape 2 — Verification du scope OIDC**. On compare le `env.d/common` staging et prod. Le staging a `OIDC_RP_SCOPES="openid email profile"`, la prod a `OIDC_RP_SCOPES="openid email"`. Il manque `profile`. Sans ce scope, Keycloak peut ne pas inclure certains claims dans le userinfo. Le scope est ajoute.

**Etape 3 — Test apres correction**. Malgre l'ajout du scope, le tier reste `normal` apres reconnexion. On ajoute un log de debug dans `_sync_account_tier` pour voir exactement ce que le backend recoit dans les claims. Le log ne s'affiche pas dans les backend logs prod (difficulte d'acces aux logs en temps reel sans acces serveur).

**Etape 4 — Verification en base via le debug job**. On enrichit le debug job CI avec un shell Django qui liste les users et leur `account_tier`. Resultat : tous les users sont `normal`.

**Etape 5 — Decouverte du downgrade systematique**. En analysant le code, on comprend que `_sync_account_tier` downgrade **inconditionnellement** quand `realm_access.roles` est present mais ne contient pas `enterprise`. Meme si on promeut un user en base Django, le prochain login le remet a `normal`. Le probleme est que Keycloak renvoie bien des roles (`default-roles-meet`, `offline_access`, etc.) mais pas `enterprise` — soit parce que le scope ne suffit pas, soit parce que le role n'est pas correctement propage.

**Resolution** :
- Modification de `_sync_account_tier` pour ne rien faire quand `realm_access` est absent ou vide (preserve le tier actuel)
- Mise en place d'une promotion automatique par domaine email : la CI promeut dans Django DB et assigne le role dans Keycloak a chaque deploiement
- `enterprise-users.txt` avec des patterns `@domaine` (@aiobi.world, @bbsholding.net, @burvalcorporate.com, etc.)

### Corruption des donnees utilisateurs

En tentant de corriger les tiers via le debug job, un probleme plus grave survient. Le debug job contenait un code de correction rapide qui itere sur **tous les utilisateurs** et les promeut en enterprise + superuser sans aucun filtre :

```python
for u in User.objects.all():
    u.is_superuser = True
    u.is_staff = True
    u.account_tier = 'enterprise'
    u.save()
```

Ce code a ete execute manuellement. Les 50+ utilisateurs en base prod — y compris les comptes gmail, yahoo, icloud d'utilisateurs externes — sont tous promus enterprise avec acces admin Django.

De plus, le `save()` sans `update_fields` declenche le signal Django `post_save`, qui tente un back-sync vers Keycloak via l'API admin. Mais `KEYCLOAK_ADMIN_CLIENT_ID` et `KEYCLOAK_ADMIN_CLIENT_SECRET` ne sont pas configures → erreur 401. La promotion Django est faite mais pas la promotion Keycloak, creant une desynchronisation.

**Resolution** : Le code dangereux est retire du debug job et remplace par des diagnostics (logs, test SMTP, check env). La promotion est reecrite avec filtrage par domaine email et `User.objects.filter(pk=u.pk).update()` pour bypasser le signal `post_save`. Un cleanup des donnees (remettre les non-company users a `normal` + retrait `is_superuser`) est planifie pour le prochain deploy.

### Signalement enregistrement et transcription

Le product owner signale que l'enregistrement et la transcription ne fonctionnent pas. La comparaison methodique du `env.d/common` de production avec celui du staging revele un ensemble de differences critiques.

Le fichier `env.d/common` de prod avait ete cree independamment, avec des valeurs par defaut de developpement (mailcatcher) et des sections entieres absentes (S3/MinIO, userinfo fields). Chaque difference causait un probleme distinct :

| Element manquant | Consequence technique |
|---------|-------------|
| `DJANGO_EMAIL_HOST=mailcatcher` au lieu de `smtp.gmail.com` | Le backend tente de se connecter a un service qui n'existe pas en prod (mailcatcher est un outil de dev). L'envoi d'email bloque le worker Gunicorn pendant le timeout → l'utilisateur voit un 504. |
| Config S3/MinIO absente | Le backend n'a pas les credentials pour acceder au stockage MinIO. Les enregistrements ne peuvent pas etre sauvegardes ni lus. |
| LiveKit Egress absent du compose | Le service qui capture le flux video de la reunion et l'uploade vers MinIO n'est pas deploye. L'enregistrement ne peut pas demarrer. |
| `RECORDING_EXPIRATION_DAYS=1` | Les enregistrements sont supprimes apres 24h — une valeur de test, pas une valeur de production. |
| `SUMMARY_API_TOKEN` vide | Variable CI scopee staging. Le service summary ne peut pas authentifier les requetes du backend. |

**Resolution** : Toutes ces differences ont ete corrigees. La retention des enregistrements a ete redessinee avec une logique par tier : 14 jours pour les comptes gratuits, 365 jours pour les comptes enterprise. L'email de notification d'enregistrement affiche la bonne duree selon le tier de l'organisateur.

### Decouverte de la cause racine : probleme reseau

Apres avoir corrige toutes les configurations, un test d'envoi email Django via le debug job retourne toujours une erreur :
```
EMAIL SEND FAILED: [Errno 101] Network unreachable
```

En parallele, les logs du container Whisper (transcription IA) montrent :
```
error sending request for url (https://pypi.org/simple/hatchling/)
Caused by: operation timed out
```

L'erreur `Network unreachable` signifie que le container ne peut pas atteindre Internet du tout — ce n'est pas un probleme de port ou de firewall specifique, c'est un probleme de routage reseau.

L'analyse de l'architecture reseau Docker revele le probleme. Le serveur de production utilise des regles iptables pour autoriser l'acces Internet sortant depuis les containers Docker. Mais ces regles ne sont configurees que pour le reseau `aiobi-public` (172.18.0.0/16), qui heberge Traefik, le frontend, Keycloak et LiveKit.

Le backend Django, Whisper, et tous les services applicatifs tournent sur le reseau `default` cree automatiquement par Docker Compose. Ce reseau n'a pas de regles iptables pour le NAT sortant → pas d'acces Internet.

C'est la raison pour laquelle les **emails Keycloak fonctionnent** (Keycloak est sur `aiobi-public`) mais **pas les emails Django**. C'est aussi la raison du crash de Whisper, qui doit telecharger ses dependances Python et le modele IA (~3 GB) au premier demarrage.

Cette decouverte explique retrospectivement pourquoi certains fix ne prenaient pas effet : meme avec la bonne config SMTP, le backend ne pouvait physiquement pas atteindre le serveur SMTP.

**Resolution** : Necessit un acces serveur pour appliquer les regles iptables au reseau `default`. C'est le seul point bloquant restant.

### Incoherence des permissions d'acces aux enregistrements

En investiguant les problemes d'enregistrement, une incoherence logique dans les permissions est decouverte. Le code du modele `Recording` exigeait `is_enterprise` pour l'action `retrieve` (consulter un enregistrement) et `stop` (arreter un enregistrement en cours).

Or, les utilisateurs du plan gratuit ont le droit d'enregistrer (quota 10/mois). Il n'a pas de sens de leur permettre de creer des enregistrements mais de leur interdire de les consulter ensuite.

**Resolution** : Les actions `retrieve` et `stop` sont ouvertes a tous les proprietaires/administrateurs de la room. La restriction enterprise reste uniquement sur le **quota** : le nombre d'enregistrements et de transcriptions par mois.

---

## 3. Cause racine

```
aiobi-public (172.18.0.0/16) — regles iptables → acces Internet
  ├── traefik
  ├── frontend
  ├── keycloak        → emails Keycloak OK ✓
  └── livekit

default — PAS de regles iptables → PAS d'acces Internet
  ├── backend          → SMTP unreachable ✗
  ├── whisper          → pypi.org unreachable, crash au demarrage ✗
  ├── celery, summary, celery-transcribe, celery-summarize
  ├── redis, redis-summary, postgresql
  ├── minio, livekit-egress (fonctionnent en interne, pas besoin d'Internet)
  └── mailcatcher (vestige de la config initiale, inutile en prod)
```

Les regles iptables existantes (documentees dans `docker/production/README.md` section 10.1) ne couvrent que `aiobi-public`. Il manque les memes regles pour le subnet du reseau `default`.

A noter : Whisper n'a besoin d'Internet que **temporairement** (premier demarrage pour telecharger les dependances et le modele). Une fois le modele cache dans le volume Docker `whisper-models`, il fonctionne entierement en local.

---

## 4. Erreurs humaines

### Corruption des donnees par le debug job

Un code dans le debug job promouvait tous les utilisateurs en enterprise + superuser sans aucun filtre. Ce code, prevu comme correction rapide temporaire, a ete execute manuellement en production sans mesurer les consequences. Impact : 50+ comptes corrompus, tous les utilisateurs externes avec acces admin Django.

**Lecon** : Ne jamais ecrire de boucle sans filtre sur une table entiere dans un job CI executable manuellement. Toujours filtrer par critere (domaine, role, flag) et utiliser `update_fields` pour eviter les effets de bord des signaux Django.

### Configuration de production incomplete

Le fichier `env.d/common` de prod a ete cree independamment du staging avec des valeurs incompletes ou de developpement. Au lieu de partir du fichier staging et d'adapter les valeurs specifiques a la prod (domaines, URLs), le fichier a ete ecrit de zero, ce qui a cause 6 problemes distincts (SMTP, S3, OIDC scope, userinfo, retention, egress).

**Lecon** : Toujours generer le env de prod a partir du staging. Faire un diff systematique avant le premier deploiement d'un nouvel environnement.

### Variables CI scopees par environnement

Les variables SMTP (DJANGO_EMAIL_HOST, etc.) et SUMMARY_API_TOKEN etaient scopees "staging" dans GitLab CI. La pipeline prod ne les recevait pas. Ce probleme n'est pas visible dans l'interface GitLab sans verifier explicitement le scope de chaque variable.

**Lecon** : Verifier le scope de chaque variable CI avant le premier deploiement d'un nouvel environnement. Idealement, creer un checklist de validation pre-deploiement.

### Valeur de test en production

`RECORDING_EXPIRATION_DAYS=1` — une valeur de test (1 jour) deployee en production. Les enregistrements des utilisateurs etaient supprimes apres 24h sans avertissement.

**Lecon** : Les valeurs par defaut dans les fichiers de config commites doivent etre des valeurs de production raisonnables, pas des valeurs de test ou de developpement.

### Services manquants dans le compose de production

LiveKit Egress et le service Summary n'etaient pas dans le compose prod alors qu'ils etaient presents en staging. Sans egress, l'enregistrement video est impossible. Sans summary, la transcription IA ne peut pas etre declenchee.

**Lecon** : Meme principe que la configuration — verifier que tous les services du staging sont presents en prod avant le premier deploiement.

### Detection CI des changements Keycloak

La CI utilisait `git diff HEAD~1 HEAD` pour detecter les changements de themes Keycloak et declencher un `--force-recreate`. Cette commande ne compare que le dernier commit avec le precedent. Lors d'un push contenant plusieurs commits, les changements de themes dans les commits intermediaires ne sont pas detectes et le recreate ne se declenche pas.

Consequence : Keycloak continuait de tourner avec les anciens themes en memoire malgre la mise a jour des fichiers sur le filesystem (bind mount).

**Lecon** : Utiliser `CI_COMMIT_BEFORE_SHA` fourni par GitLab CI pour comparer l'etat avant le push avec l'etat apres, couvrant ainsi tous les commits.

### Regles iptables non etendues au reseau default

Lors de la mise en place du serveur de production, les regles iptables pour l'acces Internet sortant des containers Docker n'ont ete configurees que pour le reseau `aiobi-public` (utilise par Traefik et les services exposes). Le reseau `default` cree par le compose applicatif n'a pas ete pris en compte, bien qu'il heberge le backend qui a besoin d'envoyer des emails et le container Whisper qui doit telecharger le modele IA.

**Lecon** : Documenter et verifier les regles iptables pour **chaque** reseau Docker qui necessite un acces Internet sortant, pas seulement le reseau principal.

---

## 5. Statut actuel

### Resolu et deploye
- [x] Emails Keycloak (verification, reset password)
- [x] Config SMTP dans env.d/common prod (smtp.gmail.com:465)
- [x] Config S3/MinIO dans env.d/common prod
- [x] Scope OIDC `profile` ajoute
- [x] LiveKit Egress et Summary service ajoutes en prod (containers UP, mais enregistrement non fonctionnel — diagnostic serveur requis)
- [x] Sync `account_tier` ne downgrade plus quand claims vides
- [x] Acces recording ouvert a tous les owners (pas seulement enterprise)
- [x] Retention par tier (14j free, 365j enterprise)
- [x] Promotion enterprise par domaine (Django DB + role Keycloak)
- [x] Debug job nettoye (code dangereux retire)
- [x] Detection CI Keycloak corrigee (CI_COMMIT_BEFORE_SHA)

### Bloque — acces serveur requis
- [ ] Regles iptables pour le reseau `default` (debloque SMTP Django + Whisper)
- [ ] Enregistrement video : le backend retourne 201 (start-recording) mais l'egress boucle indefiniment. Cause inconnue sans acces aux logs du container egress en prod — potentiellement un probleme d'injection des secrets dans `livekit-egress.yaml` ou de communication egress → MinIO

### A faire au prochain deploy
- [ ] Merger develop → main (tous les fix sont sur develop, pas encore sur main)
- [ ] Cleanup users : remettre les non-company users a `normal` + retrait `is_superuser`
- [ ] Retirer le log de debug dans `_sync_account_tier`
- [ ] Retirer le container `mailcatcher` du compose prod (inutile)

---

## 6. Actions pour debloquer

Acces serveur requis. Commandes a executer :

```bash
# 1. Trouver le subnet du reseau default
docker network inspect production_default --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'

# 2. Ajouter les regles iptables (remplacer X.X.X.X/XX par le subnet trouve)
iptables -I DOCKER-USER -s X.X.X.X/XX -j ACCEPT
iptables -I DOCKER-USER -d X.X.X.X/XX -j ACCEPT
iptables -t nat -A POSTROUTING -s X.X.X.X/XX ! -o docker0 -j MASQUERADE

# 3. Persister les regles apres reboot
netfilter-persistent save

# 4. Redemarrer Whisper pour qu'il telecharge le modele
docker restart production-whisper-1

# 5. Tester l'envoi email Django
docker compose exec -T backend python manage.py shell -c "
from django.core.mail import send_mail
send_mail('Test', 'Test prod', None, ['yanisaxel.dabo@aiobi.world'])
print('OK')
"
```

---

## 7. Ce que cet incident revele

Ce n'est pas un incident cause par un bug dans le code applicatif. C'est un incident d'**ecart entre deux environnements** — staging et production — qui auraient du etre quasi identiques. Chaque probleme decouvert etait une difference non documentee entre les deux : une variable scopee, un fichier cree separement, un service oublie, une regle reseau non etendue.

Le staging fonctionnait parfaitement. La production aussi, en apparence — les containers tournent, le site repond, les reunions video marchent. Mais tout ce qui touche a la communication externe (emails, telechargement de modeles IA) ou a la synchronisation entre systemes (Keycloak → Django) etait silencieusement casse.

La plupart de ces problemes auraient ete detectes par un **test de smoke automatise** dans la pipeline de deploiement : un envoi d'email, une verification du `account_tier` apres login, un check de connectivite reseau. L'absence de ces tests a fait que les problemes n'ont ete decouverts que par le product owner en conditions reelles, a 06h40 du matin, avec une reunion dans l'heure.

L'investigation a ete rendue plus difficile par l'absence d'acces direct au serveur de production. Tout le diagnostic a du passer par le debug job CI — un outil prevu pour du diagnostic Traefik, adapte en cours de route pour tester le SMTP, les tiers utilisateurs, les logs des services. Cette contrainte a ralenti le processus mais a aussi force la creation d'un outillage de diagnostic reutilisable.

Sur 18h d'investigation, la majorite du temps a ete consacree au probleme du badge Enterprise — un probleme en apparence simple (un tier en base de donnees) mais dont la cause traversait trois systemes (Keycloak, OIDC, Django) avec des interactions subtiles (sync au login, signaux post_save, scopes OIDC). Ce type de probleme distribue est le plus couteux a diagnostiquer et le plus important a documenter.

A la fin de cette journee, le site est fonctionnel pour les reunions video. Les emails Django et la transcription IA restent bloques par un probleme reseau qui ne peut etre resolu que depuis le serveur. Une seule commande iptables separe la production d'un etat pleinement operationnel.
