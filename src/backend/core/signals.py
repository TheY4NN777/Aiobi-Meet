"""Django signals for the core app."""

import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from core.models import User

logger = logging.getLogger(__name__)


# Attribute name used to pass the pre-save tier to the post_save handler.
_TIER_BEFORE_SAVE_ATTR = "_tier_before_save"


@receiver(pre_save, sender=User)
def capture_tier_before_save(sender, instance, **kwargs):
    """Capture the previous account_tier before the User row is saved.

    Stored as a transient attribute on the instance so the post_save handler
    can detect transitions (e.g. normal -> enterprise) without an extra DB hit.
    """
    if instance.pk is None:
        # New user: no previous tier to compare
        instance._tier_before_save = None  # noqa: SLF001
        return

    try:
        previous = (
            User.objects.filter(pk=instance.pk)
            .values_list("account_tier", flat=True)
            .first()
        )
    except Exception:  # noqa: BLE001
        previous = None

    instance._tier_before_save = previous  # noqa: SLF001


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


@receiver(post_save, sender=User)
def notify_tier_upgraded_to_enterprise(sender, instance, created, **kwargs):
    """Trigger the welcome email when a user transitions to the enterprise tier.

    Covers both:
      - Users newly created directly as enterprise (first OIDC login with the
        enterprise role, or CI promotion on first deploy)
      - Existing normal users who get upgraded (admin edit, realm role added)

    The task itself is idempotent: it checks tier_upgraded_notified_at and only
    sends once per user, so calling it multiple times is safe.
    """
    if not instance.email:
        return

    if instance.account_tier != User.AccountTier.ENTERPRISE:
        return

    if instance.tier_upgraded_notified_at is not None:
        # Already notified previously; nothing to do.
        return

    previous_tier = getattr(instance, _TIER_BEFORE_SAVE_ATTR, None)
    is_transition = created or previous_tier != User.AccountTier.ENTERPRISE
    if not is_transition:
        return

    try:
        from core.tasks.account import send_tier_upgraded_email  # noqa: PLC0415

        send_tier_upgraded_email.delay(str(instance.pk))
    except Exception:  # noqa: BLE001
        logger.exception(
            "Failed to enqueue tier upgrade email for user %s", instance.email
        )
