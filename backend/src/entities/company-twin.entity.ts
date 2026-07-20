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

// Composite UNIQUE is required, not optional — it's the ON CONFLICT target
// for the upsert in ProductService.updateCompanyTwin (findOneAndUpdate with
// upsert:true in the Mongoose version, keyed on this same pair).
@Entity('company_twins')
@Unique(['manufacturer_company_id', 'asset_ifric_id'])
export class CompanyTwin extends BaseEntity {
  @Column({ type: 'char', length: 24, nullable: true })
  manufacturer_company_id: string;

  @Column({ type: 'char', length: 24, nullable: true })
  owner_company_id: string;

  @Column({ type: 'varchar', nullable: true })
  asset_ifric_id: string;

  // References Factory.factory_id (a business key), not Factory._id — no
  // FK constraint, same as the Mongo schema this replaces.
  @Column({ type: 'varchar', nullable: true })
  factory_id: string;
}
