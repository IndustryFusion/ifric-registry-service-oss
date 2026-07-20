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
import { HttpException } from '@nestjs/common';
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

describe('ProductService', () => {
  let service: ProductService;
  let companyRepository: { find: jest.Mock; findOne: jest.Mock };
  let companyUserRepository: { find: jest.Mock };
  let companyTwinRepository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    query: jest.Mock;
  };
  let productRepository: { find: jest.Mock };
  let accessGroupRepository: { find: jest.Mock };
  let companyProductRepository: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    query: jest.Mock;
    delete: jest.Mock;
  };
  let userProductAccessGroupRepository: { find: jest.Mock };
  let factoryRepository: { find: jest.Mock };

  beforeEach(async () => {
    companyRepository = { find: jest.fn(), findOne: jest.fn() };
    companyUserRepository = { find: jest.fn() };

    companyTwinRepository = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      query: jest.fn(),
    };

    productRepository = { find: jest.fn() };
    accessGroupRepository = { find: jest.fn() };

    companyProductRepository = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((x) => x),
      save: jest.fn(),
      query: jest.fn(),
      delete: jest.fn(),
    };

    userProductAccessGroupRepository = { find: jest.fn() };
    factoryRepository = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: getRepositoryToken(Company), useValue: companyRepository },
        {
          provide: getRepositoryToken(CompanyUser),
          useValue: companyUserRepository,
        },
        {
          provide: getRepositoryToken(CompanyTwin),
          useValue: companyTwinRepository,
        },
        {
          provide: getRepositoryToken(CompanyProduct),
          useValue: companyProductRepository,
        },
        { provide: getRepositoryToken(Product), useValue: productRepository },
        {
          provide: getRepositoryToken(AccessGroup),
          useValue: accessGroupRepository,
        },
        {
          provide: getRepositoryToken(UserProductAccessGroup),
          useValue: userProductAccessGroupRepository,
        },
        { provide: getRepositoryToken(Factory), useValue: factoryRepository },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProductCompany', () => {
    it('returns a null-company message when no twin matches the URN', async () => {
      companyTwinRepository.findOne.mockResolvedValue(null);

      const result = await service.getProductCompany('urn:product:missing');

      expect(result).toEqual({
        company: null,
        message: 'No company data found for product URN: urn:product:missing',
      });
    });

    it('resolves the manufacturer company via the twin', async () => {
      companyTwinRepository.findOne.mockResolvedValue({
        manufacturer_company_id: 'mfg-1',
      });
      const company = { company_name: 'Acme Manufacturing' };
      companyRepository.findOne.mockResolvedValue(company);

      await expect(
        service.getProductCompany('urn:product:widget'),
      ).resolves.toBe(company);
      expect(companyRepository.findOne).toHaveBeenCalledWith({
        where: { _id: 'mfg-1' },
      });
    });
  });

  describe('getProductOwner', () => {
    it('resolves the owner company via the twin', async () => {
      companyTwinRepository.findOne.mockResolvedValue({
        owner_company_id: 'own-1',
      });
      const owner = { company_name: 'Acme Factory Owner' };
      companyRepository.findOne.mockResolvedValue(owner);

      await expect(service.getProductOwner('urn:product:widget')).resolves.toBe(
        owner,
      );
      expect(companyRepository.findOne).toHaveBeenCalledWith({
        where: { _id: 'own-1' },
      });
    });
  });

  describe('addCompanyProduct', () => {
    it('throws 404 when the company does not exist', async () => {
      companyRepository.find.mockResolvedValue([]);

      await expect(
        service.addCompanyProduct({
          company_ifric_id: 'urn:ifric:missing',
          product_ifric_id: 'urn:product:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when product_ifric_id is missing', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);

      await expect(
        service.addCompanyProduct({
          company_ifric_id: 'urn:ifric:company-1',
          product_ifric_id: '',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 409 when the product is already tagged to the company', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      companyProductRepository.find.mockResolvedValue([
        { _id: 'existing-tag' },
      ]);

      await expect(
        service.addCompanyProduct({
          company_ifric_id: 'urn:ifric:company-1',
          product_ifric_id: 'urn:product:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('tags the product by product_ifric_id directly, with no catalog lookup or RBAC grant', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      companyProductRepository.find.mockResolvedValue([]);
      companyProductRepository.save.mockResolvedValue({});

      const result = await service.addCompanyProduct({
        company_ifric_id: 'urn:ifric:company-1',
        product_ifric_id: 'urn:product:widget',
        billing_id: 'BILL-1',
      });

      expect(companyProductRepository.create).toHaveBeenCalledWith({
        product_ifric_id: 'urn:product:widget',
        company_id: 'company-1',
        billing_id: 'BILL-1',
      });
      expect(companyProductRepository.save).toHaveBeenCalled();
      expect(productRepository.find).not.toHaveBeenCalled();
      expect(userProductAccessGroupRepository.find).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        status: 201,
        message: 'Product added successfully',
      });
    });
  });

  describe('updateCompanyProduct', () => {
    it('throws 404 when the company does not exist', async () => {
      companyRepository.find.mockResolvedValue([]);

      await expect(
        service.updateCompanyProduct('urn:ifric:missing', {
          product_ifric_id: 'urn:product:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when product_ifric_id is missing', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);

      await expect(
        service.updateCompanyProduct('urn:ifric:company-1', {
          product_ifric_id: '',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('upserts the company product tag keyed on company_id + product_ifric_id', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      companyProductRepository.query.mockResolvedValue({});

      const result = await service.updateCompanyProduct('urn:ifric:company-1', {
        product_ifric_id: 'urn:product:widget',
      });

      expect(companyProductRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        [expect.any(String), 'company-1', 'urn:product:widget'],
      );
      expect(result.status).toBe(200);
    });
  });

  describe('getCompanyProducts', () => {
    it('throws 404 when the company does not exist', async () => {
      companyRepository.find.mockResolvedValue([]);

      await expect(
        service.getCompanyProducts('urn:ifric:missing'),
      ).rejects.toThrow(HttpException);
    });

    it('returns the CompanyProduct rows directly, with no catalog join', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      const tags = [{ product_ifric_id: 'urn:product:widget' }];
      companyProductRepository.find.mockResolvedValue(tags);

      const result = await service.getCompanyProducts('urn:ifric:company-1');

      expect(companyProductRepository.find).toHaveBeenCalledWith({
        where: { company_id: 'company-1' },
      });
      expect(result).toBe(tags);
    });
  });

  describe('createCompanyTwin', () => {
    it('throws 400 when required fields are missing', async () => {
      await expect(
        service.createCompanyTwin({
          manufacturer_ifric_id: 'urn:ifric:mfg',
          owner_company_ifric_id: '',
          asset_ifric_id: 'urn:asset:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when the manufacturer company is invalid', async () => {
      companyRepository.find.mockResolvedValueOnce([]); // manufacturer lookup

      await expect(
        service.createCompanyTwin({
          manufacturer_ifric_id: 'urn:ifric:mfg',
          owner_company_ifric_id: 'urn:ifric:owner',
          asset_ifric_id: 'urn:asset:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when the owner company is invalid', async () => {
      companyRepository.find
        .mockResolvedValueOnce([{ _id: 'mfg-1' }]) // manufacturer lookup
        .mockResolvedValueOnce([]); // owner lookup

      await expect(
        service.createCompanyTwin({
          manufacturer_ifric_id: 'urn:ifric:mfg',
          owner_company_ifric_id: 'urn:ifric:owner',
          asset_ifric_id: 'urn:asset:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when factory_id does not resolve to an existing factory', async () => {
      companyRepository.find
        .mockResolvedValueOnce([{ _id: 'mfg-1' }])
        .mockResolvedValueOnce([{ _id: 'owner-1' }]);
      factoryRepository.find.mockResolvedValue([]);

      await expect(
        service.createCompanyTwin({
          manufacturer_ifric_id: 'urn:ifric:mfg',
          owner_company_ifric_id: 'urn:ifric:owner',
          asset_ifric_id: 'urn:asset:widget',
          factory_id: 'urn:factory:missing',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('sets owner_company_id from the OWNER lookup, not the manufacturer (core bug fix)', async () => {
      // Manufacturer and owner are looked up by two separate company_ifric_id
      // filters and must resolve to two different ids — this is the
      // regression test for the bug where owner was always forced equal to
      // manufacturer.
      companyRepository.find
        .mockResolvedValueOnce([{ _id: 'mfg-id' }])
        .mockResolvedValueOnce([{ _id: 'owner-id' }]);
      companyTwinRepository.save.mockResolvedValue({});

      await service.createCompanyTwin({
        manufacturer_ifric_id: 'urn:ifric:mfg',
        owner_company_ifric_id: 'urn:ifric:owner',
        asset_ifric_id: 'urn:asset:widget',
      });

      expect(companyTwinRepository.create).toHaveBeenCalledWith({
        manufacturer_company_id: 'mfg-id',
        owner_company_id: 'owner-id',
        asset_ifric_id: 'urn:asset:widget',
      });
      expect(companyTwinRepository.save).toHaveBeenCalled();
    });

    it('wires a valid factory_id onto the created twin', async () => {
      companyRepository.find
        .mockResolvedValueOnce([{ _id: 'mfg-1' }])
        .mockResolvedValueOnce([{ _id: 'owner-1' }]);
      factoryRepository.find.mockResolvedValue([
        { factory_id: 'urn:factory:1' },
      ]);
      companyTwinRepository.save.mockResolvedValue({});

      await service.createCompanyTwin({
        manufacturer_ifric_id: 'urn:ifric:mfg',
        owner_company_ifric_id: 'urn:ifric:owner',
        asset_ifric_id: 'urn:asset:widget',
        factory_id: 'urn:factory:1',
      });

      expect(companyTwinRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ factory_id: 'urn:factory:1' }),
      );
    });
  });

  describe('updateCompanyTwin', () => {
    it('throws 404 when the owner company is invalid', async () => {
      companyRepository.find.mockResolvedValueOnce([]); // owner lookup

      await expect(
        service.updateCompanyTwin({
          owner_company_ifric_id: 'urn:ifric:owner',
          manufacturer_ifric_id: 'urn:ifric:mfg',
          asset_ifric_id: 'urn:asset:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 404 when the manufacturer company is invalid (previously unguarded)', async () => {
      companyRepository.find
        .mockResolvedValueOnce([{ _id: 'owner-1' }]) // owner lookup
        .mockResolvedValueOnce([]); // manufacturer lookup

      await expect(
        service.updateCompanyTwin({
          owner_company_ifric_id: 'urn:ifric:owner',
          manufacturer_ifric_id: 'urn:ifric:mfg',
          asset_ifric_id: 'urn:asset:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('upserts owner_company_id and factory_id keyed on manufacturer_company_id + asset_ifric_id', async () => {
      companyRepository.find
        .mockResolvedValueOnce([{ _id: 'owner-1' }])
        .mockResolvedValueOnce([{ _id: 'mfg-1' }]);
      factoryRepository.find.mockResolvedValue([
        { factory_id: 'urn:factory:1' },
      ]);
      companyTwinRepository.query.mockResolvedValue({});

      const result = await service.updateCompanyTwin({
        owner_company_ifric_id: 'urn:ifric:owner',
        manufacturer_ifric_id: 'urn:ifric:mfg',
        asset_ifric_id: 'urn:asset:widget',
        factory_id: 'urn:factory:1',
      });

      expect(companyTwinRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        [
          expect.any(String),
          'mfg-1',
          'urn:asset:widget',
          'owner-1',
          'urn:factory:1',
        ],
      );
      expect(result.status).toBe(204);
    });
  });

  describe('deleteCompanyProduct', () => {
    it('deletes only the CompanyProduct row, no dead UserProductAccessGroup cleanup', async () => {
      companyProductRepository.delete.mockResolvedValue({});

      await service.deleteCompanyProduct('company-product-id');

      expect(companyProductRepository.delete).toHaveBeenCalledWith({
        _id: 'company-product-id',
      });
      expect(userProductAccessGroupRepository.find).not.toHaveBeenCalled();
    });
  });
});
