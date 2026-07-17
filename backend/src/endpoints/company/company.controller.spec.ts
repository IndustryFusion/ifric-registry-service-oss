import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { CompanyController } from './company.controller';
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

describe('CompanyController', () => {
  let controller: CompanyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompanyController],
      providers: [
        CompanyService,
        { provide: getModelToken(Company.name), useValue: {} },
        { provide: getModelToken(CompanyTwin.name), useValue: {} },
        { provide: getModelToken(Factory.name), useValue: {} },
        { provide: getModelToken(CompanyUser.name), useValue: {} },
        { provide: getModelToken(CompanyCategory.name), useValue: {} },
        { provide: getModelToken(CompanyCategoryMapping.name), useValue: {} },
        { provide: getModelToken(CompanyAsset.name), useValue: {} },
        { provide: getModelToken(CompanyGateWay.name), useValue: {} },
        { provide: getModelToken(CompanyServer.name), useValue: {} },
        { provide: getModelToken(CompanyProduct.name), useValue: {} },
        { provide: getModelToken(Product.name), useValue: {} },
        { provide: getModelToken(AccessGroup.name), useValue: {} },
        { provide: getModelToken(UserProductAccessGroup.name), useValue: {} },
        { provide: CertificateService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: getConnectionToken(), useValue: {} },
      ],
    }).compile();

    controller = module.get<CompanyController>(CompanyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getFactories', () => {
    it('delegates to CompanyService.getFactories with the owner filter', async () => {
      const companyService = {
        getFactories: jest.fn().mockResolvedValue([{ factory_id: 'f1' }]),
      };
      (controller as any).companyService = companyService;

      const result = await controller.getFactories('urn:ifric:owner-1');

      expect(companyService.getFactories).toHaveBeenCalledWith(
        'urn:ifric:owner-1',
      );
      expect(result).toEqual([{ factory_id: 'f1' }]);
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

      const result = await controller.createFactory(data as any);

      expect(companyService.createFactory).toHaveBeenCalledWith(data);
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

      const result = await controller.updateFactory(
        'urn:ifric:fac-1',
        data as any,
      );

      expect(companyService.updateFactory).toHaveBeenCalledWith(
        'urn:ifric:fac-1',
        data,
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

      const result = await controller.deleteFactory('urn:ifric:fac-1');

      expect(companyService.deleteFactory).toHaveBeenCalledWith(
        'urn:ifric:fac-1',
      );
      expect(result).toEqual({ deletedCount: 1 });
    });
  });

  describe('createCompanyAsset', () => {
    it('delegates to CompanyService.createCompanyAsset with the type discriminator', async () => {
      const companyService = {
        createCompanyAsset: jest.fn().mockResolvedValue({ success: true }),
      };
      (controller as any).companyService = companyService;
      const data = {
        type: 'asset',
        company_ifric_id: 'urn:ifric:company-1',
        asset_ifric_id: 'urn:asset:1',
      };

      const result = await controller.createCompanyAsset(data as any);

      expect(companyService.createCompanyAsset).toHaveBeenCalledWith(data);
      expect(result).toEqual({ success: true });
    });
  });
});
