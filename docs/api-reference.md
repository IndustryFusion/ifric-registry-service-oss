# API Reference

Full per-endpoint listing for all five controllers. This table is
hand-maintained — if it and the running app ever disagree, the app wins:

- **Live, interactive:** Swagger UI at `/api-docs` once the app is running.
- **Static specs** (generated from the running app, not hand-written):
  `backend/openapi.yaml` (full surface), `backend/openapi.company.yaml`
  (`/company/*` only). Regenerate after changing any controller:
  ```bash
  cd backend
  npm run start:dev &
  npm run generate:openapi
  ```

"Guard" below is `AuthGuard` (valid Keycloak bearer token required) unless
noted otherwise. "RBAC-scoped" means the endpoint additionally checks the
token's own `company_ifric_id`/`user_id` against the request (see the root
README's [Keycloak Authentication](../README.md#keycloak-authentication)
section and `AccessControlService`) — company/user CRUD, factory CRUD, and
all of `/company/assets/*` are RBAC-scoped; directory/search-style reads
that intentionally span companies (`get-all-companies`, manufacturer
search, category listings) are not.

## Auth (`/auth/*`)

Login, sessions, credential/user-lifecycle management via Keycloak — no
company/product data of its own. RBAC in this app is **one `AccessGroup`
role per user per company** (no per-product dimension — see the root
README's Keycloak Authentication section).

| Method | Path | Guard | Description |
|---|---|---|---|
| POST | `/auth/create-user/:admin_mail` | Auth + RBAC-scoped | Create an additional user for a company: provisions a Keycloak identity and grants it one `AccessGroup` role. |
| POST | `/auth/login` | Public | Log in via Keycloak (ROPC), then resolve the user's company/category/AccessGroup role. Returns `access_token`/`refresh_token`. |
| POST | `/auth/get-indexed-db-data` | Auth | Re-resolve a user's company/role/AccessGroup data without a fresh login. |
| GET | `/auth/authenticate-token/:token` | Public | Verify a bearer token against Keycloak. |
| GET | `/auth/get-company-users/:id` | Auth | List all users of a company. |
| GET | `/auth/get-company-users-access/:company_ifric_id` | Auth | List a company's users with their one AccessGroup role each. |
| GET | `/auth/get-user-profile-content/:company_ifric_id/:user_id` | Auth | A user's role for their profile page. |
| GET | `/auth/get-user-product-access/:id` | Auth | A user's `UserAccessGroup` grant, if any. |
| GET | `/auth/get-user-details` | Auth | Look up a user by `user_email` + `company_ifric_id` (query params). |
| GET | `/auth/get-total-users` | Auth | Count of all users. |
| GET | `/auth/get-user-details/:id` | Auth | Look up a user by its id. |
| GET | `/auth/get-user-details-by-email/:email` | Auth | Look up a user by email. |
| GET | `/auth/get-user-details-by-email-recover-password/:email` | Public | Same lookup, public — used by the forgot-password flow before login. |
| GET | `/auth/check-company-admin/:email` | Auth | Whether an email belongs to a company's admin contact. |
| PATCH | `/auth/update-password` | Public | Change password — verifies the old one against Keycloak first. |
| PATCH | `/auth/update-user-access-group/:id` | Auth | Set a user's `AccessGroup` role (`{ user_role }`). |
| PATCH | `/auth/update-company-user` | Auth | Update a user's name/email/image, optionally password. |
| DELETE | `/auth/delete-company-user/:id` | Auth | Delete a user (Keycloak identity + local rows). |
| POST | `/auth/logout` | Public | Best-effort revoke the Keycloak session (pass `refresh_token`). |
| POST | `/auth/refresh` | Public | Exchange a refresh token for a new access/refresh token pair. |
| POST | `/auth/recover-password-request` | Public | Generate a new temporary password. |
| POST | `/auth/recover-password` | Public | Set a new password using a temporary one. |

## Company (`/company/*`)

Company CRUD, factories, assets (see below), access groups (RBAC role
definitions — not themselves RBAC-scoped, since they're seeded/managed
config, not a tenant resource), and gateway/server.

| Method | Path | Guard | Description |
|---|---|---|---|
| GET | `/company/factories` | Auth (RBAC-scoped when `owner_company_ifric_id` is given) | List factories, optionally filtered by owner company. Unfiltered = cross-company directory. |
| GET | `/company/factories/:id` | Auth + RBAC-scoped | Look up one factory by `factory_id`. |
| GET | `/company/factories/:id/owner` | Auth + RBAC-scoped | Resolve a factory's owner company. |
| GET | `/company/factories/:id/products` | Auth + RBAC-scoped | Asset URNs (see `/company/assets/*`) located at a factory. |
| POST | `/company/factories` | Auth + RBAC-scoped | Create a factory tagged to an owner company. |
| PATCH | `/company/factories/:id` | Auth + RBAC-scoped | Update a factory's location details. |
| DELETE | `/company/factories/:id` | Auth + RBAC-scoped | Delete a factory — `409` if an asset still references it. |

### Assets (`/company/assets/*`)

Merges what used to be two unrelated concepts — a bare physical-asset tag
and a manufacturer/owner/factory "digital twin" — into **one** object. A
row starts physical-only (`company_ifric_id` only, `is_twin: false`) and
becomes a twin once `owner_company_ifric_id` (+ optionally `factory_id`) is
set. All RBAC-scoped: writes and single-object reads (`:id`,
`:id/manufacturer`, `:id/owner`, `:id/factory-location`) check the caller
against whichever party (manufacturer or owner) the asset belongs to;
`assets`/`assets/manufacturer/:id`/`assets/owner/:id`/
`assets/count/:id` check the caller against the named `company_ifric_id`.

| Method | Path | Description |
|---|---|---|
| POST | `/company/assets` | Create an asset. `company_ifric_id` (manufacturer, required); `owner_company_ifric_id`/`factory_id` optional — providing them creates it already twinned. |
| PATCH | `/company/assets/:id` | Update an asset — setting `owner_company_ifric_id` "twins" it. |
| DELETE | `/company/assets/:id` | Delete one asset. |
| DELETE | `/company/assets/bulk` | Bulk-delete — rejects the whole call if any targeted asset belongs to a different company. |
| GET | `/company/assets` | List a company's assets (`company_ifric_id` query param, required). |
| GET | `/company/assets/:id` | Look up one asset by `asset_ifric_id`. |
| GET | `/company/assets/:id/manufacturer` | Resolve an asset to its manufacturer company. |
| GET | `/company/assets/:id/owner` | Resolve an asset to its owner company. |
| GET | `/company/assets/:id/factory-location` | Resolve an asset to its factory. |
| GET | `/company/assets/manufacturer/:company_ifric_id` | List assets manufactured by a company. |
| GET | `/company/assets/owner/:company_ifric_id` | List assets owned by a company. |
| GET | `/company/assets/manufacturer/:manufacturer_company_ifric_id/owner/:owner_company_ifric_id` | Assets shared between one specific manufacturer + owner pair. |
| GET | `/company/assets/count` | Count assets matching a comma-separated list of URNs (`asset_ifric_ids` query param) — unscoped, may span companies. |
| GET | `/company/assets/count/:company_ifric_id` | Count a company's assets. |

### Company CRUD, access groups, gateway/server

| Method | Path | Guard | Description |
|---|---|---|---|
| POST | `/company/company-asset` | Auth + RBAC-scoped | Create a gateway/server (`type` discriminator — `"asset"` moved to `POST /company/assets`). |
| POST | `/company/create-access-group/:id` | Auth | Create a custom RBAC role for a company. |
| POST | `/company/create-company` | `X-API-Key` (`COMPANY_CREATION_API_KEY`), not a Keycloak token | Create a company: mints `company_ifric_id` via ICID, provisions a default admin user + RBAC roles, all in one transaction. |
| POST | `/company/add-status-detail` | Public | Mark a company's verification status. |
| GET | `/company/get-company-access-group/:id` | Auth | List a company's RBAC roles. |
| GET | `/company/get-access-group-by-group-name/:company_id/:group_name` | Auth | Look up one RBAC role by name. |
| GET | `/company/get-access-group/:id` | Auth | Look up one RBAC role by id. |
| GET | `/company/get-category-specific-company/:categoryName` | Auth | Companies in one category (e.g. `manufacturer`). |
| GET | `/company/get-company-details/:id` | Auth + RBAC-scoped | Look up a company by `company_ifric_id`. |
| GET | `/company/get-company-details-id/:id` | Auth + RBAC-scoped | Look up a company by its internal id. |
| GET | `/company/get-company-contact-details/:company_ifric_id` | Auth + RBAC-scoped | A company's contact/admin details. |
| GET | `/company/companies/check` | Public | Check whether a company name/registration number is already taken. |
| GET | `/company/get-company-details-by-email/:email` | Public | Look up a company by its admin email. |
| GET | `/company/get-company-details-by-name/:company_name` | Auth | Look up a company by name. |
| GET | `/company/get-company-and-user-details/:company_ifric_id` | Auth + RBAC-scoped | Combined company + users + roles view. |
| GET | `/company/get-all-companies` | Auth | List every company (with certificate-verification annotation if enabled). |
| GET | `/company/get-all-owner-companies/:company_ifric_id` | Auth + RBAC-scoped | Distinct owner companies across a manufacturer's assets. |
| GET | `/company/get-company-category/:company_ifric_id` | Auth | A company's category (e.g. manufacturer, factory owner). |
| GET | `/company/get-categories` | Auth | The fixed list of company categories. |
| GET | `/company/get-manufacturer-companies/:count` | Auth | Paged list of manufacturer companies. |
| GET | `/company/get-searched-manufacturer-companies/:searched_text` | Auth | Search manufacturer companies by name. |
| GET | `/company/get-manufacturer-owner-companies` | Auth | Companies that are both a manufacturer and an owner somewhere. |
| PATCH | `/company/update-company/:id` | Auth + RBAC-scoped | Update company details. |
| PATCH | `/company/update-access-group/:id` | Auth | Update an RBAC role's CRUD flags. |
| DELETE | `/company/delete-company/:id` | Auth + RBAC-scoped | Delete a company (cascades its access groups, assets, etc). |
| DELETE | `/company/delete-access-group/:id` | Auth | Delete an RBAC role. |
| DELETE | `/company/delete-company-gateway/:id` | Auth + RBAC-scoped | Delete a gateway. |
| DELETE | `/company/delete-company-server/:id` | Auth + RBAC-scoped | Delete a server. |

## Product (`/product/*`)

Everything asset/digital-twin-related moved to `/company/assets/*` (see
above). What's left is just the local `Product` catalog (seeded via
`POST /script/create-product`) — an id↔name lookup, unrelated to that
merge.

| Method | Path | Guard | Description |
|---|---|---|---|
| GET | `/product/:id/name` | Auth | Look up a catalog `Product`'s name by id. |
| GET | `/product/by-name/:product_name/id` | Auth | Reverse lookup: catalog `Product` id by name. |

## Certificate (`/certificate/*`)

ICID-backed, Hedera-based certificate issuance/verification. **Optional**:
these routes only exist at all when `HEDERA_KEY_SECRET` is set — otherwise
they 404.

| Method | Path | Guard | Description |
|---|---|---|---|
| POST | `/certificate/create-company-certificate` | Auth | Issue a Hedera-backed certificate for a company, via ICID. |
| POST | `/certificate/verify-company-certificate` | Auth | Verify a company's certificate, via ICID. |
| GET | `/certificate/get-company-certificate/:company_ifric_id` | Auth | Fetch a company's stored certificate. |
| GET | `/certificate/reveal-private-key/:company_ifric_id` | Auth | Decrypt and reveal the certificate's private key. |
| DELETE | `/certificate/delete-private-key/:company_ifric_id` | Auth | Delete the stored private key. |

## Script (`/script*`)

One-off setup scripts for seeding reference data into a **fresh**
deployment — not a general-purpose admin API. Deliberately unguarded (no
company/user context exists yet the first time these run); don't leave
this controller reachable in a real deployment after initial setup.

| Method | Path | Guard | Description |
|---|---|---|---|
| POST | `/script` | None | Seed default access-group templates + the company-category taxonomy. |
| POST | `/script/create-product` | None | Seed example catalog products. |
