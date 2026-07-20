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

@Entity('companies')
export class Company extends BaseEntity {
  @Column({ type: 'varchar', nullable: true })
  company_name: string;

  @Column({ type: 'varchar', nullable: true })
  registration_number: string;

  // Minted by the external ICID service — app code already requires this
  // to be unique before allowing company creation.
  @Column({ type: 'varchar', nullable: true, unique: true })
  company_ifric_id: string;

  @Column({ type: 'varchar', nullable: true })
  address_1: string;

  @Column({ type: 'varchar', nullable: true })
  city: string;

  @Column({ type: 'varchar', nullable: true })
  country: string;

  @Column({ type: 'varchar', nullable: true })
  zip: string;

  @Column({ type: 'varchar', nullable: true })
  admin_name: string;

  @Column({ type: 'varchar', nullable: true })
  position: string;

  // createCompany already rejects a duplicate email before insert.
  @Column({ type: 'varchar', nullable: true, unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  company_size: string;

  @Column({ type: 'varchar', nullable: true })
  temp_password: string;

  // Mongoose's String enum was only ever enforced at the ODM/application
  // layer (never a DB-level CHECK) — kept as a plain varchar+default here
  // to match, not tighten, that behavior.
  @Column({ type: 'varchar', default: 'new' })
  company_verified: string;

  @Column({ type: 'varchar', nullable: true })
  company_domain: string;

  @Column({ type: 'jsonb', nullable: true })
  meta_data: Record<string, any>;

  @Column({ type: 'varchar', nullable: true })
  company_image: string;

  @Column({ type: 'varchar', nullable: true })
  industry: string;
}
