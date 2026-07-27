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

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthTokenClaims } from './auth-token-claims.interface';

// Reads the verified token payload AuthGuard already attached to
// request.user — only valid on routes guarded by AuthGuard.
export const AuthUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthTokenClaims => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
