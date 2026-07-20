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

// Keycloak is now this app's sole identity provider (see KeycloakService) —
// credentials and refresh-token session state live there, not in this
// database. Drops company_users.user_password/jwt_token and
// companies.password, all now fully unused. Irreversible for any existing
// deployment's local credential data — acceptable, since that data is
// meaningless once auth has moved to Keycloak.
export class DropLocalAuthColumns1784546767848 implements MigrationInterface {
  name = 'DropLocalAuthColumns1784546767848';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "company_users" DROP COLUMN "user_password"`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_users" DROP COLUMN "jwt_token"`,
    );
    await queryRunner.query(`ALTER TABLE "companies" DROP COLUMN "password"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "companies" ADD COLUMN "password" varchar`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_users" ADD COLUMN "jwt_token" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "company_users" ADD COLUMN "user_password" varchar`,
    );
  }
}
