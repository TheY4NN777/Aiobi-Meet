"""API routes related to application tasks."""

import logging
import time
from typing import Optional

from celery.result import AsyncResult
from fastapi import APIRouter
from prometheus_client import Counter
from pydantic import BaseModel, field_validator

from summary.core.celery_worker import (
    _extract_recording_id,
    process_audio_transcribe_summarize_v2,
)
from summary.core.config import get_settings
from summary.core.dedup import (
    acquire_transcribe_lock,
    claim_transcribe_lock,
    get_lock_holder,
)

settings = get_settings()
logger = logging.getLogger(__name__)

# Prometheus counter for Layer B (FastAPI endpoint dedup). Increments on every
# duplicate /tasks POST refused by the Redis SETNX lock, whatever the upstream
# source (MinIO webhook replay, Django retry, manual curl, etc.).
duplicate_task_submit_counter = Counter(
    "aiobi_transcribe_duplicate_submit_total",
    "Number of duplicate transcribe task submissions blocked by the Redis lock.",
)


class TranscribeSummarizeTaskCreation(BaseModel):
    """Transcription and summarization parameters."""

    owner_id: str
    filename: str
    email: str
    sub: str
    version: Optional[int] = 2
    room: Optional[str]
    recording_date: Optional[str]
    recording_time: Optional[str]
    language: Optional[str]
    download_link: Optional[str]
    context_language: Optional[str] = None

    @field_validator("language")
    @classmethod
    def validate_language(cls, v):
        """Validate 'language' parameter."""
        if v is not None and v not in settings.whisperx_allowed_languages:
            raise ValueError(
                f"Language '{v}' is not allowed. "
                f"Allowed languages: {', '.join(settings.whisperx_allowed_languages)}"
            )
        return v


router = APIRouter(prefix="/tasks")


@router.post("/")
async def create_transcribe_summarize_task(request: TranscribeSummarizeTaskCreation):
    """Create a transcription and summarization task.

    Guarded by a Redis SETNX lock on ``recording_id`` (see summary.core.dedup).
    If another request for the same recording is already in-flight — whether
    the Celery task is running, queued, or waiting for a retry — this endpoint
    returns ``already_queued`` without enqueuing a duplicate.

    This defends against the scenario observed 2026-04-17 where MinIO
    webhook replays (or Celery broker redeliveries feeding a re-POST loop)
    caused 3 whisper instances to transcribe the same audio in parallel.
    """
    recording_id = _extract_recording_id(request.filename)

    # Reserve the lock BEFORE apply_async. The Celery task_id isn't known yet,
    # so we stash a placeholder; we overwrite it with the real task_id below.
    # The placeholder has to be unique per attempt so Layer C's guard can
    # detect "lock holder is ME" vs "lock holder is someone else".
    placeholder = f"pending-{int(time.time() * 1000)}"

    if not acquire_transcribe_lock(
        recording_id,
        placeholder,
        ttl_seconds=settings.transcribe_lock_ttl_seconds,
    ):
        holder = get_lock_holder(recording_id) or "unknown"
        duplicate_task_submit_counter.inc()
        logger.info(
            "Duplicate transcribe request rejected: recording_id=%s lock_holder=%s",
            recording_id,
            holder,
        )
        return {
            "status": "already_queued",
            "recording_id": recording_id,
            "lock_holder": holder,
        }

    task = process_audio_transcribe_summarize_v2.apply_async(
        args=[
            request.owner_id,
            request.filename,
            request.email,
            request.sub,
            time.time(),
            request.room,
            request.recording_date,
            request.recording_time,
            request.language,
            request.download_link,
            request.context_language,
        ],
        queue=settings.transcribe_queue,
    )

    # Replace placeholder with the real task_id so Layer C can prove ownership
    # when the worker picks up the message.
    claim_transcribe_lock(
        recording_id,
        task.id,
        ttl_seconds=settings.transcribe_lock_ttl_seconds,
    )

    return {"id": task.id, "message": "Task created", "recording_id": recording_id}


@router.get("/{task_id}")
async def get_task_status(task_id: str):
    """Check task status by ID."""
    task = AsyncResult(task_id)
    return {"id": task_id, "status": task.status}
