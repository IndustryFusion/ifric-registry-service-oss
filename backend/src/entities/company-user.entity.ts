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

@Entity('company_users')
export class CompanyUser extends BaseEntity {
  @Column({ type: 'char', length: 24, nullable: true })
  company_id: string;

  // createAdminUser already checks for an existing user with this email
  // before insert.
  @Column({ type: 'varchar', nullable: true, unique: true })
  user_email: string;

  @Column({ type: 'varchar', nullable: true })
  user_name: string;

  @Column({ type: 'varchar', nullable: true })
  user_image: string;

  @Column({ type: 'jsonb', nullable: true })
  meta_data: Record<string, any>;
}
