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
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { HttpException } from '@nestjs/common';
import axios from 'axios';
import { CompanyService } from './company.service';
import { Company } from 'src/schemas/company.schema';
import { CompanyTwin } from 'src/schemas/company_twin.schema';
import { Factory } from 'src/schemas/factory.schema';
import { CompanyUser } from 'src/schemas/company_user.schema';
import { CompanyCategory } from 'src/schemas/company_category.schema';
import { CompanyCategoryMapping } from 'src/schemas/company_category_mapping.schema';
import { CompanyAsset } from 'src/schemas/company_asset.schema';
import { CompanyGateWay } from 'src/schemas/company_gateway.schema';
import { CompanyServer } from 'src/schemas/company_server.schema';
import { CompanyProduct } from 'src/schemas/company_product.schema';
import { Product } from 'src/schemas/products.schema';
import { AccessGroup } from 'src/schemas/access_group.schema';
import { UserProductAccessGroup } from 'src/schemas/user_product_access_group.schema';
import { CertificateService } from '../certificate/certificate.service';

jest.mock('axios');

describe('CompanyService', () => {
  let service: CompanyService;
  let companyModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    aggregate: jest.Mock;
  } & jest.Mock;
  let factoryModel: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
    deleteOne: jest.Mock;
  } & jest.Mock;
  let companyTwinModel: { find: jest.Mock };
  let companyAssetModel: jest.Mock;
  let companyGateWayModel: jest.Mock;
  let companyServerModel: jest.Mock;
  let companyCategoryModel: { findOne: jest.Mock };
  let companyCategoryMappingModel: jest.Mock;
  let companyProductModel: jest.Mock;
  let accessGroupModel: { insertMany: jest.Mock };
  let connection: { startSession: jest.Mock };
  let certificateService: { verifyAllCompanyCertificate: jest.Mock };

  beforeEach(async () => {
    companyModel = jest.fn() as any;
    companyModel.find = jest.fn();
    companyModel.findOne = jest.fn();
    companyModel.findOneAndUpdate = jest.fn();
    companyModel.aggregate = jest.fn();

    certificateService = { verifyAllCompanyCertificate: jest.fn() };

    factoryModel = jest.fn() as any;
    factoryModel.find = jest.fn();
    factoryModel.findOne = jest.fn();
    factoryModel.findOneAndUpdate = jest.fn();
    factoryModel.deleteOne = jest.fn();

    companyTwinModel = { find: jest.fn() };
    companyAssetModel = jest.fn();
    companyGateWayModel = jest.fn();
    companyServerModel = jest.fn();
    companyCategoryModel = { findOne: jest.fn() };
    companyCategoryMappingModel = jest.fn();
    companyProductModel = jest.fn();
    accessGroupModel = { insertMany: jest.fn() };

    const session = {
      withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()),
      endSession: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
    };
    connection = { startSession: jest.fn().mockResolvedValue(session) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompanyService,
        { provide: getModelToken(Company.name), useValue: companyModel },
        {
          provide: getModelToken(CompanyTwin.name),
          useValue: companyTwinModel,
        },
        { provide: getModelToken(Factory.name), useValue: factoryModel },
        { provide: getModelToken(CompanyUser.name), useValue: {} },
        {
          provide: getModelToken(CompanyCategory.name),
          useValue: companyCategoryModel,
        },
        {
          provide: getModelToken(CompanyCategoryMapping.name),
          useValue: companyCategoryMappingModel,
        },
        {
          provide: getModelToken(CompanyAsset.name),
          useValue: companyAssetModel,
        },
        {
          provide: getModelToken(CompanyGateWay.name),
          useValue: companyGateWayModel,
        },
        {
          provide: getModelToken(CompanyServer.name),
          useValue: companyServerModel,
        },
        {
          provide: getModelToken(CompanyProduct.name),
          useValue: companyProductModel,
        },
        { provide: getModelToken(Product.name), useValue: {} },
        {
          provide: getModelToken(AccessGroup.name),
          useValue: accessGroupModel,
        },
        { provide: getModelToken(UserProductAccessGroup.name), useValue: {} },
        { provide: CertificateService, useValue: certificateService },
        { provide: JwtService, useValue: {} },
        { provide: getConnectionToken(), useValue: connection },
      ],
    }).compile();

    service = module.get<CompanyService>(CompanyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addStatusDetail', () => {
    it('looks the company up by company_ifric_id, not the removed external_account_ref field', async () => {
      companyModel.findOneAndUpdate.mockResolvedValue({});

      await service.addStatusDetail({
        company_id: 'urn:ifric:ifx-eur-com-own-1',
        status: 'Verified',
      });

      expect(companyModel.findOneAndUpdate).toHaveBeenCalledWith(
        { company_ifric_id: 'urn:ifric:ifx-eur-com-own-1' },
        { company_verified: 'verified' },
        { new: true },
      );
    });
  });

  describe('getFactoryById', () => {
    it('returns a null-factory message when no factory matches', async () => {
      factoryModel.findOne.mockResolvedValue(null);

      const result = await service.getFactoryById('urn:ifric:missing');

      expect(result).toEqual({
        factory: null,
        message: 'No factory data found for factory id: urn:ifric:missing',
      });
    });

    it('returns the factory document when found', async () => {
      const factory = {
        factory_id: 'urn:ifric:fac-1',
        location_name: 'Plant 1',
      };
      factoryModel.findOne.mockResolvedValue(factory);

      await expect(service.getFactoryById('urn:ifric:fac-1')).resolves.toBe(
        factory,
      );
    });
  });

  describe('getFactoryOwner', () => {
    it('resolves the factory then looks up its owner company', async () => {
      factoryModel.findOne.mockResolvedValue({
        owner_company_ifric_id: 'urn:ifric:owner-1',
      });
      const owner = { company_ifric_id: 'urn:ifric:owner-1' };
      companyModel.findOne.mockResolvedValue(owner);

      await expect(service.getFactoryOwner('urn:ifric:fac-1')).resolves.toBe(
        owner,
      );
      expect(companyModel.findOne).toHaveBeenCalledWith({
        company_ifric_id: 'urn:ifric:owner-1',
      });
    });
  });

  describe('createFactory', () => {
    it('throws 404 when owner_company_ifric_id does not resolve to a company', async () => {
      companyModel.find.mockResolvedValue([]);

      await expect(
        service.createFactory({
          factory_id: 'urn:ifric:fac-1',
          owner_company_ifric_id: 'urn:ifric:missing-owner',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 409 when the factory_id already exists', async () => {
      companyModel.find.mockResolvedValue([{ id: 'owner-1' }]);
      factoryModel.find.mockResolvedValue([{ factory_id: 'urn:ifric:fac-1' }]);

      await expect(
        service.createFactory({
          factory_id: 'urn:ifric:fac-1',
          owner_company_ifric_id: 'urn:ifric:owner-1',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('creates the factory when the owner exists and the id is unused', async () => {
      companyModel.find.mockResolvedValue([{ id: 'owner-1' }]);
      factoryModel.find.mockResolvedValue([]);
      const save = jest.fn().mockResolvedValue({});
      factoryModel.mockReturnValue({ save });

      const result = await service.createFactory({
        factory_id: 'urn:ifric:fac-1',
        owner_company_ifric_id: 'urn:ifric:owner-1',
        location_name: 'Plant 1',
      });

      expect(save).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        status: 201,
        message: 'Factory created successfully',
      });
    });
  });

  describe('updateFactory', () => {
    it('throws 404 when the factory does not exist', async () => {
      factoryModel.findOneAndUpdate.mockResolvedValue(null);

      await expect(
        service.updateFactory('urn:ifric:missing', { city: 'Munich' }),
      ).rejects.toThrow(HttpException);
    });

    it('updates the factory when found', async () => {
      factoryModel.findOneAndUpdate.mockResolvedValue({ city: 'Munich' });

      const result = await service.updateFactory('urn:ifric:fac-1', {
        city: 'Munich',
      });

      expect(factoryModel.findOneAndUpdate).toHaveBeenCalledWith(
        { factory_id: 'urn:ifric:fac-1' },
        { city: 'Munich' },
        { new: true },
      );
      expect(result.status).toBe(204);
    });
  });

  describe('deleteFactory', () => {
    it('throws 409 when a company twin still references the factory', async () => {
      companyTwinModel.find.mockResolvedValue([
        { factory_id: 'urn:ifric:fac-1' },
      ]);

      await expect(service.deleteFactory('urn:ifric:fac-1')).rejects.toThrow(
        HttpException,
      );
      expect(factoryModel.deleteOne).not.toHaveBeenCalled();
    });

    it('deletes the factory when no twin references it', async () => {
      companyTwinModel.find.mockResolvedValue([]);
      factoryModel.deleteOne.mockResolvedValue({ deletedCount: 1 });

      await service.deleteFactory('urn:ifric:fac-1');

      expect(factoryModel.deleteOne).toHaveBeenCalledWith({
        factory_id: 'urn:ifric:fac-1',
      });
    });
  });

  describe('createCompanyAsset', () => {
    beforeEach(() => {
      companyModel.find.mockResolvedValue([{ id: 'company-1' }]);
    });

    it('throws 409 when the company does not exist', async () => {
      companyModel.find.mockResolvedValue([]);

      await expect(
        service.createCompanyAsset({
          type: 'asset',
          company_ifric_id: 'urn:ifric:missing',
          asset_ifric_id: 'urn:asset:1',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when type is "asset" but asset_ifric_id is missing', async () => {
      await expect(
        service.createCompanyAsset({
          type: 'asset',
          company_ifric_id: 'urn:ifric:company-1',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when type is "gateway" but gateway_ifric_id is missing', async () => {
      await expect(
        service.createCompanyAsset({
          type: 'gateway',
          company_ifric_id: 'urn:ifric:company-1',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when type is "server" but server_ifric_id is missing', async () => {
      await expect(
        service.createCompanyAsset({
          type: 'server',
          company_ifric_id: 'urn:ifric:company-1',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 for an unknown/missing type instead of silently creating a server', async () => {
      await expect(
        service.createCompanyAsset({
          type: undefined as any,
          company_ifric_id: 'urn:ifric:company-1',
        }),
      ).rejects.toThrow(HttpException);
      expect(companyServerModel).not.toHaveBeenCalled();
    });

    it('creates a CompanyAsset when type is "asset"', async () => {
      const save = jest.fn().mockResolvedValue({});
      companyAssetModel.mockReturnValue({ save });

      await service.createCompanyAsset({
        type: 'asset',
        company_ifric_id: 'urn:ifric:company-1',
        asset_ifric_id: 'urn:asset:1',
      });

      expect(companyAssetModel).toHaveBeenCalledWith({
        company_id: 'company-1',
        asset_ifric_id: 'urn:asset:1',
      });
      expect(companyGateWayModel).not.toHaveBeenCalled();
      expect(companyServerModel).not.toHaveBeenCalled();
    });
  });

  describe('createCompany', () => {
    const baseDto = {
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
      companyModel.find.mockResolvedValue([]); // no existing company by email/name
      companyModel.mockReturnValue({
        save: jest.fn().mockResolvedValue({ id: 'company-mongo-id' }),
      });
      companyCategoryModel.findOne.mockReturnValue({
        session: jest.fn().mockResolvedValue({ id: 'category-1' }),
      });
      companyCategoryMappingModel.mockReturnValue({
        save: jest.fn().mockResolvedValue({ id: 'mapping-1' }),
      });
      let productSeq = 0;
      companyProductModel.mockImplementation(() => ({
        save: jest
          .fn()
          .mockResolvedValue({ id: `company-product-${productSeq++}` }),
      }));
      accessGroupModel.insertMany.mockResolvedValue([
        { id: 'ag-read-only' },
        { id: 'ag-admin' },
      ]);
      (axios.post as jest.Mock).mockResolvedValue({
        data: { status: '201', urn_id: 'urn:ifric:new-company-1' },
      });
      jest.spyOn(service as any, 'createAdminUser').mockResolvedValue({
        status: 201,
        userId: 'user-1',
        productAccessGroupIds: [],
      });
    });

    it('returns company_ifric_id in the success response', async () => {
      const result = await service.createCompany({ ...baseDto });

      expect(result).toMatchObject({
        success: true,
        status: 201,
        company_ifric_id: 'urn:ifric:new-company-1',
      });
    });

    it('links default products directly by product_ifric_id, with no local Product catalog lookup', async () => {
      await service.createCompany({ ...baseDto });

      // Every DEFAULT_PRODUCT_NAMES entry is linked without ever querying a
      // Product catalog collection — creation cannot fail on missing seed
      // data, unlike the old behavior which threw INTERNAL_SERVER_ERROR.
      expect(companyProductModel).toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: 'company-mongo-id',
          product_ifric_id: expect.any(String),
        }),
      );
      expect(companyProductModel).not.toHaveBeenCalledWith(
        expect.objectContaining({ product_id: expect.anything() }),
      );
    });
  });

  describe('getAllCompanies', () => {
    const aggregateResult = [{ company_ifric_id: 'urn:ifric:company-1' }];

    beforeEach(() => {
      companyModel.aggregate.mockResolvedValue(aggregateResult);
    });

    it('skips the certificate check entirely when certificates are disabled', async () => {
      (service as any).certificatesEnabled = false;

      const result = await service.getAllCompanies();

      expect(
        certificateService.verifyAllCompanyCertificate,
      ).not.toHaveBeenCalled();
      expect(result).toEqual([
        { company_ifric_id: 'urn:ifric:company-1', company_cert: false },
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
        { company_ifric_id: 'urn:ifric:company-1', company_cert: true },
      ]);
    });

    it('degrades to company_cert: false instead of throwing when certificates are enabled but the call fails', async () => {
      (service as any).certificatesEnabled = true;
      certificateService.verifyAllCompanyCertificate.mockRejectedValue(
        new Error('ICID unreachable'),
      );

      const result = await service.getAllCompanies();

      expect(result).toEqual([
        { company_ifric_id: 'urn:ifric:company-1', company_cert: false },
      ]);
    });
  });
});
