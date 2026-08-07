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

import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../database/base.entity';

// Merges what used to be two unrelated tables (CompanyAsset — a bare
// company_id + asset_ifric_id tag — and CompanyTwin — manufacturer +
// owner + optional factory) into one lifecycle: a row starts physical-only
// (company_id set, is_twin false), then gains owner_company_id (and
// optionally factory_id) once it's tagged to an owner, flipping is_twin to
// true. Same row throughout, not two records.
@Entity('assets')
@Unique(['company_id', 'asset_ifric_id'])
export class Asset extends BaseEntity {
  @Column({ type: 'varchar', nullable: true })
  asset_ifric_id: string;

  // The registering/manufacturer company — always set, from creation.
  @Column({ type: 'char', length: 24, nullable: true })
  company_id: string;

  // Nullable — set once this asset is tagged to an owner company,
  // which is what "twins" it. References Factory.factory_id (a business
  // key), not Factory._id — no FK constraint, matching the rest of this
  // codebase's URN-keyed cross-references.
  @Column({ type: 'char', length: 24, nullable: true })
  owner_company_id: string;

  @Column({ type: 'varchar', nullable: true })
  factory_id: string;

  @Column({ type: 'boolean', default: false })
  is_twin: boolean;
}
