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

import { Global, Module } from '@nestjs/common';
import { KeycloakService } from './keycloak.service';

// @Global() so AuthGuard's dependency on KeycloakService resolves even for
// controllers that use @UseGuards(AuthGuard) without importing AuthModule
// (e.g. CertificateModule) — mirrors how JwtModule.register({global: true})
// made the same shortcut work before this feature existed.
@Global()
@Module({
  providers: [KeycloakService],
  exports: [KeycloakService],
})
export class KeycloakModule {}
