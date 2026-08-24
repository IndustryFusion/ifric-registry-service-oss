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

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Company, CompanyCategory, CompanyCategoryMapping } from 'src/entities';
import { PublicCompanyService } from './public-company.service';

// A full row, including every column that must never cross the company
// boundary. Written out in full deliberately: the point of these tests is
// that the projection is an allow-list, so the fixture has to carry the
// things it is expected to drop.
const FULL_ROW = {
  _id: 'company-1',
  company_ifric_id: 'urn:ifric:company-1',
  company_name: 'Machine Builder GmbH',
  registration_number: 'HRB-12345',
  address_1: 'Hauptstrasse 1',
  zip: '80331',
  city: 'Munich',
  country: 'Germany',
  admin_name: 'Alex Admin',
  position: 'CTO',
  email: 'admin@builder.example',
  company_size: '50-200',
  temp_password: 'legacy-secret',
  company_verified: 'verified',
  company_domain: 'builder.example',
  meta_data: { internal_notes: 'do not share' },
  company_image: 'https://example.invalid/logo.png',
  industry: 'Machinery',
} as unknown as Company;

const PRIVATE_FIELDS = [
  '_id',
  'registration_number',
  'admin_name',
  'position',
  'email',
  'company_size',
  'temp_password',
  'company_verified',
  'company_domain',
  'meta_data',
];

describe('PublicCompanyService', () => {
  let service: PublicCompanyService;
  let mappingRepository: { find: jest.Mock };
  let categoryRepository: { find: jest.Mock };

  beforeEach(async () => {
    mappingRepository = { find: jest.fn().mockResolvedValue([]) };
    categoryRepository = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicCompanyService,
        {
          provide: getRepositoryToken(CompanyCategoryMapping),
          useValue: mappingRepository,
        },
        {
          provide: getRepositoryToken(CompanyCategory),
          useValue: categoryRepository,
        },
      ],
    }).compile();

    service = module.get<PublicCompanyService>(PublicCompanyService);
  });

  it('exposes exactly the agreed public field set', async () => {
    const [projected] = await service.toPublicCompanies([FULL_ROW]);

    expect(Object.keys(projected).sort()).toEqual(
      [
        'address_1',
        'city',
        'company_category',
        'company_ifric_id',
        'company_image',
        'company_name',
        'country',
        'industry',
        'zip',
      ].sort(),
    );
  });

  it.each(PRIVATE_FIELDS)('never exposes %s', async (field) => {
    const [projected] = await service.toPublicCompanies([FULL_ROW]);

    expect(projected).not.toHaveProperty(field);
  });

  it('carries the public values through unchanged', async () => {
    const [projected] = await service.toPublicCompanies([FULL_ROW]);

    expect(projected).toMatchObject({
      company_ifric_id: 'urn:ifric:company-1',
      company_name: 'Machine Builder GmbH',
      address_1: 'Hauptstrasse 1',
      zip: '80331',
      city: 'Munich',
      country: 'Germany',
      industry: 'Machinery',
      company_image: 'https://example.invalid/logo.png',
    });
  });

  it('normalizes a missing image to null rather than undefined', async () => {
    const [projected] = await service.toPublicCompanies([
      { ...FULL_ROW, company_image: null } as unknown as Company,
    ]);

    expect(projected.company_image).toBeNull();
  });

  it('resolves the derived company_category', async () => {
    mappingRepository.find.mockResolvedValue([
      { company_id: 'company-1', category_id: 'cat-1' },
    ]);
    categoryRepository.find.mockResolvedValue([
      { _id: 'cat-1', category_name: 'machine_builder' },
    ]);

    const [projected] = await service.toPublicCompanies([FULL_ROW]);

    expect(projected.company_category).toBe('machine_builder');
  });

  // The category walk is two queries no matter how many companies are
  // passed — a list endpoint must not degrade into an N+1.
  it('resolves categories for a batch in two queries', async () => {
    const second = {
      ...FULL_ROW,
      _id: 'company-2',
      company_ifric_id: 'urn:ifric:company-2',
    } as unknown as Company;
    mappingRepository.find.mockResolvedValue([
      { company_id: 'company-1', category_id: 'cat-1' },
      { company_id: 'company-2', category_id: 'cat-2' },
    ]);
    categoryRepository.find.mockResolvedValue([
      { _id: 'cat-1', category_name: 'machine_builder' },
      { _id: 'cat-2', category_name: 'factory_owner' },
    ]);

    const projected = await service.toPublicCompanies([FULL_ROW, second]);

    expect(projected.map((c) => c.company_category)).toEqual([
      'machine_builder',
      'factory_owner',
    ]);
    expect(mappingRepository.find).toHaveBeenCalledTimes(1);
    expect(categoryRepository.find).toHaveBeenCalledTimes(1);
  });

  it('leaves company_category undefined when the company has no mapping', async () => {
    const [projected] = await service.toPublicCompanies([FULL_ROW]);

    expect(projected.company_category).toBeUndefined();
  });

  it('short-circuits on an empty list without querying', async () => {
    await expect(service.toPublicCompanies([])).resolves.toEqual([]);
    expect(mappingRepository.find).not.toHaveBeenCalled();
  });

  it('returns null for a missing company rather than throwing', async () => {
    await expect(service.toPublicCompany(null)).resolves.toBeNull();
  });
});
