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
import { DataSource, DataSourceOptions } from 'typeorm';

dotenv.config();

// Shared by both the running app (via app.module.ts's TypeOrmModule.forRoot,
// which duplicates these options rather than importing this file directly,
// since Nest's forRoot doesn't accept a pre-built DataSource) and the
// TypeORM CLI (migration:generate/migration:run use this file directly).
// Entities/migrations grow one feature module at a time as the Mongo->
// Postgres migration proceeds — see the plan for the phase breakdown.
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  username: process.env.DB_USER || 'ifric',
  password: process.env.DB_PASSWORD || 'ifric',
  database: process.env.DB_NAME || 'ifric_registry_service',
  entities: [__dirname + '/../entities/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
};

export default new DataSource(dataSourceOptions);
