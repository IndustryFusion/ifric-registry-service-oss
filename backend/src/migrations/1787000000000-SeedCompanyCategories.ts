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
import { COMPANY_CATEGORY_NAMES } from '../common/company-category.constants';
import { generateId } from '../database/generate-id';

// Populates company_categories, which CreateAccessGroupCategoryProduct
// creates but never fills.
//
// The table is reference data the service cannot start work without:
// CompanyService.createCompany looks a category up by name and refuses the
// registration when it finds nothing. Because that lookup hits the table
// while the error message it throws is built from COMPANY_CATEGORY_NAMES,
// an empty table rejects every registration with a list of the exact
// values the caller just used — the failure names the right answer and
// still fails, which is a hard thing to diagnose from the outside.
//
// Seeded from COMPANY_CATEGORY_NAMES rather than a literal list here, so
// the constant stays the single definition and a name added there is
// carried in by re-running this migration's insert on a fresh database.
// For an existing database, adding a name means a new migration — this one
// will already be recorded as run.
//
// Idempotent by name (ON CONFLICT on the unique index added below), so it
// is safe on a database that was seeded by hand before this shipped —
// which is how the first deployments were unblocked.
export class SeedCompanyCategories1787000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Names are looked up as identifiers, so duplicates would make
    // createCompany's findOne ambiguous. The constraint is what lets the
    // insert below be safely repeatable.
    await queryRunner.query(`
      DELETE FROM "company_categories" a
      USING "company_categories" b
      WHERE a.ctid > b.ctid AND a."category_name" = b."category_name"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_company_categories_category_name"
      ON "company_categories" ("category_name")
    `);

    for (const name of COMPANY_CATEGORY_NAMES) {
      await queryRunner.query(
        `INSERT INTO "company_categories" ("_id", "category_name")
         VALUES ($1, $2)
         ON CONFLICT ("category_name") DO NOTHING`,
        [generateId(), name],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Only the rows this migration is responsible for. A category a
    // deployment added itself is left alone, and companies already mapped
    // to a seeded category would block the delete via their foreign key
    // rather than being silently orphaned.
    await queryRunner.query(
      `DELETE FROM "company_categories" WHERE "category_name" = ANY($1)`,
      [[...COMPANY_CATEGORY_NAMES]],
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_company_categories_category_name"`,
    );
  }
}
