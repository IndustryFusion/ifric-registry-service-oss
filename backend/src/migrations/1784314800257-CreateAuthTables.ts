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

export class CreateAuthTables1784314800257 implements MigrationInterface {
  name = 'CreateAuthTables1784314800257';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "companies" (
        "_id" char(24) PRIMARY KEY,
        "company_name" varchar,
        "registration_number" varchar,
        "company_ifric_id" varchar UNIQUE,
        "address_1" varchar,
        "city" varchar,
        "country" varchar,
        "zip" varchar,
        "admin_name" varchar,
        "position" varchar,
        "email" varchar UNIQUE,
        "company_size" varchar,
        "temp_password" varchar,
        "password" varchar,
        "company_verified" varchar NOT NULL DEFAULT 'new',
        "company_domain" varchar,
        "meta_data" jsonb,
        "company_image" varchar,
        "industry" varchar
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "company_users" (
        "_id" char(24) PRIMARY KEY,
        "company_id" char(24),
        "user_email" varchar UNIQUE,
        "user_name" varchar,
        "user_image" varchar,
        "user_password" varchar,
        "jwt_token" text,
        "meta_data" jsonb
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "company_category_mappings" (
        "_id" char(24) PRIMARY KEY,
        "category_id" char(24),
        "company_id" char(24)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "company_products" (
        "_id" char(24) PRIMARY KEY,
        "product_ifric_id" varchar,
        "company_id" char(24),
        "billing_id" varchar,
        CONSTRAINT "UQ_company_products_company_id_product_ifric_id" UNIQUE ("company_id", "product_ifric_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "company_twins" (
        "_id" char(24) PRIMARY KEY,
        "manufacturer_company_id" char(24),
        "owner_company_id" char(24),
        "asset_ifric_id" varchar,
        "factory_id" varchar,
        CONSTRAINT "UQ_company_twins_manufacturer_company_id_asset_ifric_id" UNIQUE ("manufacturer_company_id", "asset_ifric_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "user_product_access_groups" (
        "_id" char(24) PRIMARY KEY,
        "user_id" char(24),
        "product_ifric_id" varchar,
        "access_group_id" char(24),
        CONSTRAINT "UQ_user_product_access_groups_user_id_product_ifric_id" UNIQUE ("user_id", "product_ifric_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_product_access_groups"`);
    await queryRunner.query(`DROP TABLE "company_twins"`);
    await queryRunner.query(`DROP TABLE "company_products"`);
    await queryRunner.query(`DROP TABLE "company_category_mappings"`);
    await queryRunner.query(`DROP TABLE "company_users"`);
    await queryRunner.query(`DROP TABLE "companies"`);
  }
}
