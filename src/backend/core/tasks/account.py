"""
Account lifecycle tasks (tier upgrades, downgrades, notifications).
"""

import logging

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.translation import gettext_lazy as _
from django.utils.translation import override

from core.models import User
from core.tasks._task import task

logger = logging.getLogger(__name__)


@task
def send_tier_upgraded_email(user_id: str) -> bool:
    """Send the welcome email to a user who was just upgraded to enterprise tier.

    Idempotent: does nothing if the user is not enterprise or has already been
    notified (tier_upgraded_notified_at is not None).

    Returns True if the email was sent, False otherwise.
    """
    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        logger.warning("User %s not found for tier upgrade notification", user_id)
        return False

    if user.account_tier != User.AccountTier.ENTERPRISE:
        logger.info(
            "User %s is no longer enterprise (current=%s); skipping notification",
            user.email,
            user.account_tier,
        )
        return False

    if user.tier_upgraded_notified_at is not None:
        logger.info(
            "User %s was already notified of the enterprise upgrade at %s",
            user.email,
            user.tier_upgraded_notified_at,
        )
        return False

    if not user.email:
        logger.warning("User %s has no email address; cannot notify", user_id)
        return False

    # Determine first name for personalization: first word of full_name,
    # falling back to the local part of the email if full_name is empty.
    first_name = (
        user.full_name.split()[0]
        if user.full_name and user.full_name.strip()
        else user.email.split("@")[0]
    )

    context = {
        "brandname": settings.EMAIL_BRAND_NAME,
        "support_email": settings.EMAIL_SUPPORT_EMAIL,
        "logo_img": settings.EMAIL_LOGO_IMG,
        "domain": settings.EMAIL_DOMAIN,
        "first_name": first_name,
        "link": settings.EMAIL_APP_BASE_URL,
        "retention_days": settings.RECORDING_RETENTION_DAYS_ENTERPRISE,
        "max_transcriptions": settings.TRANSCRIPTION_MAX_KEEP_ENTERPRISE,
    }

    language = user.language or settings.LANGUAGE_CODE
    with override(language):
        msg_html = render_to_string(
            "mail/html/tier_upgraded_enterprise.html", context
        )
        msg_plain = render_to_string(
            "mail/text/tier_upgraded_enterprise.txt", context
        )
        subject = f"{first_name}, votre compte {settings.EMAIL_BRAND_NAME} est passé en Entreprise"

        try:
            send_mail(
                subject=subject,
                message=msg_plain,
                from_email=settings.EMAIL_FROM,
                recipient_list=[user.email],
                html_message=msg_html,
                fail_silently=False,
            )
        except Exception:  # noqa: BLE001
            logger.exception(
                "Failed to send tier upgrade email to %s", user.email
            )
            return False

    # Mark as notified so we don't spam on re-sync
    User.objects.filter(pk=user.pk).update(
        tier_upgraded_notified_at=timezone.now()
    )
    logger.info("Tier upgrade email sent to %s", user.email)
    return True
