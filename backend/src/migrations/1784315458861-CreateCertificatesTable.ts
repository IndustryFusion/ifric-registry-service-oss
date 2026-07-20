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

export class CreateCertificatesTable1784315458861
  implements MigrationInterface
{
  name = 'CreateCertificatesTable1784315458861';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "certificates" (
        "_id" char(24) PRIMARY KEY,
        "certificate_data" text,
        "created_on" timestamptz,
        "expiry_on" timestamptz,
        "company_id" char(24),
        "user_id" char(24),
        "private_key" text,
        "hedera_did_id" varchar,
        "hedera_file_id" varchar,
        "hedera_account_id" varchar
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "certificates"`);
  }
}
