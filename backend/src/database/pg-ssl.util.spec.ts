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

import { buildPgSslOption } from './pg-ssl.util';

describe('buildPgSslOption', () => {
  it('returns false when disabled, regardless of other inputs', () => {
    expect(
      buildPgSslOption({ enabled: false, rejectUnauthorized: true, ca: 'x' }),
    ).toBe(false);
  });

  it('returns rejectUnauthorized:true and no ca by default when enabled', () => {
    expect(
      buildPgSslOption({ enabled: true, rejectUnauthorized: true }),
    ).toEqual({ rejectUnauthorized: true });
  });

  it('honors rejectUnauthorized:false', () => {
    expect(
      buildPgSslOption({ enabled: true, rejectUnauthorized: false }),
    ).toEqual({ rejectUnauthorized: false });
  });

  it('includes ca only when provided', () => {
    expect(
      buildPgSslOption({
        enabled: true,
        rejectUnauthorized: true,
        ca: '-----BEGIN CERTIFICATE-----...',
      }),
    ).toEqual({
      rejectUnauthorized: true,
      ca: '-----BEGIN CERTIFICATE-----...',
    });
  });
});
