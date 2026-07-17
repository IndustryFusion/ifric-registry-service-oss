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

export type CompanyTwinDocument = HydratedDocument<CompanyTwin>;

@Schema()
export class CompanyTwin {
  @Prop()
  manufacturer_company_id: string;

  @Prop()
  owner_company_id: string;

  @Prop()
  asset_ifric_id: string;

  // The physical Factory (see factory.schema.ts) where this asset is
  // installed, if known. References Factory.factory_id.
  @Prop()
  factory_id: string;
}

export const CompanyTwinSchema = SchemaFactory.createForClass(CompanyTwin);
