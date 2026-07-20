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

import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../database/base.entity';

// No FK constraint on company_id — the Mongo schema this replaces had none
// either (a plain string field, not a ref), and this table's rows are
// bulk-deleted whenever a company is deleted (see CompanyService.deleteCompany).
@Entity('access_groups')
export class AccessGroup extends BaseEntity {
  @Column({ type: 'char', length: 24, nullable: true })
  company_id: string;

  @Column({ type: 'varchar', nullable: true })
  group_name: string;

  @Column({ type: 'boolean', nullable: true })
  create: boolean;

  @Column({ type: 'boolean', nullable: true })
  read: boolean;

  @Column({ type: 'boolean', nullable: true })
  update: boolean;

  @Column({ type: 'boolean', nullable: true })
  delete: boolean;
}
