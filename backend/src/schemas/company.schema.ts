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
import { HydratedDocument } from 'mongoose';

export type CompanyDocument = HydratedDocument<Company>;

@Schema()
export class Company {
  @Prop()
  company_name: string;

  @Prop()
  registration_number: string;

  @Prop()
  company_ifric_id: string;

  @Prop()
  address_1: string;

  @Prop()
  city: string;

  @Prop()
  country: string;

  @Prop()
  zip: string;

  @Prop()
  admin_name: string;

  @Prop()
  position: string;

  @Prop()
  email: string;

  @Prop()
  company_size: string;

  @Prop()
  temp_password: string;

  @Prop()
  password: string;

  @Prop({
    type: String,
    enum: ['new', 'verify', 'verified', 'unverified'],
    default: 'new',
  })
  company_verified: string;

  @Prop()
  company_domain: string;

  @Prop({ type: Object })
  meta_data: Record<string, any>;

  @Prop()
  company_image: string;

  @Prop()
  industry: string;
}

export const CompanySchema = SchemaFactory.createForClass(Company);
