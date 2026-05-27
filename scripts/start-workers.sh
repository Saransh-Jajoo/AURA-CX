#!/usr/bin/env bash
# Start Celery worker and beat for local development (Linux/macOS)
export CELERY_BROKER_URL=${CELERY_BROKER_URL:-redis://localhost:6379/1}
export CELERY_RESULT_BACKEND=${CELERY_RESULT_BACKEND:-redis://localhost:6379/2}

echo "Starting Celery worker..."
python -m celery -A backend.celery_app.celery_app worker -Q default,sla,knowledge,voice,social,dlq --loglevel=info &

echo "Starting Celery beat..."
python -m celery -A backend.celery_app.celery_app beat --loglevel=info &

wait
