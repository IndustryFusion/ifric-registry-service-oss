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
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import {
  Company,
  CompanyUser,
  CompanyTwin,
  CompanyProduct,
  Product,
  AccessGroup,
  UserProductAccessGroup,
  Factory,
} from 'src/entities';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyUser,
      CompanyTwin,
      CompanyProduct,
      Product,
      AccessGroup,
      UserProductAccessGroup,
      Factory,
    ]),
    AuthModule,
  ],
  controllers: [ProductController],
  providers: [ProductService],
})
export class ProductModule {}
