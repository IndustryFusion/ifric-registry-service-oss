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
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { KeycloakModule } from './keycloak.module';
import {
  Company,
  CompanyUser,
  CompanyCategory,
  AccessGroup,
  CompanyCategoryMapping,
  UserProductAccessGroup,
  CompanyProduct,
  CompanyTwin,
} from 'src/entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyUser,
      CompanyCategory,
      AccessGroup,
      CompanyCategoryMapping,
      UserProductAccessGroup,
      CompanyProduct,
      CompanyTwin,
    ]),
    KeycloakModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard],
})
export class AuthModule {}
