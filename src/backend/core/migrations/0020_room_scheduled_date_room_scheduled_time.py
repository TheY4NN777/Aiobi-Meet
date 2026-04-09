from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0019_recording_transcription_key"),
    ]

    operations = [
        migrations.AddField(
            model_name="room",
            name="scheduled_date",
            field=models.DateField(
                blank=True, null=True, verbose_name="scheduled date"
            ),
        ),
        migrations.AddField(
            model_name="room",
            name="scheduled_time",
            field=models.TimeField(
                blank=True, null=True, verbose_name="scheduled time"
            ),
        ),
    ]
