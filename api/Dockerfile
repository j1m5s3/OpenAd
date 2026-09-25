# syntax=docker/dockerfile:1
FROM python:3.12-slim

WORKDIR /app
RUN pip install --no-cache-dir uv

COPY api/pyproject.toml api/README.md api/uv.lock ./
COPY api/src ./src
COPY api/alembic ./alembic
COPY api/alembic.ini ./

ENV UV_COMPILE_BYTECODE=1 PYTHONPATH=/app/src
# Pass --build-arg UV_EXTRAS=gcs to include google-cloud-storage (ADR-0017, OPENAD_MEDIA_BACKEND=gcs).
# Unset (default) keeps the image identical to before this extra existed.
ARG UV_EXTRAS=""
RUN uv sync --no-dev ${UV_EXTRAS:+--extra $UV_EXTRAS}

ENV OPENAD_ENV=prod
EXPOSE 8000
# CMD runs uvicorn ONLY — no migrations here (ADR-0017 "Migrations"). Rolling deploys can run
# more than one container of this image at once (Cloud Run `min-instances=1` + a new revision
# starting during rollout), so `alembic upgrade head` on every container start would race.
# Migrations run once, before traffic shifts, via:
#   - the Cloud Run Job `openad-migrate` (infra/gcp/jobs/migrate.yaml) in GCP, or
#   - the one-shot `migrate` service in docker-compose.stack.yml locally.
# `${PORT:-8000}` keeps local/compose (no $PORT set) on 8000 while honoring Cloud Run's
# injected $PORT. No HEALTHCHECK here: compose's `api` service defines its own (see
# docker-compose.yml / docker-compose.stack.yml); Cloud Run health-checks $PORT itself and
# needs no image-level HEALTHCHECK directive.
# indexer/settler override CMD (docker-compose.stack.yml, infra/gcp/services/*.yaml) and never
# listen on $PORT except through openad.health's liveness listener (ADR-0017).
CMD ["sh", "-c", "uv run uvicorn openad.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
