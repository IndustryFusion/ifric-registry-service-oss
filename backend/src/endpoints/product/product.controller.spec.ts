import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { Company } from 'src/schemas/company.schema';
import { CompanyUser } from 'src/schemas/company_user.schema';
import { CompanyTwin } from 'src/schemas/company_twin.schema';
import { CompanyProduct } from 'src/schemas/company_product.schema';
import { Product } from 'src/schemas/products.schema';
import { AccessGroup } from 'src/schemas/access_group.schema';
import { UserProductAccessGroup } from 'src/schemas/user_product_access_group.schema';
import { Factory } from 'src/schemas/factory.schema';

describe('ProductController', () => {
  let controller: ProductController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [
        ProductService,
        { provide: getModelToken(Company.name), useValue: {} },
        { provide: getModelToken(CompanyUser.name), useValue: {} },
        { provide: getModelToken(CompanyTwin.name), useValue: {} },
        { provide: getModelToken(CompanyProduct.name), useValue: {} },
        { provide: getModelToken(Product.name), useValue: {} },
        { provide: getModelToken(AccessGroup.name), useValue: {} },
        {
          provide: getModelToken(UserProductAccessGroup.name),
          useValue: {},
        },
        { provide: getModelToken(Factory.name), useValue: {} },
        { provide: JwtService, useValue: {} },
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

      const result = await controller.addCompanyProduct(data as any);

      expect(productService.addCompanyProduct).toHaveBeenCalledWith(data);
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
