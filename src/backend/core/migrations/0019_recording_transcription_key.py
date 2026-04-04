"""Add transcription_key field to Recording model."""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0018_rename_active_application_is_active"),
    ]

    operations = [
        migrations.AddField(
            model_name="recording",
            name="transcription_key",
            field=models.CharField(
                blank=True,
                help_text="MinIO object key for the transcription file (.md).",
                max_length=500,
                null=True,
                verbose_name="Transcription key",
            ),
        ),
    ]
