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
// for the upsert in AuthService.updateUserAccessGroup (findOneAndUpdate
// with upsert:true in the Mongoose version, keyed on this same pair).
@Entity('user_product_access_groups')
@Unique(['user_id', 'product_ifric_id'])
export class UserProductAccessGroup extends BaseEntity {
  @Column({ type: 'char', length: 24, nullable: true })
  user_id: string;

  // External product / internal-module identifier — a plain string, not a
  // local catalog reference. See CompanyProduct.product_ifric_id.
  @Column({ type: 'varchar', nullable: true })
  product_ifric_id: string;

  @Column({ type: 'char', length: 24, nullable: true })
  access_group_id: string;
}
