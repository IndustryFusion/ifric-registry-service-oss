import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { HttpException } from '@nestjs/common';
import { ProductService } from './product.service';
import { Company } from 'src/schemas/company.schema';
import { CompanyUser } from 'src/schemas/company_user.schema';
import { CompanyTwin } from 'src/schemas/company_twin.schema';
import { CompanyProduct } from 'src/schemas/company_product.schema';
import { Product } from 'src/schemas/products.schema';
import { AccessGroup } from 'src/schemas/access_group.schema';
import { UserProductAccessGroup } from 'src/schemas/user_product_access_group.schema';
import { Factory } from 'src/schemas/factory.schema';

describe('ProductService', () => {
  let service: ProductService;
  let companyModel: { find: jest.Mock; findById: jest.Mock };
  let companyUserModel: { find: jest.Mock };
  let companyTwinModel: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
  } & jest.Mock;
  let productModel: { find: jest.Mock };
  let accessGroupModel: { find: jest.Mock };
  let companyProductModel: {
    find: jest.Mock;
    findOneAndUpdate: jest.Mock;
    deleteOne: jest.Mock;
  } & jest.Mock;
  let userProductAccessGroupModel: { find: jest.Mock };
  let factoryModel: { find: jest.Mock };

  beforeEach(async () => {
    companyModel = { find: jest.fn(), findById: jest.fn() };
    companyUserModel = { find: jest.fn() };

    companyTwinModel = jest.fn() as any;
    companyTwinModel.findOne = jest.fn();
    companyTwinModel.findOneAndUpdate = jest.fn();

    productModel = { find: jest.fn() };
    accessGroupModel = { find: jest.fn() };

    companyProductModel = jest.fn() as any;
    companyProductModel.find = jest.fn().mockResolvedValue([]);
    companyProductModel.findOneAndUpdate = jest.fn();
    companyProductModel.deleteOne = jest.fn();

    userProductAccessGroupModel = { find: jest.fn() };
    factoryModel = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: getModelToken(Company.name), useValue: companyModel },
        {
          provide: getModelToken(CompanyUser.name),
          useValue: companyUserModel,
        },
        {
          provide: getModelToken(CompanyTwin.name),
          useValue: companyTwinModel,
        },
        {
          provide: getModelToken(CompanyProduct.name),
          useValue: companyProductModel,
        },
        { provide: getModelToken(Product.name), useValue: productModel },
        {
          provide: getModelToken(AccessGroup.name),
          useValue: accessGroupModel,
        },
        {
          provide: getModelToken(UserProductAccessGroup.name),
          useValue: userProductAccessGroupModel,
        },
        { provide: getModelToken(Factory.name), useValue: factoryModel },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProductCompany', () => {
    it('returns a null-company message when no twin matches the URN', async () => {
      companyTwinModel.findOne.mockResolvedValue(null);

      const result = await service.getProductCompany('urn:product:missing');

      expect(result).toEqual({
        company: null,
        message: 'No company data found for product URN: urn:product:missing',
      });
    });

    it('resolves the manufacturer company via the twin', async () => {
      companyTwinModel.findOne.mockResolvedValue({
        manufacturer_company_id: 'mfg-1',
      });
      const company = { company_name: 'Acme Manufacturing' };
      companyModel.findById.mockResolvedValue(company);

      await expect(
        service.getProductCompany('urn:product:widget'),
      ).resolves.toBe(company);
      expect(companyModel.findById).toHaveBeenCalledWith('mfg-1');
    });
  });

  describe('getProductOwner', () => {
    it('resolves the owner company via the twin', async () => {
      companyTwinModel.findOne.mockResolvedValue({ owner_company_id: 'own-1' });
      const owner = { company_name: 'Acme Factory Owner' };
      companyModel.findById.mockResolvedValue(owner);

      await expect(service.getProductOwner('urn:product:widget')).resolves.toBe(
        owner,
      );
      expect(companyModel.findById).toHaveBeenCalledWith('own-1');
    });
  });

  describe('addCompanyProduct', () => {
    it('throws 404 when the company does not exist', async () => {
      companyModel.find.mockResolvedValue([]);

      await expect(
        service.addCompanyProduct({
          company_ifric_id: 'urn:ifric:missing',
          product_ifric_id: 'urn:product:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when product_ifric_id is missing', async () => {
      companyModel.find.mockResolvedValue([{ id: 'company-1' }]);

      await expect(
        service.addCompanyProduct({
          company_ifric_id: 'urn:ifric:company-1',
          product_ifric_id: '',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 409 when the product is already tagged to the company', async () => {
      companyModel.find.mockResolvedValue([{ id: 'company-1' }]);
      companyProductModel.find.mockResolvedValue([{ id: 'existing-tag' }]);

      await expect(
        service.addCompanyProduct({
          company_ifric_id: 'urn:ifric:company-1',
          product_ifric_id: 'urn:product:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('tags the product by product_ifric_id directly, with no catalog lookup or RBAC grant', async () => {
      companyModel.find.mockResolvedValue([{ id: 'company-1' }]);
      companyProductModel.find.mockResolvedValue([]);
      const save = jest.fn().mockResolvedValue({});
      companyProductModel.mockReturnValue({ save });

      const result = await service.addCompanyProduct({
        company_ifric_id: 'urn:ifric:company-1',
        product_ifric_id: 'urn:product:widget',
        billing_id: 'BILL-1',
      });

      expect(companyProductModel).toHaveBeenCalledWith({
        product_ifric_id: 'urn:product:widget',
        company_id: 'company-1',
        billing_id: 'BILL-1',
      });
      expect(save).toHaveBeenCalled();
      expect(productModel.find).not.toHaveBeenCalled();
      expect(userProductAccessGroupModel.find).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        status: 201,
        message: 'Product added successfully',
      });
    });
  });

  describe('updateCompanyProduct', () => {
    it('throws 404 when the company does not exist', async () => {
      companyModel.find.mockResolvedValue([]);

      await expect(
        service.updateCompanyProduct('urn:ifric:missing', {
          product_ifric_id: 'urn:product:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when product_ifric_id is missing', async () => {
      companyModel.find.mockResolvedValue([{ id: 'company-1' }]);

      await expect(
        service.updateCompanyProduct('urn:ifric:company-1', {
          product_ifric_id: '',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('upserts the company product tag keyed on company_id + product_ifric_id', async () => {
      companyModel.find.mockResolvedValue([{ id: 'company-1' }]);
      companyProductModel.findOneAndUpdate.mockResolvedValue({});

      const result = await service.updateCompanyProduct('urn:ifric:company-1', {
        product_ifric_id: 'urn:product:widget',
      });

      expect(companyProductModel.findOneAndUpdate).toHaveBeenCalledWith(
        { company_id: 'company-1', product_ifric_id: 'urn:product:widget' },
        { company_id: 'company-1', product_ifric_id: 'urn:product:widget' },
        { upsert: true, new: true },
      );
      expect(result.status).toBe(200);
    });
  });

  describe('getCompanyProducts', () => {
    it('throws 404 when the company does not exist', async () => {
      companyModel.find.mockResolvedValue([]);

      await expect(
        service.getCompanyProducts('urn:ifric:missing'),
      ).rejects.toThrow(HttpException);
    });

    it('returns the CompanyProduct docs directly, with no catalog join', async () => {
      companyModel.find.mockResolvedValue([{ id: 'company-1' }]);
      const tags = [{ product_ifric_id: 'urn:product:widget' }];
      companyProductModel.find.mockResolvedValue(tags);

      const result = await service.getCompanyProducts('urn:ifric:company-1');

      expect(companyProductModel.find).toHaveBeenCalledWith({
        company_id: 'company-1',
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
      companyModel.find.mockResolvedValueOnce([]); // manufacturer lookup

      await expect(
        service.createCompanyTwin({
          manufacturer_ifric_id: 'urn:ifric:mfg',
          owner_company_ifric_id: 'urn:ifric:owner',
          asset_ifric_id: 'urn:asset:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 400 when the owner company is invalid', async () => {
      companyModel.find
        .mockResolvedValueOnce([{ id: 'mfg-1' }]) // manufacturer lookup
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
      companyModel.find
        .mockResolvedValueOnce([{ id: 'mfg-1' }])
        .mockResolvedValueOnce([{ id: 'owner-1' }]);
      factoryModel.find.mockResolvedValue([]);

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
      // filters and must resolve to two different Mongo ids — this is the
      // regression test for the bug where owner was always forced equal to
      // manufacturer.
      companyModel.find
        .mockResolvedValueOnce([{ id: 'mfg-mongo-id' }])
        .mockResolvedValueOnce([{ id: 'owner-mongo-id' }]);
      const save = jest.fn().mockResolvedValue({});
      companyTwinModel.mockReturnValue({ save });

      await service.createCompanyTwin({
        manufacturer_ifric_id: 'urn:ifric:mfg',
        owner_company_ifric_id: 'urn:ifric:owner',
        asset_ifric_id: 'urn:asset:widget',
      });

      expect(companyTwinModel).toHaveBeenCalledWith({
        manufacturer_company_id: 'mfg-mongo-id',
        owner_company_id: 'owner-mongo-id',
        asset_ifric_id: 'urn:asset:widget',
      });
      expect(save).toHaveBeenCalled();
    });

    it('wires a valid factory_id onto the created twin', async () => {
      companyModel.find
        .mockResolvedValueOnce([{ id: 'mfg-1' }])
        .mockResolvedValueOnce([{ id: 'owner-1' }]);
      factoryModel.find.mockResolvedValue([{ factory_id: 'urn:factory:1' }]);
      const save = jest.fn().mockResolvedValue({});
      companyTwinModel.mockReturnValue({ save });

      await service.createCompanyTwin({
        manufacturer_ifric_id: 'urn:ifric:mfg',
        owner_company_ifric_id: 'urn:ifric:owner',
        asset_ifric_id: 'urn:asset:widget',
        factory_id: 'urn:factory:1',
      });

      expect(companyTwinModel).toHaveBeenCalledWith(
        expect.objectContaining({ factory_id: 'urn:factory:1' }),
      );
    });
  });

  describe('updateCompanyTwin', () => {
    it('throws 404 when the owner company is invalid', async () => {
      companyModel.find.mockResolvedValueOnce([]); // owner lookup

      await expect(
        service.updateCompanyTwin({
          owner_company_ifric_id: 'urn:ifric:owner',
          manufacturer_ifric_id: 'urn:ifric:mfg',
          asset_ifric_id: 'urn:asset:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('throws 404 when the manufacturer company is invalid (previously unguarded)', async () => {
      companyModel.find
        .mockResolvedValueOnce([{ id: 'owner-1' }]) // owner lookup
        .mockResolvedValueOnce([]); // manufacturer lookup

      await expect(
        service.updateCompanyTwin({
          owner_company_ifric_id: 'urn:ifric:owner',
          manufacturer_ifric_id: 'urn:ifric:mfg',
          asset_ifric_id: 'urn:asset:widget',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('upserts owner_company_id and factory_id via findOneAndUpdate', async () => {
      companyModel.find
        .mockResolvedValueOnce([{ id: 'owner-1' }])
        .mockResolvedValueOnce([{ id: 'mfg-1' }]);
      factoryModel.find.mockResolvedValue([{ factory_id: 'urn:factory:1' }]);
      companyTwinModel.findOneAndUpdate.mockResolvedValue({ id: 'twin-1' });

      const result = await service.updateCompanyTwin({
        owner_company_ifric_id: 'urn:ifric:owner',
        manufacturer_ifric_id: 'urn:ifric:mfg',
        asset_ifric_id: 'urn:asset:widget',
        factory_id: 'urn:factory:1',
      });

      expect(companyTwinModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          manufacturer_company_id: 'mfg-1',
          asset_ifric_id: 'urn:asset:widget',
        },
        { owner_company_id: 'owner-1', factory_id: 'urn:factory:1' },
        { new: true, upsert: true },
      );
      expect(result.status).toBe(204);
    });
  });

  describe('deleteCompanyProduct', () => {
    it('deletes only the CompanyProduct doc, no dead UserProductAccessGroup cleanup', async () => {
      companyProductModel.deleteOne.mockResolvedValue({});

      await service.deleteCompanyProduct('company-product-id');

      expect(companyProductModel.deleteOne).toHaveBeenCalledWith({
        _id: 'company-product-id',
      });
      expect(userProductAccessGroupModel.find).not.toHaveBeenCalled();
    });
  });
});
