"""Integration tests for the API tasks endpoints."""

# tests/unit/test_api_tasks.py
from unittest.mock import MagicMock, patch


class TestTasks:
    """Tests for the /tasks endpoint."""

    @patch("summary.api.route.tasks.claim_transcribe_lock")
    @patch(
        "summary.api.route.tasks.acquire_transcribe_lock",
        return_value=True,
    )
    @patch(
        "summary.api.route.tasks.process_audio_transcribe_summarize_v2.apply_async",
        return_value=MagicMock(id="task-id-abc"),
    )
    @patch("summary.api.route.tasks.time.time", return_value=1735725600.0)
    def test_create_task_returns_task_id(
        self,
        mock_time,
        mock_apply_async,
        mock_acquire,
        mock_claim,
        client,
    ):
        """POST /tasks/ with valid payload returns id and dispatches Celery task."""
        response = client.post(
            "api/v1/tasks/",
            headers={"Authorization": "Bearer test-api-token"},
            json={
                "owner_id": "owner-123",
                "filename": "recording.mp4",
                "email": "user@example.com",
                "sub": "sub-123",
                "room": "room-abc",
                "recording_date": "2026-01-01",
                "recording_time": "10:00:00",
                "language": None,
                "download_link": "http://example.com/file.mp4",
            },
        )

        assert response.status_code == 200
        assert response.json() == {
            "id": "task-id-abc",
            "message": "Task created",
            "recording_id": "recording",
        }

        # Lock acquired with a placeholder, then re-claimed with the real task_id.
        assert mock_acquire.call_count == 1
        assert mock_acquire.call_args.args[0] == "recording"
        assert mock_acquire.call_args.args[1].startswith("pending-")

        assert mock_claim.call_count == 1
        assert mock_claim.call_args.args == ("recording", "task-id-abc")

        args = mock_apply_async.call_args.kwargs["args"]
        assert args == [
            "owner-123",  # owner_id
            "recording.mp4",  # filename
            "user@example.com",  # email
            "sub-123",  # sub
            1735725600.0,  # frozen time
            "room-abc",  # room
            "2026-01-01",  # recording_date
            "10:00:00",  # recording_time
            None,  # language
            "http://example.com/file.mp4",  # download_link
            None,  # context_language
        ]

    @patch(
        "summary.api.route.tasks.get_lock_holder",
        return_value="task-already-running",
    )
    @patch(
        "summary.api.route.tasks.acquire_transcribe_lock",
        return_value=False,
    )
    @patch(
        "summary.api.route.tasks.process_audio_transcribe_summarize_v2.apply_async"
    )
    def test_create_task_duplicate_rejected_without_apply_async(
        self, mock_apply_async, mock_acquire, mock_get_holder, client
    ):
        """POST /tasks/ for a recording already locked returns already_queued.

        Critical path: apply_async MUST NOT be called, otherwise we'd requeue
        the same task we're trying to dedup.
        """
        response = client.post(
            "/api/v1/tasks/",
            headers={"Authorization": "Bearer test-api-token"},
            json={
                "owner_id": "owner-123",
                "filename": "recording.mp4",
                "email": "user@example.com",
                "sub": "sub-123",
                "room": "room-abc",
                "recording_date": "2026-01-01",
                "recording_time": "10:00:00",
                "language": None,
                "download_link": "http://example.com/file.mp4",
            },
        )

        assert response.status_code == 200
        assert response.json() == {
            "status": "already_queued",
            "recording_id": "recording",
            "lock_holder": "task-already-running",
        }

        # Lock was attempted once (and refused).
        assert mock_acquire.call_count == 1
        # The dispatch MUST be short-circuited — zero Celery submissions.
        mock_apply_async.assert_not_called()

    @patch(
        "summary.api.route.tasks.get_lock_holder",
        return_value=None,
    )
    @patch(
        "summary.api.route.tasks.acquire_transcribe_lock",
        return_value=False,
    )
    @patch(
        "summary.api.route.tasks.process_audio_transcribe_summarize_v2.apply_async"
    )
    def test_create_task_duplicate_with_unknown_holder(
        self, mock_apply_async, mock_acquire, mock_get_holder, client
    ):
        """Race: SETNX failed (lock exists) but GET None because TTL just expired.

        We still refuse to enqueue in this degenerate window; the caller will
        retry and eventually succeed once the stale lock is fully gone. This
        is safer than enqueueing with ambiguous ownership.
        """
        response = client.post(
            "/api/v1/tasks/",
            headers={"Authorization": "Bearer test-api-token"},
            json={
                "owner_id": "owner-123",
                "filename": "recording.mp4",
                "email": "user@example.com",
                "sub": "sub-123",
                "room": "room-abc",
                "recording_date": "2026-01-01",
                "recording_time": "10:00:00",
                "language": None,
                "download_link": "http://example.com/file.mp4",
            },
        )

        assert response.status_code == 200
        assert response.json() == {
            "status": "already_queued",
            "recording_id": "recording",
            "lock_holder": "unknown",
        }
        mock_apply_async.assert_not_called()

    def test_create_task_invalid_language(self, client):
        """POST /tasks/ with an unsupported language returns 422."""
        payload = {"language": "klingon"}
        response = client.post(
            "/api/v1/tasks/",
            headers={"Authorization": "Bearer test-api-token"},
            json=payload,
        )

        assert response.status_code == 422

    @patch(
        "summary.api.route.tasks.AsyncResult",
        return_value=MagicMock(status="PENDING"),
    )
    def test_get_task_status_pending(self, mock_result, client):
        """GET /tasks/{id} returns PENDING status when the task has not started yet."""
        response = client.get(
            "/api/v1/tasks/task-id-abc",
            headers={"Authorization": "Bearer test-api-token"},
        )

        assert response.status_code == 200
        assert response.json() == {"id": "task-id-abc", "status": "PENDING"}

    @patch(
        "summary.api.route.tasks.AsyncResult",
        return_value=MagicMock(status="SUCCESS"),
    )
    def test_get_task_status_success(self, mock_result, client):
        """GET /tasks/{id} returns SUCCESS status when the task has completed."""
        response = client.get(
            "/api/v1/tasks/task-id-abc",
            headers={"Authorization": "Bearer test-api-token"},
        )

        assert response.status_code == 200
        assert response.json()["status"] == "SUCCESS"
