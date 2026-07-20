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

// A physical location where assets are manufactured, owned, or operated.
// Linked to its owning Company via owner_company_ifric_id, and to the
// assets/twins located there via CompanyTwin.factory_id.
@Entity('factories')
export class Factory extends BaseEntity {
  // App-generated business key — used as a lookup key from CompanyTwin and
  // for direct deletes/updates, so it's unique in practice even though
  // nothing enforced that in Mongo.
  @Column({ type: 'varchar', nullable: true, unique: true })
  factory_id: string;

  @Column({ type: 'varchar', nullable: true })
  owner_company_ifric_id: string;

  @Column({ type: 'varchar', nullable: true })
  location_name: string;

  @Column({ type: 'varchar', nullable: true })
  address_1: string;

  @Column({ type: 'varchar', nullable: true })
  city: string;

  @Column({ type: 'varchar', nullable: true })
  country: string;

  @Column({ type: 'varchar', nullable: true })
  zip: string;

  @Column({ type: 'double precision', nullable: true })
  latitude: number;

  @Column({ type: 'double precision', nullable: true })
  longitude: number;

  @Column({ type: 'varchar', nullable: true })
  timezone: string;
}
