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
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { Product } from 'src/entities';
import { KeycloakService } from '../auth/keycloak.service';

describe('ProductController', () => {
  let controller: ProductController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [
        ProductService,
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: KeycloakService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ProductController>(ProductController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProductName', () => {
    it('delegates to ProductService.getProductName', async () => {
      const productService = {
        getProductName: jest
          .fn()
          .mockResolvedValue({ product_name: 'Example Product A' }),
      };
      (controller as any).productService = productService;

      const result = await controller.getProductName('p1');

      expect(productService.getProductName).toHaveBeenCalledWith('p1');
      expect(result).toEqual({ product_name: 'Example Product A' });
    });
  });

  describe('findProductIdByProductName', () => {
    it('delegates to ProductService.findProductIdByProductName', async () => {
      const productService = {
        findProductIdByProductName: jest.fn().mockResolvedValue('p1'),
      };
      (controller as any).productService = productService;

      const result =
        await controller.findProductIdByProductName('Example Product A');

      expect(productService.findProductIdByProductName).toHaveBeenCalledWith(
        'Example Product A',
      );
      expect(result).toBe('p1');
    });
  });
});
