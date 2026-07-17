# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An open-source, multi-tenant registry service for companies, users,
role-based access control, physical/IoT assets, and digital twins — built
with NestJS and MongoDB. All application code lives under `backend/`; the
repo root only has docs and `docker-compose.yaml`.

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

CI (`.github/workflows/ci.yaml`) runs `npm ci`, `lint`, `build`, `test` against
a real `mongo:7` service container — no mocking of Mongo at the CI level.

Docker Compose (`docker-compose.yaml` at repo root) starts Mongo + the app;
`docker compose up --build` reads `backend/.env`.

### Environment

Copy `backend/.env.example` to `backend/.env`. Required: `MONGO_URL`,
`JWT_SECRET`. `ICID_SERVICE_BACKEND_URL` and `HEDERA_KEY_SECRET` are only
needed for company creation and `/certificate/*` — everything else (users,
access groups, assets, twins, factories) works on MongoDB alone.

## Architecture

### Domain modules

Each domain has its own NestJS module registering only the Mongoose models it
needs — there's no shared "models" module:

- **AuthModule** (`/auth/*`) — login, logout, password management,
  user-session lookups. Owns `AuthGuard` (stateless bearer-JWT verification)
  and exports it for reuse by `CompanyModule`/`ProductModule` without any
  cross-module model access. Does not own company or product data.
- **CompanyModule** (`/company/*`) — company CRUD, access groups, physical
  assets (`CompanyAsset`/`CompanyGateWay`/`CompanyServer`), factory-keyed
  lookups. Imports `AuthModule` (for the guard) and `CertificateModule`.
- **ProductModule** (`/product/*`) — product catalog, company↔product
  linking, digital twins (`CompanyTwin`), product-URN-keyed
  manufacturer/owner/factory-location lookups.
- **CertificateModule** (`/certificate/*`) — ICID-backed company certificate
  issuance/verification.
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

ICID is a separate, external open-source service (not bundled in this repo)
that mints `company_ifric_id` and issues/verifies Hedera-based certificates.
Contract: `POST {ICID_SERVICE_BACKEND_URL}/company` (mint),
`DELETE .../company/:id` (rollback on failure), `POST
.../certificate/create-company-certificate`, `POST
.../certificate/verify-company-certificate`, `POST
.../certificate/verify-all-company-certificate`. Exact request/response
shapes live in `CompanyService.createCompany` and `CertificateService` — read
those before changing the integration, since there's no local contract test
for the external service.

### Data model shape

Core schemas live in `backend/src/schemas/`. Company is the tenant root
(`company_ifric_id` from ICID); `CompanyProduct`/`CompanyTwin` link a product
URN to its manufacturer and owner companies, optionally located at a
`Factory`; `CompanyAsset`/`CompanyGateWay`/`CompanyServer` are company-owned
physical/IoT resources; `AccessGroup` + `UserProductAccessGroup` implement
per-company CRUD-permission RBAC; `CompanyCategory` +
`CompanyCategoryMapping` implement the company taxonomy seeded by
`ScriptService`.

### API docs

Swagger UI at `/api-docs` once running; static specs `backend/openapi.yaml`
(full surface) and `backend/openapi.company.yaml` (`/company/*` only) are
generated from the running app's `/api-docs-json`, not hand-written —
regenerate them the same way after changing any controller.

## Before opening a PR

- `npm run lint`, `npm run build`, `npm run test` must pass.
- Add/update unit tests for any behavior you change.
- Keep public classes and methods documented (comment density matches the
  existing JSDoc-style comments on services/guards, e.g. `auth.guard.ts`).
