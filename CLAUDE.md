# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An open-source, multi-tenant registry service for companies, users,
role-based access control, physical/IoT assets, and digital twins — built
with NestJS and MongoDB. All application code lives under `backend/`; the
repo root only has docs, licensing, and two Docker Compose files
(`docker-compose.yaml` for app+MongoDB, `docker-compose.full.yaml` which
additionally builds and runs a real ICID instance — see
[ICID integration](#icid-integration)).

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

CI (`.github/workflows/ci.yaml`) runs `npm ci`, `lint`, `build`, `test` against
a real `mongo:7` service container — no mocking of Mongo at the CI level.

Docker Compose (`docker-compose.yaml` at repo root) starts Mongo + the app;
`docker compose up --build` reads `backend/.env`. Mongo runs as a
**single-node replica set** (`--replSet rs0`, initiated by a one-shot
`mongo-init` service) — this is required, not incidental:
`CompanyService.createCompany` uses a MongoDB transaction, which fails
outright against a standalone `mongod`. If you spin up Mongo any other way
for local testing, replicate that or pass `directConnection=true` +
initiate a replica set yourself.

### Environment

Copy `backend/.env.example` to `backend/.env`. `MONGO_URL`, `JWT_SECRET`,
`ICID_SERVICE_BACKEND_URL`, and `COMPANY_DEFAULT_CODE` are required — the
app fails fast at startup (`backend/src/common/env.constants.ts`) if any of
these four is missing. `HEDERA_KEY_SECRET` is the one optional var: it's
certificate-only, and its presence is what turns the certificate feature on
— see the `CertificateModule` bullet below. Without a reachable ICID, company creation fails at call time (not at
boot); everything else (users, access groups, assets, twins, factories,
product tagging) works on MongoDB alone.

## Architecture

### Domain modules

Each domain has its own NestJS module registering only the Mongoose models it
needs — there's no shared "models" module:

- **AuthModule** (`/auth/*`) — login, logout, password management,
  user-session lookups. Owns `AuthGuard` (stateless bearer-JWT verification)
  and exports it for reuse by `CompanyModule`/`ProductModule` without any
  cross-module model access. Does not own company or product data.
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

`AppModule` wires all of the above together plus `JwtModule` (global, no
default `signOptions`/`expiresIn` — every token-minting call site sets its own
TTL explicitly since access/refresh tokens have different lifetimes) and a
global in-memory `CacheModule`/`CacheInterceptor` (skips caching for
`token`/`refresh_token`/`grant_type`).

### Auth model

`POST /auth/login` returns two JWTs, distinguished by a `type` claim
(`'access'` vs `'refresh'`) — a token minted for one purpose is rejected if
used for the other:

- **`access_token`** — 1 hour, stateless. `AuthGuard` verifies signature +
  `type` only, no DB round trip. Stays valid for its full lifetime even after
  logout.
- **`refresh_token`** — 30 days, stored server-side on `CompanyUser.jwt_token`.
  Exchanged for a new access token via `POST /auth/refresh`. `/auth/logout`
  clears the stored token — this is the only place revocation is actually
  enforced (it blocks future refreshes, not already-issued access tokens).

Passwords are hashed with bcrypt (`AuthService.hashPassword`/
`comparePassword`) — never stored or returned in reversible form.

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

`docker-compose.full.yaml` builds and runs a real ICID instance (from its
own repo via a git build context, source unmodified) alongside this
service and MongoDB — use it to test ICID-integration changes end to end
instead of guessing at the contract from the code alone.

### Data model shape

Core schemas live in `backend/src/schemas/`. Company is the tenant root
(`company_ifric_id` from ICID); `CompanyProduct` tags an external
`product_ifric_id` to a company (no local product catalog — the product
itself lives in another system); `CompanyTwin` links an asset URN to its
manufacturer company, its owner company, and optionally a `Factory`;
`Factory` is a physical location tagged to an owner company via
`owner_company_ifric_id` (full CRUD lives on `CompanyController`);
`CompanyAsset`/`CompanyGateWay`/`CompanyServer` are company-owned
physical/IoT resources; `AccessGroup` + `UserProductAccessGroup` implement
per-company CRUD-permission RBAC — `UserProductAccessGroup.product_ifric_id`
is also a plain string, not a Product-catalog reference:
`AuthService.logIn`/`getIndexedData` resolve module access directly off it
rather than through a catalog lookup; `CompanyCategory` +
`CompanyCategoryMapping` implement the company taxonomy seeded by
`ScriptService`.

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
