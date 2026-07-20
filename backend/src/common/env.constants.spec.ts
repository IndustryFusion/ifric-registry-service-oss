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

// This file re-requires env.constants.ts fresh (via jest.resetModules()) to
// exercise its module-load-time env var checks under different process.env
// values in the same test run — that needs require(), not a static import.
/* eslint-disable @typescript-eslint/no-var-requires */
describe('envConstants.certificatesEnabled', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('is true when HEDERA_KEY_SECRET is set', () => {
    process.env.HEDERA_KEY_SECRET = 'some-secret';
    const { envConstants } = require('./env.constants');
    expect(envConstants.certificatesEnabled).toBe(true);
  });

  it('is false when HEDERA_KEY_SECRET is unset', () => {
    delete process.env.HEDERA_KEY_SECRET;
    const { envConstants } = require('./env.constants');
    expect(envConstants.certificatesEnabled).toBe(false);
  });

  it('still requires ICID_SERVICE_BACKEND_URL regardless of certificates', () => {
    delete process.env.ICID_SERVICE_BACKEND_URL;
    expect(() => require('./env.constants')).toThrow(
      'ICID_SERVICE_BACKEND_URL environment variable is required',
    );
  });

  it('never fails fast on a missing HEDERA_KEY_SECRET', () => {
    delete process.env.HEDERA_KEY_SECRET;
    expect(() => require('./env.constants')).not.toThrow();
  });

  it('requires DB_HOST', () => {
    delete process.env.DB_HOST;
    expect(() => require('./env.constants')).toThrow(
      'DB_HOST environment variable is required',
    );
  });

  it('requires DB_NAME', () => {
    delete process.env.DB_NAME;
    expect(() => require('./env.constants')).toThrow(
      'DB_NAME environment variable is required',
    );
  });

  it('defaults dbPort to 5432 and dbUser/dbPassword to ifric when unset', () => {
    delete process.env.DB_PORT;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    const { envConstants } = require('./env.constants');
    expect(envConstants.dbPort).toBe(5432);
    expect(envConstants.dbUser).toBe('ifric');
    expect(envConstants.dbPassword).toBe('ifric');
  });

  it('requires KEYCLOAK_URL', () => {
    delete process.env.KEYCLOAK_URL;
    expect(() => require('./env.constants')).toThrow(
      'KEYCLOAK_URL environment variable is required',
    );
  });

  it('requires KEYCLOAK_REALM', () => {
    delete process.env.KEYCLOAK_REALM;
    expect(() => require('./env.constants')).toThrow(
      'KEYCLOAK_REALM environment variable is required',
    );
  });

  it('requires KEYCLOAK_CLIENT_SECRET', () => {
    delete process.env.KEYCLOAK_CLIENT_SECRET;
    expect(() => require('./env.constants')).toThrow(
      'KEYCLOAK_CLIENT_SECRET environment variable is required',
    );
  });

  it('requires KEYCLOAK_ADMIN_CLIENT_SECRET', () => {
    delete process.env.KEYCLOAK_ADMIN_CLIENT_SECRET;
    expect(() => require('./env.constants')).toThrow(
      'KEYCLOAK_ADMIN_CLIENT_SECRET environment variable is required',
    );
  });

  it('defaults keycloak.clientId/adminClientId to ifric/ifric-admin when unset', () => {
    delete process.env.KEYCLOAK_CLIENT_ID;
    delete process.env.KEYCLOAK_ADMIN_CLIENT_ID;
    const { envConstants } = require('./env.constants');
    expect(envConstants.keycloak.clientId).toBe('ifric');
    expect(envConstants.keycloak.adminClientId).toBe('ifric-admin');
  });

  it('uses explicit KEYCLOAK_CLIENT_ID/KEYCLOAK_ADMIN_CLIENT_ID when set', () => {
    process.env.KEYCLOAK_CLIENT_ID = 'custom-client';
    process.env.KEYCLOAK_ADMIN_CLIENT_ID = 'custom-admin-client';
    const { envConstants } = require('./env.constants');
    expect(envConstants.keycloak.clientId).toBe('custom-client');
    expect(envConstants.keycloak.adminClientId).toBe('custom-admin-client');
  });
});
