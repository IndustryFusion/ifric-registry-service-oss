# Keycloak first-time checklist

A realm has to be set up **once**, before the first login — nothing guarded
works until it is, and the backend fails fast at boot without the two
client secrets it produces.

On Kubernetes the Helm chart does that for you by default; the next section
explains exactly what it does and why you never handle the client secrets
yourself. Everywhere else, work through the numbered steps.

This page is the steps. For *why* each one exists, what breaks without it,
and how the resulting claims are enforced at request time, see
[`keycloak-setup.md`](keycloak-setup.md).

## On Kubernetes, the chart already does this

The Helm chart ships with `keycloak.bootstrap.enabled: true`. That runs a
`post-install`/`post-upgrade` Job which performs steps 2–6 below with
`kcadm.sh`, so a plain install needs nothing from this page:

```bash
helm install my-registry charts/ifric-registry-service \
  --set image.repository=<registry>/ifric-registry-service \
  --set image.tag=<tag>
```

**You never create or copy the client secrets.** This is the part that
catches people out, because it runs backwards from the manual path:

| | Manual (steps below) | Bootstrap Job |
|---|---|---|
| Who invents the secret | Keycloak, when the client is created | the chart |
| How the other side learns it | you copy it into `.env` / `--set` | the Job pushes it onto the Keycloak client |

In order, on `helm install`:

1. **The release Secret is rendered.** For each client secret the chart
   uses the value from `values.yaml` if you set one, otherwise reads back
   the value already in the live Secret (this is what keeps upgrades
   stable), otherwise generates a random 32-character one.
2. **The backend Deployment starts** and reads that Secret.
3. **The bootstrap Job runs.** It's a post-install *hook*, so the Secret is
   guaranteed to exist by then. It reads the **same** Secret via `envFrom`
   and creates each client with `-s secret="${KEYCLOAK_CLIENT_SECRET}"`.

Both sides therefore hold the same string by construction, and there is
nothing to copy. Where a client already exists, the Job re-asserts the
secret with `kc update` instead — so a drifted or hand-regenerated value
converges back on the next `helm upgrade`.

Four things worth knowing:

- **The backend logs Keycloak errors between steps 2 and 3.** Expected —
  the clients don't exist yet. It recovers on its own once the Job
  finishes; no restart needed.
- **`helm template` and `--dry-run` don't show the real secrets.** The
  lookup of the live Secret returns nothing outside a real cluster, so both
  always render freshly generated values.
- **`secrets.existingSecret` opts out of the generation entirely.** Put
  `KEYCLOAK_CLIENT_SECRET` and `KEYCLOAK_ADMIN_CLIENT_SECRET` in your own
  Secret — any values you like, since the Job pushes them onto the clients.
- **Setting them in values works too.** The Job then pushes your chosen
  values rather than generated ones.

Set `keycloak.bootstrap.enabled=false` when the Keycloak belongs to another
team, and do the manual steps below instead. The chart then deliberately
does **not** generate the two secrets: only whoever configured those
clients knows them, and inventing a value here would write one Keycloak has
never heard of — turning a clear "fails fast at boot" into logins that fail
at runtime for no visible reason.

Full chart reference:
[`charts/ifric-registry-service/README.md`](../charts/ifric-registry-service/README.md#keycloak).

---

Everything below is the **manual** path — Docker Compose, an external
Keycloak, or bootstrap off. Click paths are Keycloak 26. Substitute your
own realm name for `ifric` if you use a different one — it has to match
`KEYCLOAK_REALM`.

## 1. Open the admin console

| Where | How |
|---|---|
| Docker Compose | `http://localhost:8080`, log in as `admin` / `admin` (dev-only) |
| Helm, bundled Keycloak | `kubectl get secret <release>-ifric-registry-service-secret -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' \| base64 -d`, then `kubectl port-forward svc/<release>-ifric-registry-service-keycloak 8080:8080` |

## 2. Create the realm

Realm dropdown (top-left) → **Create realm** → Realm name `ifric` →
**Create**.

## 3. Change one realm default

It is easy to miss, and the setup looks correct without it.

1. **Realm settings** → **General** tab → **Unmanaged attributes**:
   `Enabled` → **Save**.

Nothing else needs changing. In particular, leave **Authentication** →
**Required actions** → **Verify Profile** alone: this app now gives every
user it creates both a first and a last name, so the action no longer
blocks logins. (Older releases set only `firstName`, and this step used to
say to turn it off — see [Already have users?](#already-have-users) if your
realm predates that.)

## 4. Create the `ifric` client (end-user login)

**Clients** → **Create client**:

| Page | Setting | Value |
|---|---|---|
| General settings | Client type | `OpenID Connect` |
| | Client ID | `ifric` |
| Capability config | Client authentication | **On** (this makes it confidential) |
| | Standard flow | checked |
| | Direct access grants | **checked** — required |
| | Service accounts roles | unchecked |

**Next** → **Save**.

Copy the secret from the **Credentials** tab — that's
`KEYCLOAK_CLIENT_SECRET`.

## 5. Add two protocol mappers to `ifric`

**Clients** → `ifric` → **Client scopes** tab → **`ifric-dedicated`** →
**Add mapper** → **By configuration** → **User Attribute**.

Do this twice, once per row:

| Name | User Attribute | Token Claim Name | Claim JSON Type | Add to access token |
|---|---|---|---|---|
| `company_ifric_id` | `company_ifric_id` | `company_ifric_id` | `String` | **On** |
| `user_id` | `user_id` | `user_id` | `String` | **On** |

## 6. Create the `ifric-admin` client (Admin API)

**Clients** → **Create client**:

| Page | Setting | Value |
|---|---|---|
| General settings | Client ID | `ifric-admin` |
| Capability config | Client authentication | **On** |
| | Standard flow | **unchecked** |
| | Direct access grants | **unchecked** |
| | Service accounts roles | **checked** — required |

**Next** → **Save**.

Then grant it the role it needs: **Clients** → `ifric-admin` → **Service
accounts roles** tab → **Assign role** → switch the filter to **Filter by
clients** → search `manage-users` → select **`realm-management`
`manage-users`** → **Assign**.

Copy the secret from its **Credentials** tab — that's
`KEYCLOAK_ADMIN_CLIENT_SECRET`.

## 7. Give the backend both secrets

**Docker Compose** — in `backend/.env`, then restart:

```dotenv
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=ifric
KEYCLOAK_CLIENT_SECRET=<step 4 secret>
KEYCLOAK_ADMIN_CLIENT_SECRET=<step 6 secret>
```

`KEYCLOAK_CLIENT_ID`/`KEYCLOAK_ADMIN_CLIENT_ID` default to
`ifric`/`ifric-admin` — set them only if you named the clients differently.

**Helm** (bootstrap off / external Keycloak):

```bash
helm upgrade <release> charts/ifric-registry-service \
  --reuse-values \
  --set secrets.keycloakClientSecret=<step 4 secret> \
  --set secrets.keycloakAdminClientSecret=<step 6 secret>
```

## 8. Verify

**The `ifric-admin` client and its role** — this should return an
`access_token`:

```bash
curl -s -X POST "http://localhost:8080/realms/ifric/protocol/openid-connect/token" \
  -d grant_type=client_credentials \
  -d client_id=ifric-admin \
  -d client_secret=<step 6 secret>
```

**Steps 3 and 5, end to end** — the only way to catch a dropped attribute
or a mapper that projects nothing. Create a company (which provisions an
admin user), log in as that user, and check the token carries both claims:

```bash
TOKEN=$(curl -s -X POST http://localhost:4007/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"<admin email>","password":"<password>"}' | jq -r .access_token)

echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{company_ifric_id, user_id}'
```

Both fields must be present. If they're `null`, step 3.1 or step 5 didn't
take — every company-scoped endpoint will return 403 on a token that
otherwise looks valid.

## Already have users?

Accounts created before the mappers existed have no attributes to project,
and accounts created before this app started setting `lastName` have no
surname — which the `Verify Profile` required action rejects with `Account
is not fully set up` (the login then fails with `invalid_grant`). One run
fixes both. Do it from `backend/`, then have those users log in again:

```bash
npm run backfill:keycloak-attributes
```

If you turned `Verify Profile` off on an older release, you can turn it back
on once this has run.

## Not your job

The dataspace's `data-space` client lives in this same realm but is owned
by that team — don't create or manage it here. See
[`keycloak-setup.md`](keycloak-setup.md#dataspace-participants-the-data-space-client).

## 9. Realm SMTP — required for password recovery

`POST /auth/recover-password-request` doesn't send mail itself and never
returns a credential: it asks Keycloak to email the account holder a
one-time `UPDATE_PASSWORD` action link
(`KeycloakService.sendPasswordResetEmail`). With no realm SMTP, Keycloak
can't send that mail and the endpoint returns an error — deliberately, it
fails closed rather than fall back to handing a password to whoever asked.
Everything else works without this step.

The Helm bootstrap Job does **not** configure SMTP (steps 2–6 only) — it's
manual everywhere, since the mail credentials are yours.

**Realm settings** → **Email** tab → fill in **From**, **Host**, **Port**,
and, if your relay needs them, **Authentication** / username / password →
**Test connection** → **Save**.

One catch: Keycloak sends to the address on the *user*, so a user with no
`email` set never receives anything. Users this service provisions always
have one (`KeycloakService.createUser` sets `email` and `username` to the
same address), so this only bites identities created by hand.

Verify end to end — this should answer with a fixed acknowledgement and no
password, and land a mail in the account's inbox:

```bash
curl -s -X POST http://localhost:4007/auth/recover-password-request \
  -H 'Content-Type: application/json' \
  -d '{"email":"<a real user email>"}'
# {"success":true,"status":200,"message":"If that email address belongs to
#  an account, a password recovery email has been sent to it"}
```

The same response comes back for an address with no account (by design —
otherwise the endpoint would tell anyone who asks which addresses are
registered), and a second call for either inside a minute returns `429`.
