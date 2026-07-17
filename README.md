# Ifric Registry Service

Open-source, multi-tenant registry for companies, users, role-based access
control, physical/IoT assets, and digital twins. Built with
[NestJS](https://nestjs.com/) + MongoDB.

## Architecture

```mermaid
flowchart LR
    Client(["Client / Swagger UI"])

    subgraph App["ifric-registry-service"]
        direction TB
        Auth["Auth — /auth"]
        Company["Company — /company"]
        Product["Product — /product"]
        Cert["Certificate — /certificate"]
        Script["Script — /script"]
    end

    Mongo[("MongoDB")]
    ICID[("ICID<br/>separate service")]

    Client --> Auth & Company & Product & Cert & Script
    Auth --- Mongo
    Company --- Mongo
    Product --- Mongo
    Cert --- Mongo
    Script --- Mongo
    Company -. "mint company_ifric_id" .-> ICID
    Cert -. "issue / verify certs" .-> ICID
```

Everything runs on MongoDB alone **except company creation and
certificates**, which need [ICID](#icid-integration) — a separate service.

| Module | Routes | Owns |
|---|---|---|
| Auth | `/auth/*` | Login, sessions, password management — no company/product data |
| Company | `/company/*` | Company CRUD, access groups, physical assets, factories |
| Product | `/product/*` | Product tagging, digital twins |
| Certificate | `/certificate/*` | ICID-backed certificate issuance/verification |
| Script | `/script` | One-time seed data (see [Usage flow](#usage-flow)) |

## Quick start

```bash
cd backend
cp .env.example .env      # fill in the required values — see comments in the file
npm install && npm run start:dev
```

Or with Docker (see [Running with Docker](#running-with-docker) for details):

```bash
docker compose up --build                              # app + MongoDB
docker compose -f docker-compose.full.yaml up --build   # + a real ICID instance
```

App: `http://localhost:4007` · Swagger UI: `/api-docs`

## Core concepts

| Entity | What it is |
|---|---|
| **Company** | Tenant root. Gets a `company_ifric_id` minted by ICID. |
| **Factory** | Physical location, tagged to an owner company. |
| **Product tag** | An external product/asset id linked to a company — the product data itself lives elsewhere, this service only stores the tag. |
| **Digital twin** | Links a product/asset to a manufacturer company + an owner company, optionally a factory. Manufacturer/owner are just *roles* — any company can play either, no separate "become a manufacturer" step. |
| **Access group** | Per-company CRUD-permission role. |
| **Certificate** | ICID-issued/verified, Hedera-backed. |

## Authentication

`POST /auth/login` returns two JWTs:

| Token | Lifetime | Notes |
|---|---|---|
| `access_token` | 1 hour | Stateless — checked by signature only. Stays valid until it expires, even after logout. |
| `refresh_token` | 30 days | Stored server-side. `POST /auth/refresh` exchanges it for a new access token. `/auth/logout` clears it — the only place revocation is enforced. |

A token minted for one purpose can't be used for the other
(`type: 'access'` vs `'refresh'`).

## Usage flow

Seed once, then create → tag → query. Manufacturer and owner are always
two distinct companies:

```mermaid
sequenceDiagram
    actor You
    participant App as ifric-registry-service
    participant ICID

    You->>App: POST /script (seed once)
    You->>App: POST /company/create-company (manufacturer)
    App->>ICID: mint company_ifric_id
    ICID-->>App: company_ifric_id
    You->>App: POST /company/create-company (owner)
    You->>App: POST /auth/login
    App-->>You: access_token
    You->>App: POST /company/factories (tag to owner)
    You->>App: POST /product/company-product (tag external product)
    You->>App: POST /product/twin (manufacturer + owner + factory)
    You->>App: GET .../owner · .../factory-location
    App-->>You: owner ≠ manufacturer, factory resolved ✓
```

<details>
<summary><strong>Full copy-pasteable curl walkthrough</strong></summary>

```bash
BASE=http://localhost:4007

# 1. Seed RBAC templates + company-category taxonomy (once, on a fresh DB)
curl -s -X POST $BASE/script

# 2. Create a manufacturer company
curl -s -X POST $BASE/company/create-company -H 'Content-Type: application/json' -d '{
  "industry": "Manufacturing", "company_name": "Acme Manufacturing Co",
  "registration_number": "REG-1001", "address_1": "123 Main St", "city": "Berlin",
  "country": "Germany", "zip": "10115", "admin_name": "Admin Person", "position": "CEO",
  "email": "admin@acme-mfg.example", "password": "unused", "company_size": "10-50",
  "company_category": "manufacturer", "meta_data": {}, "company_domain": "acme-mfg.example",
  "newsLetter": false, "company_logo": "", "company_image": ""
}'
# -> { "company_ifric_id": "urn:ifric:...", "temporaryPassword": "..." } — save both.

# 3. Create a second company to act as owner (same shape, different
#    email/company_name/company_category, e.g. "factory_owner")

# 4. Log in as the manufacturer's admin
curl -s -X POST $BASE/auth/login -H 'Content-Type: application/json' -d '{
  "email": "admin@acme-mfg.example",
  "password": "<temporaryPassword from step 2>",
  "product_name": "Example Product A"
}'
TOKEN="<access_token from the response>"

# 5. Create a factory, tagged to the owner company
curl -s -X POST $BASE/company/factories -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "factory_id": "urn:ifric:fac-1",
  "owner_company_ifric_id": "<owner company_ifric_id from step 3>",
  "location_name": "Plant 1", "city": "Munich", "country": "Germany"
}'

# 6. Query the factory back
curl -s $BASE/company/factories/urn:ifric:fac-1 -H "Authorization: Bearer $TOKEN"
curl -s $BASE/company/factories/urn:ifric:fac-1/owner -H "Authorization: Bearer $TOKEN"

# 7. Tag an external product to the manufacturer (no pre-seeding required)
curl -s -X POST $BASE/product/company-product -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "company_ifric_id": "<manufacturer company_ifric_id from step 2>",
  "product_ifric_id": "urn:product:alpha-machine-001",
  "billing_id": "BILL-1"
}'
curl -s $BASE/product/company/<manufacturer company_ifric_id> -H "Authorization: Bearer $TOKEN"

# 8. Create a digital twin — manufacturer and owner are DISTINCT companies,
#    located at the factory from step 5
curl -s -X POST $BASE/product/twin -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{
  "manufacturer_ifric_id": "<manufacturer company_ifric_id from step 2>",
  "owner_company_ifric_id": "<owner company_ifric_id from step 3>",
  "asset_ifric_id": "urn:asset:widget-1",
  "factory_id": "urn:ifric:fac-1"
}'

# 9. Query the twin back — owner resolves to the OWNER (not the
#    manufacturer), and the factory resolves to the real factory
curl -s $BASE/product/urn:asset:widget-1/owner -H "Authorization: Bearer $TOKEN"
curl -s $BASE/product/urn:asset:widget-1/factory-location -H "Authorization: Bearer $TOKEN"
curl -s $BASE/product/twin/by-asset/urn:asset:widget-1 -H "Authorization: Bearer $TOKEN"
```

</details>

**Good to know:** deleting a factory still referenced by a twin is blocked
(`409`) — detach the twin first. `POST /company/company-asset` needs a
`type: "asset" | "gateway" | "server"` field alongside the matching
`*_ifric_id` field.

## Environment variables

At minimum you need `MONGO_URL` and `JWT_SECRET`. The other three are
validated at startup — the app won't boot without them — but only need to
be *functionally* correct (a reachable ICID) if you use company creation or
certificates. Full list with examples: `backend/.env.example`.

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URL` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Signs/verifies access + refresh JWTs |
| `ICID_SERVICE_BACKEND_URL` | Yes* | Base URL of an ICID-compatible instance |
| `HEDERA_KEY_SECRET` | Yes* | Local AES-256 key encrypting the private key ICID returns |
| `COMPANY_DEFAULT_CODE` | Yes* | `IFX-COM-NAP` — see [ICID integration](#icid-integration) for why |
| `PORT` | No (default `4007`) | HTTP port |
| `CORS_ORIGIN` | No | Comma-separated allowed browser origins |

<sub>* app refuses to boot without a value set; only needs to actually work if you use company creation / certificates.</sub>

## ICID integration

[ICID](https://github.com/IndustryFusion/icidservice) is a separate
open-source service that mints `company_ifric_id`s and issues/verifies
Hedera-backed certificates. Not bundled here — point
`ICID_SERVICE_BACKEND_URL` at a running instance.

**Contract:** `POST /company` (mint), `DELETE /company/:id` (rollback on
failure), `POST /certificate/create-company-certificate`,
`POST /certificate/verify-company-certificate`,
`POST /certificate/verify-all-company-certificate`.

> **Gotcha:** `COMPANY_DEFAULT_CODE` must be `IFX-COM-NAP`. Its last two
> segments have to match an object-type/subtype pair already seeded in
> ICID, and the object-type segment is compared **case-sensitively**. An
> older default (`ifx-eur-com`) doesn't match and ICID rejects it with
> `404`.

<details>
<summary>Verified against a real, unmodified ICID instance — details</summary>

This integration was tested end to end against ICID built straight from
its own Dockerfile (`backend/Dockerfile` in the ICID repo), no source
changes made.

- ICID's own `POST /script` seeds `object_type_code: "COM"` with
  `object_sub_type_code: "NAP"` for companies — that's where `IFX-COM-NAP`
  comes from (see ICID's `endpoints/script/script.service.ts`).
- ICID also needs `IFRIC_NAMESPACE` (any valid UUID, used as a `uuidv5`
  namespace) set on **its own** container to boot.
- ICID's Dockerfile fetches secrets from HashiCorp Vault on startup unless
  you pass `-e ENV=prod`, in which case it reads env vars directly instead
  — that's how it was run here, since no Vault instance was available.
  This is a runtime flag, not a code change.
- Certificate endpoints (on both services) were **not** part of this
  verification and need additional setup (Hedera network access, ICID's
  certificate-signing dependencies) beyond what's covered here.
- Negative paths were also verified: a duplicate registration number is
  rejected by ICID itself and correctly surfaces as `409` through this
  service.

</details>

## Running with Docker

| File | Starts |
|---|---|
| `docker-compose.yaml` | App + MongoDB (single-node replica set) |
| `docker-compose.full.yaml` | App + MongoDB + a real ICID, built from its own repo, unmodified |
| `backend/Dockerfile` | Standalone image — bring your own MongoDB |

```bash
docker compose up --build
# — or, with a real ICID —
docker compose -f docker-compose.full.yaml up --build
curl -X POST http://localhost:4010/script   # seed ICID (once)
curl -X POST http://localhost:4007/script   # seed this service (once)
```

MongoDB runs as a single-node replica set in both compose files — this is
**required**, not optional: `createCompany` uses a MongoDB transaction,
which only works against a replica set.

<details>
<summary>Standalone image, network troubleshooting</summary>

**Standalone image (bring your own MongoDB):**

```bash
cd backend
docker build -t ifric-registry-service .
docker run -p 4007:4007 --env-file .env ifric-registry-service
```

`MONGO_URL` must be reachable **from inside the container** — `localhost`
there means "this container," not your machine:

- Same Docker network → use the container/service name (`mongodb://mongo:27017/...`).
- Docker Desktop (Mac/Windows) reaching a MongoDB on your host → `mongodb://host.docker.internal:27017/...`.
- Remote/managed MongoDB → its real connection string.

If a replica set member self-identifies with a hostname your container
can't resolve, append `&directConnection=true` to `MONGO_URL`.

**If `docker build` hangs on `RUN npm install`** with no output, your
Docker daemon may block build-time outbound network access (seen in some
sandboxed/CI environments). Confirm with:

```bash
docker build --network=host -t test -<<< $'FROM node:20-alpine\nRUN wget -qO- https://registry.npmjs.org/'
```

If that succeeds where a plain `docker build` hangs, add `--network=host`
to your build command.

</details>

## API documentation

- Live, interactive: `/api-docs` (Swagger UI) once the app is running.
- Static specs in `backend/`: `openapi.yaml` (full surface),
  `openapi.company.yaml` (`/company/*` only).

Both are generated from the running app's Swagger metadata, not
hand-written — regenerate after changing any controller:

```bash
cd backend
npm run start:dev &
npm run generate:openapi
```

## Testing

```bash
cd backend
npm test          # unit tests
npm run test:e2e  # e2e tests (currently boilerplate)
npm run lint
npm run build
```

<details>
<summary>Design notes</summary>

- Each domain has its own NestJS module registering only the Mongoose
  models it needs; `AppModule` wires them together plus the flat
  `ScriptController`/`ScriptService`.
- `AuthGuard` is stateless (JWT signature + `type` claim only, no DB
  access) — exported once from `AuthModule`, reused everywhere.
- Passwords are bcrypt-hashed, never stored or returned in reversible form.
- `CompanyProduct`/`UserProductAccessGroup` store a plain
  `product_ifric_id` string rather than a foreign key into a local
  catalog — product data lives in an external system, this service only
  stores the tag (same pattern as `CompanyTwin.asset_ifric_id`).

</details>

## License

Apache License 2.0 — see [`LICENSE`](LICENSE).
