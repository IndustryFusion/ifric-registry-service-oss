# ifric-registry-service Helm chart

Deploys this registry service to Kubernetes, backed by PostgreSQL and a
bundled [Keycloak](https://www.keycloak.org/) instance (this app's sole
identity provider), with an optional bundled
[ICID](https://github.com/IndustryFusion/icidservice) instance (+ its own
required MongoDB) for company creation and certificates. Mirrors the two
root-level Docker Compose files:

| Compose file | Chart equivalent |
|---|---|
| `docker-compose.yaml` (app + its own Postgres + Keycloak, ICID external) | `values.yaml` alone — `icid.enabled: false` |
| `docker-compose.full.yaml` (+ a real ICID + ICID's own MongoDB) | `values.yaml` + `values-full.yaml` — `icid.enabled: true` |

Keycloak (`keycloak.enabled`) defaults to `true` in **both** profiles —
unlike ICID, it isn't something `values-full.yaml` turns on.

## Prerequisites

**This service's own image**, built and pushed to a registry your cluster
can pull from:
```bash
cd backend
docker build -t <your-registry>/ifric-registry-service:<tag> .
docker push <your-registry>/ifric-registry-service:<tag>
```

That's it for ICID and Keycloak — neither needs a build/push step.
`icid.image` defaults to the published, unmodified `ibn40/icid-backend:latest`
image (same one `docker-compose.full.yaml` pulls); `keycloak.image` defaults
to the published `quay.io/keycloak/keycloak:26.0`. Only override either if
you're running your own fork/build/version.

## Install — default profile (app + its own Postgres + Keycloak, ICID external)

```bash
helm install my-registry charts/ifric-registry-service \
  --set image.repository=<your-registry>/ifric-registry-service \
  --set image.tag=<tag> \
  --set env.icidServiceBackendUrl=https://your-real-icid.example.com
```

`env.icidServiceBackendUrl` is required in this profile — not just for
company creation/certificates, but because the app itself fails fast at
boot without it (`ICID_SERVICE_BACKEND_URL` is a hard-required env var).
Point it at any real, reachable ICID-compatible instance, or use the full
profile below to bundle one instead.

**This install succeeds, but the backend Pod will crash-loop** until you
complete the one-time manual Keycloak realm/client setup below and
`helm upgrade` with the resulting secrets — see [Keycloak](#keycloak).

## Install — full profile (+ bundled ICID + its MongoDB)

```bash
helm install my-registry charts/ifric-registry-service \
  -f charts/ifric-registry-service/values.yaml \
  -f charts/ifric-registry-service/values-full.yaml \
  --set image.repository=<your-registry>/ifric-registry-service \
  --set image.tag=<tag>
```

`ICID_SERVICE_BACKEND_URL` is computed automatically from the release's own
in-cluster ICID Service — you don't set it yourself in this profile. Same
crash-loop-until-configured caveat applies to Keycloak here too.

## Keycloak

This app has no built-in auth — Keycloak is the sole identity provider for
login/tokens (`ifric` client) and all user/password lifecycle management
via its Admin API (`ifric-admin` client). `keycloak.enabled` (default
`true` in both profiles) deploys a bundled instance backed by this chart's
own Postgres (`KC_DB=postgres`, a different set of tables — no dedicated
PVC needed, unlike ICID's MongoDB); set it `false` to point at a fully
external Keycloak via `env.keycloak.url`/`env.keycloak.realm` instead.

**The bundled instance always comes up unconfigured** — realm/client
creation is a manual, one-time step this chart does not automate (same
reasoning as ICID's manual `POST /script` seeding, just for identity
instead of taxonomy data — and there's a genuine chicken-and-egg problem
with automating it: the client secrets only exist once a human has used
the admin console against this release's *already-running* Keycloak Pod).
After `helm install`:

1. Port-forward or otherwise reach the Keycloak Service
   (`<release>-ifric-registry-service-keycloak`, port `8080`) and its admin
   console. The console login is `secrets.keycloakAdminPassword` (blank by
   default — auto-generated on first install and reused across upgrades,
   same pattern as the old `jwtSecret`; read it back with
   `kubectl get secret <release>-ifric-registry-service-secret -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' | base64 -d`).
2. Create a realm (e.g. `ifric`, matching `env.keycloak.realm`'s default).
3. Create a **confidential** client named exactly `ifric`, with **Direct
   Access Grants** enabled. Copy its secret.
4. Create a second **confidential** client named exactly `ifric-admin`,
   with its **Service account roles** enabled, granted the
   `realm-management` client's `manage-users` role. Copy its secret.
5. `helm upgrade` the release with
   `--set secrets.keycloakClientSecret=<step-3-secret>
   --set secrets.keycloakAdminClientSecret=<step-4-secret>` (or an
   untracked values file — never commit real secrets). The backend Pod
   picks these up on its next restart and starts authenticating
   successfully.

## Secrets

`HEDERA_KEY_SECRET` (optional — leave unset to disable `/certificate/*`
entirely, matching the app's existing optionality), the two Keycloak
client secrets above, Keycloak's own admin-console password, and the
Postgres password live in a Kubernetes `Secret`.

- **`secrets.keycloakAdminPassword`** — same auto-generate-and-reuse-via-
  `lookup` pattern the old `jwtSecret` used: leave unset and the chart
  generates a random value on first install, then reads that same value
  back off the live `Secret` on every later `helm upgrade`, so upgrades
  never lock you out of the console you need for the manual setup above.
  `lookup` only sees real cluster state, so `helm template`/`--dry-run`
  always render a fresh random value — harmless, since nothing from a dry
  run gets applied.
- **`secrets.keycloakClientSecret` / `secrets.keycloakAdminClientSecret`**
  — plain inline values, blank by default (no safe auto-generated default
  is possible — see [Keycloak](#keycloak) for why). Set via `--set`/an
  untracked values file after completing the manual setup.
- **`secrets.existingSecret`** — the name of a `Secret` you already manage
  through your own pipeline (Vault, Sealed Secrets, External Secrets,
  etc.), with keys `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_CLIENT_SECRET`,
  `KEYCLOAK_ADMIN_CLIENT_SECRET`, `HEDERA_KEY_SECRET`, and `DB_PASSWORD`.
  When set, this chart creates no `Secret` of its own and ignores all of
  the above, including auto-generation.

`secrets.hederaKeySecret` and `postgres.auth.password` are plain inline
values (no auto-generation) — set them via `--set`/an untracked values
file, or fold them into `existingSecret` instead.

**Rotating `postgres.auth.password` after first install:**
PostgreSQL only applies `POSTGRES_PASSWORD` when its data volume is first
initialized — it ignores the env var on every later restart. Changing
`postgres.auth.password` on an existing release changes what the `Secret`
hands the backend (and Keycloak) without changing what's already set
inside the already-initialized database, breaking the DB connection.
Change the password inside Postgres itself first (or wipe the PVC for a
fresh init) before changing this value.

## Migrations

The backend Pod runs two initContainers before the app container starts:
`wait-for-postgres` (loops `pg_isready`) and `migrate` (`npm run
migration:run`, same image as the app). This replaces Compose's
`depends_on: condition: service_completed_successfully` ordering — Helm
hooks can't reproduce that ordering cleanly here (a `pre-install` hook runs
before the Postgres `StatefulSet` template even exists; a `post-install`
hook runs after this `Deployment` is already scheduling pods), so
migrations run per-pod instead. TypeORM tracks applied migrations in its
own table and wraps each one in a transaction, so redundant runs across
replicas on scale-up are safe. The Keycloak Deployment has its own
`wait-for-postgres` initContainer for the same reason, since it shares this
same Postgres instance.

## Values reference

See `values.yaml` for the full list with inline comments — it mirrors
`backend/.env.example` and `backend/src/common/env.constants.ts` variable
for variable. Notable ones:

| Value | Default | Notes |
|---|---|---|
| `replicaCount` | `1` | Backend replica count |
| `postgres.persistence.enabled` | `true` | Set `false` for ephemeral (`emptyDir`) storage — testing only |
| `keycloak.enabled` | `true` | Unlike `icid.enabled` — set `false` to point at an external Keycloak instead |
| `icid.enabled` | `false` | Set via `values-full.yaml` |
| `icid.mongodb.persistence.enabled` | `true` | Same ephemeral-storage toggle, for ICID's MongoDB |
| `ingress.enabled` | `false` | Standard `networking.k8s.io/v1` Ingress when enabled; requires `ingress.host` |

## Not included (out of scope for this chart)

- Autoscaling (HPA) — not configured; add your own if needed.
- Bitnami/external chart dependencies for Postgres or MongoDB — this chart
  hand-rolls both `StatefulSet`s so the whole deployment is auditable from
  one `templates/` directory, with no external chart-repo dependency.
- A CI pipeline that builds and pushes ICID's image — build it yourself
  (see Prerequisites above) or point `icid.image` at a published one if
  IndustryFusion ever publishes one.
- A realm-export/auto-import mechanism for Keycloak — see
  [Keycloak](#keycloak) above; realm/client setup is manual by design.

## Verification

```bash
helm lint charts/ifric-registry-service --set env.icidServiceBackendUrl=https://example.com
helm lint charts/ifric-registry-service -f charts/ifric-registry-service/values-full.yaml \
  --set icid.image.repository=x --set icid.image.tag=y

helm template my-registry charts/ifric-registry-service --set env.icidServiceBackendUrl=https://example.com
```
