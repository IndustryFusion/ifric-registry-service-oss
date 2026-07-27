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

// One AccessGroup role per user — not per product (there is no product
// dimension in this app's RBAC model). UNIQUE is required, not optional —
// it's the ON CONFLICT target for the upsert in
// AuthService.updateUserAccessGroup.
@Entity('user_access_groups')
@Unique(['user_id'])
export class UserAccessGroup extends BaseEntity {
  @Column({ type: 'char', length: 24, nullable: true })
  user_id: string;

  @Column({ type: 'char', length: 24, nullable: true })
  access_group_id: string;
}
