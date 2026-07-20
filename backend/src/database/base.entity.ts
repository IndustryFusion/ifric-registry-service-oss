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

import { BeforeInsert, PrimaryColumn } from 'typeorm';
import { generateId } from './generate-id';

// Every table's primary key is a 24-hex-char, Mongo-ObjectId-shaped string
// (via bson-objectid, no real MongoDB involved) rather than a Postgres-
// native uuid/serial. This is deliberate: every HTTP response before this
// migration returned raw Mongoose documents whose `_id` field is exactly
// this shape, and preserving it byte-for-byte avoids any client-visible
// change. As a side effect, `_id` stays lexicographically time-ordered, so
// `ORDER BY _id DESC` continues to mean "most recently inserted first"
// exactly like it did with real Mongo ObjectIds.
//
// Note: this @BeforeInsert() hook only fires for repository.save()/
// insert() — NOT for repository.upsert(), which builds a raw
// "INSERT ... ON CONFLICT" query that bypasses entity lifecycle hooks
// entirely. Any upsert-style write must generate and supply its own _id
// explicitly (see generateId() below) rather than relying on this hook.
export abstract class BaseEntity {
  @PrimaryColumn({ type: 'char', length: 24 })
  _id: string;

  @BeforeInsert()
  assignId() {
    if (!this._id) {
      this._id = generateId();
    }
  }
}
