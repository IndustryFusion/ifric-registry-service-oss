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
import { HttpException } from '@nestjs/common';
import axios from 'axios';
import { CompanyService } from './company.service';
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
import { RegisterAuthDto } from '../auth/dto/register-auth.dto';
import { AccessControlService } from 'src/common/access-control.service';

const authorizedUser = {
  company_ifric_id: 'urn:ifric:owner-1',
  user_id: 'caller-1',
};

jest.mock('axios');

describe('CompanyService', () => {
  let service: CompanyService;
  let companyRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let factoryRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let assetRepository: { find: jest.Mock; delete: jest.Mock };
  let companyGateWayRepository: {
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    findOne: jest.Mock;
  };
  let companyServerRepository: {
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    findOne: jest.Mock;
  };
  let companyCategoryRepository: { find: jest.Mock; findOne: jest.Mock };
  let companyCategoryMappingRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let accessGroupRepository: {
    find: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  let userAccessGroupRepository: { delete: jest.Mock };
  let certificateService: { verifyAllCompanyCertificate: jest.Mock };
  let keycloakService: { createUser: jest.Mock };
  let dataSource: { createQueryRunner: jest.Mock };
  let mockQueryRunner: any;
  let idCounter: number;
  let accessControlService: {
    assertCompanyMatch: jest.Mock;
    assertPermission: jest.Mock;
  };

  beforeEach(async () => {
    companyRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn(),
    };

    certificateService = { verifyAllCompanyCertificate: jest.fn() };
    keycloakService = { createUser: jest.fn().mockResolvedValue('kc-user-1') };

    factoryRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    assetRepository = { find: jest.fn(), delete: jest.fn() };
    companyGateWayRepository = {
      create: jest.fn((x) => x),
      save: jest.fn(),
      delete: jest.fn(),
      findOne: jest.fn(),
    };
    companyServerRepository = {
      create: jest.fn((x) => x),
      save: jest.fn(),
      delete: jest.fn(),
      findOne: jest.fn(),
    };
    companyCategoryRepository = { find: jest.fn(), findOne: jest.fn() };
    companyCategoryMappingRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      delete: jest.fn(),
    };
    accessGroupRepository = {
      find: jest.fn(),
      create: jest.fn((x) => x),
      delete: jest.fn(),
    };
    userAccessGroupRepository = { delete: jest.fn() };
    accessControlService = {
      assertCompanyMatch: jest.fn(),
      assertPermission: jest.fn().mockResolvedValue(undefined),
    };

    idCounter = 0;
    const mockManager = {
      create: jest.fn((_entityClass, data) => ({ ...data })),
      save: jest.fn(async (_entityClass, data) => {
        if (Array.isArray(data)) {
          return data.map((d) => ({ ...d, _id: `id-${idCounter++}` }));
        }
        return { ...data, _id: `id-${idCounter++}` };
      }),
      findOne: jest.fn(),
    };
    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
      manager: mockManager,
    };
    dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyService,
        { provide: getRepositoryToken(Company), useValue: companyRepository },
        {
          provide: getRepositoryToken(Asset),
          useValue: assetRepository,
        },
        { provide: getRepositoryToken(Factory), useValue: factoryRepository },
        { provide: getRepositoryToken(CompanyUser), useValue: {} },
        {
          provide: getRepositoryToken(CompanyCategory),
          useValue: companyCategoryRepository,
        },
        {
          provide: getRepositoryToken(CompanyCategoryMapping),
          useValue: companyCategoryMappingRepository,
        },
        {
          provide: getRepositoryToken(CompanyGateWay),
          useValue: companyGateWayRepository,
        },
        {
          provide: getRepositoryToken(CompanyServer),
          useValue: companyServerRepository,
        },
        { provide: getRepositoryToken(Product), useValue: {} },
        {
          provide: getRepositoryToken(AccessGroup),
          useValue: accessGroupRepository,
        },
        {
          provide: getRepositoryToken(UserAccessGroup),
          useValue: userAccessGroupRepository,
        },
        { provide: CertificateService, useValue: certificateService },
        { provide: KeycloakService, useValue: keycloakService },
        { provide: AccessControlService, useValue: accessControlService },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get<CompanyService>(CompanyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addStatusDetail', () => {
    it('looks the company up by company_ifric_id, not the removed external_account_ref field', async () => {
      await service.addStatusDetail({
        company_id: 'urn:ifric:ifx-eur-com-own-1',
        status: 'Verified',
      });

      expect(companyRepository.update).toHaveBeenCalledWith(
        { company_ifric_id: 'urn:ifric:ifx-eur-com-own-1' },
        { company_verified: 'verified' },
      );
    });
  });

  describe('getFactoryById', () => {
    it('returns a null-factory message when no factory matches, without checking access', async () => {
      factoryRepository.findOne.mockResolvedValue(null);

      const result = await service.getFactoryById(
        'urn:ifric:missing',
        authorizedUser,
      );

      expect(result).toEqual({
        factory: null,
        message: 'No factory data found for factory id: urn:ifric:missing',
      });
      expect(accessControlService.assertCompanyMatch).not.toHaveBeenCalled();
    });

    it('checks the caller against the factory owner, then returns the factory', async () => {
      const factory = {
        factory_id: 'urn:ifric:fac-1',
        location_name: 'Plant 1',
        owner_company_ifric_id: 'urn:ifric:owner-1',
      };
      factoryRepository.findOne.mockResolvedValue(factory);

      await expect(
        service.getFactoryById('urn:ifric:fac-1', authorizedUser),
      ).resolves.toBe(factory);
      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        authorizedUser,
        'urn:ifric:owner-1',
      );
    });
  });

  describe('getFactoryOwner', () => {
    it('resolves the factory then looks up its owner company', async () => {
      factoryRepository.findOne.mockResolvedValue({
        owner_company_ifric_id: 'urn:ifric:owner-1',
      });
      const owner = { company_ifric_id: 'urn:ifric:owner-1' };
      companyRepository.findOne.mockResolvedValue(owner);

      await expect(
        service.getFactoryOwner('urn:ifric:fac-1', authorizedUser),
      ).resolves.toBe(owner);
      expect(companyRepository.findOne).toHaveBeenCalledWith({
        where: { company_ifric_id: 'urn:ifric:owner-1' },
      });
    });
  });

  describe('getFactoryProducts', () => {
    it('returns [] without checking access when the factory does not exist', async () => {
      factoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getFactoryProducts('urn:ifric:missing', authorizedUser),
      ).resolves.toEqual([]);
      expect(accessControlService.assertCompanyMatch).not.toHaveBeenCalled();
    });

    it("checks the caller against the factory's owner company", async () => {
      factoryRepository.findOne.mockResolvedValue({
        owner_company_ifric_id: 'urn:ifric:owner-1',
      });
      assetRepository.find.mockResolvedValue([
        { asset_ifric_id: 'urn:asset:1' },
      ]);

      const result = await service.getFactoryProducts(
        'urn:ifric:fac-1',
        authorizedUser,
      );

      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        authorizedUser,
        'urn:ifric:owner-1',
      );
      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        authorizedUser,
        'read',
      );
      expect(result).toEqual(['urn:asset:1']);
    });

    it('rejects when the caller is scoped to a different company', async () => {
      factoryRepository.findOne.mockResolvedValue({
        owner_company_ifric_id: 'urn:ifric:owner-1',
      });
      accessControlService.assertCompanyMatch.mockImplementation(() => {
        throw new Error('company mismatch');
      });

      await expect(
        service.getFactoryProducts('urn:ifric:fac-1', {
          company_ifric_id: 'urn:ifric:other-company',
          user_id: 'user-1',
        }),
      ).rejects.toThrow('company mismatch');
      expect(assetRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('getCompanyDetails', () => {
    it('checks the caller against the requested company before querying', async () => {
      companyRepository.find.mockResolvedValue([
        { company_ifric_id: 'urn:ifric:company-1' },
      ]);

      await service.getCompanyDetails('urn:ifric:company-1', authorizedUser);

      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        authorizedUser,
        'urn:ifric:company-1',
      );
      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        authorizedUser,
        'read',
      );
    });

    it('rejects when the caller is scoped to a different company', async () => {
      accessControlService.assertCompanyMatch.mockImplementation(() => {
        throw new HttpException('Forbidden', 403);
      });

      await expect(
        service.getCompanyDetails('urn:ifric:company-1', {
          company_ifric_id: 'urn:ifric:other-company',
          user_id: 'user-1',
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(companyRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('getCompanyAndUserDetails', () => {
    it('returns [] without checking access when the company does not exist', async () => {
      companyRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getCompanyAndUserDetails('urn:ifric:missing', authorizedUser),
      ).resolves.toEqual([]);
      expect(accessControlService.assertCompanyMatch).not.toHaveBeenCalled();
    });

    it('rejects when the caller is scoped to a different company', async () => {
      companyRepository.findOne.mockResolvedValue({
        _id: 'company-1',
        company_ifric_id: 'urn:ifric:company-1',
      });
      accessControlService.assertCompanyMatch.mockImplementation(() => {
        throw new HttpException('Forbidden', 403);
      });

      await expect(
        service.getCompanyAndUserDetails('urn:ifric:company-1', {
          company_ifric_id: 'urn:ifric:other-company',
          user_id: 'user-1',
        }),
      ).rejects.toMatchObject({ status: 403 });
      expect(companyCategoryMappingRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('createFactory', () => {
    it('throws 404 when owner_company_ifric_id does not resolve to a company', async () => {
      companyRepository.find.mockResolvedValue([]);

      await expect(
        service.createFactory(
          {
            factory_id: 'urn:ifric:fac-1',
            owner_company_ifric_id: 'urn:ifric:missing-owner',
          },
          authorizedUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('throws 409 when the factory_id already exists', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'owner-1' }]);
      factoryRepository.find.mockResolvedValue([
        { factory_id: 'urn:ifric:fac-1' },
      ]);

      await expect(
        service.createFactory(
          {
            factory_id: 'urn:ifric:fac-1',
            owner_company_ifric_id: 'urn:ifric:owner-1',
          },
          authorizedUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('creates the factory when the owner exists and the id is unused', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'owner-1' }]);
      factoryRepository.find.mockResolvedValue([]);
      factoryRepository.save.mockResolvedValue({});

      const result = await service.createFactory(
        {
          factory_id: 'urn:ifric:fac-1',
          owner_company_ifric_id: 'urn:ifric:owner-1',
          location_name: 'Plant 1',
        },
        authorizedUser,
      );

      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        authorizedUser,
        'urn:ifric:owner-1',
      );
      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        authorizedUser,
        'create',
      );
      expect(factoryRepository.save).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        status: 201,
        message: 'Factory created successfully',
      });
    });
  });

  describe('updateFactory', () => {
    it('throws 404 when the factory does not exist', async () => {
      factoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateFactory(
          'urn:ifric:missing',
          { city: 'Munich' },
          authorizedUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('updates the factory when found', async () => {
      factoryRepository.findOne.mockResolvedValue({
        owner_company_ifric_id: 'urn:ifric:owner-1',
      });
      factoryRepository.update.mockResolvedValue({ affected: 1 });

      const result = await service.updateFactory(
        'urn:ifric:fac-1',
        { city: 'Munich' },
        authorizedUser,
      );

      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        authorizedUser,
        'urn:ifric:owner-1',
      );
      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        authorizedUser,
        'update',
      );
      expect(factoryRepository.update).toHaveBeenCalledWith(
        { factory_id: 'urn:ifric:fac-1' },
        { city: 'Munich' },
      );
      expect(result.status).toBe(204);
    });
  });

  describe('deleteFactory', () => {
    it('throws 409 when an asset still references the factory', async () => {
      factoryRepository.findOne.mockResolvedValue({
        owner_company_ifric_id: 'urn:ifric:owner-1',
      });
      assetRepository.find.mockResolvedValue([
        { factory_id: 'urn:ifric:fac-1' },
      ]);

      await expect(
        service.deleteFactory('urn:ifric:fac-1', authorizedUser),
      ).rejects.toThrow(HttpException);
      expect(factoryRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes the factory when no asset references it', async () => {
      factoryRepository.findOne.mockResolvedValue({
        owner_company_ifric_id: 'urn:ifric:owner-1',
      });
      assetRepository.find.mockResolvedValue([]);
      factoryRepository.delete.mockResolvedValue({ affected: 1 });

      await service.deleteFactory('urn:ifric:fac-1', authorizedUser);

      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        authorizedUser,
        'delete',
      );
      expect(factoryRepository.delete).toHaveBeenCalledWith({
        factory_id: 'urn:ifric:fac-1',
      });
    });
  });

  describe('createCompanyAsset', () => {
    beforeEach(() => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
    });

    it('throws 409 when the company does not exist', async () => {
      companyRepository.find.mockResolvedValue([]);

      await expect(
        service.createCompanyAsset(
          {
            type: 'gateway',
            company_ifric_id: 'urn:ifric:missing',
            gateway_ifric_id: 'urn:gateway:1',
          },
          authorizedUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when type is "gateway" but gateway_ifric_id is missing', async () => {
      await expect(
        service.createCompanyAsset(
          {
            type: 'gateway',
            company_ifric_id: 'urn:ifric:company-1',
          },
          authorizedUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when type is "server" but server_ifric_id is missing', async () => {
      await expect(
        service.createCompanyAsset(
          {
            type: 'server',
            company_ifric_id: 'urn:ifric:company-1',
          },
          authorizedUser,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 for an unknown/missing type instead of silently creating a server', async () => {
      await expect(
        service.createCompanyAsset(
          {
            type: undefined as any,
            company_ifric_id: 'urn:ifric:company-1',
          },
          authorizedUser,
        ),
      ).rejects.toThrow(HttpException);
      expect(companyServerRepository.create).not.toHaveBeenCalled();
    });

    it('creates a gateway when type is "gateway", after checking company-scoped RBAC', async () => {
      companyGateWayRepository.save.mockResolvedValue({});

      await service.createCompanyAsset(
        {
          type: 'gateway',
          company_ifric_id: 'urn:ifric:company-1',
          gateway_ifric_id: 'urn:gateway:1',
        },
        authorizedUser,
      );

      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        authorizedUser,
        'urn:ifric:company-1',
      );
      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        authorizedUser,
        'create',
      );
      expect(companyGateWayRepository.create).toHaveBeenCalledWith({
        company_id: 'company-1',
        gateway_ifric_id: 'urn:gateway:1',
      });
    });
  });

  describe('createCompany', () => {
    const baseDto: RegisterAuthDto = {
      industry: 'Manufacturing',
      company_name: 'Acme Co',
      registration_number: 'REG-1',
      company_ifric_id: '',
      address_1: '123 Main St',
      city: 'Berlin',
      country: 'Germany',
      zip: '10115',
      admin_name: 'Admin Person',
      position: 'CEO',
      email: 'admin@acme.example',
      password: '',
      company_size: '10-50',
      company_category: 'manufacturer',
      meta_data: {},
      company_domain: 'acme.example',
      newsLetter: false,
      company_logo: '',
      company_image: '',
    };

    beforeEach(() => {
      companyRepository.find.mockResolvedValue([]); // no existing company by email/name
      (axios.post as jest.Mock).mockResolvedValue({
        data: { status: '201', urn_id: 'urn:ifric:new-company-1' },
      });
      mockQueryRunner.manager.findOne.mockImplementation(
        (entityClass: any, options: any) => {
          if (entityClass === CompanyCategory) {
            return Promise.resolve({
              _id: 'category-1',
              category_name: options.where.category_name,
            });
          }
          if (entityClass === CompanyUser) {
            return Promise.resolve(null); // no existing admin user
          }
          if (entityClass === AccessGroup) {
            return Promise.resolve({ _id: 'ag-admin', group_name: 'admin' });
          }
          return Promise.resolve(null);
        },
      );
    });

    it('returns company_ifric_id in the success response', async () => {
      const result = await service.createCompany({ ...baseDto });

      expect(result).toMatchObject({
        success: true,
        status: 201,
        company_ifric_id: 'urn:ifric:new-company-1',
      });
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('grants the new admin exactly one UserAccessGroup row, not a per-product loop', async () => {
      await service.createCompany({ ...baseDto });

      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        UserAccessGroup,
        expect.objectContaining({ access_group_id: 'ag-admin' }),
      );
      expect(mockQueryRunner.manager.save).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([
          expect.objectContaining({ access_group_id: 'ag-admin' }),
          expect.objectContaining({ access_group_id: 'ag-admin' }),
        ]),
      );
    });

    it('provisions the admin user in Keycloak instead of a local hash/refresh token', async () => {
      await service.createCompany({ ...baseDto });

      expect(keycloakService.createUser).toHaveBeenCalledWith(
        baseDto.email,
        baseDto.admin_name,
        expect.any(String),
        {
          company_ifric_id: 'urn:ifric:new-company-1',
          user_id: expect.any(String),
        },
      );
      expect(mockQueryRunner.manager.create).not.toHaveBeenCalledWith(
        CompanyUser,
        expect.objectContaining({ user_password: expect.anything() }),
      );
      expect(mockQueryRunner.manager.create).not.toHaveBeenCalledWith(
        CompanyUser,
        expect.objectContaining({ jwt_token: expect.anything() }),
      );
    });

    it('stamps the same pre-generated user_id onto both Keycloak and the CompanyUser row', async () => {
      await service.createCompany({ ...baseDto });

      const [, , , attributes] = keycloakService.createUser.mock.calls[0];
      expect(mockQueryRunner.manager.create).toHaveBeenCalledWith(
        CompanyUser,
        expect.objectContaining({ _id: attributes.user_id }),
      );
    });

    it('rolls back the whole transaction and compensates ICID when the category is invalid', async () => {
      mockQueryRunner.manager.findOne.mockImplementation((entityClass: any) => {
        if (entityClass === CompanyCategory) return Promise.resolve(null);
        return Promise.resolve(null);
      });

      await expect(service.createCompany({ ...baseDto })).rejects.toThrow(
        HttpException,
      );

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(axios.delete).toHaveBeenCalledWith(
        expect.stringContaining('urn:ifric:new-company-1'),
        expect.any(Object),
      );
    });
  });

  describe('updateCompany', () => {
    const mockCompany = {
      _id: 'company-1',
      company_ifric_id: 'urn:ifric:company-1',
    };

    beforeEach(() => {
      companyRepository.find.mockResolvedValue([mockCompany]);
    });

    it('checks the caller against the target company before updating', async () => {
      await service.updateCompany(
        'urn:ifric:company-1',
        { company_name: 'Renamed Co' } as unknown as RegisterAuthDto,
        authorizedUser,
      );

      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        authorizedUser,
        'urn:ifric:company-1',
      );
      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        authorizedUser,
        'update',
      );
    });

    it('re-points an existing category mapping when company_category changes', async () => {
      companyCategoryRepository.findOne.mockResolvedValue({
        _id: 'cat-machine-builder',
        category_name: 'machine_builder',
      });
      companyCategoryMappingRepository.findOne.mockResolvedValue({
        _id: 'mapping-1',
        category_id: 'cat-manufacturer',
        company_id: 'company-1',
      });

      await service.updateCompany(
        'urn:ifric:company-1',
        { company_category: 'machine_builder' } as unknown as RegisterAuthDto,
        authorizedUser,
      );

      expect(companyCategoryMappingRepository.update).toHaveBeenCalledWith(
        { _id: 'mapping-1' },
        { category_id: 'cat-machine-builder' },
      );
      expect(companyCategoryMappingRepository.save).not.toHaveBeenCalled();
    });

    it('creates a mapping row when the company has none yet', async () => {
      companyCategoryRepository.findOne.mockResolvedValue({
        _id: 'cat-machine-builder',
        category_name: 'machine_builder',
      });
      companyCategoryMappingRepository.findOne.mockResolvedValue(null);

      await service.updateCompany(
        'urn:ifric:company-1',
        { company_category: 'machine_builder' } as unknown as RegisterAuthDto,
        authorizedUser,
      );

      expect(companyCategoryMappingRepository.save).toHaveBeenCalledWith({
        category_id: 'cat-machine-builder',
        company_id: 'company-1',
      });
    });

    it('rejects an unknown company_category without touching the mapping', async () => {
      companyCategoryRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateCompany(
          'urn:ifric:company-1',
          {
            company_category: 'not_a_real_category',
          } as unknown as RegisterAuthDto,
          authorizedUser,
        ),
      ).rejects.toThrow(HttpException);

      expect(companyCategoryMappingRepository.update).not.toHaveBeenCalled();
      expect(companyCategoryMappingRepository.save).not.toHaveBeenCalled();
      expect(companyRepository.update).not.toHaveBeenCalled();
    });

    it('skips category handling entirely when company_category is omitted', async () => {
      await service.updateCompany(
        'urn:ifric:company-1',
        { company_name: 'Renamed Co' } as unknown as RegisterAuthDto,
        authorizedUser,
      );

      expect(companyCategoryRepository.findOne).not.toHaveBeenCalled();
      expect(companyCategoryMappingRepository.findOne).not.toHaveBeenCalled();
      expect(companyRepository.update).toHaveBeenCalledWith(
        { _id: 'company-1' },
        { company_name: 'Renamed Co' },
      );
    });
  });

  describe('getCompanyCategories', () => {
    it('returns every seeded company category row', async () => {
      const categories = [
        { _id: 'cat-1', category_name: 'manufacturer' },
        { _id: 'cat-2', category_name: 'machine_builder' },
        { _id: 'cat-3', category_name: 'factory_owner' },
      ];
      companyCategoryRepository.find.mockResolvedValue(categories);

      const result = await service.getCompanyCategories();

      expect(companyCategoryRepository.find).toHaveBeenCalledWith();
      expect(result).toEqual(categories);
    });
  });

  describe('getAllCompanies', () => {
    const mockCompany = {
      _id: 'company-1',
      company_ifric_id: 'urn:ifric:company-1',
      company_name: 'Acme',
      company_image: null,
      address_1: 'Addr 1',
      city: 'Berlin',
      country: 'Germany',
      industry: 'Manufacturing',
      company_verified: 'new',
    };

    beforeEach(() => {
      companyRepository.find.mockResolvedValue([mockCompany]);
      companyCategoryMappingRepository.find.mockResolvedValue([]);
      companyCategoryRepository.find.mockResolvedValue([]);
    });

    it('skips the certificate check entirely when certificates are disabled', async () => {
      (service as any).certificatesEnabled = false;

      const result = await service.getAllCompanies();

      expect(
        certificateService.verifyAllCompanyCertificate,
      ).not.toHaveBeenCalled();
      expect(result).toEqual([
        expect.objectContaining({
          company_ifric_id: 'urn:ifric:company-1',
          company_cert: false,
        }),
      ]);
    });

    it('sets company_cert from the verification response when certificates are enabled and succeed', async () => {
      (service as any).certificatesEnabled = true;
      certificateService.verifyAllCompanyCertificate.mockResolvedValue({
        'urn:ifric:company-1': true,
      });

      const result = await service.getAllCompanies();

      expect(
        certificateService.verifyAllCompanyCertificate,
      ).toHaveBeenCalledWith(['urn:ifric:company-1']);
      expect(result).toEqual([
        expect.objectContaining({
          company_ifric_id: 'urn:ifric:company-1',
          company_cert: true,
        }),
      ]);
    });

    it('degrades to company_cert: false instead of throwing when certificates are enabled but the call fails', async () => {
      (service as any).certificatesEnabled = true;
      certificateService.verifyAllCompanyCertificate.mockRejectedValue(
        new Error('ICID unreachable'),
      );

      const result = await service.getAllCompanies();

      expect(result).toEqual([
        expect.objectContaining({
          company_ifric_id: 'urn:ifric:company-1',
          company_cert: false,
        }),
      ]);
    });
  });

  describe('deleteCompany', () => {
    it('checks the caller against the target company before deleting', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      const companyUserRepo = (service as any).companyUserRepository;
      companyUserRepo.find = jest.fn().mockResolvedValue([]);
      companyUserRepo.delete = jest.fn();
      companyRepository.delete.mockResolvedValue({ affected: 1 });

      await service.deleteCompany('urn:ifric:company-1', authorizedUser);

      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        authorizedUser,
        'urn:ifric:company-1',
      );
      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        authorizedUser,
        'delete',
      );
    });

    it('fetches users before deleting them so UserAccessGroup rows are actually cascade-deleted (bug fix)', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      const companyUserRepo = (service as any).companyUserRepository;
      companyUserRepo.find = jest
        .fn()
        .mockResolvedValue([{ _id: 'user-1' }, { _id: 'user-2' }]);
      companyUserRepo.delete = jest.fn();
      companyRepository.delete.mockResolvedValue({ affected: 1 });

      await service.deleteCompany('urn:ifric:company-1', authorizedUser);

      expect(userAccessGroupRepository.delete).toHaveBeenCalledWith({
        user_id: 'user-1',
      });
      expect(userAccessGroupRepository.delete).toHaveBeenCalledWith({
        user_id: 'user-2',
      });
      expect(assetRepository.delete).toHaveBeenCalledWith({
        company_id: 'company-1',
      });
      // Fixed: deletes by the resolved internal _id, not the raw
      // company_ifric_id parameter.
      expect(companyRepository.delete).toHaveBeenCalledWith({
        _id: 'company-1',
      });
    });
  });
});
