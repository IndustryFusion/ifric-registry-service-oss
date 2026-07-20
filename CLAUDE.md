# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An open-source, multi-tenant registry service for companies, users,
role-based access control, physical/IoT assets, and digital twins — built
with NestJS and PostgreSQL (via TypeORM). Authentication has no built-in
implementation of its own — [Keycloak](#keycloak-integration) is the sole
identity provider. All application code lives under `backend/`; the repo
root has docs, licensing, two Docker Compose files (`docker-compose.yaml`
for app+PostgreSQL+Keycloak, `docker-compose.full.yaml` which additionally
pulls and runs a real ICID instance, with its own required MongoDB — see
[ICID integration](#icid-integration)), and a Helm chart
(`charts/ifric-registry-service/`) that mirrors both Compose profiles for
Kubernetes — see that chart's own README before changing its templates.

## Commands

All commands run from `backend/`:

```bash
npm install
npm run start:dev    # watch mode, http://localhost:4007, Swagger at /api-docs
npm run build        # compile to dist/
npm run start:prod   # run the compiled build
npm run lint         # eslint --fix
npm test             # unit tests (jest, *.spec.ts colocated with source)
npm run test:watch
npm run test:cov
npm run test:e2e     # jest -c test/jest-e2e.json (currently boilerplate)
```

Run a single unit test file: `npx jest src/endpoints/company/company.service.spec.ts`.
Run a single test by name: `npx jest -t "test name substring"`.

`npm run generate:openapi` regenerates `backend/openapi.yaml` and
`backend/openapi.company.yaml` from a running app's `/api-docs-json` (start
the app first, e.g. `npm run start:dev &`) — see
[API docs](#api-docs).

`npm run migration:run` applies pending TypeORM migrations
(`backend/src/migrations/`) to whatever database `DB_HOST`/`DB_NAME`/etc.
point at; `npm run migration:generate` diffs entities against the current
schema to draft a new one. Run against a fresh database before first boot —
the app does not apply migrations itself (`synchronize: false` always).

CI (`.github/workflows/ci.yaml`) runs `npm ci`, `lint`, `build`, `test` against
a real `postgres:16` service container — no mocking of the DB at the CI level
(though the unit suite itself mocks every `Repository`, so this container is
mainly there for parity with local dev / future e2e use).

Docker Compose (`docker-compose.yaml` at repo root) starts PostgreSQL +
Keycloak + a one-shot `migrate` service (applies TypeORM migrations,
idempotent) + the app; `docker compose up --build` reads `backend/.env`.
Keycloak comes up unconfigured — the backend crash-loops on its fail-fast
env check until a one-time manual realm/client setup is done (see root
README.md's "Running with Docker").

### Environment

Copy `backend/.env.example` to `backend/.env`. `DB_HOST`, `DB_NAME`,
`KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_SECRET`,
`KEYCLOAK_ADMIN_CLIENT_SECRET`, `ICID_SERVICE_BACKEND_URL`, and
`COMPANY_DEFAULT_CODE` are required — the app fails fast at startup
(`backend/src/common/env.constants.ts`) if any of these is missing.
`DB_PORT`/`DB_USER`/`DB_PASSWORD` default to `5432`/`ifric`/`ifric`;
`KEYCLOAK_CLIENT_ID`/`KEYCLOAK_ADMIN_CLIENT_ID` default to
`ifric`/`ifric-admin`. `HEDERA_KEY_SECRET` is the one fully optional var:
it's certificate-only, and its presence is what turns the certificate
feature on — see the `CertificateModule` bullet below. Without a reachable
ICID, company creation fails at call time (not at boot); without a reachable
Keycloak, nothing auth-related works at all (there is no local fallback).

`main.ts` calls `dotenv.config()` before importing `AppModule` (or anything
else) — that ordering is load-bearing, not stylistic. `AppModule`
transitively imports `env.constants.ts`, which reads `process.env` at
module-load time; if `dotenv.config()` ran after that import (as it
previously did, a real bug fixed alongside the Keycloak migration), a real
`backend/.env` file would silently never populate `process.env` in time,
and the app would only boot if the same vars happened to already be
exported in the shell. Keep the `dotenv` import+`config()` call pair as the
very first thing in `main.ts` if you touch that file.

## Architecture

### Domain modules

Each domain has its own NestJS module registering only the TypeORM entities
it needs (`TypeOrmModule.forFeature([...])`) — there's no shared "models"
module. Every table's primary key (`_id`) is a 24-hex-char,
Mongo-ObjectId-shaped string generated via `bson-objectid`
(`backend/src/database/generate-id.ts`), not a Postgres-native uuid/serial —
this predates the Postgres migration and was kept deliberately so `_id` in
every JSON response stayed byte-identical to the service's original
MongoDB-backed shape. `repository.upsert()` bypasses TypeORM entity
lifecycle hooks (so `@BeforeInsert()` never fires and a freshly-inserted row
gets a `NULL` primary key) — every upsert in this codebase is therefore a
hand-written `INSERT ... ON CONFLICT` via `repository.query()` with an
explicitly generated id instead; don't reintroduce `repository.upsert()`.

- **AuthModule** (`/auth/*`) — login, logout, password management,
  user-session lookups. Owns `AuthGuard` (verifies bearer tokens against
  Keycloak's JWKS) and exports it for reuse by `CompanyModule`/
  `ProductModule` without any cross-module model access. Also owns
  `KeycloakService` (see [Keycloak integration](#keycloak-integration)),
  registered globally via `KeycloakModule` so `CertificateModule`'s bare
  `@UseGuards(AuthGuard)` (it doesn't import `AuthModule`) keeps resolving
  `AuthGuard`'s dependencies. Does not own company or product data.
- **CompanyModule** (`/company/*`) — company CRUD, access groups, physical
  assets (`CompanyAsset`/`CompanyGateWay`/`CompanyServer`), and full Factory
  CRUD (`POST`/`PATCH`/`DELETE /company/factories`, plus factory-keyed
  lookups) — a `Factory` is a physical location tagged to an owner company
  via `owner_company_ifric_id`; deleting one still referenced by a
  `CompanyTwin.factory_id` is blocked (`409`). Imports `AuthModule` (for the
  guard) and `CertificateModule`.
- **ProductModule** (`/product/*`) — external product tagging
  (`CompanyProduct.product_ifric_id`, a plain string id, not a foreign key
  into a local catalog — product data lives in another system) and digital
  twins (`CompanyTwin`), which link an asset URN to a manufacturer company,
  an **independently looked-up** owner company, and optionally a `Factory`
  via `factory_id`. Manufacturer and owner are just roles on the same kind
  of company entity — don't reintroduce the bug where owner was silently
  forced equal to manufacturer; they must resolve to two separate `Company`
  lookups.
- **CertificateModule** (`/certificate/*`) — ICID-backed company certificate
  issuance/verification. **Optional**: `CertificateController` is only
  added to the module (`controllers: [...]`) when `HEDERA_KEY_SECRET` is
  set (`envConstants.certificatesEnabled`) — unset, the routes don't exist
  at all (`404`, not just unauthenticated). `CertificateService` is always
  provided regardless, since `CompanyModule` injects it for
  `getAllCompanies`'s certificate-verification annotation, which degrades
  to `company_cert: false` instead of throwing whenever certificates are
  disabled or the ICID call fails.
- **ScriptController/ScriptService** (`/script`) — flat, not its own module
  (registered directly in `AppModule`); one-time seed-data bootstrap for a
  fresh database (default RBAC access-group templates, company-category
  taxonomy, example products). **Has no `@UseGuards()`** — don't leave it
  reachable after initial setup in a real deployment.

`AppModule` wires all of the above together plus a global in-memory
`CacheModule`/`CacheInterceptor` (skips caching for
`token`/`refresh_token`/`grant_type`). There is no `JwtModule`/local JWT
signing anywhere in this codebase — token issuance and verification are
entirely Keycloak's responsibility (see below).

### Auth model

There is no local auth implementation — Keycloak issues, refreshes, and
verifies every token, and owns all credential/user-lifecycle state.
`AuthService`/`AuthGuard` never touch a password hash or sign a JWT
themselves; every credential operation goes through `KeycloakService`
(`backend/src/endpoints/auth/keycloak.service.ts`):

- **`POST /auth/login`** — same external contract as before
  (`{email, password, product_name}` in, `access_token`/`refresh_token` +
  company/access-group data out), but the password check is a Resource
  Owner Password Credentials (ROPC) grant against Keycloak's confidential
  `ifric` client (`KeycloakService.passwordGrant`), called exactly once per
  login and reused across whichever response branch fires — don't
  reintroduce a second call, it would open a redundant Keycloak session.
  The rest of `logIn`'s Company/CompanyCategoryMapping/CompanyProduct/
  UserProductAccessGroup/AccessGroup resolution walk (including the
  `'DPP Creator'` special case) is unchanged and has nothing to do with
  authentication.
- **`POST /auth/refresh`** — forwards to Keycloak's `refresh_token` grant.
  Keycloak rotates refresh tokens by default, so the response includes a
  new `refresh_token` (additive vs. the old `{access_token}`-only shape).
- **`POST /auth/logout`** — best-effort revokes the session at Keycloak
  when a `refresh_token` is supplied (`KeycloakService.revoke`, swallows
  its own errors so a briefly-unreachable Keycloak can't fail a logout).
- **`AuthGuard`** — verifies the bearer token locally against Keycloak's
  realm signing keys (JWKS, fetched via `jwks-rsa` and cached — no
  per-request network round trip to Keycloak in the steady state), not via
  Keycloak's token-introspection endpoint.
- **User/credential lifecycle** (`create-user/:admin_mail`,
  `update-password`, `recover-password[-request]`, `delete-company-user`,
  and `CompanyService.createCompany`'s admin-user provisioning) all call
  `KeycloakService`'s Admin API methods (`createUser`/`setPassword`/
  `setEmail`/`deleteUser`) instead of hashing/storing a password locally.
  These go through a **separate** confidential client, `ifric-admin`
  (client-credentials grant, service account granted the
  realm-management client's `manage-users` role) — kept separate from
  `ifric` so a leaked end-user-facing client secret can't also manage the
  realm's users.

`CompanyUser.user_password`/`jwt_token` and `Company.password` were dropped
(migration `DropLocalAuthColumns1784546767848`) — don't reintroduce them;
credentials and session state live in Keycloak, not this database. Both
Keycloak clients (`ifric`, `ifric-admin`) must already exist in the target
realm — this app never provisions them; it's a one-time manual step (see
root README.md's "Running with Docker"/"Deploying with Helm").

### Keycloak integration

[Keycloak](https://www.keycloak.org/) is a separate, external identity
provider (not bundled as application code in this repo, but run as its own
container/Pod via Compose/Helm — see below) that this service depends on
for 100% of authentication; there is no local fallback mode. Contract
(`KeycloakService`): token endpoint
`{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token`
(`grant_type=password|refresh_token|client_credentials`), `.../protocol/
openid-connect/logout` (revoke), `.../protocol/openid-connect/certs`
(JWKS), and the Admin API under `{KEYCLOAK_URL}/admin/realms/
{KEYCLOAK_REALM}/users`. Exact request/response shapes and error-message
translation (Keycloak failures are mapped back to this app's pre-existing
`HttpException`/`UnauthorizedException` messages, e.g. bad credentials →
`'Invalid Password'`/400) live in `keycloak.service.ts` — read it before
changing the integration.

`docker-compose.yaml` and `docker-compose.full.yaml` both run a `keycloak`
service (official `quay.io/keycloak/keycloak` image, `start-dev` mode,
`KC_DB=postgres` pointed at this service's own Postgres — Keycloak
namespaces its own tables, so there's no collision, and it avoids standing
up a third datastore) unconditionally — unlike ICID, it isn't gated behind
the `full` profile. The Helm chart's `keycloak.enabled` (default `true` in
both `values.yaml` and `values-full.yaml`) mirrors this. In both cases the
instance comes up **unconfigured**: the confidential `ifric`/`ifric-admin`
clients are a required manual setup step (admin console), since there's no
safe way to auto-provision client secrets before a human has interacted
with the just-deployed instance. The backend fails fast at boot
(`env.constants.ts`) without them — this is intentional, not a bug to
paper over with a default.

### ICID integration

[ICID](https://github.com/IndustryFusion/icidservice) is a separate,
external open-source service (not bundled in this repo) that mints
`company_ifric_id` and issues/verifies Hedera-based certificates.
Contract: `POST {ICID_SERVICE_BACKEND_URL}/company` (mint),
`DELETE .../company/:id` (rollback on failure), `POST
.../certificate/create-company-certificate`, `POST
.../certificate/verify-company-certificate`, `POST
.../certificate/verify-all-company-certificate`. Exact request/response
shapes live in `CompanyService.createCompany` and `CertificateService` — read
those before changing the integration.

`COMPANY_DEFAULT_CODE` must be `IFX-COM-NAP` — its last two segments have to
match an object-type/subtype pair already seeded in ICID's own `POST
/script` (`COM`/`NAP` for companies), and the object-type segment is
compared **case-sensitively** on ICID's side. This was confirmed against
ICID's actual seed data (`endpoints/script/script.service.ts` in the ICID
repo), not assumed — don't change it without re-verifying against a real
instance.

`docker-compose.full.yaml` pulls and runs a real ICID instance (the
published `ibn40/icid-backend:latest` image, unmodified — no build step)
alongside this service's own PostgreSQL and ICID's own required MongoDB
(unrelated databases — ICID's MongoDB dependency can't be changed since
ICID runs unmodified) — use it to test ICID-integration changes end to end
instead of guessing at the contract from the code alone. The Helm chart's
`values-full.yaml` overlay defaults to the same image, for the same reason.

### Data model shape

Core entities live in `backend/src/entities/` (TypeORM). Company is the
tenant root (`company_ifric_id` from ICID); `CompanyProduct` tags an
external `product_ifric_id` to a company (no local product catalog — the
product itself lives in another system); `CompanyTwin` links an asset URN
to its manufacturer company, its owner company, and optionally a `Factory`;
`Factory` is a physical location tagged to an owner company via
`owner_company_ifric_id` (full CRUD lives on `CompanyController`);
`CompanyAsset`/`CompanyGateWay`/`CompanyServer` are company-owned
physical/IoT resources; `AccessGroup` + `UserProductAccessGroup` implement
per-company CRUD-permission RBAC — `UserProductAccessGroup.product_ifric_id`
is also a plain string, not a Product-catalog reference:
`AuthService.logIn`/`getIndexedData` resolve module access directly off it
rather than through a catalog lookup; `CompanyCategory` +
`CompanyCategoryMapping` implement the company taxonomy seeded by
`ScriptService`. `CompanyService.createCompany` runs as a single TypeORM
`QueryRunner` transaction spanning `Company`, `CompanyCategoryMapping`,
`CompanyProduct`, `AccessGroup`, `CompanyUser`, and
`UserProductAccessGroup` — the ICID mint call happens outside the DB
transaction (external, not rollback-able by SQL) and keeps its own manual
compensating `DELETE` on failure.

### API docs

Swagger UI at `/api-docs` once running; static specs `backend/openapi.yaml`
(full surface) and `backend/openapi.company.yaml` (`/company/*` only) are
generated from the running app's `/api-docs-json`, not hand-written —
regenerate with `npm run generate:openapi` (`backend/scripts/generate-openapi.js`;
the app must already be running) after changing any controller.

## Before opening a PR

- `npm run lint`, `npm run build`, `npm run test` must pass.
- Add/update unit tests for any behavior you change.
- Keep public classes and methods documented (comment density matches the
  existing JSDoc-style comments on services/guards, e.g. `auth.guard.ts`).
