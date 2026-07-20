//
// Copyright (c) 2026 IndustryFusion Europe UG
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

if (!process.env.ICID_SERVICE_BACKEND_URL) {
  throw new Error('ICID_SERVICE_BACKEND_URL environment variable is required');
}
if (!process.env.COMPANY_DEFAULT_CODE) {
  throw new Error('COMPANY_DEFAULT_CODE environment variable is required');
}
if (!process.env.DB_HOST) {
  throw new Error('DB_HOST environment variable is required');
}
if (!process.env.DB_NAME) {
  throw new Error('DB_NAME environment variable is required');
}

// Keycloak is this app's sole identity provider — there is no built-in
// auth of its own (see KeycloakService). "ifric" (KEYCLOAK_CLIENT_ID)
// authenticates end users via the Resource Owner Password Credentials
// grant; "ifric-admin" (KEYCLOAK_ADMIN_CLIENT_ID) is a separate,
// service-account-enabled client used only for Admin API calls
// (create/reset-password/delete users) — kept separate from "ifric" so a
// leaked end-user-facing client secret doesn't also grant realm-wide user
// management. Both clients must already exist in the target realm — this
// app does not provision them (one-time manual setup, see README.md).
if (!process.env.KEYCLOAK_URL) {
  throw new Error('KEYCLOAK_URL environment variable is required');
}
if (!process.env.KEYCLOAK_REALM) {
  throw new Error('KEYCLOAK_REALM environment variable is required');
}
if (!process.env.KEYCLOAK_CLIENT_SECRET) {
  throw new Error('KEYCLOAK_CLIENT_SECRET environment variable is required');
}
if (!process.env.KEYCLOAK_ADMIN_CLIENT_SECRET) {
  throw new Error(
    'KEYCLOAK_ADMIN_CLIENT_SECRET environment variable is required',
  );
}

// HEDERA_KEY_SECRET is optional — it's only used by the certificate
// feature (encrypting/decrypting the private key ICID returns). Its
// presence is what turns certificates on: see CertificateModule and
// CompanyService.getAllCompanies.
export const envConstants = {
  icidServiceBackendUrl: process.env.ICID_SERVICE_BACKEND_URL,
  hederaKeySecret: process.env.HEDERA_KEY_SECRET,
  companyDefaultCode: process.env.COMPANY_DEFAULT_CODE,
  certificatesEnabled: !!process.env.HEDERA_KEY_SECRET,
  dbHost: process.env.DB_HOST,
  dbPort: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  dbUser: process.env.DB_USER || 'ifric',
  dbPassword: process.env.DB_PASSWORD || 'ifric',
  dbName: process.env.DB_NAME,
  keycloak: {
    url: process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM,
    clientId: process.env.KEYCLOAK_CLIENT_ID || 'ifric',
    clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
    adminClientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'ifric-admin',
    adminClientSecret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET,
  },
};
