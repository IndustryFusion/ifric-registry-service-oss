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
import { getModelToken } from '@nestjs/mongoose';
import { ScriptService } from './script.service';
import { AccessGroup } from 'src/schemas/access_group.schema';
import { CompanyCategory } from 'src/schemas/company_category.schema';
import { Product } from 'src/schemas/products.schema';

describe('ScriptService', () => {
  let service: ScriptService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScriptService,
        { provide: getModelToken(AccessGroup.name), useValue: {} },
        { provide: getModelToken(CompanyCategory.name), useValue: {} },
        { provide: getModelToken(Product.name), useValue: {} },
      ],
    }).compile();

    service = module.get<ScriptService>(ScriptService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
