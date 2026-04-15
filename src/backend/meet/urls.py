"""URL configuration for the Meet project"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from django.urls import include, path, re_path

from drf_spectacular.views import (
    SpectacularJSONAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    # Endpoint Prometheus /metrics — scrape interne uniquement par Prometheus
    # sur backend:8000/metrics. Bloque en public par nginx frontend (location
    # /metrics deny all) + pas de route nginx qui mappe /metrics vers backend.
    path("", include("django_prometheus.urls")),
    path("", include("core.urls")),
    path("", include("lasuite.oidc_resource_server.urls")),
]

if settings.DEBUG:
    urlpatterns = (
        urlpatterns
        + staticfiles_urlpatterns()
        + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    )


if settings.USE_SWAGGER or settings.DEBUG:
    urlpatterns += [
        path(
            f"{settings.API_VERSION}/swagger.json",
            SpectacularJSONAPIView.as_view(
                api_version=settings.API_VERSION,
                urlconf="core.urls",
            ),
            name="client-api-schema",
        ),
        path(
            f"{settings.API_VERSION}//swagger/",
            SpectacularSwaggerView.as_view(url_name="client-api-schema"),
            name="swagger-ui-schema",
        ),
        re_path(
            f"{settings.API_VERSION}//redoc/",
            SpectacularRedocView.as_view(url_name="client-api-schema"),
            name="redoc-schema",
        ),
    ]
