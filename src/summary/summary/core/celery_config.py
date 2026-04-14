"""Celery Config."""

# https://github.com/danihodovic/celery-exporter
# Enable task events for Prometheus monitoring via celery-exporter.

# worker_send_task_events: Sends task lifecycle events (e.g., started, succeeded),
# allowing the exporter to track task execution metrics and durations.
worker_send_task_events = True

# task_send_sent_event: Sends an event when a task is dispatched to the broker,
# enabling full lifecycle tracking from submission to completion (including queue time).
task_send_sent_event = True

# Redis visibility timeout: how long the broker waits before re-delivering an
# unacked message. Default is 3600s (1h) which is SHORTER than our long-running
# whisper transcription tasks (can exceed 1h on CPU for long meetings). With
# acks_late=True on the transcribe task, a re-delivery would cause duplicate
# execution AND leave the worker in a wedged state (observed 2026-04-14).
# Set to 6h to stay above both the OpenAI client timeout (whisperx_timeout=21600)
# and the Celery task hard kill (task_time_limit=18000, i.e. 5h).
broker_transport_options = {
    "visibility_timeout": 21600,
}
