"""Tests for the process_audio_transcribe_summarize_v2 Celery task.

Focus areas:
- Layer C: broker redelivery guard (lock holder mismatch -> early return).
- Layer D: retry policy restricted to ConnectionError / Timeout.
- Lock lifecycle: claimed at entry, released in finally on success & exception.
"""

# pylint: disable=redefined-outer-name,unused-argument

from unittest.mock import patch

import pytest
from requests import exceptions as req_exceptions

from summary.core.celery_worker import process_audio_transcribe_summarize_v2


@pytest.fixture
def mock_transcribe_audio():
    """Stub whisper transcription with a minimal result payload."""
    with patch(
        "summary.core.celery_worker.transcribe_audio",
        return_value={"text": "hello world", "segments": []},
    ) as m:
        yield m


@pytest.fixture
def mock_format_transcript():
    """Stub format_transcript to avoid pulling jinja/locale machinery in tests."""
    with patch(
        "summary.core.celery_worker.format_transcript",
        return_value=("content markdown", "Title"),
    ) as m:
        yield m


@pytest.fixture
def mock_file_service():
    """Stub MinIO file service calls."""
    with patch("summary.core.celery_worker.file_service") as m:
        m.markdown_to_docx.return_value = b"docx-bytes"
        yield m


@pytest.fixture
def mock_notify_backend():
    """Stub backend notification webhook."""
    with patch("summary.core.celery_worker._notify_backend") as m:
        yield m


@pytest.fixture
def mock_metadata_manager():
    """Stub metadata tracking (PostHog / Redis hashes)."""
    with patch("summary.core.celery_worker.metadata_manager") as m:
        yield m


@pytest.fixture
def mock_analytics():
    """Disable LLM summarization branch for focused unit tests."""
    with patch("summary.core.celery_worker.analytics") as m:
        m.is_feature_enabled.return_value = False
        yield m


@pytest.fixture
def task_args():
    """Standard set of positional args accepted by the Celery task."""
    return {
        "owner_id": "owner-123",
        "filename": "recordings/abc-def-ghi.ogg",
        "email": "user@example.com",
        "sub": "sub-123",
        "received_at": 1735725600.0,
        "room": "room-xyz",
        "recording_date": "2026-04-17",
        "recording_time": "10:00",
        "language": "fr",
        "download_link": "https://meet.aiobi.world/recording/abc",
        "context_language": "fr-fr",
    }


def _apply(task_args):
    """Invoke the Celery task synchronously (no broker, no worker)."""
    return process_audio_transcribe_summarize_v2.apply(
        args=[
            task_args["owner_id"],
            task_args["filename"],
            task_args["email"],
            task_args["sub"],
            task_args["received_at"],
            task_args["room"],
            task_args["recording_date"],
            task_args["recording_time"],
            task_args["language"],
            task_args["download_link"],
            task_args["context_language"],
        ]
    )


@patch("summary.core.celery_worker.release_transcribe_lock")
@patch("summary.core.celery_worker.claim_transcribe_lock")
@patch(
    "summary.core.celery_worker.get_lock_holder",
    return_value="some-other-task-id",
)
def test_task_aborts_if_lock_held_by_different_task_id(
    mock_get_holder,
    mock_claim,
    mock_release,
    mock_transcribe_audio,
    mock_metadata_manager,
    task_args,
):
    """A redelivered task must early-return when another task owns the lock.

    This is the Celery broker redelivery scenario: Redis re-ships the same
    message after acks_late + lost heartbeat. Without the guard, we'd launch
    a second whisper call for a recording already being transcribed.
    """
    result = _apply(task_args)

    payload = result.get()
    assert payload == {
        "status": "skipped_redelivery",
        "lock_holder": "some-other-task-id",
    }

    # No transcription work happened.
    mock_transcribe_audio.assert_not_called()
    # No lock was re-claimed (we saw it was foreign, we backed off).
    mock_claim.assert_not_called()
    # No release either — we never acquired it.
    mock_release.assert_not_called()


@patch("summary.core.celery_worker.release_transcribe_lock")
@patch("summary.core.celery_worker.claim_transcribe_lock")
@patch(
    "summary.core.celery_worker.get_lock_holder",
    return_value="pending-1776437588000",
)
def test_task_proceeds_when_lock_holder_is_pending_placeholder(
    mock_get_holder,
    mock_claim,
    mock_release,
    mock_transcribe_audio,
    mock_format_transcript,
    mock_file_service,
    mock_notify_backend,
    mock_metadata_manager,
    mock_analytics,
    task_args,
):
    """A ``pending-*`` placeholder is OUR own pre-lock from FastAPI. Proceed.

    Without this carve-out, every normal run would misidentify the FastAPI
    placeholder as a foreign lock and abort itself.
    """
    result = _apply(task_args)
    assert result.state == "SUCCESS"

    mock_claim.assert_called_once()
    mock_transcribe_audio.assert_called_once()
    mock_release.assert_called_once()


@patch("summary.core.celery_worker.release_transcribe_lock")
@patch("summary.core.celery_worker.claim_transcribe_lock")
@patch(
    "summary.core.celery_worker.get_lock_holder",
    return_value=None,
)
def test_task_releases_lock_on_success(
    mock_get_holder,
    mock_claim,
    mock_release,
    mock_transcribe_audio,
    mock_format_transcript,
    mock_file_service,
    mock_notify_backend,
    mock_metadata_manager,
    mock_analytics,
    task_args,
):
    """Happy path: lock is claimed on entry and released after docx upload."""
    _apply(task_args)

    mock_claim.assert_called_once()
    mock_release.assert_called_once()
    claim_args = mock_claim.call_args.args
    release_args = mock_release.call_args.args
    # Same recording_id + task_id on both claim and release.
    assert claim_args[0] == release_args[0] == "abc-def-ghi"


@patch("summary.core.celery_worker.release_transcribe_lock")
@patch("summary.core.celery_worker.claim_transcribe_lock")
@patch(
    "summary.core.celery_worker.get_lock_holder",
    return_value=None,
)
def test_task_releases_lock_on_exception(
    mock_get_holder,
    mock_claim,
    mock_release,
    mock_metadata_manager,
    task_args,
):
    """Lock MUST be released even if transcribe_audio raises unexpectedly.

    Otherwise a single failed run would poison the Redis key for 6h and
    block all subsequent retries for the same recording.
    """
    with patch(
        "summary.core.celery_worker.transcribe_audio",
        side_effect=RuntimeError("whisper boom"),
    ):
        result = _apply(task_args)

    # Task failed (as expected given the injected error)...
    assert result.state == "FAILURE"
    # ...but the lock was released in `finally`.
    mock_release.assert_called_once()


@patch("summary.core.celery_worker.release_transcribe_lock")
@patch("summary.core.celery_worker.claim_transcribe_lock")
@patch(
    "summary.core.celery_worker.get_lock_holder",
    return_value=None,
)
def test_task_returns_early_and_releases_lock_when_transcription_is_none(
    mock_get_holder,
    mock_claim,
    mock_release,
    mock_metadata_manager,
    task_args,
):
    """If transcribe_audio returns None (unusable audio), release lock and exit."""
    with patch(
        "summary.core.celery_worker.transcribe_audio", return_value=None
    ):
        result = _apply(task_args)

    assert result.state == "SUCCESS"
    mock_claim.assert_called_once()
    mock_release.assert_called_once()


def test_retry_policy_targets_only_transient_network_errors():
    """Layer D: decorator must retry on ConnectionError / Timeout, not HTTPError.

    Previous policy (autoretry_for=[HTTPError]) re-queued the task on any
    whisper 5xx, which created duplicate in-flight transcriptions under load.
    We now retry only on genuinely transient conditions.
    """
    autoretry_for = process_audio_transcribe_summarize_v2.autoretry_for

    assert req_exceptions.ConnectionError in autoretry_for
    assert req_exceptions.Timeout in autoretry_for
    # Critically, a generic HTTPError no longer triggers automatic retries.
    assert req_exceptions.HTTPError not in autoretry_for


def test_retry_backoff_configured_to_prevent_thundering_herd():
    """Retries must be spaced out, not fire immediately after a failure."""
    task = process_audio_transcribe_summarize_v2
    # Celery exposes backoff as an attribute on the task class.
    assert task.retry_backoff == 600
    assert task.retry_backoff_max == 3600
    assert task.retry_jitter is True
    assert task.max_retries == 1
