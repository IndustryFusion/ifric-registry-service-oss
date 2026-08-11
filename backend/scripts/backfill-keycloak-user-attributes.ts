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

// One-time, manual post-upgrade step for existing deployments: stamps
// company_ifric_id/user_id onto every existing CompanyUser's Keycloak
// account, so their access tokens start carrying those claims once the
// realm protocol mapper (see docs/keycloak-setup.md) is also in place. New
// CompanyUsers created after this migration already get this at creation
// time (CompanyService.createCompany / AuthService.createCompanyUser) — this
// script only needs to run once, against accounts that predate it.
//
// Usage: npm run backfill:keycloak-attributes

import * as dotenv from 'dotenv';
dotenv.config();

import dataSource from '../src/database/data-source';
import { CompanyUser, Company } from '../src/entities';
import { KeycloakService } from '../src/endpoints/auth/keycloak.service';

async function main() {
  await dataSource.initialize();
  const keycloakService = new KeycloakService();

  const companyUsers = await dataSource.getRepository(CompanyUser).find();
  const companies = await dataSource.getRepository(Company).find();
  const companyIfricIdById = new Map(
    companies.map((c) => [c._id, c.company_ifric_id]),
  );

  let updated = 0;
  let skipped = 0;
  for (const user of companyUsers) {
    const companyIfricId = companyIfricIdById.get(user.company_id);
    if (!companyIfricId) {
      console.warn(
        `Skipping ${user.user_email}: no company found for company_id ${user.company_id}`,
      );
      skipped++;
      continue;
    }
    try {
      await keycloakService.setUserAttributes(user.user_email, {
        company_ifric_id: companyIfricId,
        user_id: user._id,
      });
      console.log(`Updated ${user.user_email}`);
      updated++;
    } catch (err) {
      console.warn(`Skipping ${user.user_email}: ${err.message}`);
      skipped++;
    }
  }

  console.log(`Done. Updated ${updated}, skipped ${skipped}.`);
  await dataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
