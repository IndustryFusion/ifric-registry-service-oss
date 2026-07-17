import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company } from 'src/schemas/company.schema';
import { CompanyUser } from 'src/schemas/company_user.schema';
import { CompanyTwin } from 'src/schemas/company_twin.schema';
import { CompanyProduct } from 'src/schemas/company_product.schema';
import { Product } from 'src/schemas/products.schema';
import { AccessGroup } from 'src/schemas/access_group.schema';
import { UserProductAccessGroup } from 'src/schemas/user_product_access_group.schema';
import { Factory } from 'src/schemas/factory.schema';
import { AddProductDto } from './dto/add-product.dto';
import { CompanyTwinDto } from './dto/company-twin.dto';
import { UpdateCompanyProductDto } from './dto/update-company-product.dto';

@Injectable()
export class ProductService {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<Company>,
    @InjectModel(CompanyUser.name) private companyUserModel: Model<CompanyUser>,
    @InjectModel(CompanyTwin.name) private companyTwinModel: Model<CompanyTwin>,
    @InjectModel(CompanyProduct.name)
    private companyProductModel: Model<CompanyProduct>,
    @InjectModel(Product.name) private productModel: Model<Product>,
    @InjectModel(AccessGroup.name) private accessGroupModel: Model<AccessGroup>,
    @InjectModel(UserProductAccessGroup.name)
    private userProductAccessGroupModel: Model<UserProductAccessGroup>,
    @InjectModel(Factory.name) private factoryModel: Model<Factory>,
  ) {}

  async createCompanyTwin(data: CompanyTwinDto) {
    try {
      if (
        !data.manufacturer_ifric_id ||
        !data.owner_company_ifric_id ||
        !data.asset_ifric_id
      ) {
        throw new HttpException(
          'manufacturer_ifric_id, owner_company_ifric_id and asset_ifric_id are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const manufacturerData = await this.companyModel.find({
        company_ifric_id: data.manufacturer_ifric_id,
      });
      if (manufacturerData.length === 0) {
        throw new HttpException(
          'Invalid manufacturer_ifric_id',
          HttpStatus.BAD_REQUEST,
        );
      }

      const ownerData = await this.companyModel.find({
        company_ifric_id: data.owner_company_ifric_id,
      });
      if (ownerData.length === 0) {
        throw new HttpException(
          'Invalid owner_company_ifric_id',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (data.factory_id) {
        const factory = await this.factoryModel.find({
          factory_id: data.factory_id,
        });
        if (factory.length === 0) {
          throw new HttpException('Invalid factory_id', HttpStatus.BAD_REQUEST);
        }
      }

      const companyTwinData = new this.companyTwinModel({
        manufacturer_company_id: manufacturerData[0].id,
        owner_company_id: ownerData[0].id,
        asset_ifric_id: data.asset_ifric_id,
        ...(data.factory_id && { factory_id: data.factory_id }),
      });
      await companyTwinData.save();

      return {
        success: true,
        status: 201,
        message: 'Company Twin created successfully',
      };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  // Tags an externally-catalogued product (data lives in another system) to
  // a company by its external product_ifric_id — no local Product catalog
  // lookup or match required. Unlike the old name-matched flow, this does
  // not grant any UserProductAccessGroup rows: RBAC over the internal
  // module catalog (see AuthService) is a separate concept from tagging an
  // external product to a company.
  async addCompanyProduct(data: AddProductDto) {
    try {
      const companyData = await this.companyModel.find({
        company_ifric_id: data.company_ifric_id,
      });
      if (companyData.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      if (!data.product_ifric_id) {
        throw new HttpException(
          'product_ifric_id is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const checkProductAvailability = await this.companyProductModel.find({
        product_ifric_id: data.product_ifric_id,
        company_id: companyData[0].id,
      });

      if (checkProductAvailability.length > 0) {
        throw new HttpException(
          'Product already available in company products',
          HttpStatus.CONFLICT,
        );
      }
      const companyProduct = new this.companyProductModel({
        product_ifric_id: data.product_ifric_id,
        company_id: companyData[0].id,
        ...(data.billing_id && { billing_id: data.billing_id }),
      });
      await companyProduct.save();

      return {
        success: true,
        status: 201,
        message: 'Product added successfully',
      };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getCompanyProducts(id: string) {
    try {
      const response = await this.companyModel.find({ company_ifric_id: id });
      if (response.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      return await this.companyProductModel.find({
        company_id: response[0].id,
      });
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getProductName(id: string) {
    try {
      return await this.productModel.findById(id);
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.NOT_FOUND);
      }
    }
  }

  async getManufacturerAssets(company_ifric_id: string) {
    try {
      const companyData = await this.companyModel.find({
        company_ifric_id: company_ifric_id,
      });
      if (companyData.length == 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const manufacturerAssetData = await this.companyTwinModel
        .find({ manufacturer_company_id: companyData[0].id })
        .sort({ _id: -1 });
      if (manufacturerAssetData.length == 0) {
        throw new HttpException(
          'Manufacturer Asset not found',
          HttpStatus.NOT_FOUND,
        );
      } else {
        return manufacturerAssetData;
      }
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getManufacturerOwnerAssets(
    manufacturer_company_ifric_id: string,
    owner_company_ifric_id: string,
  ) {
    try {
      const manufacturerCompanyData = await this.companyModel.find({
        company_ifric_id: manufacturer_company_ifric_id,
      });
      if (manufacturerCompanyData.length == 0) {
        throw new HttpException(
          'No manufacturer company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const ownerCompanyData = await this.companyModel.find({
        company_ifric_id: owner_company_ifric_id,
      });
      if (ownerCompanyData.length == 0) {
        throw new HttpException(
          'No owner company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      return await this.companyTwinModel
        .find({
          manufacturer_company_id: manufacturerCompanyData[0].id,
          owner_company_id: ownerCompanyData[0].id,
        })
        .sort({ _id: -1 });
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getOwnerAssets(id: string) {
    try {
      return await this.companyTwinModel.find({ owner_company_id: id });
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getCompanyTwinById(id: string) {
    try {
      const companyData = await this.companyModel.find({
        company_ifric_id: id,
      });
      if (!companyData.length) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const responseAsset = await this.companyTwinModel.find({
        manufacturer_company_id: companyData[0].id,
      });
      return responseAsset;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getCompanyTwinByAssetId(asset_ifric_id: string) {
    try {
      return await this.companyTwinModel.find({ asset_ifric_id });
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getCompanyTwinCount(assetIds: string[]) {
    try {
      const companyTwinData = await this.companyTwinModel.find({
        asset_ifric_id: { $in: assetIds },
      });
      return companyTwinData.length;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getCompanyTwinCountByCompanyIfricId(company_ifric_id: string) {
    try {
      const companyData = await this.companyModel.find({
        company_ifric_id,
      });
      if (companyData.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      const companyTwinData = await this.companyTwinModel.find({
        manufacturer_company_id: companyData[0].id,
      });
      return companyTwinData.length;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  // Ensures a product tag exists for this company (upsert), matching the
  // findOneAndUpdate({upsert:true}) pattern used by updateCompanyTwin. Like
  // addCompanyProduct, this no longer grants any UserProductAccessGroup rows
  // — see the comment on addCompanyProduct.
  async updateCompanyProduct(id: string, data: UpdateCompanyProductDto) {
    try {
      const response = await this.companyModel.find({ company_ifric_id: id });
      if (response.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      if (!data.product_ifric_id) {
        throw new HttpException(
          'product_ifric_id is required',
          HttpStatus.BAD_REQUEST,
        );
      }

      await this.companyProductModel.findOneAndUpdate(
        { company_id: response[0].id, product_ifric_id: data.product_ifric_id },
        { company_id: response[0].id, product_ifric_id: data.product_ifric_id },
        { upsert: true, new: true },
      );

      return {
        success: true,
        status: 200,
        message: 'Company product upserted successfully',
      };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async updateCompanyTwin(data: CompanyTwinDto) {
    try {
      const ownerCompanyData = await this.companyModel.find({
        company_ifric_id: data.owner_company_ifric_id,
      });
      if (ownerCompanyData.length === 0) {
        throw new HttpException(
          'No company found with the provided owner_company_ifric_id',
          HttpStatus.NOT_FOUND,
        );
      }

      const manufacturerCompanyData = await this.companyModel.find({
        company_ifric_id: data.manufacturer_ifric_id,
      });
      if (manufacturerCompanyData.length === 0) {
        throw new HttpException(
          'No company found with the provided manufacturer_ifric_id',
          HttpStatus.NOT_FOUND,
        );
      }

      if (data.factory_id) {
        const factory = await this.factoryModel.find({
          factory_id: data.factory_id,
        });
        if (factory.length === 0) {
          throw new HttpException('Invalid factory_id', HttpStatus.BAD_REQUEST);
        }
      }

      const filter = {
        manufacturer_company_id: manufacturerCompanyData[0].id,
        asset_ifric_id: data.asset_ifric_id,
      };
      const update = {
        owner_company_id: ownerCompanyData[0].id,
        ...(data.factory_id && { factory_id: data.factory_id }),
      };
      const options = { new: true, upsert: true };
      const response = await this.companyTwinModel.findOneAndUpdate(
        filter,
        update,
        options,
      );
      if (!response) {
        throw new HttpException(
          'No record found with the provided data',
          HttpStatus.NOT_FOUND,
        );
      }
      return {
        status: 204,
        message: 'Company Twin Updated Successfully',
      };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async deleteCompanyProduct(id: string) {
    try {
      return await this.companyProductModel.deleteOne({ _id: id });
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async deleteCompanyTwins(assetIds: string[]) {
    try {
      return await this.companyTwinModel.deleteMany({
        asset_ifric_id: { $in: assetIds },
      });
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async deleteCompanyTwinAsset(id: string) {
    try {
      return await this.companyTwinModel.deleteOne({ asset_ifric_id: id });
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async findProductIdByProductName(productName: string) {
    try {
      const product = await this.productModel.findOne({
        product_name: productName,
      });
      return product ? product._id.toString() : null;
    } catch (err) {
      console.error('Error finding product ID:', err);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ===========================================================================
  // Product-URN-keyed company/factory lookups (relocated from the
  // company-read demo module — see CompanyService for the company/factory-
  // keyed equivalents).
  // ===========================================================================

  async getProductCompany(productUrn: string): Promise<Record<string, any>> {
    const twin = await this.companyTwinModel.findOne({
      asset_ifric_id: productUrn,
    });
    const company =
      twin && (await this.companyModel.findById(twin.manufacturer_company_id));
    if (!company) {
      return {
        company: null,
        message: `No company data found for product URN: ${productUrn}`,
      };
    }
    return company;
  }

  async getProductOwner(productUrn: string): Promise<Record<string, any>> {
    const twin = await this.companyTwinModel.findOne({
      asset_ifric_id: productUrn,
    });
    const owner =
      twin && (await this.companyModel.findById(twin.owner_company_id));
    if (!owner) {
      return {
        owner: null,
        message: `No owner data found for product URN: ${productUrn}`,
      };
    }
    return owner;
  }

  async getProductFactoryLocation(
    productUrn: string,
  ): Promise<Record<string, any>> {
    const twin = await this.companyTwinModel.findOne({
      asset_ifric_id: productUrn,
    });
    const factory =
      twin?.factory_id &&
      (await this.factoryModel.findOne({ factory_id: twin.factory_id }));
    if (!factory) {
      return {
        factory: null,
        message: `No factory data found for product URN: ${productUrn}`,
      };
    }
    return factory;
  }
}
