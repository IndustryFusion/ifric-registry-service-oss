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

// Dummy secrets so modules that fail fast on a missing required env var
// (see common/env.constants.ts) can be imported during unit tests. Never
// used for anything real.
process.env.ICID_SERVICE_BACKEND_URL ??= 'http://test-icid.local';
process.env.HEDERA_KEY_SECRET ??= 'test-hedera-key-secret-32-bytes!';
process.env.COMPANY_DEFAULT_CODE ??= 'ifx-eur-com';
process.env.DB_HOST ??= 'localhost';
process.env.DB_NAME ??= 'ifric_registry_service_test';
process.env.KEYCLOAK_URL ??= 'http://test-keycloak.local';
process.env.KEYCLOAK_REALM ??= 'ifric';
process.env.KEYCLOAK_CLIENT_SECRET ??= 'test-keycloak-client-secret';
process.env.KEYCLOAK_ADMIN_CLIENT_SECRET ??=
  'test-keycloak-admin-client-secret';
