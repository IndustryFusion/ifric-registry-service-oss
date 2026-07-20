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

// Mongoose documents always serialized with a `__v` version-key field
// (every schema in this repo used the default, unconfigured behavior).
// Postgres has no equivalent, so response call sites that used to return
// raw Mongoose docs re-add it here to keep JSON output unchanged. Do NOT
// apply this to responses built from `$project`-style reshaping that
// already excluded `_id`/`__v` (e.g. getCompanyContactDetails) — only to
// call sites that previously returned full documents.
export function withVersion<T extends Record<string, any>>(
  doc: T,
): T & { __v: number };
export function withVersion<T extends Record<string, any>>(
  docs: T[],
): (T & { __v: number })[];
export function withVersion<T extends Record<string, any>>(
  input: T | T[],
): (T & { __v: number }) | (T & { __v: number })[] {
  if (Array.isArray(input)) {
    return input.map((doc) => ({ ...doc, __v: 0 }));
  }
  return { ...input, __v: 0 };
}
