"""
Periodic tasks for recording and transcription lifecycle management.
"""

import logging
from datetime import timedelta

from django.conf import settings
from django.core.files.storage import default_storage
from django.utils import timezone

from core.models import Recording, User
from core.tasks._task import task

logger = logging.getLogger(__name__)


def _get_retention_days(user: User) -> int:
    """Return the transcription retention days for a given user based on their tier."""
    if user.account_tier == User.AccountTier.ENTERPRISE:
        return settings.TRANSCRIPTION_RETENTION_DAYS_ENTERPRISE
    return settings.TRANSCRIPTION_RETENTION_DAYS_DEFAULT


def _delete_transcription(recording: Recording) -> None:
    """Delete the transcription file from storage and clear the key on the recording."""
    if recording.transcription_key:
        try:
            default_storage.delete(recording.transcription_key)
        except Exception:  # noqa: BLE001
            logger.warning(
                "Failed to delete transcription file %s for recording %s",
                recording.transcription_key,
                recording.id,
            )
        recording.transcription_key = None
        recording.save(update_fields=["transcription_key", "updated_at"])
        logger.info("Transcription deleted for recording %s.", recording.id)


@task
def purge_expired_transcriptions():
    """Purge transcriptions that have exceeded their retention period.

    Runs hourly via Celery Beat. For each user, deletes transcriptions older
    than their retention limit (14 days for normal, 365 for enterprise).

    Also processes recordings flagged for deferred deletion
    (transcription_deletion_scheduled_at <= now).
    """
    now = timezone.now()
    total_purged = 0

    # --- Deferred deletions (Lot 4: scheduled after limit exceeded) ---
    deferred = Recording.objects.filter(
        transcription_deletion_scheduled_at__lte=now,
        transcription_key__isnull=False,
    ).select_related("room")

    for recording in deferred:
        logger.info(
            "Deferred transcription deletion for recording %s (scheduled at %s).",
            recording.id,
            recording.transcription_deletion_scheduled_at,
        )
        _delete_transcription(recording)
        Recording.objects.filter(pk=recording.pk).update(
            transcription_deletion_scheduled_at=None
        )
        total_purged += 1

    # --- Retention-based purge (per user tier) ---
    # Get distinct users who own recordings with active transcriptions
    user_ids = (
        Recording.objects.filter(transcription_key__isnull=False)
        .values_list("room__accesses__user_id", flat=True)
        .distinct()
    )

    for user_id in user_ids:
        if user_id is None:
            continue
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            continue

        retention_days = _get_retention_days(user)
        cutoff = now - timedelta(days=retention_days)

        expired = Recording.objects.filter(
            room__accesses__user=user,
            room__accesses__role__in=["owner", "administrator"],
            transcription_key__isnull=False,
            created_at__lt=cutoff,
        ).distinct()

        for recording in expired:
            logger.info(
                "Retention purge: transcription for recording %s (user %s, tier %s, cutoff %s).",
                recording.id,
                user.email,
                user.account_tier,
                cutoff.date(),
            )
            _delete_transcription(recording)
            total_purged += 1

    logger.info("purge_expired_transcriptions completed: %d transcriptions purged.", total_purged)
