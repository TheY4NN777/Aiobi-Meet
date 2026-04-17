# Gunicorn-django settings
bind = ["0.0.0.0:8000"]
name = "meet"
python_path = "/app"

# Run
graceful_timeout = 90
timeout = 90

# 6 workers is the prod sizing. Benchmark ~150-250 MB RAM per worker for this
# app with its DB + OIDC + LiveKit SDK imports; 6 workers × ~200 MB ≈ 1.2 GB
# working set, fits under the 2 GB docker memory cap in
# docker/production/compose.yaml. Bump this (not GUNICORN_CMD_ARGS) so dev and
# prod always see the same effective config. docker/production/README.md §Tuning
# documents "9 workers" as the next step if request pressure grows.
workers = 6

# Logging
# Using '-' for the access log file makes gunicorn log accesses to stdout
accesslog = "-"
# Using '-' for the error log file makes gunicorn log errors to stderr
errorlog = "-"
loglevel = "info"
