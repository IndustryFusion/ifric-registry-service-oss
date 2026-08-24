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

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AccessControlService } from '../../common/access-control.service';
import { IS_PUBLIC_KEY } from '../../common/public.decorator';
import { KeycloakService } from './keycloak.service';

/**
 * Verifies the bearer token against Keycloak's realm signing keys (JWKS,
 * cached — see KeycloakService.verifyAccessToken), Keycloak being this
 * app's sole identity provider. On success, attaches the decoded payload to
 * `request.user`.
 *
 * The realm hosts more than one client, and they issue different claim
 * sets — so the payload is normalized here, at the one point every guarded
 * request passes through, rather than at the ~30 places that consume it.
 * Everything downstream sees a single shape.
 *
 * Registered globally via APP_GUARD in app.module.ts, so it runs for every
 * route unless that route carries @Public(). Authentication is therefore
 * deny-by-default: a new handler is guarded whether or not its author
 * thought about it.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  // AccessControlService comes from @Global() AccessControlModule, the same
  // way KeycloakService comes from @Global() KeycloakModule — CertificateModule
  // uses a bare @UseGuards(AuthGuard) without importing either, so any
  // dependency added here has to be globally resolvable.
  constructor(
    private keycloakService: KeycloakService,
    private accessControlService: AccessControlService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Checked before the header is even read: a @Public() route must work
    // for a caller that has no token to send.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException();
    }

    const payload = await this.keycloakService.verifyAccessToken(token);
    request['user'] = await this.accessControlService.resolveClaims(payload);
    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
