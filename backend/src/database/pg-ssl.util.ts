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

// Pure and side-effect-free on purpose: both env.constants.ts (used by the
// running app) and data-source.ts (used directly by the TypeORM CLI for
// migration:generate/migration:run, which must keep working with a minimal
// env) need this shape-building logic without either one depending on the
// other — data-source.ts deliberately doesn't import env.constants.ts,
// since that would pull in its Keycloak/ICID fail-fast checks into a plain
// migration run.
export interface PgSslInput {
  enabled: boolean;
  rejectUnauthorized: boolean;
  ca?: string;
}

// Builds the `ssl` option TypeORM's postgres driver forwards verbatim to
// `pg.Pool()` (`boolean | TlsOptions`, where TlsOptions is Node's own `tls`
// module type — `{ rejectUnauthorized?: boolean; ca?: string }` satisfies
// it). `false` (not `undefined`) is returned when disabled since that's
// node-postgres's own explicit way of saying "no TLS".
export function buildPgSslOption(
  input: PgSslInput,
): false | { rejectUnauthorized: boolean; ca?: string } {
  if (!input.enabled) {
    return false;
  }
  const option: { rejectUnauthorized: boolean; ca?: string } = {
    rejectUnauthorized: input.rejectUnauthorized,
  };
  if (input.ca) {
    option.ca = input.ca;
  }
  return option;
}
