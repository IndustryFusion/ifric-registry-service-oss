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

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route out of the global AuthGuard registered in app.module.ts.
 *
 * Authentication is deny-by-default: a handler with no decorators at all is
 * guarded. This marker is the only way to open one up, which makes
 * `grep -rn "@Public()" src/` the complete unauthenticated surface of the
 * service. Before this existed a route was public by *omitting*
 * `@UseGuards(AuthGuard)`, so forgetting the decorator silently exposed the
 * handler and nothing anywhere recorded that it had happened.
 *
 * Use it only for routes that genuinely cannot carry a bearer token — the
 * login/token endpoints that mint one, the pre-login password-recovery
 * flow, and callers authenticated by some other means (create-company,
 * which keeps its own CompanyCreationApiKeyGuard).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
