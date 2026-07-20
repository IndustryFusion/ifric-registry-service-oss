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
import { ScriptController } from './script.controller';
import { ScriptService } from './script.service';
import { AccessGroup, CompanyCategory, Product } from 'src/entities';

describe('ScriptController', () => {
  let controller: ScriptController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScriptController],
      providers: [
        ScriptService,
        { provide: getRepositoryToken(AccessGroup), useValue: {} },
        { provide: getRepositoryToken(CompanyCategory), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
      ],
    }).compile();

    controller = module.get<ScriptController>(ScriptController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
