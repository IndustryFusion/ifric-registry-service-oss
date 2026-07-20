# ifric-registry-service Helm chart

Deploys this registry service to Kubernetes: PostgreSQL + a bundled
[Keycloak](https://www.keycloak.org/) (the app's sole identity provider),
with an optional bundled [ICID](https://github.com/IndustryFusion/icidservice)
(+ its own MongoDB) for company creation and certificates. Mirrors the two
root-level Docker Compose files:

| Compose file | Chart equivalent |
|---|---|
| `docker-compose.yaml` (app + Postgres + Keycloak, ICID external) | `values.yaml` alone — `icid.enabled: false` |
| `docker-compose.full.yaml` (+ a real ICID + its MongoDB) | `values.yaml` + `values-full.yaml` — `icid.enabled: true` |

`keycloak.enabled` defaults to `true` in **both** profiles — unlike ICID,
it isn't something `values-full.yaml` turns on.

## Prerequisites

Build and push this service's own image:

```bash
cd backend
docker build -t <your-registry>/ifric-registry-service:<tag> .
docker push <your-registry>/ifric-registry-service:<tag>
```

ICID and Keycloak need no build/push — both default to published images
(`ibn40/icid-backend:latest`, `quay.io/keycloak/keycloak:26.0`). Override
`icid.image`/`keycloak.image` only if running your own fork/version.

## Install — default profile (ICID external)

```bash
helm install my-registry charts/ifric-registry-service \
  --set image.repository=<your-registry>/ifric-registry-service \
  --set image.tag=<tag> \
  --set env.icidServiceBackendUrl=https://your-real-icid.example.com
```

`env.icidServiceBackendUrl` is required — the app fails fast at boot
without it. Point it at a real ICID instance, or use the full profile
below to bundle one.

This install succeeds, but the backend Pod will crash-loop until you
finish the [Keycloak](#keycloak) setup below.

## Install — full profile (+ bundled ICID)

```bash
helm install my-registry charts/ifric-registry-service \
  -f charts/ifric-registry-service/values.yaml \
  -f charts/ifric-registry-service/values-full.yaml \
  --set image.repository=<your-registry>/ifric-registry-service \
  --set image.tag=<tag>
```

`ICID_SERVICE_BACKEND_URL` is computed automatically here. Same
crash-loop-until-configured caveat applies to Keycloak.

## Keycloak

The bundled instance comes up **unconfigured** — realm/client creation is
a manual, one-time step (there's no safe way to auto-provision client
secrets before you've used the admin console against the running Pod).
After `helm install`:

1. Reach the Keycloak Service (`<release>-ifric-registry-service-keycloak`,
   port `8080`) and its admin console — login is `secrets.keycloakAdminPassword`
   (auto-generated if left blank; read it back with
   `kubectl get secret <release>-ifric-registry-service-secret -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' | base64 -d`).
2. Create a realm (e.g. `ifric`).
3. Create a **confidential** client `ifric` with **Direct Access Grants**
   enabled. Copy its secret.
4. Create a second **confidential** client `ifric-admin` with its
   **service account** enabled, granted the `realm-management` client's
   `manage-users` role. Copy its secret.
5. `helm upgrade` with `--set secrets.keycloakClientSecret=<step-3>
   --set secrets.keycloakAdminClientSecret=<step-4>` (or an untracked
   values file). The backend picks these up on restart.

Set `keycloak.enabled=false` + `env.keycloak.url`/`env.keycloak.realm` to
point at a fully external Keycloak instead of the bundled one.

## Secrets

`HEDERA_KEY_SECRET` (optional — unset disables `/certificate/*`), the two
Keycloak client secrets, Keycloak's admin password, and the Postgres
password all live in one Kubernetes `Secret`.

- **`secrets.keycloakAdminPassword`** — leave unset to auto-generate on
  first install and keep reusing it on every upgrade.
- **`secrets.keycloakClientSecret` / `secrets.keycloakAdminClientSecret`**
  — blank by default; set via `--set` or an untracked values file after
  completing the [Keycloak](#keycloak) setup.
- **`secrets.existingSecret`** — name of a `Secret` you manage yourself
  (Vault, Sealed Secrets, etc.), with keys `KEYCLOAK_ADMIN_PASSWORD`,
  `KEYCLOAK_CLIENT_SECRET`, `KEYCLOAK_ADMIN_CLIENT_SECRET`,
  `HEDERA_KEY_SECRET`, `DB_PASSWORD`. When set, this chart creates no
  `Secret` of its own.

`secrets.hederaKeySecret` and `postgres.auth.password` are plain values,
no auto-generation.

**Changing `postgres.auth.password` after first install** won't rotate the
password inside an already-initialized Postgres data volume — change it in
Postgres itself first, or wipe the PVC for a fresh init.

## Migrations

The backend Pod runs `wait-for-postgres` then `migrate`
(`npm run migration:run`) as initContainers before the app starts —
TypeORM tracks applied migrations, so redundant runs on scale-up are safe.
The Keycloak Deployment has the same `wait-for-postgres` initContainer,
since it shares the same Postgres instance.

## Values reference

See `values.yaml` for the full list with inline comments (mirrors
`backend/.env.example`). Notable ones:

| Value | Default | Notes |
|---|---|---|
| `replicaCount` | `1` | Backend replica count |
| `postgres.persistence.enabled` | `true` | Set `false` for ephemeral storage — testing only |
| `keycloak.enabled` | `true` | Set `false` to point at an external Keycloak instead |
| `icid.enabled` | `false` | Set via `values-full.yaml` |
| `icid.mongodb.persistence.enabled` | `true` | Same ephemeral-storage toggle, for ICID's MongoDB |
| `ingress.enabled` | `false` | Requires `ingress.host` |

## Not included

- Autoscaling (HPA) — add your own if needed.
- Bitnami/external chart dependencies — Postgres and MongoDB are hand-rolled
  `StatefulSet`s, kept auditable in one `templates/` directory.
- A CI pipeline that builds/pushes ICID's image — build it yourself.
- A realm-export/auto-import mechanism for Keycloak — setup is manual by
  design, see [Keycloak](#keycloak).

## Verification

```bash
helm lint charts/ifric-registry-service --set env.icidServiceBackendUrl=https://example.com
helm lint charts/ifric-registry-service -f charts/ifric-registry-service/values-full.yaml \
  --set icid.image.repository=x --set icid.image.tag=y

helm template my-registry charts/ifric-registry-service --set env.icidServiceBackendUrl=https://example.com
```
