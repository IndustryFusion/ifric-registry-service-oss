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

// The decoded Keycloak access token payload AuthGuard attaches to
// request.user. company_ifric_id/user_id are projected from Keycloak user
// attributes via a realm protocol mapper (see README.md) — optional because
// a token issued before that migration (or before the backfill script runs
// for a given user) simply won't carry them; callers must treat a missing
// value as "unauthorized", not as an implicit bypass (see
// AccessControlService).
export interface AuthTokenClaims {
  company_ifric_id?: string;
  user_id?: string;
  sub?: string;
  email?: string;
  preferred_username?: string;
  [claim: string]: unknown;
}
