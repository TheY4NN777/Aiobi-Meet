"""LiveKit Events Service"""

# pylint: disable=no-member

import re
import uuid
from datetime import datetime
from datetime import timezone as dt_timezone
from enum import Enum
from logging import getLogger

from django.conf import settings
from django.utils import timezone as utils_timezone

from livekit import api

from core import models, utils
from core.recording.services.recording_events import (
    RecordingEventsError,
    RecordingEventsService,
)

from .lobby import LobbyService
from .telephony import TelephonyException, TelephonyService

logger = getLogger(__name__)


class LiveKitWebhookError(Exception):
    """Base exception for LiveKit webhook processing errors."""

    status_code = 500


class AuthenticationError(LiveKitWebhookError):
    """Authentication failed."""

    status_code = 401


class InvalidPayloadError(LiveKitWebhookError):
    """Invalid webhook payload."""

    status_code = 400


class UnsupportedEventTypeError(LiveKitWebhookError):
    """Unsupported event type."""

    status_code = 422


class ActionFailedError(LiveKitWebhookError):
    """Webhook action fails to process or complete."""

    status_code = 500


class LiveKitWebhookEventType(Enum):
    """LiveKit webhook event types."""

    # Room events
    ROOM_STARTED = "room_started"
    ROOM_FINISHED = "room_finished"

    # Participant events
    PARTICIPANT_JOINED = "participant_joined"
    PARTICIPANT_LEFT = "participant_left"

    # Track events
    TRACK_PUBLISHED = "track_published"
    TRACK_UNPUBLISHED = "track_unpublished"

    # Egress events
    EGRESS_STARTED = "egress_started"
    EGRESS_UPDATED = "egress_updated"
    EGRESS_ENDED = "egress_ended"

    # Ingress events
    INGRESS_STARTED = "ingress_started"
    INGRESS_ENDED = "ingress_ended"


class LiveKitEventsService:
    """Service for processing and handling LiveKit webhook events and notifications."""

    def __init__(self):
        """Initialize with required services."""

        token_verifier = api.TokenVerifier(
            settings.LIVEKIT_CONFIGURATION["api_key"],
            settings.LIVEKIT_CONFIGURATION["api_secret"],
        )
        self.webhook_receiver = api.WebhookReceiver(token_verifier)
        self.lobby_service = LobbyService()
        self.telephony_service = TelephonyService()
        self.recording_events = RecordingEventsService()

        self._filter_regex = None
        if settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX:
            try:
                self._filter_regex = re.compile(
                    settings.LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX
                )
            except re.error:
                logger.exception(
                    "Invalid LIVEKIT_WEBHOOK_EVENTS_FILTER_REGEX. Webhook filtering disabled."
                )

    def receive(self, request):
        """Process webhook and route to appropriate handler."""

        auth_token = request.headers.get("Authorization")
        if not auth_token:
            raise AuthenticationError("Authorization header missing")

        # LiveKit server v1.8+ sends "Bearer <jwt>" instead of raw JWT
        if auth_token.startswith("Bearer "):
            auth_token = auth_token[len("Bearer ") :]

        try:
            data = self.webhook_receiver.receive(
                request.body.decode("utf-8"), auth_token
            )
        except Exception as e:
            raise InvalidPayloadError("Invalid webhook payload") from e

        room_name = data.room.name or data.egress_info.room_name

        if self._filter_regex and not self._filter_regex.search(room_name):
            logger.info("Filtered webhook event for room '%s'", room_name)
            return

        try:
            webhook_type = LiveKitWebhookEventType(data.event)
        except ValueError as e:
            raise UnsupportedEventTypeError(
                f"Unknown webhook type: {data.event}"
            ) from e

        handler_name = f"_handle_{webhook_type.value}"
        handler = getattr(self, handler_name, None)

        if not handler or not callable(handler):
            return

        # pylint: disable=not-callable
        handler(data)

    def _handle_egress_updated(self, data):
        """Handle 'egress_updated' event."""

        egress_id = data.egress_info.egress_id
        try:
            recording = models.Recording.objects.get(worker_id=egress_id)
        except models.Recording.DoesNotExist as err:
            raise ActionFailedError(
                f"Recording with worker ID {egress_id} does not exist"
            ) from err

        egress_status = data.egress_info.status
        self.recording_events.handle_update(recording, egress_status)

    def _handle_egress_ended(self, data):
        """Handle 'egress_ended' event."""

        try:
            recording = models.Recording.objects.get(
                worker_id=data.egress_info.egress_id
            )
        except models.Recording.DoesNotExist as err:
            raise ActionFailedError(
                f"Recording with worker ID {data.egress_info.egress_id} does not exist"
            ) from err

        try:
            room_name = str(recording.room.id)
            utils.update_room_metadata(
                room_name, {}, ["recording_mode", "recording_status"]
            )
        except utils.MetadataUpdateException as e:
            logger.exception("Failed to update room's metadata: %s", e)

        if (
            data.egress_info.status == api.EgressStatus.EGRESS_LIMIT_REACHED
            and recording.status == models.RecordingStatusChoices.ACTIVE
        ):
            try:
                self.recording_events.handle_limit_reached(recording)
            except RecordingEventsError as e:
                raise ActionFailedError(
                    f"Failed to process limit reached event for recording {recording}"
                ) from e

    def _handle_room_started(self, data):
        """Handle 'room_started' event."""

        try:
            room_id = uuid.UUID(data.room.name)
        except ValueError as e:
            logger.warning(
                "Ignoring room event: room name '%s' is not a valid UUID format.",
                data.room.name,
            )
            raise ActionFailedError("Failed to process room started event") from e

        try:
            room = models.Room.objects.get(id=room_id)
        except models.Room.DoesNotExist as err:
            raise ActionFailedError(f"Room with ID {room_id} does not exist") from err

        if settings.ROOM_TELEPHONY_ENABLED:
            try:
                self.telephony_service.create_dispatch_rule(room)
            except TelephonyException as e:
                raise ActionFailedError(
                    f"Failed to create telephony dispatch rule for room {room_id}"
                ) from e

        started_at = (
            datetime.fromtimestamp(data.room.creation_time, tz=dt_timezone.utc)
            if data.room.creation_time
            else utils_timezone.now()
        )
        models.RoomSession.objects.get_or_create(
            room=room,
            livekit_room_sid=data.room.sid or None,
            defaults={"started_at": started_at},
        )

    def _handle_room_finished(self, data):
        """Handle 'room_finished' event."""

        try:
            room_id = uuid.UUID(data.room.name)
        except ValueError as e:
            logger.warning(
                "Ignoring room event: room name '%s' is not a valid UUID format.",
                data.room.name,
            )
            raise ActionFailedError("Failed to process room finished event") from e

        if settings.ROOM_TELEPHONY_ENABLED:
            try:
                self.telephony_service.delete_dispatch_rule(room_id)
            except TelephonyException as e:
                raise ActionFailedError(
                    f"Failed to delete telephony dispatch rule for room {room_id}"
                ) from e

        try:
            self.lobby_service.clear_room_cache(room_id)
        except Exception as e:
            raise ActionFailedError(
                f"Failed to clear room cache for room {room_id}"
            ) from e

        session = (
            models.RoomSession.objects.filter(room__id=room_id, ended_at__isnull=True)
            .order_by("-started_at")
            .first()
        )
        if session:
            session.ended_at = utils_timezone.now()
            session.save(update_fields=["ended_at", "updated_at"])
            session.participants.filter(left_at__isnull=True).update(
                left_at=session.ended_at
            )

    def _handle_participant_joined(self, data):
        """Handle 'participant_joined' event."""

        try:
            room_id = uuid.UUID(data.room.name)
        except ValueError:
            logger.warning(
                "Ignoring participant event: room name '%s' is not a valid UUID.",
                data.room.name,
            )
            return

        session = (
            models.RoomSession.objects.filter(room__id=room_id, ended_at__isnull=True)
            .order_by("-started_at")
            .first()
        )
        if not session:
            logger.info(
                "No open session found for room %s on participant_joined — skipping.",
                room_id,
            )
            return

        identity = data.participant.identity
        user = None
        try:
            user = models.User.objects.get(sub=identity)
        except models.User.DoesNotExist:
            pass

        joined_at = (
            datetime.fromtimestamp(data.participant.joined_at, tz=dt_timezone.utc)
            if data.participant.joined_at
            else utils_timezone.now()
        )

        models.RoomParticipant.objects.get_or_create(
            session=session,
            livekit_identity=identity,
            defaults={
                "user": user,
                "display_name": data.participant.name or "",
                "joined_at": joined_at,
            },
        )

    def _handle_participant_left(self, data):
        """Handle 'participant_left' event."""

        try:
            room_id = uuid.UUID(data.room.name)
        except ValueError:
            logger.warning(
                "Ignoring participant event: room name '%s' is not a valid UUID.",
                data.room.name,
            )
            return

        session = (
            models.RoomSession.objects.filter(room__id=room_id, ended_at__isnull=True)
            .order_by("-started_at")
            .first()
        )
        if not session:
            return

        models.RoomParticipant.objects.filter(
            session=session,
            livekit_identity=data.participant.identity,
            left_at__isnull=True,
        ).update(left_at=utils_timezone.now())
