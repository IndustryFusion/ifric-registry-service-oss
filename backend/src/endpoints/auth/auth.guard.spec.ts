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
import { Reflector } from '@nestjs/core';
import { AccessControlService } from '../../common/access-control.service';
import { AuthGuard } from './auth.guard';
import { KeycloakService } from './keycloak.service';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let keycloakService: { verifyAccessToken: jest.Mock };
  let accessControlService: { resolveClaims: jest.Mock };
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    keycloakService = { verifyAccessToken: jest.fn() };
    // Default to a pass-through so the pre-existing cases below still
    // assert what they always did; the participant case overrides it.
    accessControlService = {
      resolveClaims: jest.fn(async (claims) => claims),
    };
    // Not @Public() by default, so the pre-existing cases below still
    // exercise the full verification path.
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    guard = new AuthGuard(
      keycloakService as unknown as KeycloakService,
      accessControlService as unknown as AccessControlService,
      reflector as unknown as Reflector,
    );
  });

  function contextWithAuthHeader(header?: string): ExecutionContext {
    const request: any = { headers: header ? { authorization: header } : {} };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
  }

  // The guard is registered globally (APP_GUARD), so @Public() is the only
  // way a route opts out — and it has to work for a caller carrying no
  // token at all, which means it must be checked before the header is read.
  it('allows a @Public() route through without any token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(contextWithAuthHeader())).resolves.toBe(
      true,
    );
    expect(keycloakService.verifyAccessToken).not.toHaveBeenCalled();
    expect(accessControlService.resolveClaims).not.toHaveBeenCalled();
  });

  it('still verifies a @Public() route is not assumed for unmarked routes', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    await expect(guard.canActivate(contextWithAuthHeader())).rejects.toThrow(
      UnauthorizedException,
    );
  });

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
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(keycloakService.verifyAccessToken).toHaveBeenCalledWith(
      'a-valid-token',
    );
    expect(request.user).toEqual(payload);
  });

  it('attaches the resolved claims, not the raw payload, so a dataspace token arrives normalized', async () => {
    const payload = { sub: 'kc-user-1', participant_id: 'urn:ifric:company-a' };
    const resolved = {
      ...payload,
      company_ifric_id: 'urn:ifric:company-a',
      participant_verified: true,
    };
    keycloakService.verifyAccessToken.mockResolvedValue(payload);
    accessControlService.resolveClaims.mockResolvedValue(resolved);
    const request: any = { headers: { authorization: 'Bearer a-valid-token' } };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(accessControlService.resolveClaims).toHaveBeenCalledWith(payload);
    expect(request.user).toEqual(resolved);
  });
});
