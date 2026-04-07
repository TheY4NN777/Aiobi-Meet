# Session: Recording & Transcription Pipeline

## Metadata
- **Date**: 2026-04-01 → 2026-04-05
- **Operator**: TheY4NN777 (Yanis Axel DABO)
- **Sprint**: Sprint 2
- **Tasks**: Self-hosted recording + transcription pipeline
- **Branch**: develop
- **Commits**:
  - `0830fce6` — `feat(backend+summary) self-hosted transcription: MinIO storage + webhook + email notification`
  - `dbe301ea` — `feat(transcription) frontend, docker, CI, migration for self-hosted transcription`
  - `40bc2d79` — `fix(docker) use faster-whisper-server:latest-cpu tag (latest does not exist)`
  - `4e3746ac` — `feat(recording) add LiveKit Egress + MinIO webhook for recording pipeline`
  - `b4dbda09` — `fix(docker) egress config via CI sed, fix whisperx_allowed_languages JSON format`
  - `1da7072a` — `fix(staging) add MinIO/S3 credentials to backend env, clean duplicate email vars`
  - `c28dbbeb` — `fix(backend) strip Bearer prefix from LiveKit webhook auth token (server v1.8+)`
  - `91cad120` — `fix(backend) allow internal Docker webhooks (ALLOWED_HOSTS + SSL exempt)`
  - `894cf402` — `fix(backend) disable DRF auth on LiveKit webhook endpoint`
  - `d8158318` — `fix(staging) recording download + transcription callback`
  - `ac8cf387` — `fix(summary,mail) handle Whisper plain text response + French email templates`
  - `8ffaec3f` — `feat(summary) add timestamps to transcriptions via verbose_json`
  - `bbd18db8` — `fix(staging) remove hardcoded email credentials from env.d/common`

## Objectives
1. Record meetings via LiveKit Egress (video MP4 or audio OGG)
2. Store recordings in MinIO (S3-compatible, self-hosted)
3. Transcribe recordings using Whisper (faster-whisper-server, CPU)
4. Upload transcriptions to MinIO, notify backend via webhook
5. Send email notification when transcription is ready
6. Allow download of recordings and transcriptions via authenticated nginx proxy
7. Add timestamps to transcriptions

## Architecture

### Recording Flow
```
User clicks "Record" → Backend creates Recording model + starts LiveKit Egress
→ Egress captures room video/audio → uploads MP4 to MinIO (recordings/{uuid}.mp4)
→ MinIO webhook notifies backend (storage-hook) → Backend updates Recording status
→ Backend notifies Summary service via Celery task
```

### Transcription Flow
```
Summary service receives task → downloads MP4 from MinIO
→ extracts audio (ffmpeg) → sends to faster-whisper-server (/v1/audio/transcriptions)
→ receives verbose_json with timestamped segments
→ formats as Markdown with [MM:SS] timestamps
→ uploads to MinIO (transcriptions/{uuid}.md)
→ POST /api/v1.0/recordings/{id}/transcription-ready/ to backend
→ Backend updates recording.transcription_key, sends email notification
```

### Download Flow
```
User visits /recording/{uuid} → Frontend fetches recording metadata
→ User clicks download → GET /media/recordings/{uuid}.mp4
→ nginx auth_request to /recording-media-auth
→ Backend /api/v1.0/recordings/media-auth/ verifies user permissions
→ Backend generates S3 SigV4 auth headers, returns 200
→ nginx captures Authorization, X-Amz-Date, X-Amz-Content-SHA256 headers
→ nginx proxies to MinIO with S3 auth headers → file served
```

### New Docker Services (staging)
- **whisper** — `fedirz/faster-whisper-server:latest-cpu` (model: Systran/faster-whisper-large-v3)
- **summary** — FastAPI app (receives recording notifications, queues tasks)
- **celery-transcribe** — Celery worker (queue: transcribe-queue, concurrency: 2)
- **celery-summarize** — Celery worker (queue: summarize-queue, ready for Phase 2 LLM)
- **redis-summary** — Dedicated Redis for summary Celery broker
- **livekit-egress** — `livekit/egress:v1.11.0` (records rooms, uploads to MinIO)

## Issues Encountered & Fixes

### 1. faster-whisper-server image tag
- **Error**: `docker pull fedirz/faster-whisper-server:latest` → tag does not exist
- **Fix**: Changed to `:latest-cpu` (Docker Hub only has `:latest-cpu` and `:latest-cuda`)

### 2. WHISPERX_ALLOWED_LANGUAGES parsing
- **Error**: pydantic-settings failed to parse `en,fr` (comma-separated)
- **Fix**: Changed to JSON format `["en","fr"]`

### 3. LiveKit Egress permission denied
- **Error**: Custom entrypoint with sed → `Permission denied` writing config inside image
- **Fix**: Removed custom entrypoint, injected secrets via CI sed before mounting as read-only volume

### 4. DJANGO_ALLOWED_HOSTS missing `backend`
- **Error**: All LiveKit webhooks returned **400** (Django HTML error, not DRF JSON)
- **Root cause**: LiveKit sends webhooks to `http://backend:8000`, but `backend` hostname not in `ALLOWED_HOSTS`
- **Fix**: Added `backend` to `DJANGO_ALLOWED_HOSTS` in `env.d/common`
- **Key insight**: 400 was Django's `DisallowedHost`, not our webhook code

### 5. SECURE_SSL_REDIRECT blocking internal webhooks
- **Error**: After fixing ALLOWED_HOSTS, webhooks returned **301** redirect
- **Root cause**: `SECURE_SSL_REDIRECT=True` redirects HTTP → HTTPS, but internal Docker calls use HTTP
- **Fix**: Added `r"^api/v1\.0/rooms/webhooks-livekit/"` and `r"^api/v1\.0/recordings/"` to `SECURE_REDIRECT_EXEMPT`

### 6. Bearer token in LiveKit webhooks
- **Error**: JWT decode failed with "Invalid header padding"
- **Root cause**: LiveKit server v1.8+ sends `Authorization: Bearer <jwt>` but `TokenVerifier.verify()` expects raw JWT
- **Fix**: Strip "Bearer " prefix before passing to verify()

### 7. DRF authentication on webhook endpoint
- **Error**: **401** "Token verification failed" on webhook
- **Root cause**: DRF tried to decode LiveKit JWT as a user session token via `authentication_classes`
- **Fix**: Added `authentication_classes=[]` to `webhooks_livekit` action decorator

### 8. Nginx media-auth routing
- **Error**: Recording download → **404** on `/api/v1.0/files/media-auth/`
- **Root cause**: Nginx routed recording media-auth to `files/media-auth` (which requires `file_upload` feature flag) instead of `recordings/media-auth`
- **Fix**: Added separate nginx location `/media/recordings/` with auth to `/recording-media-auth` → `recordings/media-auth`

### 9. Missing X-Original-URL header
- **Error**: Recording download → **403** "Missing HTTP_X_ORIGINAL_URL header"
- **Root cause**: Backend `_auth_get_original_url()` reads `HTTP_X_ORIGINAL_URL` from nginx subrequest, but nginx wasn't sending it
- **Fix**: Added `proxy_set_header X-Original-URL $request_uri` in `/recording-media-auth` location

### 10. MinIO rejecting proxied requests
- **Error**: Backend returned 200 for auth but MinIO returned **403**
- **Root cause**: Backend generates S3 SigV4 auth headers in the auth response, but nginx wasn't forwarding them to MinIO
- **Fix**: Used `auth_request_set` to capture `Authorization`, `X-Amz-Date`, `X-Amz-Content-SHA256` from auth response and `proxy_set_header` to forward them

### 11. Summary service SSL error on callback
- **Error**: `SSLError: HTTPSConnectionPool(host='backend', port=8000)` when notifying backend
- **Root cause**: `webhook_service.py` only mounted retry adapter on `https://`, and SECURE_SSL_REDIRECT redirected HTTP → HTTPS
- **Fix**: (a) Mount adapter on `http://` too, (b) Exempt `/api/v1.0/recordings/` from SSL redirect

### 12. Whisper returns empty transcription
- **Error**: All transcriptions showed "Aucun contenu audio n'a été détecté"
- **Root cause**: Whisper API returns `Transcription` object with `.text` only (no `.segments`). Code checked `segments` → None → "empty"
- **Fix**: Added fallback to `transcription.text` when segments unavailable
- **Verification**: Manual test confirmed Whisper correctly transcribed audio

### 13. No timestamps in transcription
- **Enhancement**: Default API returns plain text without timing info
- **Fix**: Added `response_format="verbose_json"` to Whisper API call → returns segments with `.start` and `.end` timestamps
- **Format**: `[MM:SS]` per segment (or `[HH:MM:SS]` for recordings > 1h)

### 14. Hardcoded secrets in tracked files
- **Error**: `livekit-egress.yaml` and `env.d/common` had real secrets committed during live debugging
- **Fix**: Reverted to placeholder values, committed the cleanup

## Key Technical Decisions
- **faster-whisper-server over WhisperX library** — simpler, OpenAI-compatible API, no pyannote dependency
- **verbose_json format** — provides timestamps per segment without needing diarization
- **No speaker diarization (for now)** — pyannote requires HuggingFace token, timestamps-only is sufficient
- **Separate nginx locations** — `/media/recordings/` and `/media/transcriptions/` each with proper auth routing
- **S3 SigV4 headers via auth_request_set** — matches upstream Kubernetes ingress pattern
- **SECURE_REDIRECT_EXEMPT for internal services** — all internal Docker HTTP calls exempt from SSL redirect
- **Markdown transcription format** — simple, readable, downloadable

## Files Modified

### Backend
- `src/backend/meet/settings.py` — SECURE_REDIRECT_EXEMPT
- `src/backend/core/api/viewsets.py` — authentication_classes on webhook, transcription-ready endpoint
- `src/backend/core/services/livekit_events.py` — Bearer token stripping
- `src/backend/core/models.py` — transcription_key field on Recording
- `src/backend/core/migrations/0019_recording_transcription_key.py` — new migration

### Summary Service
- `src/summary/summary/core/celery_worker.py` — verbose_json, MinIO upload, backend notify
- `src/summary/summary/core/transcript_formatter.py` — timestamps, .text fallback
- `src/summary/summary/core/webhook_service.py` — http:// adapter mount

### Docker / Staging
- `docker/staging/compose.yaml` — whisper, summary, celery-transcribe, celery-summarize, redis-summary, livekit-egress, MinIO webhook
- `docker/staging/default.conf.template` — recording/transcription media-auth nginx locations
- `docker/staging/env.d/common` — ALLOWED_HOSTS, recording vars, MinIO credentials
- `docker/staging/env.d/summary` — new file, summary service configuration
- `docker/staging/livekit-egress.yaml` — new file, egress S3 output config

### Email
- `src/mail/mjml/transcription_ready.mjml` — new template (French)
- `src/mail/mjml/screen_recording.mjml` — translated to French, signature aligned right
- `src/mail/mjml/partial/footer.mjml` — translated to French

### Frontend
- `src/frontend/src/features/recording/` — transcription download button, API types

### CI
- `.gitlab-ci.yml` — build-summary-staging, secret injection for egress/summary

## Pending / Next Steps

### To test after deployment
- [ ] Full recording flow: record → stop → download MP4
- [ ] Full transcription flow: record → stop → wait → download transcription with timestamps
- [ ] Email notification received with French text and right-aligned signature
- [ ] Verify no secrets in committed code

### Future enhancements
- [ ] Speaker diarization (Phase 2 — requires pyannote + HuggingFace token)
- [ ] LLM summarization via Docker Model Runner (Phase 2 — IS_SUMMARY_ENABLED=false)
- [ ] Audio-only recording mode (TRANSCRIPT mode with OGG, lighter than video)
- [ ] Recording expiration / auto-cleanup policy
