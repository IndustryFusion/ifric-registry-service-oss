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

import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CertificateController } from './certificate.controller';
import { CertificateService } from './certificate.service';
import { Company, CompanySchema } from 'src/schemas/company.schema';
import {
  CompanyUser,
  CompanyUserSchema,
} from 'src/schemas/company_user.schema';
import { Certificate, CertificateSchema } from 'src/schemas/certificate.schema';
import { envConstants } from 'src/common/env.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      { name: Certificate.name, schema: CertificateSchema },
    ]),
  ],
  // /certificate/* only exists when HEDERA_KEY_SECRET is set — CompanyModule
  // still needs CertificateService itself (see CompanyService.getAllCompanies),
  // so only the controller (the HTTP surface) is conditional, not the provider.
  controllers: envConstants.certificatesEnabled ? [CertificateController] : [],
  providers: [CertificateService],
  exports: [CertificateService],
})
export class CertificateModule {}
