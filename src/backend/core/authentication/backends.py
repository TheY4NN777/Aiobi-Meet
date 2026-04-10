"""Authentication Backends for the Meet core app."""

import contextlib

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured, SuspiciousOperation
from django.utils.translation import gettext_lazy as _

from lasuite.oidc_login.backends import (
    OIDCAuthenticationBackend as LaSuiteOIDCAuthenticationBackend,
)

from core.models import User
from core.services.marketing import (
    ContactCreationError,
    ContactData,
    get_marketing_service,
)


class OIDCAuthenticationBackend(LaSuiteOIDCAuthenticationBackend):
    """Custom OpenID Connect (OIDC) Authentication Backend.

    This class overrides the default OIDC Authentication Backend to accommodate differences
    in the User and Identity models, and handles signed and/or encrypted UserInfo response.
    """

    def get_extra_claims(self, user_info):
        """
        Return extra claims from user_info.

        Args:
          user_info (dict): The user information dictionary.

        Returns:
          dict: A dictionary of extra claims.

        """
        return {
            "full_name": self.compute_full_name(user_info),
            "short_name": user_info.get(settings.OIDC_USERINFO_SHORTNAME_FIELD),
            # Propagate realm_access so post_get_or_create_user can read
            # realm roles (used by _sync_account_tier to set ENTERPRISE tier).
            # lasuite's get_or_create_user only forwards sub/email + extra
            # claims to post_get_or_create_user, so we must include it here.
            "realm_access": user_info.get("realm_access", {}),
        }

    def create_user(self, claims):
        """Create a new User, stripping non-model claims.

        lasuite's base ``create_user`` instantiates the model with
        ``User(**claims)``. Our ``get_extra_claims`` injects ``realm_access``
        (needed by ``_sync_account_tier``) which is not a User field, so we
        must drop it before delegating — otherwise registration raises
        ``TypeError: User() got unexpected keyword arguments: 'realm_access'``.
        ``claims`` is not mutated so ``post_get_or_create_user`` still sees
        ``realm_access`` afterwards.
        """
        filtered = {k: v for k, v in claims.items() if k != "realm_access"}
        return super().create_user(filtered)

    def post_get_or_create_user(self, user, claims, is_new_user):
        """
        Post-processing after user creation or retrieval.

        Args:
          user (User): The user instance.
          claims (dict): The claims dictionary.
          is_new_user (bool): Indicates if the user was newly created.

        Returns:
        - None

        """
        email = claims["email"]
        if is_new_user and email and settings.SIGNUP_NEW_USER_TO_MARKETING_EMAIL:
            self.signup_to_marketing_email(email)

        self._sync_account_tier(user, claims)

    def _sync_account_tier(self, user, claims):
        """Sync account_tier from Keycloak realm roles on every login.

        Reads 'realm_access.roles' from the OIDC claims. If the 'enterprise'
        role is present, the user is promoted. If realm_access is missing or
        empty (mapper not configured), the current tier is preserved to avoid
        accidentally downgrading users promoted via other means (admin, CI).
        Skips the Keycloak API back-sync (signal) by using update_fields.
        """
        realm_access = claims.get("realm_access")
        if not realm_access or not realm_access.get("roles"):
            # Mapper not returning roles — don't touch the tier
            return

        realm_roles = realm_access.get("roles", [])
        new_tier = (
            User.AccountTier.ENTERPRISE
            if "enterprise" in realm_roles
            else User.AccountTier.NORMAL
        )

        if user.account_tier != new_tier:
            # Use queryset.update() to bypass the post_save signal and avoid
            # a Keycloak write-back loop (Keycloak is the source of truth here).
            User.objects.filter(pk=user.pk).update(account_tier=new_tier)
            user.account_tier = new_tier  # keep in-memory object consistent

    @staticmethod
    def signup_to_marketing_email(email):
        """Pragmatic approach to newsletter signup during authentication flow.

        Details:
        1. Uses a very short timeout (1s) to prevent blocking the auth process
        2. Silently fails if the marketing service is down/slow to prioritize user experience
        3. Trade-off: May miss some signups but ensures auth flow remains fast

        Note: For a more robust solution, consider using Async task processing (Celery/Django-Q)
        """
        with contextlib.suppress(
            ContactCreationError, ImproperlyConfigured, ImportError
        ):
            marketing_service = get_marketing_service()
            contact_data = ContactData(
                email=email, attributes={"AIOBI_MEET_SOURCE": ["SIGNIN"]}
            )
            marketing_service.create_contact(
                contact_data, timeout=settings.BREVO_API_TIMEOUT
            )

    def get_existing_user(self, sub, email):
        """Fetch existing user by sub or email."""
        try:
            return User.objects.get(sub=sub)
        except User.DoesNotExist:
            if email and settings.OIDC_FALLBACK_TO_EMAIL_FOR_IDENTIFICATION:
                try:
                    return User.objects.get(email__iexact=email)
                except User.DoesNotExist:
                    pass
                except User.MultipleObjectsReturned as e:
                    raise SuspiciousOperation(
                        "Multiple user accounts share a common email."
                    ) from e
        return None
