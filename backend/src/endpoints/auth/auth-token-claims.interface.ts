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
// attributes via a realm protocol mapper (see docs/keycloak-setup.md) —
// optional because
// a token issued before that migration (or before the backfill script runs
// for a given user) simply won't carry them; callers must treat a missing
// value as "unauthorized", not as an implicit bypass (see
// AccessControlService).
export interface AuthTokenClaims {
  company_ifric_id?: string;
  user_id?: string;
  // Projected by the separate "data-space" client's own mapper, not ours.
  // For a company onboarded into the dataspace from IFRIC, this is a
  // verbatim copy of its company_ifric_id — see
  // AccessControlService.resolveClaims. Participants that originated
  // outside IFRIC carry an id from the dataspace's own registry, which
  // matches no company here.
  participant_id?: string;
  sub?: string;
  email?: string;
  preferred_username?: string;
  [claim: string]: unknown;
}

// Not a Keycloak claim: set only by AccessControlService.resolveClaims once
// a participant_id has actually been matched against a Company row, and
// stripped from incoming payloads before that check so it can never be
// asserted by a token. Kept out of AuthTokenClaims' named fields so no
// caller mistakes it for something the identity provider vouched for.
export const PARTICIPANT_VERIFIED = 'participant_verified';
