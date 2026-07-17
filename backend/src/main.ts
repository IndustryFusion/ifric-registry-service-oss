//
// Copyright (c) 2026 IndustryFusion Europe UG
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

import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as cors from 'cors';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bodyParser from 'body-parser';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Split CORS_ORIGIN values by comma to handle multiple origins
  const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [];

  // Using NestJS built-in CORS support with multiple origins from CORS_ORIGIN env
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      allowedHeaders: ['Authorization', 'Content-Type'],
    }),
  );

  app.use(cookieParser());

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('Ifric Registry Service')
    .setDescription(
      'Open-source multi-tenant company/user/access-control/digital-twin ' +
        'registry service, split into Auth (session/identity), Company ' +
        '(company CRUD, access groups, physical assets), Product (product ' +
        'catalog, digital twins), Certificate, and Script (one-time seed ' +
        'data) controllers. All use a single bearer-JWT auth mechanism ' +
        '(POST /auth/login, refreshed via POST /auth/refresh). Certificate ' +
        'issuance and company_ifric_id minting integrate with an external ' +
        'open-source ICID-compatible service (see README.md).',
    )
    .setVersion('0.1.0')
    .setLicense('Apache-2.0', 'https://www.apache.org/licenses/LICENSE-2.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document);

  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  await app.listen(process.env.PORT || 4007);
}
bootstrap();
