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

import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type FactoryDocument = HydratedDocument<Factory>;

/**
 * A physical location where assets are manufactured, owned, or operated.
 * Linked to its owning Company via owner_company_ifric_id, and to the
 * assets/twins located there via CompanyTwin.factory_id.
 */
@Schema()
export class Factory {
  @Prop()
  factory_id: string;

  @Prop()
  owner_company_ifric_id: string;

  @Prop()
  location_name: string;

  @Prop()
  address_1: string;

  @Prop()
  city: string;

  @Prop()
  country: string;

  @Prop()
  zip: string;

  @Prop()
  latitude: number;

  @Prop()
  longitude: number;

  @Prop()
  timezone: string;
}

export const FactorySchema = SchemaFactory.createForClass(Factory);
