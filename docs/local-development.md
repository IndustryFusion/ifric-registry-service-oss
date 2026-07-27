# Local development details

Companion to the root README's [Local Development](../README.md#local-development)
section — the two most common paths (`docker compose up` and native
`npm run start:dev`) are covered there. This doc has the less-common paths
and troubleshooting.

## Standalone Docker image

`backend/Dockerfile` builds just this app — bring your own PostgreSQL and
Keycloak (no `docker-compose.yaml` orchestration):

```bash
cd backend
docker build -t ifric-registry-service .
docker run -p 4007:4007 --env-file .env ifric-registry-service
```

Run migrations against your database first — the standalone image doesn't
apply them automatically:

```bash
cd backend
npm run migration:run
```

`DB_HOST` in `.env` must be reachable **from inside the container**, not
from your host shell:

- Same Docker network as your Postgres container → use the container/service
  name (e.g. `postgres`).
- Docker Desktop, Postgres running on your host → `host.docker.internal`.
- Remote/managed PostgreSQL → its real hostname. `DB_SSL` defaults to on,
  so TLS is used automatically (set `DB_SSL_CA` if it uses a
  private/self-signed CA) — see `backend/.env.example`.
- Postgres with no TLS listener (including the bundled docker-compose/Helm
  one) → set `DB_SSL=false`.

## Troubleshooting

**`docker build` hangs on `RUN npm install`.** Some Docker daemons
(notably CI/sandboxed environments) restrict outbound network access on
the default bridge network used during a build. Add `--network=host` to
the build command — this is already done for you in the root
`docker-compose.yaml`/`docker-compose.full.yaml` builds, but not for a
manual `docker build` of the standalone image above.

**Backend crash-loops after `docker compose up`.** Expected on first run —
Keycloak comes up unconfigured. Finish the one-time setup in
[`docs/keycloak-setup.md`](keycloak-setup.md), then bring the stack up
again.

**Migrations vs. schema drift.** This app never applies migrations itself
(`synchronize: false` always) — `npm run migration:run` (or the
`docker-compose.yaml` one-shot `migrate` service) must be run against a
fresh database before first boot. `npm run migration:generate` diffs
entities against the current schema if you're adding a new one.
