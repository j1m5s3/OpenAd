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
# Indexer overlay overrides command and skips migrations.
CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn openad.main:app --host 0.0.0.0 --port 8000"]
