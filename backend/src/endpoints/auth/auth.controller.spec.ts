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
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Company } from 'src/schemas/company.schema';
import { CompanyUser } from 'src/schemas/company_user.schema';
import { CompanyCategory } from 'src/schemas/company_category.schema';
import { AccessGroup } from 'src/schemas/access_group.schema';
import { CompanyCategoryMapping } from 'src/schemas/company_category_mapping.schema';
import { Product } from 'src/schemas/products.schema';
import { UserProductAccessGroup } from 'src/schemas/user_product_access_group.schema';
import { CompanyProduct } from 'src/schemas/company_product.schema';
import { CompanyTwin } from 'src/schemas/company_twin.schema';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: CACHE_MANAGER, useValue: {} },
        { provide: getModelToken(Company.name), useValue: {} },
        { provide: getModelToken(CompanyUser.name), useValue: {} },
        { provide: getModelToken(CompanyCategory.name), useValue: {} },
        { provide: getModelToken(AccessGroup.name), useValue: {} },
        { provide: getModelToken(CompanyCategoryMapping.name), useValue: {} },
        { provide: getModelToken(Product.name), useValue: {} },
        { provide: getModelToken(UserProductAccessGroup.name), useValue: {} },
        { provide: getModelToken(CompanyProduct.name), useValue: {} },
        { provide: getModelToken(CompanyTwin.name), useValue: {} },
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('refresh', () => {
    it('delegates to AuthService.refreshAccessToken with the given token', async () => {
      const authService = {
        refreshAccessToken: jest.fn().mockResolvedValue({
          access_token: 'new-token',
        }),
      };
      (controller as any).authService = authService;

      const result = await controller.refresh('a-refresh-token');

      expect(authService.refreshAccessToken).toHaveBeenCalledWith(
        'a-refresh-token',
      );
      expect(result).toEqual({ access_token: 'new-token' });
    });
  });
});
