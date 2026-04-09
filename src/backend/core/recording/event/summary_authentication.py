"""Authentication class for summary service webhook validation."""

import logging
import secrets

from django.conf import settings

from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from core.recording.event.authentication import MachineUser

logger = logging.getLogger(__name__)


class SummaryServiceAuthentication(BaseAuthentication):
    """Authenticate requests from the summary service using a Bearer token.

    Validates the token against SUMMARY_SERVICE_API_TOKEN. Used by the
    transcription-ready webhook endpoint.
    """

    AUTH_HEADER = "Authorization"
    TOKEN_TYPE = "Bearer"  # noqa S105

    def authenticate(self, request):
        """Validate the Bearer token from the Authorization header."""

        required_token = settings.SUMMARY_SERVICE_API_TOKEN
        if not required_token:
            raise AuthenticationFailed("Summary service token is not configured.")

        auth_header = request.headers.get(self.AUTH_HEADER)

        if not auth_header:
            logger.warning(
                "Summary auth failed: Missing Authorization header (ip: %s)",
                request.META.get("REMOTE_ADDR"),
            )
            raise AuthenticationFailed("Authorization header is required")

        auth_parts = auth_header.split(" ")
        if len(auth_parts) != 2 or auth_parts[0] != self.TOKEN_TYPE:
            raise AuthenticationFailed("Invalid authorization header.")

        token = auth_parts[1]

        if not secrets.compare_digest(token.encode(), required_token.encode()):
            logger.warning(
                "Summary auth failed: Invalid token (ip: %s)",
                request.META.get("REMOTE_ADDR"),
            )
            raise AuthenticationFailed("Invalid token")

        return MachineUser(), token

    def authenticate_header(self, request):
        """Return the WWW-Authenticate header value."""
        return f"{self.TOKEN_TYPE} realm='Summary service API'"
