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

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccessGroupCategoryProduct1784314327548
  implements MigrationInterface
{
  name = 'CreateAccessGroupCategoryProduct1784314327548';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "access_groups" (
        "_id" char(24) PRIMARY KEY,
        "company_id" char(24),
        "group_name" varchar,
        "create" boolean,
        "read" boolean,
        "update" boolean,
        "delete" boolean
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "company_categories" (
        "_id" char(24) PRIMARY KEY,
        "category_name" varchar
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "_id" char(24) PRIMARY KEY,
        "product_name" varchar
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TABLE "company_categories"`);
    await queryRunner.query(`DROP TABLE "access_groups"`);
  }
}
