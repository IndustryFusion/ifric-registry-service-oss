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

import ObjectId from 'bson-objectid';

// Shared by BaseEntity's @BeforeInsert() hook (for normal save()/create()
// writes) and by any raw-SQL "INSERT ... ON CONFLICT" upsert (which bypasses
// entity lifecycle hooks entirely, so needs an _id supplied explicitly on
// the insert branch — see the upsert helpers in auth.service.ts/
// product.service.ts for why TypeORM's own repository.upsert() can't be
// used here: it never fires @BeforeInsert, so newly-inserted rows would get
// a NULL primary key).
export function generateId(): string {
  return new ObjectId().toHexString();
}
