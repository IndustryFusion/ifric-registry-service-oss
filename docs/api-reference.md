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
noted otherwise. See the root README's
[Keycloak Authentication](../README.md#keycloak-authentication) section for
what the token needs to carry, and "RBAC-scoped" for endpoints that
additionally check the token's own `company_ifric_id`/`user_id` against the
request (see `AccessControlService`).

## Auth (`/auth/*`)

Login, sessions, credential/user-lifecycle management via Keycloak — no
company/product data of its own.

| Method | Path | Guard | Description |
|---|---|---|---|
| POST | `/auth/create-user/:admin_mail` | Auth + RBAC-scoped | Create an additional user for a company: provisions a Keycloak identity and per-product access grants. |
| POST | `/auth/login` | Public | Log in via Keycloak (ROPC), then resolve company/access-group data. Returns `access_token`/`refresh_token`. |
| POST | `/auth/get-indexed-db-data` | Auth | Re-resolve a user's company/role/access-group data without a fresh login. |
| GET | `/auth/authenticate-token/:token` | Public | Verify a bearer token against Keycloak. |
| GET | `/auth/get-company-users/:id` | Auth | List all users of a company. |
| GET | `/auth/get-company-users-access/:company_ifric_id` | Auth | List a company's users with their access-group roles. |
| GET | `/auth/get-user-profile-content/:company_ifric_id/:user_id` | Auth | Per-product role list for a user's profile page. |
| GET | `/auth/get-user-product-access/:id` | Auth | Raw access-group grants for a user. |
| GET | `/auth/get-user-details` | Auth | Look up a user by `user_email` + `company_ifric_id` (query params). |
| GET | `/auth/get-total-users` | Auth | Count of all users. |
| GET | `/auth/get-user-details/:id` | Auth | Look up a user by its id. |
| GET | `/auth/get-user-details-by-email/:email` | Auth | Look up a user by email. |
| GET | `/auth/get-user-details-by-email-recover-password/:email` | Public | Same lookup, public — used by the forgot-password flow before login. |
| GET | `/auth/get-user-specific-product-access` | Auth | A user's access-group role for one product (query params). |
| GET | `/auth/check-company-admin/:email` | Auth | Whether an email belongs to a company's admin contact. |
| PATCH | `/auth/update-password` | Public | Change password — verifies the old one against Keycloak first. |
| PATCH | `/auth/update-user-access-group/:id` | Auth | Upsert a user's access-group role per product. |
| PATCH | `/auth/update-company-user` | Auth | Update a user's name/email/image, optionally password. |
| DELETE | `/auth/delete-company-user/:id` | Auth | Delete a user (Keycloak identity + local rows). |
| POST | `/auth/logout` | Public | Best-effort revoke the Keycloak session (pass `refresh_token`). |
| POST | `/auth/refresh` | Public | Exchange a refresh token for a new access/refresh token pair. |
| POST | `/auth/recover-password-request` | Public | Generate a new temporary password. |
| POST | `/auth/recover-password` | Public | Set a new password using a temporary one. |

## Company (`/company/*`)

Company CRUD, access groups (RBAC roles), physical assets, and factories.

| Method | Path | Guard | Description |
|---|---|---|---|
| GET | `/company/factories` | Auth | List factories, optionally filtered by owner company. |
| GET | `/company/factories/:id` | Auth | Look up one factory by `factory_id`. |
| GET | `/company/factories/:id/owner` | Auth | Resolve a factory's owner company. |
| GET | `/company/factories/:id/products` | Auth + RBAC-scoped | Asset URNs (via digital twins) located at a factory. |
| POST | `/company/factories` | Auth + RBAC-scoped | Create a factory tagged to an owner company. |
| PATCH | `/company/factories/:id` | Auth + RBAC-scoped | Update a factory's location details. |
| DELETE | `/company/factories/:id` | Auth + RBAC-scoped | Delete a factory — `409` if a digital twin still references it. |
| POST | `/company/company-asset` | Auth | Tag a physical asset/gateway/server to a company (`type` discriminator). |
| POST | `/company/create-access-group/:id` | Auth | Create a custom RBAC role for a company. |
| POST | `/company/create-company` | `X-API-Key` (`COMPANY_CREATION_API_KEY`), not a Keycloak token | Create a company: mints `company_ifric_id` via ICID, provisions a default admin user + RBAC roles, all in one transaction. |
| POST | `/company/add-status-detail` | Public | Mark a company's verification status. |
| GET | `/company/get-company-assets/:id` | Auth | List a company's physical assets/gateways/servers. |
| GET | `/company/get-company-assets-by-asset/:assetId` | Auth | Look up assets by `asset_ifric_id`. |
| GET | `/company/get-company-asset-by-assetid/:asset_ifric_id` | Auth | Single asset lookup by `asset_ifric_id`. |
| GET | `/company/get-company-access-group/:id` | Auth | List a company's RBAC roles. |
| GET | `/company/get-access-group-by-group-name/:company_id/:group_name` | Auth | Look up one RBAC role by name. |
| GET | `/company/get-access-group/:id` | Auth | Look up one RBAC role by id. |
| GET | `/company/get-category-specific-company/:categoryName` | Auth | Companies in one category (e.g. `manufacturer`). |
| GET | `/company/get-company-details/:id` | Auth + RBAC-scoped | Look up a company by `company_ifric_id`. |
| GET | `/company/get-company-details-id/:id` | Auth | Look up a company by its internal id. |
| GET | `/company/get-company-contact-details/:company_ifric_id` | Auth | A company's contact/admin details. |
| GET | `/company/companies/check` | Public | Check whether a company name/registration number is already taken. |
| GET | `/company/get-company-details-by-email/:email` | Public | Look up a company by its admin email. |
| GET | `/company/get-company-details-by-name/:company_name` | Auth | Look up a company by name. |
| GET | `/company/get-company-and-user-details/:company_ifric_id` | Auth + RBAC-scoped | Combined company + users + roles view. |
| GET | `/company/get-all-companies` | Auth | List every company (with certificate-verification annotation if enabled). |
| GET | `/company/get-all-owner-companies/:company_ifric_id` | Auth | Distinct owner companies across a manufacturer's twins. |
| GET | `/company/get-company-category/:company_ifric_id` | Auth | A company's category (e.g. manufacturer, factory owner). |
| GET | `/company/get-categories` | Auth | The fixed list of company categories. |
| GET | `/company/get-manufacturer-companies/:count` | Auth | Paged list of manufacturer companies. |
| GET | `/company/get-searched-manufacturer-companies/:searched_text` | Auth | Search manufacturer companies by name. |
| GET | `/company/get-manufacturer-owner-companies` | Auth | Companies that are both a manufacturer and an owner somewhere. |
| PATCH | `/company/update-company/:id` | Auth | Update company details. |
| PATCH | `/company/update-access-group/:id` | Auth | Update an RBAC role's CRUD flags. |
| DELETE | `/company/delete-company/:id` | Auth | Delete a company (cascades its access groups, etc). |
| DELETE | `/company/delete-access-group/:id` | Auth | Delete an RBAC role. |
| DELETE | `/company/delete-company-asset/:id` | Auth | Delete one physical asset. |
| DELETE | `/company/delete-bulk-company-assets` | Auth | Bulk-delete physical assets. |
| DELETE | `/company/delete-company-gateway/:id` | Auth | Delete a gateway. |
| DELETE | `/company/delete-company-server/:id` | Auth | Delete a server. |

## Product (`/product/*`)

External product tagging and digital twins (asset ↔ manufacturer ↔ owner ↔
optional factory).

| Method | Path | Guard | Description |
|---|---|---|---|
| GET | `/product/:id` | Auth | Resolve a product/asset URN to its manufacturer company. |
| GET | `/product/:id/owner` | Auth | Resolve a product/asset URN to its owner company. |
| GET | `/product/:id/factory-location` | Auth + RBAC-scoped | Resolve a product/asset URN to its factory. |
| POST | `/product/company-product` | Auth + RBAC-scoped | Tag an externally-catalogued product to a company. |
| GET | `/product/company/:id` | Auth | List a company's tagged products. |
| GET | `/product/:id/name` | Auth | Look up a catalog `Product`'s name by id (seeded via `/script/create-product`). |
| GET | `/product/by-name/:product_name/id` | Auth | Reverse lookup: catalog `Product` id by name. |
| PATCH | `/product/company-product/:id` | Auth | Upsert a company-product tag. |
| DELETE | `/product/company-product/:id` | Auth | Remove a company-product tag. |
| POST | `/product/twin` | Auth | Create a digital twin (asset URN + manufacturer + owner + optional factory). |
| GET | `/product/twin/:id` | Auth | Look up a twin by id. |
| GET | `/product/twin/by-asset/:asset_ifric_id` | Auth | Look up a twin by asset URN. |
| POST | `/product/twin/count` | Auth | Count twins matching a filter (request body). |
| GET | `/product/twin/count/:company_ifric_id` | Auth | Count twins for a company. |
| PATCH | `/product/twin` | Auth | Update/upsert a twin's owner company or factory. |
| DELETE | `/product/twin/bulk` | Auth | Bulk-delete twins. |
| DELETE | `/product/twin/:id` | Auth | Delete one twin. |
| GET | `/product/manufacturer-assets/:id` | Auth | Assets/twins where a company is the manufacturer. |
| GET | `/product/manufacturer-owner-assets/:manufacturer_company_ifric_id/:owner_company_ifric_id` | Auth | Twins shared between one specific manufacturer + owner pair. |
| GET | `/product/owner-assets/:id` | Auth | Assets/twins where a company is the owner. |

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
