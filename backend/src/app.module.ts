//
// Copyright (c) 2024 IB Systems GmbH
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

import * as dotenv from 'dotenv';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import {
  CompanyCategorySchema,
  CompanyCategory,
} from './schemas/company_category.schema';
import {
  AccessGroupSchema,
  AccessGroup,
} from 'src/schemas/access_group.schema';
import { Product, ProductSchema } from './schemas/products.schema';
import { ScriptController } from './endpoints/script/script.controller';
import { ScriptService } from './endpoints/script/script.service';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './endpoints/auth/constants';
import { AuthModule } from './endpoints/auth/auth.module';
import { CertificateModule } from './endpoints/certificate/certificate.module';
import { CacheInterceptor, CacheModule } from '@nestjs/cache-manager';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { CompanyModule } from './endpoints/company/company.module';
import { ProductModule } from './endpoints/product/product.module';

dotenv.config();
const mongoURI = process.env.MONGO_URL;

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forRoot(mongoURI),
    // Only what ScriptService/AppController need directly — every other
    // module registers its own models via its own forFeature (see
    // AuthModule, CompanyModule, ProductModule, CertificateModule).
    MongooseModule.forFeature([
      { name: CompanyCategory.name, schema: CompanyCategorySchema },
      { name: AccessGroup.name, schema: AccessGroupSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    // No global signOptions/expiresIn — every token-minting call site
    // (AuthService.generateAccessToken/signRefreshToken) sets its own TTL
    // explicitly, since access and refresh tokens have different lifetimes.
    JwtModule.register({
      global: true,
      secret: jwtConstants.secret,
    }),
    CacheModule.register({
      isGlobal: true,
      ttl: 600,
      store: 'memory',
      max: 1000000,
      skip: ['token', 'refresh_token', 'grant_type'], // Add this line
    }),
    AuthModule,
    CompanyModule,
    CertificateModule,
    ProductModule,
  ],
  controllers: [AppController, ScriptController],
  providers: [
    AppService,
    ScriptService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
  ],
})
export class AppModule {}
