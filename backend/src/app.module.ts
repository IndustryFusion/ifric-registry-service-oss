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

import * as dotenv from 'dotenv';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { envConstants } from './common/env.constants';
import { ScriptController } from './endpoints/script/script.controller';
import { ScriptService } from './endpoints/script/script.service';
import { AuthModule } from './endpoints/auth/auth.module';
import { CertificateModule } from './endpoints/certificate/certificate.module';
import { CacheInterceptor, CacheModule } from '@nestjs/cache-manager';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { CompanyModule } from './endpoints/company/company.module';
import { ProductModule } from './endpoints/product/product.module';
import { entities, AccessGroup, CompanyCategory, Product } from './entities';

dotenv.config();

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: envConstants.dbHost,
      port: envConstants.dbPort,
      username: envConstants.dbUser,
      password: envConstants.dbPassword,
      database: envConstants.dbName,
      entities,
      synchronize: false,
    }),
    // Only what ScriptService/AppController need directly — every other
    // module registers its own models via its own forFeature (see
    // AuthModule, CompanyModule, ProductModule, CertificateModule).
    TypeOrmModule.forFeature([AccessGroup, CompanyCategory, Product]),
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
