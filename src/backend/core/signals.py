"""Django signals for the core app."""

import logging

from django.db.models.signals import post_save
from django.dispatch import receiver

from core.models import User

logger = logging.getLogger(__name__)


@receiver(post_save, sender=User)
def sync_account_tier_to_keycloak(sender, instance, **kwargs):
    """Sync account_tier changes to Keycloak when saved via Django Admin.

    Only triggers when account_tier has actually changed to avoid unnecessary
    API calls on every user save.
    """
    # Only sync if the user has an email (anonymous/device users are skipped)
    if not instance.email:
        return

    # update_fields=None means a full save (e.g. Django Admin).
    # When account_tier is synced from OIDC we use queryset.update() which
    # never fires this signal, so no loop risk here.
    update_fields = kwargs.get("update_fields")
    if update_fields is not None and "account_tier" not in update_fields:
        return

    # Lazy import to avoid circular imports and allow graceful degradation
    # if Keycloak settings are not configured
    try:
        from core.services.keycloak import set_enterprise_role  # noqa: PLC0415

        is_enterprise = instance.account_tier == User.AccountTier.ENTERPRISE
        set_enterprise_role(instance.email, grant=is_enterprise)
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Failed to sync account_tier to Keycloak for user %s: %s",
            instance.email,
            exc,
        )
