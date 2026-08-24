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

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Company, CompanyCategory, CompanyCategoryMapping } from 'src/entities';

/**
 * The company profile any authenticated user of any *other* company may
 * read. Deliberately a strict subset of the Company entity's own field
 * names (not the company_address/company_city aliases getAllCompanies
 * uses), so a client reading `city` keeps working whether it received the
 * full record or this projection.
 *
 * company_category is the one derived field — it lives in
 * CompanyCategoryMapping -> CompanyCategory, not on Company.
 */
export interface PublicCompany {
  company_ifric_id: string;
  company_name: string;
  address_1: string;
  zip: string;
  city: string;
  country: string;
  industry: string;
  company_image: string | null;
  company_category?: string;
}

/**
 * Single source of truth for what a company exposes across the company
 * boundary. Every cross-company read goes through here rather than
 * hand-picking fields at the call site, which is how `temp_password`,
 * `email`, `registration_number` and `meta_data` ended up reachable from
 * several endpoints that returned raw entity rows.
 *
 * Deliberately allow-list, not deny-list: a column added to Company in
 * future is private until someone adds it here on purpose.
 */
@Injectable()
export class PublicCompanyService {
  constructor(
    @InjectRepository(CompanyCategoryMapping)
    private readonly companyCategoryMappingRepository: Repository<CompanyCategoryMapping>,
    @InjectRepository(CompanyCategory)
    private readonly companyCategoryRepository: Repository<CompanyCategory>,
  ) {}

  async toPublicCompany(
    company: Company | null,
  ): Promise<PublicCompany | null> {
    if (!company) {
      return null;
    }
    const [projected] = await this.toPublicCompanies([company]);
    return projected ?? null;
  }

  // Resolves categories for the whole batch in two queries regardless of
  // how many companies are passed — same walk getAllCompanies already does
  // inline, kept off the per-company path so a list endpoint can't turn
  // into an N+1.
  async toPublicCompanies(companies: Company[]): Promise<PublicCompany[]> {
    if (!companies.length) {
      return [];
    }
    const categoryNameByCompanyId = await this.resolveCategoryNames(
      companies.map((company) => company._id),
    );
    return companies.map((company) => ({
      company_ifric_id: company.company_ifric_id,
      company_name: company.company_name,
      address_1: company.address_1,
      zip: company.zip,
      city: company.city,
      country: company.country,
      industry: company.industry,
      company_image: company.company_image ?? null,
      company_category: categoryNameByCompanyId.get(company._id),
    }));
  }

  private async resolveCategoryNames(
    companyIds: string[],
  ): Promise<Map<string, string>> {
    const mappings = await this.companyCategoryMappingRepository.find({
      where: { company_id: In(companyIds) },
    });
    if (!mappings.length) {
      return new Map();
    }
    const categories = await this.companyCategoryRepository.find({
      where: { _id: In([...new Set(mappings.map((m) => m.category_id))]) },
    });
    const categoryNameById = new Map(
      categories.map((category) => [category._id, category.category_name]),
    );
    return new Map(
      mappings
        .map((mapping): [string, string | undefined] => [
          mapping.company_id,
          categoryNameById.get(mapping.category_id),
        ])
        .filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
  }
}
