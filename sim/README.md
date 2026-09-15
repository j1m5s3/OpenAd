# @openad/sim

Opt-in local marketplace simulator (ADR-0012). Anvil personas (publishers `#3–#5`,
advertisers `#6–#9`) sign real protocol transactions so Discover/Supply/Campaigns look live.
Not started by `dev-up`. `api/` and `web/` never hold these keys.

Requires the **host-run** API (`OPENAD_ENV=dev`) so media verification can fetch
`http://127.0.0.1:8610/media/…`. The containerized API in `docker-compose.stack.yml` cannot
reach that URL.

## Run

```text
.\scripts\setup.cmd
.\scripts\dev-up.cmd
.\scripts\sim-up.cmd          # titled window openad-sim
.\scripts\sim-down.cmd        # prints: close the window / Ctrl+C
```

Control API (localhost only): `http://127.0.0.1:8610/status`.

MCP (Cursor, daemon must already be running): `npm run mcp -w sim`
tools `sim_status`, `sim_list_personas`, `sim_nudge_action`, `sim_pause_loop`.

## Test

```bash
npm run test -w sim
npm run typecheck -w sim
# optional, needs a running stack:
# set OPENAD_SIM_IT=1 && npm run test -w sim
```

Design: [`docs/adr/0012-local-sim-daemon.md`](../docs/adr/0012-local-sim-daemon.md),
[`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) §1 / §7.
