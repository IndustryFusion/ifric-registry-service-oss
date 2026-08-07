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

// Two consolidations in one migration:
//
// 1. Retires the app/module "product" concept (CompanyProduct, and the
//    product dimension on the RBAC grant table) — this app's RBAC is one
//    AccessGroup role per user per company, not per product. Drops
//    company_products entirely; user_product_access_groups loses
//    product_ifric_id and is renamed user_access_groups, unique on user_id
//    alone (deduplicated first — a user with multiple pre-existing grants
//    keeps only its lowest-_id row, since there's no principled way to
//    pick "the" surviving role otherwise).
//
// 2. Merges what used to be two unrelated tables — company_assets (a bare
//    company_id + asset_ifric_id tag) and company_twins (manufacturer +
//    owner + optional factory) — into one `assets` table. A row starts
//    physical-only (company_id only, is_twin false) and becomes a twin
//    once owner_company_id is set. Where the same (company, asset URN)
//    existed in both source tables, the twin fields win (ON CONFLICT DO
//    UPDATE) rather than being silently dropped.
//
// Irreversible for company_products' actual row data (dropped, not
// backed up) — same tradeoff as DropLocalAuthColumns1784546767848;
// acceptable since that data has no meaning once the product dimension is
// retired. down() restores the table/column *shapes* only.
export class MergeAssetsRetireProductRbac1785000000000
  implements MigrationInterface
{
  name = 'MergeAssetsRetireProductRbac1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- Retire the product dimension on RBAC grants ---
    await queryRunner.query(`
      ALTER TABLE "user_product_access_groups"
      DROP CONSTRAINT "UQ_user_product_access_groups_user_id_product_ifric_id"
    `);
    // Keep only the lowest-_id row per user (arbitrary but deterministic)
    // before collapsing to one grant per user.
    await queryRunner.query(`
      DELETE FROM "user_product_access_groups" a
      USING "user_product_access_groups" b
      WHERE a."_id" > b."_id" AND a."user_id" = b."user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_product_access_groups" DROP COLUMN "product_ifric_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_product_access_groups"
      RENAME TO "user_access_groups"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_access_groups"
      ADD CONSTRAINT "UQ_user_access_groups_user_id" UNIQUE ("user_id")
    `);

    await queryRunner.query(`DROP TABLE "company_products"`);

    // --- Merge company_assets + company_twins into assets ---
    await queryRunner.query(`
      CREATE TABLE "assets" (
        "_id" char(24) PRIMARY KEY,
        "asset_ifric_id" varchar,
        "company_id" char(24),
        "owner_company_id" char(24),
        "factory_id" varchar,
        "is_twin" boolean NOT NULL DEFAULT false,
        CONSTRAINT "UQ_assets_company_id_asset_ifric_id" UNIQUE ("company_id", "asset_ifric_id")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "assets" ("_id", "asset_ifric_id", "company_id", "is_twin")
      SELECT "_id", "asset_ifric_id", "company_id", false FROM "company_assets"
    `);
    await queryRunner.query(`
      INSERT INTO "assets"
        ("_id", "asset_ifric_id", "company_id", "owner_company_id", "factory_id", "is_twin")
      SELECT "_id", "asset_ifric_id", "manufacturer_company_id", "owner_company_id", "factory_id", true
      FROM "company_twins"
      ON CONFLICT ("company_id", "asset_ifric_id")
      DO UPDATE SET
        owner_company_id = EXCLUDED.owner_company_id,
        factory_id = EXCLUDED.factory_id,
        is_twin = true
    `);
    await queryRunner.query(`DROP TABLE "company_assets"`);
    await queryRunner.query(`DROP TABLE "company_twins"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "company_assets" (
        "_id" char(24) PRIMARY KEY,
        "company_id" char(24),
        "asset_ifric_id" varchar
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
      INSERT INTO "company_assets" ("_id", "company_id", "asset_ifric_id")
      SELECT "_id", "company_id", "asset_ifric_id" FROM "assets" WHERE "is_twin" = false
    `);
    await queryRunner.query(`
      INSERT INTO "company_twins"
        ("_id", "manufacturer_company_id", "owner_company_id", "asset_ifric_id", "factory_id")
      SELECT "_id", "company_id", "owner_company_id", "asset_ifric_id", "factory_id"
      FROM "assets" WHERE "is_twin" = true
    `);
    await queryRunner.query(`DROP TABLE "assets"`);

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
      ALTER TABLE "user_access_groups"
      DROP CONSTRAINT "UQ_user_access_groups_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_access_groups"
      ADD COLUMN "product_ifric_id" varchar
    `);
    await queryRunner.query(`
      ALTER TABLE "user_access_groups" RENAME TO "user_product_access_groups"
    `);
    await queryRunner.query(`
      ALTER TABLE "user_product_access_groups"
      ADD CONSTRAINT "UQ_user_product_access_groups_user_id_product_ifric_id"
      UNIQUE ("user_id", "product_ifric_id")
    `);
  }
}
