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
});
