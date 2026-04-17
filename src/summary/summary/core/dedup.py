"""Redis-based idempotency locks for the transcription pipeline.

Uses the SET NX EX pattern on the shared Redis instance already connected by
`analytics.MetadataManager`. The lock key format is ``transcribe_lock:{recording_id}``
and its value is the Celery task_id (or a ``pending-*`` placeholder before the
task is enqueued). Storing the task_id lets Layer C in ``celery_worker.py``
distinguish its own lock from a stale one held by a redelivered task.

Released via a Lua script that performs a compare-and-delete, so a late release
from a task whose TTL already expired (and whose lock was re-acquired by another
task) cannot accidentally delete someone else's lock.

Motivated by the 2026-04-17 duplication incident (recording ``0e882ca2``), where
three whisper workers transcribed the same audio concurrently because nothing
de-duplicated either the MinIO webhook replays or the Celery broker redeliveries.
"""

from functools import lru_cache
from typing import Optional

import redis

from summary.core.config import get_settings

settings = get_settings()


# Process-local lazy singleton via lru_cache(1). FastAPI runs multiple workers
# (gunicorn / uvicorn) and each keeps its own client; redis-py connection
# pooling handles the rest. Celery prefork children inherit nothing — they
# call _get_client() after fork and get a fresh connection pool.
@lru_cache(maxsize=1)
def _get_client() -> redis.Redis:
    """Return a lazily-initialised redis-py client bound to the task-tracker DB."""
    return redis.from_url(settings.task_tracker_redis_url)


def _lock_key(recording_id: str) -> str:
    return f"transcribe_lock:{recording_id}"


def acquire_transcribe_lock(
    recording_id: str, task_id: str, ttl_seconds: int
) -> bool:
    """Try to acquire the transcribe lock for a recording.

    Returns ``True`` if the caller now owns the lock, ``False`` if another
    execution already holds it. Uses ``SET key value NX EX ttl`` atomically.
    """
    return bool(
        _get_client().set(
            _lock_key(recording_id),
            task_id,
            nx=True,
            ex=ttl_seconds,
        )
    )


def claim_transcribe_lock(
    recording_id: str, task_id: str, ttl_seconds: int
) -> None:
    """Overwrite the lock unconditionally with ``task_id`` (caller already owns it).

    Used by the FastAPI endpoint to swap a ``pending-*`` placeholder for the
    real Celery task_id right after ``apply_async`` returns, so Layer C can
    later match the lock holder to its own task.
    """
    _get_client().set(_lock_key(recording_id), task_id, ex=ttl_seconds)


# Lua: delete the lock only if its current value matches the expected task_id.
# Atomic under Redis single-threaded execution. Prevents the classic
# "TTL expired, someone else acquired, now I release theirs" bug.
_RELEASE_IF_OWNER_SCRIPT = (
    "if redis.call('get', KEYS[1]) == ARGV[1] "
    "then return redis.call('del', KEYS[1]) else return 0 end"
)


def release_transcribe_lock(recording_id: str, task_id: str) -> None:
    """Release the lock only if ``task_id`` still owns it. Safe under TTL races."""
    _get_client().eval(_RELEASE_IF_OWNER_SCRIPT, 1, _lock_key(recording_id), task_id)


def get_lock_holder(recording_id: str) -> Optional[str]:
    """Return the task_id currently holding the lock, or ``None`` if unheld."""
    val = _get_client().get(_lock_key(recording_id))
    return val.decode() if val else None
