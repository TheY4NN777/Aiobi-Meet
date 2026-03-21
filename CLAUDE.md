# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Aïobi Meet** is a sovereign video conferencing platform for the African tech ecosystem. It is a rebranded fork of [La Suite Numérique Meet](https://github.com/suitenumerique/meet) (built by DINUM, MIT license).

**Target deployment**: `meet.aiobi.world`

### Brand Rules (from Guidelines de marque)
- Name: **Aïobi** (capital A, ï tréma — never "AÏOBI", never "Aiobi")
- Product: **Aïobi Meet**
- Colors ONLY: Blanc #F8F8F9, Noir #0F1010, Violet #4A3C5C, Lilas #E4D3E6
- Fonts: HK Grotesk and Roboto
- Logo: black or white only, only circular element allowed in visual identity

## Architecture

Four main components run simultaneously:

- **React frontend** (`src/frontend/`) — Vite.js + React 18, React Aria, Panda CSS, Valtio state, TanStack Query, i18next, wouter routing
- **Django backend** (`src/backend/`) — Django 5 + DRF, django-configurations, Celery, PostgreSQL, Redis, MinIO (S3)
- **LiveKit server** — SFU for real-time video/audio (simulcast, VP9/AV1 codecs)
- **FastAPI summary service** (`src/summary/`) — Optional AI features (transcription & summarization)

Additional modules:
- `src/agents/` — LiveKit agent for multi-user transcription
- `src/sdk/` — JavaScript SDK library and consumer app (not yet rebranded)
- `src/mail/` — MJML-based email templates

### Backend (`src/backend/`)
- `meet/` — Django project config (settings, urls, celery, wsgi)
- `core/` — Main Django app: models, API, auth, services, recording, tasks
- `demo/` — Demo data generation
- Settings use `django-configurations`; test config: `DJANGO_CONFIGURATION=Test`
- Auth currently via `mozilla-django-oidc` (to be replaced with Keycloak)
- Ruff is the primary Python linter/formatter (config in `pyproject.toml`)
- Import ordering: future → stdlib → django → third-party → meet(core) → first-party → local

### Frontend (`src/frontend/`)
- Panda CSS for styling (run `panda codegen` before dev/build)
- React Aria Components for accessible UI primitives
- Valtio for state management
- LiveKit React SDK (`@livekit/components-react`) for video/audio
- wouter for routing
- Theme: `data-lk-theme="aiobi-light"` in index.html, selectors in `src/styles/livekit.css`

### Summary Service (`src/summary/`)
- Separate FastAPI app with its own Dockerfile and pyproject.toml
- Celery workers for transcription and summarization

## Development Commands

All development uses Docker Compose via Make. Run `make help` for the full list.

### Bootstrap (first time)
```bash
make bootstrap FLUSH_ARGS='--no-input'
```

### Run / Stop
```bash
make run          # Start all services (backend + frontend + summary)
make run-backend  # Start backend only (for local frontend dev)
make stop
make down         # Stop and remove containers
```

### Frontend (local dev outside Docker)
```bash
cd src/frontend && npm i && npm run dev
```

### Backend Linting
```bash
make lint                  # Runs ruff format + ruff check + pylint
make lint-ruff-format      # Format only
make lint-ruff-check       # Lint only
```

### Frontend Linting
```bash
make frontend-lint         # ESLint
make frontend-format       # Prettier
```

### Tests
```bash
make test                  # All tests (backend parallel + summary)
make test-back             # Backend tests (sequential)
make test-back-parallel    # Backend tests with pytest-xdist
make test-summary          # Summary service tests
```

Single test file/path: `make test-back src/backend/core/tests/test_something.py`

### Database
```bash
make migrate               # Run Django migrations
make makemigrations        # Generate new migrations
make demo                  # Reset DB and load demo data
make resetdb               # Flush DB and create superuser (admin/admin)
```

### i18n
```bash
make i18n-generate         # Extract translation strings (back + front)
make i18n-compile          # Compile .po files
```

### Mails
```bash
make mails-install && make mails-build   # Build MJML email templates
```

## Git Commit Rules

### Commit command (MANDATORY)
This is a shared server. Always use this exact pattern for every commit:
```bash
GIT_COMMITTER_NAME="TheY4NN777" GIT_COMMITTER_EMAIL="yanisaxel.dabo@aiobi.world" \
git commit --author="TheY4NN777 <yanisaxel.dabo@aiobi.world>" -m "message"
```
- NEVER modify `git config user.name` or `git config user.email`
- NEVER use `-c user.name` or `-c user.email`
- NEVER add `Co-Authored-By` or any Claude/AI mention in commit messages

### Commit message format
Format: `type(scope) short description`

Example: `chore(branding) rebrand fork to Aïobi Meet`

- No emojis in commit messages
- Types: `chore`, `feat`, `fix`, `refactor`, `docs`, `ci`, `test`, etc.
- Scopes: `backend`, `frontend`, `branding`, `CI`, `docker`, etc.

Add a changelog entry in `CHANGELOG.md` under `[Unreleased]` for each PR.

## Access Points (Docker dev)
- Frontend: http://localhost:3000 (credentials: meet/meet)
- Backend: http://localhost:8071
