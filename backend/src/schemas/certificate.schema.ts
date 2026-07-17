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

export type CertificateDocument = HydratedDocument<Certificate>;

@Schema()
export class Certificate {
  @Prop()
  certificate_data: string;

  @Prop()
  created_on: Date;

  @Prop()
  expiry_on: Date;

  @Prop()
  company_id: string;

  @Prop()
  user_id: string;

  @Prop()
  private_key: string;

  @Prop()
  hedera_did_id: string;

  @Prop()
  hedera_file_id: string;

  @Prop()
  hedera_account_id: string;
}

export const CertificateSchema = SchemaFactory.createForClass(Certificate);
