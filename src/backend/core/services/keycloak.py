"""Keycloak Admin API service for role management."""

import logging

from django.conf import settings

import requests

logger = logging.getLogger(__name__)

ENTERPRISE_ROLE = "enterprise"


class KeycloakAdminError(Exception):
    """Raised when a Keycloak Admin API call fails."""


def _get_admin_token() -> str:
    """Obtain an admin access token via client_credentials."""
    url = (
        f"{settings.KEYCLOAK_INTERNAL_URL}/realms/{settings.KEYCLOAK_REALM}"
        "/protocol/openid-connect/token"
    )
    resp = requests.post(
        url,
        data={
            "grant_type": "client_credentials",
            "client_id": settings.KEYCLOAK_ADMIN_CLIENT_ID,
            "client_secret": settings.KEYCLOAK_ADMIN_CLIENT_SECRET,
        },
        timeout=5,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def _get_user_id(token: str, email: str) -> str | None:
    """Find a Keycloak user ID by email."""
    url = (
        f"{settings.KEYCLOAK_INTERNAL_URL}/admin/realms/{settings.KEYCLOAK_REALM}/users"
    )
    resp = requests.get(
        url,
        params={"email": email, "exact": "true"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=5,
    )
    resp.raise_for_status()
    users = resp.json()
    return users[0]["id"] if users else None


def _get_realm_role(token: str, role_name: str) -> dict:
    """Fetch a realm role representation by name."""
    url = (
        f"{settings.KEYCLOAK_INTERNAL_URL}/admin/realms/{settings.KEYCLOAK_REALM}"
        f"/roles/{role_name}"
    )
    resp = requests.get(
        url,
        headers={"Authorization": f"Bearer {token}"},
        timeout=5,
    )
    resp.raise_for_status()
    return resp.json()


def set_enterprise_role(user_email: str, *, grant: bool) -> None:
    """Assign or remove the 'enterprise' realm role for a user in Keycloak.

    Args:
        user_email: The user's email address.
        grant: True to assign the role, False to remove it.
    """
    if not getattr(settings, "KEYCLOAK_INTERNAL_URL", None):
        logger.warning("KEYCLOAK_INTERNAL_URL not configured — skipping Keycloak sync.")
        return

    try:
        token = _get_admin_token()
        user_id = _get_user_id(token, user_email)

        if not user_id:
            logger.warning(
                "Keycloak user not found for email %s — skipping role sync.", user_email
            )
            return

        role = _get_realm_role(token, ENTERPRISE_ROLE)
        url = (
            f"{settings.KEYCLOAK_INTERNAL_URL}/admin/realms/{settings.KEYCLOAK_REALM}"
            f"/users/{user_id}/role-mappings/realm"
        )
        method = requests.post if grant else requests.delete
        resp = method(
            url,
            json=[role],
            headers={"Authorization": f"Bearer {token}"},
            timeout=5,
        )
        resp.raise_for_status()
        action = "granted" if grant else "revoked"
        logger.info("Enterprise role %s for user %s.", action, user_email)

    except requests.RequestException as exc:
        # Non-blocking: log the error but do not prevent the Django save.
        logger.error(
            "Keycloak sync failed for user %s: %s. "
            "Role will be corrected on next login.",
            user_email,
            exc,
        )
