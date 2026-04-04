"""Invitation Service."""

import smtplib
from logging import getLogger

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.translation import get_language, override
from django.utils.translation import gettext_lazy as _

logger = getLogger(__name__)


class InvitationError(Exception):
    """Exception raised when invitation emails cannot be sent."""

    status_code = 500


class InvitationService:
    """Service for invitations to users."""

    @staticmethod
    def invite_to_room(
        room, sender, emails, scheduled_date=None, scheduled_time=None
    ):
        """Send invitation emails to join a room."""

        language = get_language()

        sender_name = sender.full_name or sender.short_name or ""

        context = {
            "brandname": settings.EMAIL_BRAND_NAME,
            "logo_img": settings.EMAIL_LOGO_IMG,
            "domain": settings.EMAIL_DOMAIN,
            "room_url": f"{settings.EMAIL_APP_BASE_URL}/{room.slug}",
            "room_link": f"{settings.EMAIL_DOMAIN}/{room.slug}",
            "sender_name": sender_name,
            "sender_email": sender.email,
            "scheduled_date": scheduled_date,
            "scheduled_time": scheduled_time,
        }

        with override(language):
            msg_html = render_to_string("mail/html/invitation.html", context)
            msg_plain = render_to_string("mail/text/invitation.txt", context)
            sender_display = sender_name or sender.email
            if scheduled_date:
                subject = str(
                    _("%(name)s invites you to a meeting on %(date)s")
                    % {
                        "name": sender_display,
                        "date": scheduled_date.strftime("%d/%m/%Y"),
                    }
                )
            else:
                subject = str(
                    _(
                        "%(name)s is waiting for you to join a video call"
                    )
                    % {"name": sender_display}
                )

            try:
                send_mail(
                    subject,
                    msg_plain,
                    settings.EMAIL_FROM,
                    emails,
                    html_message=msg_html,
                    fail_silently=False,
                )
            except smtplib.SMTPException as e:
                logger.error("invitation to %s was not sent: %s", emails, e)
                raise InvitationError("Could not send invitation") from e
