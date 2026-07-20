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
// for the upsert in ProductService.updateCompanyProduct (findOneAndUpdate
// with upsert:true in the Mongoose version, keyed on this same pair).
@Entity('company_products')
@Unique(['company_id', 'product_ifric_id'])
export class CompanyProduct extends BaseEntity {
  // External product identifier — the product itself is catalogued in
  // another system; this only stores the tag. Mirrors CompanyTwin.asset_ifric_id.
  @Column({ type: 'varchar', nullable: true })
  product_ifric_id: string;

  @Column({ type: 'char', length: 24, nullable: true })
  company_id: string;

  @Column({ type: 'varchar', nullable: true })
  billing_id: string;
}
