# Start Celery worker and beat for local development
$env:CELERY_BROKER_URL = "redis://localhost:6379/1"
$env:CELERY_RESULT_BACKEND = "redis://localhost:6379/2"

Write-Host "Starting Celery worker..."
Start-Process -NoNewWindow -FilePath "python" -ArgumentList "-m", "celery", "-A", "backend.celery_app.celery_app", "worker", "-Q", "default,sla,knowledge,voice,social,dlq", "--loglevel=info"

Write-Host "Starting Celery beat..."
Start-Process -NoNewWindow -FilePath "python" -ArgumentList "-m", "celery", "-A", "backend.celery_app.celery_app", "beat", "--loglevel=info"
