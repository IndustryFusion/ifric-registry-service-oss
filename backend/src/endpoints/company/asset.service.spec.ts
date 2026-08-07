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
import { ForbiddenException, HttpException } from '@nestjs/common';
import { AssetService } from './asset.service';
import { Asset, Company, Factory } from 'src/entities';
import { AccessControlService } from 'src/common/access-control.service';

const manufacturer = {
  company_ifric_id: 'urn:ifric:manufacturer-1',
  user_id: 'user-1',
};

describe('AssetService', () => {
  let service: AssetService;
  let assetRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    query: jest.Mock;
    count: jest.Mock;
  };
  let companyRepository: { find: jest.Mock; findOne: jest.Mock };
  let factoryRepository: { find: jest.Mock; findOne: jest.Mock };
  let accessControlService: {
    assertCompanyMatch: jest.Mock;
    assertPermission: jest.Mock;
  };

  beforeEach(async () => {
    assetRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      delete: jest.fn(),
      query: jest.fn(),
      count: jest.fn(),
    };
    companyRepository = { find: jest.fn(), findOne: jest.fn() };
    factoryRepository = { find: jest.fn(), findOne: jest.fn() };
    accessControlService = {
      assertCompanyMatch: jest.fn(),
      assertPermission: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetService,
        { provide: getRepositoryToken(Asset), useValue: assetRepository },
        { provide: getRepositoryToken(Company), useValue: companyRepository },
        { provide: getRepositoryToken(Factory), useValue: factoryRepository },
        { provide: AccessControlService, useValue: accessControlService },
      ],
    }).compile();

    service = module.get<AssetService>(AssetService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createAsset', () => {
    it('throws 400 when company_ifric_id does not resolve', async () => {
      companyRepository.find.mockResolvedValue([]);

      await expect(
        service.createAsset(
          {
            asset_ifric_id: 'urn:asset:1',
            company_ifric_id: 'urn:ifric:missing',
          },
          manufacturer,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('checks company-scoped RBAC before creating', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'mfg-1' }]);
      assetRepository.save.mockResolvedValue({});

      await service.createAsset(
        {
          asset_ifric_id: 'urn:asset:1',
          company_ifric_id: 'urn:ifric:manufacturer-1',
        },
        manufacturer,
      );

      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        manufacturer,
        'urn:ifric:manufacturer-1',
      );
      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        manufacturer,
        'create',
      );
    });

    it('creates a physical-only asset (is_twin: false) when no owner is given', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'mfg-1' }]);

      await service.createAsset(
        {
          asset_ifric_id: 'urn:asset:1',
          company_ifric_id: 'urn:ifric:manufacturer-1',
        },
        manufacturer,
      );

      expect(assetRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          asset_ifric_id: 'urn:asset:1',
          company_id: 'mfg-1',
          is_twin: false,
        }),
      );
      expect(assetRepository.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ owner_company_id: expect.anything() }),
      );
    });

    it('creates an already-twinned asset (is_twin: true) when an owner is given', async () => {
      companyRepository.find
        .mockResolvedValueOnce([{ _id: 'mfg-1' }]) // manufacturer lookup
        .mockResolvedValueOnce([{ _id: 'owner-1' }]); // owner lookup

      await service.createAsset(
        {
          asset_ifric_id: 'urn:asset:1',
          company_ifric_id: 'urn:ifric:manufacturer-1',
          owner_company_ifric_id: 'urn:ifric:owner-1',
        },
        manufacturer,
      );

      expect(assetRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          owner_company_id: 'owner-1',
          is_twin: true,
        }),
      );
    });

    it('throws 400 when owner_company_ifric_id is invalid', async () => {
      companyRepository.find
        .mockResolvedValueOnce([{ _id: 'mfg-1' }])
        .mockResolvedValueOnce([]);

      await expect(
        service.createAsset(
          {
            asset_ifric_id: 'urn:asset:1',
            company_ifric_id: 'urn:ifric:manufacturer-1',
            owner_company_ifric_id: 'urn:ifric:missing-owner',
          },
          manufacturer,
        ),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when factory_id is invalid', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'mfg-1' }]);
      factoryRepository.find.mockResolvedValue([]);

      await expect(
        service.createAsset(
          {
            asset_ifric_id: 'urn:asset:1',
            company_ifric_id: 'urn:ifric:manufacturer-1',
            factory_id: 'urn:ifric:missing-factory',
          },
          manufacturer,
        ),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('updateAsset', () => {
    it('throws 404 when the asset does not exist', async () => {
      assetRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateAsset(
          'urn:asset:missing',
          { owner_company_ifric_id: 'urn:ifric:owner-1' },
          manufacturer,
        ),
      ).rejects.toThrow(HttpException);
    });

    it("checks RBAC against the asset's manufacturer company", async () => {
      assetRepository.findOne.mockResolvedValue({
        _id: 'asset-1',
        company_id: 'mfg-1',
      });
      companyRepository.findOne.mockResolvedValue({
        company_ifric_id: 'urn:ifric:manufacturer-1',
      });
      companyRepository.find.mockResolvedValue([{ _id: 'owner-1' }]);

      await service.updateAsset(
        'urn:asset:1',
        { owner_company_ifric_id: 'urn:ifric:owner-1' },
        manufacturer,
      );

      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        manufacturer,
        'urn:ifric:manufacturer-1',
      );
      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        manufacturer,
        'update',
      );
      expect(assetRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('is_twin = true'),
        ['owner-1', 'asset-1'],
      );
    });
  });

  describe('deleteAsset', () => {
    it("checks RBAC against the asset's manufacturer company before deleting", async () => {
      assetRepository.findOne.mockResolvedValue({
        _id: 'asset-1',
        company_id: 'mfg-1',
      });
      companyRepository.findOne.mockResolvedValue({
        company_ifric_id: 'urn:ifric:manufacturer-1',
      });

      await service.deleteAsset('urn:asset:1', manufacturer);

      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        manufacturer,
        'urn:ifric:manufacturer-1',
      );
      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        manufacturer,
        'delete',
      );
      expect(assetRepository.delete).toHaveBeenCalledWith({
        asset_ifric_id: 'urn:asset:1',
      });
    });
  });

  describe('deleteAssets (bulk)', () => {
    it('rejects the whole call when any targeted asset belongs to a different company', async () => {
      assetRepository.find.mockResolvedValue([
        { asset_ifric_id: 'urn:asset:1', company_id: 'mfg-1' },
        { asset_ifric_id: 'urn:asset:2', company_id: 'mfg-2' },
      ]);
      companyRepository.find.mockResolvedValue([
        { _id: 'mfg-1', company_ifric_id: 'urn:ifric:manufacturer-1' },
        { _id: 'mfg-2', company_ifric_id: 'urn:ifric:other-company' },
      ]);

      await expect(
        service.deleteAssets(['urn:asset:1', 'urn:asset:2'], manufacturer),
      ).rejects.toThrow(ForbiddenException);
      expect(assetRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes when every targeted asset belongs to the caller company', async () => {
      assetRepository.find.mockResolvedValue([
        { asset_ifric_id: 'urn:asset:1', company_id: 'mfg-1' },
      ]);
      companyRepository.find.mockResolvedValue([
        { _id: 'mfg-1', company_ifric_id: 'urn:ifric:manufacturer-1' },
      ]);

      await service.deleteAssets(['urn:asset:1'], manufacturer);

      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        manufacturer,
        'delete',
      );
      expect(assetRepository.delete).toHaveBeenCalled();
    });
  });

  describe('getAssets', () => {
    it('is always scoped by company (no unscoped "list everything" mode)', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'mfg-1' }]);
      assetRepository.find.mockResolvedValue([]);

      await service.getAssets('urn:ifric:manufacturer-1', manufacturer);

      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        manufacturer,
        'urn:ifric:manufacturer-1',
      );
      expect(assetRepository.find).toHaveBeenCalledWith({
        where: { company_id: 'mfg-1' },
      });
    });
  });

  describe('getAssetByAssetIfricId', () => {
    it('allows the manufacturer to look up its own asset', async () => {
      assetRepository.findOne.mockResolvedValue({
        asset_ifric_id: 'urn:asset:1',
        company_id: 'mfg-1',
        owner_company_id: null,
      });
      companyRepository.findOne.mockImplementation(({ where }) =>
        where._id === 'mfg-1'
          ? Promise.resolve({ company_ifric_id: 'urn:ifric:manufacturer-1' })
          : Promise.resolve(null),
      );

      await expect(
        service.getAssetByAssetIfricId('urn:asset:1', manufacturer),
      ).resolves.toBeDefined();
    });

    it('allows the owner (not just the manufacturer) to look up a twinned asset', async () => {
      const owner = {
        company_ifric_id: 'urn:ifric:owner-1',
        user_id: 'user-2',
      };
      assetRepository.findOne.mockResolvedValue({
        asset_ifric_id: 'urn:asset:1',
        company_id: 'mfg-1',
        owner_company_id: 'owner-1',
      });
      companyRepository.findOne.mockImplementation(({ where }) => {
        if (where._id === 'mfg-1') {
          return Promise.resolve({
            company_ifric_id: 'urn:ifric:manufacturer-1',
          });
        }
        if (where._id === 'owner-1') {
          return Promise.resolve({ company_ifric_id: 'urn:ifric:owner-1' });
        }
        return Promise.resolve(null);
      });

      await expect(
        service.getAssetByAssetIfricId('urn:asset:1', owner),
      ).resolves.toBeDefined();
    });

    it('rejects a company that is neither the manufacturer nor the owner', async () => {
      assetRepository.findOne.mockResolvedValue({
        asset_ifric_id: 'urn:asset:1',
        company_id: 'mfg-1',
        owner_company_id: 'owner-1',
      });
      companyRepository.findOne.mockImplementation(({ where }) => {
        if (where._id === 'mfg-1') {
          return Promise.resolve({
            company_ifric_id: 'urn:ifric:manufacturer-1',
          });
        }
        if (where._id === 'owner-1') {
          return Promise.resolve({ company_ifric_id: 'urn:ifric:owner-1' });
        }
        return Promise.resolve(null);
      });

      await expect(
        service.getAssetByAssetIfricId('urn:asset:1', {
          company_ifric_id: 'urn:ifric:unrelated-company',
          user_id: 'user-3',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
