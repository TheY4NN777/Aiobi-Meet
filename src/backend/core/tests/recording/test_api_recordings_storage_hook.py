"""
Test recordings API endpoints in the Meet core app: save recording.
"""

# pylint: disable=redefined-outer-name,unused-argument

import uuid
from unittest import mock

import pytest
from rest_framework.test import APIClient

from ...factories import RecordingFactory
from ...models import Recording, RecordingStatusChoices
from ...recording.event.exceptions import (
    InvalidBucketError,
    InvalidFilepathError,
    InvalidFileTypeError,
    ParsingEventDataError,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def recording_settings(settings):
    """Configure recording-related and storage event Django settings."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = "testAuthToken"
    settings.RECORDING_STORAGE_EVENT_ENABLE = True
    return settings


@pytest.fixture
def mock_get_parser():
    """Mock 'get_parser' factory function."""
    with mock.patch("core.api.viewsets.get_parser") as mock_parser:
        yield mock_parser


def test_save_recording_anonymous(settings, client):
    """Anonymous users should not be allowed to save room recordings."""
    settings.RECORDING_STORAGE_EVENT_TOKEN = "testAuthToken"

    RecordingFactory(status="active")

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
    )

    assert response.status_code == 401
    assert Recording.objects.count() == 1


def test_save_recording_wrong_bearer(settings, client):
    """Requests with incorrect bearer token should be rejected when auth is required."""

    settings.RECORDING_STORAGE_EVENT_TOKEN = "testAuthToken"

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer wrongAuthToken",
    )

    assert response.status_code == 401


def test_save_recording_permission_needed(settings, client):
    """Recordings should not be saved when feature is disabled."""

    settings.RECORDING_STORAGE_EVENT_TOKEN = "testAuthToken"
    settings.RECORDING_STORAGE_EVENT_ENABLE = False

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Not found."}


def test_save_recording_parsing_error(recording_settings, mock_get_parser, client):
    """Test handling of parsing errors in recording event data."""
    mock_parser = mock.Mock()
    mock_parser.get_recording_id.side_effect = ParsingEventDataError("Error message")
    mock_get_parser.return_value = mock_parser

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Invalid request data."}


def test_save_recording_bucket_error(recording_settings, mock_get_parser, client):
    """Test handling of invalid storage bucket errors in recording event data."""

    mock_parser = mock.Mock()
    mock_parser.get_recording_id.side_effect = InvalidBucketError("Error message")
    mock_get_parser.return_value = mock_parser

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Invalid bucket specified."}


def test_save_recording_filetype_error(recording_settings, mock_get_parser):
    """Test handling of unsupported file types in recording event data."""

    mock_parser = mock.Mock()
    mock_parser.get_recording_id.side_effect = InvalidFileTypeError(
        "unsupported '.json'"
    )
    mock_get_parser.return_value = mock_parser

    client = APIClient()

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Notification ignored."}


def test_save_recording_filepath_error(recording_settings, mock_get_parser):
    """Test handling of unsupported filepath in recording event data."""

    mock_parser = mock.Mock()
    mock_parser.get_recording_id.side_effect = InvalidFilepathError(
        "Invalid filepath structure: parent/folder/recording.jpeg"
    )
    mock_get_parser.return_value = mock_parser

    client = APIClient()

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Notification ignored."}


def test_save_recording_unknown_recording(recording_settings, mock_get_parser, client):
    """Test handling of events for non-existent recordings."""

    RecordingFactory(status="active")

    mock_parser = mock.Mock()
    mock_parser.get_recording_id.return_value = uuid.uuid4()
    mock_get_parser.return_value = mock_parser

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "No recording found for this event."}


@pytest.mark.parametrize(
    "status", ["failed_to_start", "aborted", "failed_to_stop", "initiated"]
)
def test_save_recording_non_savable_recording_error_state(
    recording_settings, mock_get_parser, client, status
):
    """Test that recordings in error or pre-active states are rejected with 403.

    These states should never receive a storage-hook event under normal flow;
    a 403 signals the caller that this is a genuine protocol violation.
    """

    recording = RecordingFactory(status=status)

    mock_parser = mock.Mock()
    mock_parser.get_recording_id.return_value = recording.id
    mock_get_parser.return_value = mock_parser

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": f"Recording with ID {recording.id} cannot be saved because it is either,"
        " in an error state or has already been saved."
    }


@pytest.mark.parametrize("status", ["saved", "notification_succeeded"])
def test_save_recording_already_processed_returns_200(
    recording_settings, mock_get_parser, client, status
):
    """Test that storage-hook events for already-processed recordings are ignored politely.

    This is the MinIO at-least-once delivery replay case. Returning 200 acknowledges
    the duplicate webhook so MinIO stops retrying, while avoiding a second pipeline
    dispatch (which previously caused duplicate transcription emails — incident
    2026-04-17 recording 0e882ca2).
    """

    recording = RecordingFactory(status=status)

    mock_parser = mock.Mock()
    mock_parser.get_recording_id.return_value = recording.id
    mock_get_parser.return_value = mock_parser

    with mock.patch(
        "core.recording.event.notification.notification_service.notify_external_services"
    ) as mock_notify:
        response = client.post(
            "/api/v1.0/recordings/storage-hook/",
            {"recording_data": "valid-data"},
            HTTP_AUTHORIZATION="Bearer testAuthToken",
        )

        assert response.status_code == 200
        assert response.json() == {
            "message": "Notification ignored (already processed)."
        }
        # Critical: no external call should be made for a duplicate webhook.
        mock_notify.assert_not_called()

    # Status is preserved unchanged — no side effects on the existing record.
    recording.refresh_from_db()
    assert recording.status == status


@pytest.mark.parametrize("initial_status", ["active", "stopped"])
def test_save_recording_concurrent_webhooks_only_one_processes(
    recording_settings, mock_get_parser, client, initial_status
):
    """Test that only one of two sequential storage-hook calls triggers processing.

    Simulates the race condition collapsed into sequential calls: the first
    transitions status ACTIVE/STOPPED -> SAVED -> NOTIFICATION_SUCCEEDED,
    the second observes updated=0 (status no longer in savable set) and
    returns a 200 "already processed" without a second notify call.

    The atomic UPDATE pattern guarantees this behavior even under true concurrency.
    """

    recording = RecordingFactory(status=initial_status)

    mock_parser = mock.Mock()
    mock_parser.get_recording_id.return_value = recording.id
    mock_get_parser.return_value = mock_parser

    with mock.patch(
        "core.recording.event.notification.notification_service.notify_external_services",
        return_value=True,
    ) as mock_notify:
        # First call: wins the race, processes normally.
        response1 = client.post(
            "/api/v1.0/recordings/storage-hook/",
            {"recording_data": "valid-data"},
            HTTP_AUTHORIZATION="Bearer testAuthToken",
        )
        # Second call: loses the race, must be a graceful 200 without side effect.
        response2 = client.post(
            "/api/v1.0/recordings/storage-hook/",
            {"recording_data": "valid-data"},
            HTTP_AUTHORIZATION="Bearer testAuthToken",
        )

    assert response1.status_code == 200
    assert response1.json() == {"message": "Event processed."}

    assert response2.status_code == 200
    assert response2.json() == {"message": "Notification ignored (already processed)."}

    # Critical: only ONE notify call across both webhooks.
    assert mock_notify.call_count == 1

    recording.refresh_from_db()
    assert recording.status == RecordingStatusChoices.NOTIFICATION_SUCCEEDED


@pytest.mark.parametrize("status", ["active", "stopped"])
def test_save_recording_success(recording_settings, mock_get_parser, client, status):
    """Test successful saving of recordings in valid states."""

    recording = RecordingFactory(status=status)

    mock_parser = mock.Mock()
    mock_parser.get_recording_id.return_value = recording.id
    mock_get_parser.return_value = mock_parser

    response = client.post(
        "/api/v1.0/recordings/storage-hook/",
        {"recording_data": "valid-data"},
        HTTP_AUTHORIZATION="Bearer testAuthToken",
    )

    assert response.status_code == 200
    assert response.json() == {"message": "Event processed."}

    recording.refresh_from_db()
    assert recording.status == RecordingStatusChoices.SAVED
