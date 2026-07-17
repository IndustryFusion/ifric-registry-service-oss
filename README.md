# Ifric Registry Service

An open-source, multi-tenant registry service for companies, users,
role-based access control, physical/IoT assets, and digital twins — built
with [NestJS](https://nestjs.com/) and MongoDB.

## What this is

The core domain model is fully self-contained and requires no external
services to run:

- **Companies** — the tenant entity. Every company gets a `company_ifric_id`,
  minted by [ICID](#icid) (see below).
- **Users** — company-scoped user accounts with bcrypt-hashed passwords and
  JWT-based auth.
- **Access groups** — simple CRUD-permission role definitions
  (`create`/`read`/`update`/`delete`) scoped per company.
- **Assets, gateways, servers** — physical/IoT resources owned by a company.
- **Factories** — physical locations, each tagged to an owning company via
  `owner_company_ifric_id`. Full CRUD, plus lookups either directly by
  factory id or via a product's digital twin.
- **Products & digital twins** (`CompanyTwin`) — tags an external product/
  asset id (the product data itself lives in another system — this service
  only stores the tag) to its manufacturer company and its owner company,
  optionally located at a Factory. Manufacturer and owner are the *same
  kind* of company entity, just playing different roles per twin — a
  company doesn't need to be specially "made a manufacturer" first.
- **Certificates** — issued and verified via [ICID](#icid).

The API surface is split by domain into five controllers:

- **Auth** (`/auth/*`) — login, logout, password management, and
  user-session lookups. This is the only place session/identity concerns
  live; it does not own company or product data.
- **Company** (`/company/*`) — company CRUD, access groups, physical assets
  (CompanyAsset/GateWay/Server), and factory CRUD/lookups.
- **Product** (`/product/*`) — company↔product tagging and digital twins
  (CompanyTwin), including product-URN-keyed manufacturer/owner/
  factory-location lookups.
- **Certificate** (`/certificate/*`) — ICID-backed company certificate
  issuance and verification.
- **Script** (`/script`) — see [Script / seed data](#script--seed-data)
  below.

All of them share a single bearer-JWT auth mechanism — see
[Authentication](#authentication).

## Authentication

`POST /auth/login` returns two tokens:

- **`access_token`** — short-lived (1 hour), stateless. Every guarded
  endpoint verifies it by signature only (`AuthGuard`) — no database round
  trip per request. It remains valid for its full lifetime even after
  `/auth/logout`, since revocation only affects future refreshes.
- **`refresh_token`** — long-lived (30 days), stored server-side
  (`CompanyUser.jwt_token`). Exchange it for a new access token via
  `POST /auth/refresh`. This is the only place session revocation is
  actually enforced: `/auth/logout` clears the stored refresh token, so a
  stale one is rejected at `/auth/refresh` — but any access token already
  issued keeps working until it naturally expires.

A token minted for one purpose can't be used for the other — access tokens
carry `type: 'access'` and refresh tokens `type: 'refresh'`; each endpoint
rejects the wrong type.

## Script / seed data

`ScriptController` (`POST /script`, `POST /script/create-product`) seeds a
fresh, empty database with reference data:

- `POST /script` — the default RBAC access-group templates (`read_only`,
  `create_only`, `update_only`, `create_update`, `admin`) and the default
  company-category taxonomy (`manufacturer`, `user`, `public`,
  `service_provider`, `retailer`, `logistics`, `recycler`,
  `factory_owner`). **Run this once before creating any company** —
  `POST /company/create-company` looks up the category you pass by name and
  fails if it isn't seeded.
- `POST /script/create-product` — a handful of example internal-module
  identifiers (`Example Product A/B/C`), used only for the platform's own
  module-access gating (e.g. an internal `DPP Creator`-style module) during
  login. **This is optional** — company creation no longer depends on it
  (it links whatever of these identifiers exist, or none, without failing),
  and external product tagging (`POST /product/company-product`) never
  touches this data at all — see [Recommended usage flow](#recommended-usage-flow).
  Replace `ScriptService.createProduct()`'s contents with your own
  module lineup if you use this feature for a real deployment.

Both are one-time bootstraps for a fresh database, not general-purpose
admin APIs — re-running `POST /script` against a database that already has
this data will fail on the unique-ish inserts. **`ScriptController` has no
`@UseGuards()`** — both endpoints are unauthenticated. That's a deliberate
simplicity choice for a first-run seeding step, but worth knowing if you're
deploying this publicly: don't leave it reachable after initial setup (or
add a guard yourself) if you don't want anyone able to reseed reference
data.

## ICID

[ICID](https://github.com/IndustryFusion/icidservice) is a separate
open-source service this project stays compatible with — it mints the
`company_ifric_id` identifier used throughout the data model and issues/
verifies Hedera-based company certificates. It is **not** bundled here;
point `ICID_SERVICE_BACKEND_URL` at a running instance. Without it,
company creation and the `/certificate/*` endpoints will fail — everything
else (user management, access groups, assets, factories, product tagging,
twins) works fine on MongoDB alone.

The exact contract expected: `POST {ICID_SERVICE_BACKEND_URL}/company` (mints
a `company_ifric_id`), `DELETE {ICID_SERVICE_BACKEND_URL}/company/:id`
(rollback), `POST {ICID_SERVICE_BACKEND_URL}/certificate/create-company-certificate`,
`POST .../certificate/verify-company-certificate`, and
`POST .../certificate/verify-all-company-certificate` — see
`CompanyService.createCompany` and `CertificateService` for the exact
request/response shapes each call uses.

### Verified against a real ICID instance

The `POST /company` integration (company creation) was verified end to end
against ICID built and run from its own Dockerfile
(`https://github.com/IndustryFusion/icidservice`, `backend/Dockerfile`,
built with `docker build --network=host .` if your Docker daemon also
restricts container build-time network access — see
[Running with Docker](#running-with-docker)), with no changes to ICID's
application code. Two things you need to know to connect successfully:

- **`COMPANY_DEFAULT_CODE`'s middle and last segments must match an
  object-type/subtype pair already seeded in the ICID instance.** ICID's own
  `POST /script` seeds `object_type_code: "COM"` with
  `object_sub_type_code: "NAP"` for companies (see ICID's
  `endpoints/script/script.service.ts`). The previous default in this repo,
  `ifx-eur-com`, does **not** match — ICID rejects it with
  `404 "Object Sub Type Code does not exist"`, since `"com"` isn't a valid
  subtype code (only a valid *object type* code — the taxonomy is
  `COM`/`NAP`, not `COM`/`COM`). The corrected default,
  `IFX-COM-NAP`, was confirmed to work against ICID's real, unmodified
  `/company` endpoint. **`object_type_code` is compared case-sensitively on
  ICID's side** (`objectTypeData.object_type_code == data.object_type_code`,
  no `.toUpperCase()`), so it must be uppercase (`COM`, not `com`).
- **ICID also requires `IFRIC_NAMESPACE`** (a UUID string, used as the
  `uuidv5` namespace when minting ids) to boot — set on the ICID container
  itself, not on this service. Run ICID's own `POST /script` once against a
  fresh database before creating any company, same as this service's own
  `/script` seed step.
- ICID's Dockerfile defaults to fetching secrets from HashiCorp Vault on
  startup (`fetch_env_from_vault.sh`) unless you pass `-e ENV=prod` when
  running its container, in which case it skips straight to
  `npm run start:prod` and reads whatever env vars you supply directly —
  this is how it was run for verification, since no Vault instance was
  available. This is a run-time flag on ICID's existing Dockerfile, not a
  code or Dockerfile change.
- Certificate endpoints (`/certificate/*`, both on this service and on
  ICID) were **not** part of this verification and are expected to need
  additional setup (Hedera network access, ICID's certificate-signing
  dependencies) beyond what's covered here.

## Getting started

```bash
cd backend
cp .env.example .env   # fill in the required values — see comments in the file
npm install
npm run start:dev
```

Or with Docker Compose (starts MongoDB too) — see
[Running with Docker](#running-with-docker) below for details and a
standalone (non-compose) alternative.

The API listens on `http://localhost:4007` by default (configurable via
`PORT`). Interactive API docs: `http://localhost:4007/api-docs`.

### Required environment variables

See `backend/.env.example` for the full list with explanations. At minimum
you need `MONGO_URL` and `JWT_SECRET`. `ICID_SERVICE_BACKEND_URL`,
`HEDERA_KEY_SECRET`, and `COMPANY_DEFAULT_CODE` are validated at startup
(the app refuses to boot without them — see `backend/src/common/env.constants.ts`)
since company creation and certificates depend on them; only their
functional correctness (an actually-reachable ICID instance) is optional if
you don't need those two features yet.

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URL` | Yes | MongoDB connection string. |
| `JWT_SECRET` | Yes | Signs/verifies access + refresh JWTs. |
| `ICID_SERVICE_BACKEND_URL` | Yes (app won't boot without it) | Base URL of an ICID-compatible instance. |
| `HEDERA_KEY_SECRET` | Yes (app won't boot without it) | Local AES-256 key encrypting the private key ICID returns before it's stored. |
| `COMPANY_DEFAULT_CODE` | Yes (app won't boot without it) | Dash-separated dataspace/object-type/object-subtype code sent to ICID when minting a `company_ifric_id`, e.g. `IFX-COM-NAP` — the last two segments must match a seeded object-type/subtype pair on the ICID side (case-sensitive on the object-type segment); see [Verified against a real ICID instance](#verified-against-a-real-icid-instance). |
| `PORT` | No (defaults to `4007`) | HTTP port the app listens on. |
| `CORS_ORIGIN` | No | Comma-separated list of allowed browser origins. |

## Recommended usage flow

A typical fresh deployment follows this order: **seed reference data →
create a company → create a factory tagged to an owner company → tag
products to a company → create digital twins linking a product to its
manufacturer, owner, and factory → query any of it back.** The examples
below are copy-pasteable and were verified end to end against a running
instance.

```bash
BASE=http://localhost:4007

# 1. Seed the RBAC templates + company-category taxonomy (once, on a fresh DB)
curl -s -X POST $BASE/script

# 2. Create a manufacturer company
curl -s -X POST $BASE/company/create-company -H 'Content-Type: application/json' -d '{
  "industry": "Manufacturing",
  "company_name": "Acme Manufacturing Co",
  "registration_number": "REG-1001",
  "address_1": "123 Main St",
  "city": "Berlin",
  "country": "Germany",
  "zip": "10115",
  "admin_name": "Admin Person",
  "position": "CEO",
  "email": "admin@acme-mfg.example",
  "password": "unused",
  "company_size": "10-50",
  "company_category": "manufacturer",
  "meta_data": {},
  "company_domain": "acme-mfg.example",
  "newsLetter": false,
  "company_logo": "",
  "company_image": ""
}'
# -> { "success": true, "status": 201, "message": "Company created successfully",
#      "company_ifric_id": "urn:ifric:...", "temporaryPassword": "..." }
# Save company_ifric_id and temporaryPassword.

# 3. Create a second company to act as an owner (same shape, different
#    email/company_name/company_category — e.g. "factory_owner")

# 4. Log in as the manufacturer's admin to get a bearer token
curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{
  "email": "admin@acme-mfg.example",
  "password": "<temporaryPassword from step 2>",
  "product_name": "Example Product A"
}'
# -> { "status": 200, "data": { "access_token": "...", ... } }
TOKEN="<access_token from above>"

# 5. Create a factory, tagged to the owner company
curl -s -X POST $BASE/company/factories -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "factory_id": "urn:ifric:fac-1",
  "owner_company_ifric_id": "<owner company_ifric_id from step 3>",
  "location_name": "Plant 1",
  "city": "Munich",
  "country": "Germany"
}'

# 6. Query the factory back
curl -s $BASE/company/factories/urn:ifric:fac-1 -H "Authorization: Bearer $TOKEN"
curl -s $BASE/company/factories/urn:ifric:fac-1/owner -H "Authorization: Bearer $TOKEN"

# 7. Tag an external product to the manufacturer — no pre-seeding required,
#    the product itself is expected to live in another system
curl -s -X POST $BASE/product/company-product -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "company_ifric_id": "<manufacturer company_ifric_id from step 2>",
  "product_ifric_id": "urn:product:alpha-machine-001",
  "billing_id": "BILL-1"
}'
curl -s $BASE/product/company/<manufacturer company_ifric_id> -H "Authorization: Bearer $TOKEN"

# 8. Create a digital twin: manufacturer and owner are DISTINCT companies,
#    located at the factory from step 5
curl -s -X POST $BASE/product/twin -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "manufacturer_ifric_id": "<manufacturer company_ifric_id from step 2>",
  "owner_company_ifric_id": "<owner company_ifric_id from step 3>",
  "asset_ifric_id": "urn:asset:widget-1",
  "factory_id": "urn:ifric:fac-1"
}'

# 9. Query the twin back — owner resolves to the OWNER company (not the
#    manufacturer), and the factory resolves to the real factory
curl -s $BASE/product/urn:asset:widget-1/owner -H "Authorization: Bearer $TOKEN"
curl -s $BASE/product/urn:asset:widget-1/factory-location -H "Authorization: Bearer $TOKEN"
curl -s $BASE/product/twin/by-asset/urn:asset:widget-1 -H "Authorization: Bearer $TOKEN"
```

A few things worth knowing about this flow:

- `owner_company_ifric_id` and `manufacturer_ifric_id` on a twin must be
  two distinct, already-existing companies — there's no separate "become a
  manufacturer" step; any company can be passed as either role on any
  given twin.
- Deleting a factory that's still referenced by a twin (`factory_id`) is
  blocked (`409 Conflict`) — detach the twin first.
- `POST /company/company-asset` (physical assets/gateways/servers, distinct
  from digital twins) requires a `type: "asset" | "gateway" | "server"`
  field alongside the matching `*_ifric_id` field.

## Running with Docker

### Docker Compose (app + MongoDB)

```bash
cp backend/.env.example backend/.env   # edit as needed; docker-compose reads backend/.env
docker compose up --build
```

MongoDB runs as a single-node replica set (`docker-compose.yaml` passes
`--replSet rs0` and a one-shot `mongo-init` service runs `rs.initiate()` on
first start) — this is required, not optional: `createCompany` uses a
MongoDB transaction, which only works against a replica set, never a
standalone `mongod`. The compose file also overrides `MONGO_URL` to point at
the `mongo` service with `?replicaSet=rs0`, so you don't need to hand-edit
that value into `backend/.env` yourself for the compose path. Everything
except company creation and `/certificate/*` works without ICID configured
at all — see [ICID](#icid) above.

### Docker Compose (app + MongoDB + a real ICID instance)

For company creation and to exercise the full [Recommended usage
flow](#recommended-usage-flow) against a real ICID rather than treating it
as an opaque dependency, `docker-compose.full.yaml` additionally builds and
runs [ICID](https://github.com/IndustryFusion/icidservice) itself, straight
from its own repo (via a git build context — nothing is vendored into this
repo, and its source is never modified), sharing the same MongoDB:

```bash
docker compose -f docker-compose.full.yaml up --build
curl -X POST http://localhost:4010/script   # seed ICID's taxonomy (once)
curl -X POST http://localhost:4007/script   # seed this service's RBAC/categories (once)
```

Then follow the [Recommended usage flow](#recommended-usage-flow) against
`http://localhost:4007` — company creation will mint real
`company_ifric_id`s from the ICID container instead of failing.

This was verified working end to end, including the negative paths (a
duplicate registration number is rejected by ICID itself and correctly
surfaces as a `409` through this service). Two things worth knowing:

- **`COMPANY_DEFAULT_CODE` must be `IFX-COM-NAP`** for this to work — see
  [Verified against a real ICID instance](#verified-against-a-real-icid-instance)
  for why. `docker-compose.full.yaml` already sets this correctly; if you
  change ICID's seeded taxonomy, update it to match.
- **ICID's Hedera and certificate-signing dependencies are deliberately
  left unconfigured** — `HBAR_URL`, `ASSET_VC_TOPIC_ID`, `CERTIFICATE_PATH`,
  `KEY_PATH` are not set on the `icid` service. ICID's certificate
  endpoints exist and are reachable, but calling them (or this service's own
  `/certificate/*`, which proxies to them) will fail — that's expected and
  out of scope for this compose file. Everything else (`/company`,
  `/script`, and this service's factory/product/twin flow) works.
- Override the ICID container's `IFRIC_NAMESPACE` or this service's
  `JWT_SECRET`/`HEDERA_KEY_SECRET` by creating a `.env` file next to
  `docker-compose.full.yaml` (compose reads it automatically for
  `${VAR}`-style substitution) — sensible defaults are used if you don't.

### Standalone image (bring your own MongoDB)

```bash
cd backend
docker build -t ifric-registry-service .
docker run -p 4007:4007 --env-file .env ifric-registry-service
```

`MONGO_URL` in `.env` must be reachable **from inside the container**, not
just from your host — `localhost` inside the container refers to the
container itself, not your machine. Point it at whatever hostname resolves
to your MongoDB instance from within Docker, e.g.:

- A MongoDB container on the same Docker network — use its container/service
  name (`mongodb://mongo:27017/...`).
- Docker Desktop (Mac/Windows) reaching a MongoDB on your host — use
  `mongodb://host.docker.internal:27017/...`.
- A remote/managed MongoDB — use its real connection string.

If a MongoDB replica set member self-identifies with a hostname your
container can't resolve (e.g. `localhost`, which means "this container" from
inside it), append `&directConnection=true` to `MONGO_URL` — this skips
replica-set topology discovery and connects directly to the node you named,
which also works fine for this service's transactions on a single-node
replica set.

If `docker build` hangs or times out on `RUN npm install` with no output,
your Docker daemon's default bridge network may not allow build-time
outbound internet access (seen in some sandboxed/CI environments). Confirm
with `docker build --network=host -t test -<<< $'FROM node:20-alpine\nRUN wget -qO- https://registry.npmjs.org/'`;
if that succeeds where a plain `docker build` hangs, add `--network=host` to
your build command (`docker build --network=host -t ifric-registry-service .`).

## API documentation

- Live, interactive: `/api-docs` (Swagger UI) once the app is running.
- Static specs checked into `backend/`:
  - `openapi.yaml` — the full API surface (all five controllers).
  - `openapi.company.yaml` — just the `/company/*` controller (company
    CRUD, access groups, physical assets, factory CRUD/lookups).

Both are generated from the running app's Swagger metadata
(`GET /api-docs-json`), not hand-written. Regenerate them after changing
any controller:

```bash
cd backend
npm run start:dev &      # or any other way of getting the app listening
npm run generate:openapi
```

## Testing

```bash
cd backend
npm test          # unit tests
npm run test:e2e  # e2e tests (currently boilerplate — see test/app.e2e-spec.ts)
npm run lint
npm run build
```

## Architecture notes

- Each domain has its own NestJS module (`AuthModule`, `CompanyModule`,
  `ProductModule`, `CertificateModule`) registering only the Mongoose
  models it needs; `AppModule` wires them together plus the flat
  `ScriptController`/`ScriptService` (small enough not to warrant its own
  module).
- `AuthGuard` is stateless (verifies JWT signature + `type` claim only) and
  has no database dependency, so it's exported once from `AuthModule` and
  reused by `CompanyModule`/`ProductModule` without any cross-module model
  access.
- Passwords are hashed with bcrypt (`AuthService.hashPassword` /
  `comparePassword`) — never stored or returned in reversible form.
- `CompanyProduct`/`UserProductAccessGroup` store a plain
  `product_ifric_id` string rather than a foreign key into a local product
  catalog — product data is expected to live in an external system, this
  service only stores the tag (mirrors how `CompanyTwin.asset_ifric_id`
  already worked).

## License

Apache License 2.0 — see [`LICENSE`](LICENSE).
