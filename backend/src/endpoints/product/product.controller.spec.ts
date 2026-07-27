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
import { KeycloakService } from '../auth/keycloak.service';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import {
  Company,
  CompanyUser,
  CompanyTwin,
  CompanyProduct,
  Product,
  AccessGroup,
  UserProductAccessGroup,
  Factory,
} from 'src/entities';
import { AccessControlService } from 'src/common/access-control.service';

describe('ProductController', () => {
  let controller: ProductController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [
        ProductService,
        { provide: getRepositoryToken(Company), useValue: {} },
        { provide: getRepositoryToken(CompanyUser), useValue: {} },
        { provide: getRepositoryToken(CompanyTwin), useValue: {} },
        { provide: getRepositoryToken(CompanyProduct), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: getRepositoryToken(AccessGroup), useValue: {} },
        {
          provide: getRepositoryToken(UserProductAccessGroup),
          useValue: {},
        },
        { provide: getRepositoryToken(Factory), useValue: {} },
        { provide: KeycloakService, useValue: {} },
        { provide: AccessControlService, useValue: {} },
      ],
    }).compile();

    controller = module.get<ProductController>(ProductController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProductCompany', () => {
    it('delegates to ProductService.getProductCompany with the product URN', async () => {
      const productService = {
        getProductCompany: jest
          .fn()
          .mockResolvedValue({ company_name: 'Acme Manufacturing' }),
      };
      (controller as any).productService = productService;

      const result = await controller.getProductCompany('urn:product:widget');

      expect(productService.getProductCompany).toHaveBeenCalledWith(
        'urn:product:widget',
      );
      expect(result).toEqual({ company_name: 'Acme Manufacturing' });
    });
  });

  describe('addCompanyProduct', () => {
    it('delegates to ProductService.addCompanyProduct with product_ifric_id', async () => {
      const productService = {
        addCompanyProduct: jest.fn().mockResolvedValue({ success: true }),
      };
      (controller as any).productService = productService;
      const data = {
        company_ifric_id: 'urn:ifric:company-1',
        product_ifric_id: 'urn:product:widget',
      };

      const authUser = {
        company_ifric_id: 'urn:ifric:company-1',
        user_id: 'u1',
      };
      const result = await controller.addCompanyProduct(data as any, authUser);

      expect(productService.addCompanyProduct).toHaveBeenCalledWith(
        data,
        authUser,
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('updateCompanyProduct', () => {
    it('delegates to ProductService.updateCompanyProduct with product_ifric_id', async () => {
      const productService = {
        updateCompanyProduct: jest.fn().mockResolvedValue({ status: 200 }),
      };
      (controller as any).productService = productService;
      const data = { product_ifric_id: 'urn:product:widget' };

      const result = await controller.updateCompanyProduct(
        'urn:ifric:company-1',
        data as any,
      );

      expect(productService.updateCompanyProduct).toHaveBeenCalledWith(
        'urn:ifric:company-1',
        data,
      );
      expect(result).toEqual({ status: 200 });
    });
  });

  describe('createCompanyTwin', () => {
    it('delegates to ProductService.createCompanyTwin with owner/manufacturer/factory fields', async () => {
      const productService = {
        createCompanyTwin: jest.fn().mockResolvedValue({ success: true }),
      };
      (controller as any).productService = productService;
      const data = {
        manufacturer_ifric_id: 'urn:ifric:mfg',
        owner_company_ifric_id: 'urn:ifric:owner',
        asset_ifric_id: 'urn:asset:widget',
        factory_id: 'urn:ifric:fac-1',
      };

      const result = await controller.createCompanyTwin(data as any);

      expect(productService.createCompanyTwin).toHaveBeenCalledWith(data);
      expect(result).toEqual({ success: true });
    });
  });

  describe('updateCompanyTwin', () => {
    it('delegates to ProductService.updateCompanyTwin', async () => {
      const productService = {
        updateCompanyTwin: jest.fn().mockResolvedValue({ status: 204 }),
      };
      (controller as any).productService = productService;
      const data = {
        manufacturer_ifric_id: 'urn:ifric:mfg',
        owner_company_ifric_id: 'urn:ifric:owner',
        asset_ifric_id: 'urn:asset:widget',
      };

      const result = await controller.updateCompanyTwin(data as any);

      expect(productService.updateCompanyTwin).toHaveBeenCalledWith(data);
      expect(result).toEqual({ status: 204 });
    });
  });
});
