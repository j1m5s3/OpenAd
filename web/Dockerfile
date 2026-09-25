# syntax=docker/dockerfile:1
#
# Multi-stage build for the web app (ADR-0017, step 27+28). Two variants of the same image:
#   docker build -f web/Dockerfile .                                   # normal build
#   docker build -f web/Dockerfile --build-arg VITE_DEMO_MODE=1 .      # demo build (ADR-0016)
# `VITE_DEMO_MODE=1` is harmless today (this branch predates web demo mode landing on main);
# once demo mode merges, this same build-arg switches the app into the demo bundle described
# by ADR-0016 without any change to this file.

FROM node:22-bookworm-slim AS build
WORKDIR /repo

# `npm run build -w web` shells out to `uv run python -m openad.export_openapi` (sync:openapi)
# to generate web/src/generated/openapi.ts, so the build stage needs Python + uv even though
# it never runs the api server itself. node:22-bookworm-slim has neither pip nor python3 at
# all (not just an old one) — rather than apt-get installing them, take uv's own static
# binary (self-contained, no system OpenSSL/certs dependency) and let uv download and manage
# its own Python 3.12 (api/pyproject.toml requires-python >=3.12,<3.14). Bump this pin
# deliberately, not via `:latest`.
COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /usr/local/bin/
ENV UV_PYTHON=3.12 UV_PYTHON_PREFERENCE=only-managed UV_LINK_MODE=copy

# Root workspace manifest first, so `npm ci` stays cacheable across source-only changes.
COPY package.json package-lock.json ./
COPY web/package.json web/package.json
COPY embed/package.json embed/package.json
COPY e2e/package.json e2e/package.json
COPY sim/package.json sim/package.json
RUN npm ci --workspaces --include-workspace-root

# api package: only what sync:openapi's `uv run python -m openad.export_openapi` needs.
COPY api/pyproject.toml api/README.md api/uv.lock api/
COPY api/src api/src
RUN uv sync --no-dev --directory api

# contracts/deployments: sync:deployments copies whatever <chainId>.json files exist (none is
# fine — 84532.json/8453.json are committed only once a chain is actually deployed to).
COPY contracts/deployments contracts/deployments

# embed source: `web/vite.config.ts`'s `@openad/embed` alias resolves straight to embed/src for
# the app's own bundle (e.g. `/embed-demo`), but `npm run build -w web`'s own `prebuild` hook
# (`npm --prefix ../embed run build`, ROADMAP 6.3) also builds `embed/dist` here — required so
# `vite.config.ts`'s `embedScriptCopy` plugin has a `embed/dist/open-ad.js` to copy into the web
# build's own output as the versioned, publisher-facing `embed/open-ad.v1.js` script.
COPY embed embed
COPY web web

ARG VITE_DEMO_MODE=""
ARG VITE_API_URL=""
ARG VITE_CHAIN_ID=""
ARG VITE_WALLETCONNECT_PROJECT_ID=""
ARG VITE_DEMO_URL=""
ARG VITE_GUIDE_URL=""
ENV VITE_DEMO_MODE=${VITE_DEMO_MODE} \
    VITE_API_URL=${VITE_API_URL} \
    VITE_CHAIN_ID=${VITE_CHAIN_ID} \
    VITE_WALLETCONNECT_PROJECT_ID=${VITE_WALLETCONNECT_PROJECT_ID} \
    VITE_DEMO_URL=${VITE_DEMO_URL} \
    VITE_GUIDE_URL=${VITE_GUIDE_URL}

# No `|| true`: if sync:openapi can't run (uv/python missing, api package broken), the build
# must fail loudly rather than ship stale generated types.
RUN npm run build -w web

FROM nginxinc/nginx-unprivileged:stable-alpine AS runtime
COPY web/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/web/dist /usr/share/nginx/html

# Cloud Run injects $PORT (default 8080 here, matching the nginx-unprivileged image's own
# default); envsubst renders the template into /etc/nginx/conf.d on container start.
ENV PORT=8080
# Demo-safe default: same-origin only. The normal (non-demo) variant is deployed with
# CSP_CONNECT_SRC widened to the API origin, RPC origins and WalletConnect (infra/gcp/services
# /web.yaml); the demo variant (services/web-demo.yaml) leaves this default in place, which is
# exactly ADR-0016's "no RPC, no API, no WebSocket" enforced at the HTTP layer too.
ENV CSP_CONNECT_SRC="'self'"
EXPOSE 8080
