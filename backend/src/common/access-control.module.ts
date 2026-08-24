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

import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AccessGroup,
  Company,
  CompanyCategory,
  CompanyCategoryMapping,
  UserAccessGroup,
} from 'src/entities';
import { AccessControlService } from './access-control.service';
import { PublicCompanyService } from './public-company.service';

// @Global() so AccessControlService resolves for every module without each
// one re-importing it — same rationale as KeycloakModule, since company/
// RBAC scoping is a cross-cutting concern needed by CompanyModule,
// ProductModule, and AuthModule alike. PublicCompanyService rides along for
// the same reason: what a company exposes across the company boundary has
// to be one answer, and CompanyService, AssetService and AuthService all
// need it.
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccessGroup,
      UserAccessGroup,
      Company,
      CompanyCategory,
      CompanyCategoryMapping,
    ]),
  ],
  providers: [AccessControlService, PublicCompanyService],
  exports: [AccessControlService, PublicCompanyService],
})
export class AccessControlModule {}
