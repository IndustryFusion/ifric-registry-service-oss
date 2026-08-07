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
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { AssetService } from './asset.service';
import {
  Company,
  Asset,
  Factory,
  CompanyUser,
  CompanyCategory,
  CompanyCategoryMapping,
  CompanyGateWay,
  CompanyServer,
  Product,
  AccessGroup,
  UserAccessGroup,
} from 'src/entities';
import { AuthModule } from '../auth/auth.module';
import { CertificateModule } from '../certificate/certificate.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      Asset,
      Factory,
      CompanyUser,
      CompanyCategory,
      CompanyCategoryMapping,
      CompanyGateWay,
      CompanyServer,
      Product,
      AccessGroup,
      UserAccessGroup,
    ]),
    AuthModule,
    CertificateModule,
  ],
  controllers: [CompanyController],
  providers: [CompanyService, AssetService],
})
export class CompanyModule {}
