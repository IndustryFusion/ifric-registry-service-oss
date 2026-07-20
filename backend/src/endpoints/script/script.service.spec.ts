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
import { ScriptService } from './script.service';
import { AccessGroup, CompanyCategory, Product } from 'src/entities';
import { COMPANY_CATEGORY_NAMES } from 'src/common/company-category.constants';

describe('ScriptService', () => {
  let service: ScriptService;
  let accessRepository: { create: jest.Mock; save: jest.Mock };
  let companyCategoryRepository: { create: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    accessRepository = {
      create: jest.fn((d) => d),
      save: jest.fn().mockResolvedValue(undefined),
    };
    companyCategoryRepository = {
      create: jest.fn((d) => d),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScriptService,
        {
          provide: getRepositoryToken(AccessGroup),
          useValue: accessRepository,
        },
        {
          provide: getRepositoryToken(CompanyCategory),
          useValue: companyCategoryRepository,
        },
        { provide: getRepositoryToken(Product), useValue: {} },
      ],
    }).compile();

    service = module.get<ScriptService>(ScriptService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('seeds exactly the predefined company-category taxonomy, including machine_builder', async () => {
      await service.create();

      expect(companyCategoryRepository.save).toHaveBeenCalledWith(
        COMPANY_CATEGORY_NAMES.map((category_name) => ({ category_name })),
      );
    });
  });
});
