"""Core app configuration."""

from django.apps import AppConfig


class CoreConfig(AppConfig):
    """Configuration for the core Django application."""

    name = "core"

    def ready(self):
        """Connect signals when the app is ready."""
        import core.signals  # noqa: PLC0415
