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

import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { envConstants } from 'src/common/env.constants';
import { CompanyCreationApiKeyGuard } from './company-creation-key.guard';

describe('CompanyCreationApiKeyGuard', () => {
  let guard: CompanyCreationApiKeyGuard;

  beforeEach(() => {
    guard = new CompanyCreationApiKeyGuard();
  });

  function contextWithApiKeyHeader(apiKey?: string): ExecutionContext {
    const request: any = {
      headers: apiKey ? { 'x-api-key': apiKey } : {},
    };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;
  }

  it('allows the request when the header matches COMPANY_CREATION_API_KEY', () => {
    expect(
      guard.canActivate(
        contextWithApiKeyHeader(envConstants.companyCreationApiKey),
      ),
    ).toBe(true);
  });

  it('rejects when the header is missing', () => {
    expect(() => guard.canActivate(contextWithApiKeyHeader())).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects when the header does not match', () => {
    expect(() =>
      guard.canActivate(contextWithApiKeyHeader('wrong-key')),
    ).toThrow(UnauthorizedException);
  });
});
