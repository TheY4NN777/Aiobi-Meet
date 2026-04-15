"""Application."""

import sentry_sdk
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from summary.api import health
from summary.api.main import api_router
from summary.core.config import get_settings

settings = get_settings()


if settings.sentry_dsn and settings.sentry_is_enabled:
    sentry_sdk.init(dsn=settings.sentry_dsn, enable_tracing=True)

app = FastAPI(
    title=settings.app_name,
)

# Prometheus instrumentation — expose /metrics pour Prometheus scrape interne.
# Endpoint accessible uniquement via le reseau Docker (summary:8000/metrics),
# jamais expose publiquement (summary n'est route par aucun nginx/traefik externe).
Instrumentator().instrument(app).expose(app)

app.include_router(api_router, prefix=settings.app_api_v1_str)
app.include_router(health.router)
