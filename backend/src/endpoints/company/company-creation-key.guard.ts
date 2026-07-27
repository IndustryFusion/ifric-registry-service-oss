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
import { envConstants } from 'src/common/env.constants';

/**
 * Placeholder gate for POST /company/create-company, checked in place of a
 * Keycloak bearer token — company creation has to work before any of the
 * new company's users have Keycloak accounts, so AuthGuard doesn't apply
 * here. A single shared secret (X-API-Key header) is a deliberate stand-in
 * for a real external-API-token flow to be built later, not a general-
 * purpose auth mechanism — don't reuse this guard elsewhere.
 */
@Injectable()
export class CompanyCreationApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    if (apiKey !== envConstants.companyCreationApiKey) {
      throw new UnauthorizedException('Invalid API key');
    }
    return true;
  }
}
