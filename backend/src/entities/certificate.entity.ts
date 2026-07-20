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

@Entity('certificates')
export class Certificate extends BaseEntity {
  @Column({ type: 'text', nullable: true })
  certificate_data: string;

  @Column({ type: 'timestamptz', nullable: true })
  created_on: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiry_on: Date;

  @Column({ type: 'char', length: 24, nullable: true })
  company_id: string;

  @Column({ type: 'char', length: 24, nullable: true })
  user_id: string;

  @Column({ type: 'text', nullable: true })
  private_key: string;

  @Column({ type: 'varchar', nullable: true })
  hedera_did_id: string;

  @Column({ type: 'varchar', nullable: true })
  hedera_file_id: string;

  @Column({ type: 'varchar', nullable: true })
  hedera_account_id: string;
}
