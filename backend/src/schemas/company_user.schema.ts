//
// Copyright (c) 2026 IndustryFusion Europe UG
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

export type CompanyUserDocument = HydratedDocument<CompanyUser>;

@Schema()
export class CompanyUser {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: 'Company' })
  company_id: mongoose.Schema.Types.ObjectId;

  @Prop()
  user_email: string;

  @Prop()
  user_name: string;

  @Prop()
  user_image: string;

  @Prop()
  user_password: string;

  @Prop()
  jwt_token: string;

  @Prop({ type: Object })
  meta_data: Record<string, any>;
}

export const CompanyUserSchema = SchemaFactory.createForClass(CompanyUser);
