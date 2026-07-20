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
import { AuthGuard } from './auth.guard';
import { KeycloakService } from './keycloak.service';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let keycloakService: { verifyAccessToken: jest.Mock };

  beforeEach(() => {
    keycloakService = { verifyAccessToken: jest.fn() };
    guard = new AuthGuard(keycloakService as unknown as KeycloakService);
  });

  function contextWithAuthHeader(header?: string): ExecutionContext {
    const request: any = { headers: header ? { authorization: header } : {} };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;
  }

  it('rejects when no Authorization header is present', async () => {
    await expect(guard.canActivate(contextWithAuthHeader())).rejects.toThrow(
      UnauthorizedException,
    );
    expect(keycloakService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects when Keycloak rejects the token', async () => {
    keycloakService.verifyAccessToken.mockRejectedValue(
      new UnauthorizedException(),
    );

    await expect(
      guard.canActivate(contextWithAuthHeader('Bearer bad-token')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a valid Keycloak access token and attaches the payload to the request', async () => {
    const payload = {
      sub: 'kc-user-1',
      preferred_username: 'user@example.com',
    };
    keycloakService.verifyAccessToken.mockResolvedValue(payload);
    const request: any = { headers: { authorization: 'Bearer a-valid-token' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(keycloakService.verifyAccessToken).toHaveBeenCalledWith(
      'a-valid-token',
    );
    expect(request.user).toEqual(payload);
  });
});
