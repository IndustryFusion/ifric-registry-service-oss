//
// Copyright (c) 2024 IB Systems GmbH
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import * as mongoose from 'mongoose';
import { HydratedDocument } from 'mongoose';

export type UserProductAccessGroupDocument =
  HydratedDocument<UserProductAccessGroup>;

@Schema()
export class UserProductAccessGroup {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'CompanyUser' })
  user_id: mongoose.Schema.Types.ObjectId;

  // External product / internal-module identifier — a plain string, not a
  // local catalog reference. See CompanyProduct.product_ifric_id.
  @Prop()
  product_ifric_id: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'AccessGroup' })
  access_group_id: mongoose.Schema.Types.ObjectId;
}

export const UserProductAccessGroupSchema = SchemaFactory.createForClass(
  UserProductAccessGroup,
);
