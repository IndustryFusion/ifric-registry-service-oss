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
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { KeycloakService } from '../auth/keycloak.service';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { AssetService } from './asset.service';
import {
  Company,
  Asset,
  Factory,
  CompanyUser,
  CompanyCategory,
  CompanyCategoryMapping,
  CompanyGateWay,
  CompanyServer,
  Product,
  AccessGroup,
  UserAccessGroup,
} from 'src/entities';
import { CertificateService } from '../certificate/certificate.service';
import { AccessControlService } from 'src/common/access-control.service';

describe('CompanyController', () => {
  let controller: CompanyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompanyController],
      providers: [
        CompanyService,
        AssetService,
        { provide: getRepositoryToken(Company), useValue: {} },
        { provide: getRepositoryToken(Asset), useValue: {} },
        { provide: getRepositoryToken(Factory), useValue: {} },
        { provide: getRepositoryToken(CompanyUser), useValue: {} },
        { provide: getRepositoryToken(CompanyCategory), useValue: {} },
        { provide: getRepositoryToken(CompanyCategoryMapping), useValue: {} },
        { provide: getRepositoryToken(CompanyGateWay), useValue: {} },
        { provide: getRepositoryToken(CompanyServer), useValue: {} },
        { provide: getRepositoryToken(Product), useValue: {} },
        { provide: getRepositoryToken(AccessGroup), useValue: {} },
        { provide: getRepositoryToken(UserAccessGroup), useValue: {} },
        { provide: CertificateService, useValue: {} },
        { provide: KeycloakService, useValue: {} },
        { provide: AccessControlService, useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
      ],
    }).compile();

    controller = module.get<CompanyController>(CompanyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getFactories', () => {
    it('delegates to CompanyService.getFactories with the owner filter and caller claims', async () => {
      const companyService = {
        getFactories: jest.fn().mockResolvedValue([{ factory_id: 'f1' }]),
      };
      (controller as any).companyService = companyService;
      const authUser = { company_ifric_id: 'urn:ifric:owner-1', user_id: 'u1' };

      const result = await controller.getFactories(
        'urn:ifric:owner-1',
        authUser,
      );

      expect(companyService.getFactories).toHaveBeenCalledWith(
        'urn:ifric:owner-1',
        authUser,
      );
      expect(result).toEqual([{ factory_id: 'f1' }]);
    });
  });

  describe('getCompanyCategories', () => {
    it('delegates to CompanyService.getCompanyCategories', async () => {
      const categories = [{ _id: 'cat-1', category_name: 'manufacturer' }];
      const companyService = {
        getCompanyCategories: jest.fn().mockResolvedValue(categories),
      };
      (controller as any).companyService = companyService;

      const result = await controller.getCompanyCategories();

      expect(companyService.getCompanyCategories).toHaveBeenCalledWith();
      expect(result).toEqual(categories);
    });
  });

  describe('createFactory', () => {
    it('delegates to CompanyService.createFactory', async () => {
      const companyService = {
        createFactory: jest.fn().mockResolvedValue({ success: true }),
      };
      (controller as any).companyService = companyService;
      const data = {
        factory_id: 'urn:ifric:fac-1',
        owner_company_ifric_id: 'urn:ifric:owner-1',
      };

      const authUser = { company_ifric_id: 'urn:ifric:owner-1', user_id: 'u1' };
      const result = await controller.createFactory(data as any, authUser);

      expect(companyService.createFactory).toHaveBeenCalledWith(data, authUser);
      expect(result).toEqual({ success: true });
    });
  });

  describe('updateFactory', () => {
    it('delegates to CompanyService.updateFactory', async () => {
      const companyService = {
        updateFactory: jest.fn().mockResolvedValue({ status: 204 }),
      };
      (controller as any).companyService = companyService;
      const data = { city: 'Munich' };

      const authUser = { company_ifric_id: 'urn:ifric:owner-1', user_id: 'u1' };
      const result = await controller.updateFactory(
        'urn:ifric:fac-1',
        data as any,
        authUser,
      );

      expect(companyService.updateFactory).toHaveBeenCalledWith(
        'urn:ifric:fac-1',
        data,
        authUser,
      );
      expect(result).toEqual({ status: 204 });
    });
  });

  describe('deleteFactory', () => {
    it('delegates to CompanyService.deleteFactory', async () => {
      const companyService = {
        deleteFactory: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      };
      (controller as any).companyService = companyService;

      const authUser = { company_ifric_id: 'urn:ifric:owner-1', user_id: 'u1' };
      const result = await controller.deleteFactory(
        'urn:ifric:fac-1',
        authUser,
      );

      expect(companyService.deleteFactory).toHaveBeenCalledWith(
        'urn:ifric:fac-1',
        authUser,
      );
      expect(result).toEqual({ deletedCount: 1 });
    });
  });

  describe('createCompanyDevice', () => {
    it('delegates to CompanyService.createCompanyDevice with the gateway/server type discriminator', async () => {
      const companyService = {
        createCompanyDevice: jest.fn().mockResolvedValue({ success: true }),
      };
      (controller as any).companyService = companyService;
      const data = {
        type: 'gateway',
        company_ifric_id: 'urn:ifric:company-1',
        gateway_ifric_id: 'urn:gateway:1',
      };
      const authUser = {
        company_ifric_id: 'urn:ifric:company-1',
        user_id: 'u1',
      };

      const result = await controller.createCompanyDevice(
        data as any,
        authUser,
      );

      expect(companyService.createCompanyDevice).toHaveBeenCalledWith(
        data,
        authUser,
      );
      expect(result).toEqual({ success: true });
    });
  });

  describe('createAsset', () => {
    it('delegates to AssetService.createAsset', async () => {
      const assetService = {
        createAsset: jest.fn().mockResolvedValue({ success: true }),
      };
      (controller as any).assetService = assetService;
      const data = {
        asset_ifric_id: 'urn:asset:1',
        company_ifric_id: 'urn:ifric:company-1',
      };
      const authUser = {
        company_ifric_id: 'urn:ifric:company-1',
        user_id: 'u1',
      };

      const result = await controller.createAsset(data as any, authUser);

      expect(assetService.createAsset).toHaveBeenCalledWith(data, authUser);
      expect(result).toEqual({ success: true });
    });
  });
});
