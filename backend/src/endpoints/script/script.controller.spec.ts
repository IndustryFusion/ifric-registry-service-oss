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
import { ScriptController } from './script.controller';
import { ScriptService } from './script.service';
import { AccessGroup } from 'src/schemas/access_group.schema';
import { CompanyCategory } from 'src/schemas/company_category.schema';
import { Product } from 'src/schemas/products.schema';

describe('ScriptController', () => {
  let controller: ScriptController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScriptController],
      providers: [
        ScriptService,
        { provide: getModelToken(AccessGroup.name), useValue: {} },
        { provide: getModelToken(CompanyCategory.name), useValue: {} },
        { provide: getModelToken(Product.name), useValue: {} },
      ],
    }).compile();

    controller = module.get<ScriptController>(ScriptController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
