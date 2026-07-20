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

import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { generateId } from 'src/database/generate-id';
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
import { AddProductDto } from './dto/add-product.dto';
import { CompanyTwinDto } from './dto/company-twin.dto';
import { UpdateCompanyProductDto } from './dto/update-company-product.dto';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Company) private companyRepository: Repository<Company>,
    @InjectRepository(CompanyUser)
    private companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(CompanyTwin)
    private companyTwinRepository: Repository<CompanyTwin>,
    @InjectRepository(CompanyProduct)
    private companyProductRepository: Repository<CompanyProduct>,
    @InjectRepository(Product) private productRepository: Repository<Product>,
    @InjectRepository(AccessGroup)
    private accessGroupRepository: Repository<AccessGroup>,
    @InjectRepository(UserProductAccessGroup)
    private userProductAccessGroupRepository: Repository<UserProductAccessGroup>,
    @InjectRepository(Factory) private factoryRepository: Repository<Factory>,
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

      const manufacturerData = await this.companyRepository.find({
        where: { company_ifric_id: data.manufacturer_ifric_id },
      });
      if (manufacturerData.length === 0) {
        throw new HttpException(
          'Invalid manufacturer_ifric_id',
          HttpStatus.BAD_REQUEST,
        );
      }

      const ownerData = await this.companyRepository.find({
        where: { company_ifric_id: data.owner_company_ifric_id },
      });
      if (ownerData.length === 0) {
        throw new HttpException(
          'Invalid owner_company_ifric_id',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (data.factory_id) {
        const factory = await this.factoryRepository.find({
          where: { factory_id: data.factory_id },
        });
        if (factory.length === 0) {
          throw new HttpException('Invalid factory_id', HttpStatus.BAD_REQUEST);
        }
      }

      await this.companyTwinRepository.save(
        this.companyTwinRepository.create({
          manufacturer_company_id: manufacturerData[0]._id,
          owner_company_id: ownerData[0]._id,
          asset_ifric_id: data.asset_ifric_id,
          ...(data.factory_id && { factory_id: data.factory_id }),
        }),
      );

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
      const companyData = await this.companyRepository.find({
        where: { company_ifric_id: data.company_ifric_id },
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

      const checkProductAvailability = await this.companyProductRepository.find(
        {
          where: {
            product_ifric_id: data.product_ifric_id,
            company_id: companyData[0]._id,
          },
        },
      );

      if (checkProductAvailability.length > 0) {
        throw new HttpException(
          'Product already available in company products',
          HttpStatus.CONFLICT,
        );
      }
      await this.companyProductRepository.save(
        this.companyProductRepository.create({
          product_ifric_id: data.product_ifric_id,
          company_id: companyData[0]._id,
          ...(data.billing_id && { billing_id: data.billing_id }),
        }),
      );

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
      const response = await this.companyRepository.find({
        where: { company_ifric_id: id },
      });
      if (response.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      return await this.companyProductRepository.find({
        where: { company_id: response[0]._id },
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
      return await this.productRepository.findOne({ where: { _id: id } });
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
      const companyData = await this.companyRepository.find({
        where: { company_ifric_id: company_ifric_id },
      });
      if (companyData.length == 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const manufacturerAssetData = await this.companyTwinRepository.find({
        where: { manufacturer_company_id: companyData[0]._id },
        order: { _id: 'DESC' },
      });
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
      const manufacturerCompanyData = await this.companyRepository.find({
        where: { company_ifric_id: manufacturer_company_ifric_id },
      });
      if (manufacturerCompanyData.length == 0) {
        throw new HttpException(
          'No manufacturer company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const ownerCompanyData = await this.companyRepository.find({
        where: { company_ifric_id: owner_company_ifric_id },
      });
      if (ownerCompanyData.length == 0) {
        throw new HttpException(
          'No owner company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      return await this.companyTwinRepository.find({
        where: {
          manufacturer_company_id: manufacturerCompanyData[0]._id,
          owner_company_id: ownerCompanyData[0]._id,
        },
        order: { _id: 'DESC' },
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

  async getOwnerAssets(id: string) {
    try {
      return await this.companyTwinRepository.find({
        where: { owner_company_id: id },
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

  async getCompanyTwinById(id: string) {
    try {
      const companyData = await this.companyRepository.find({
        where: { company_ifric_id: id },
      });
      if (!companyData.length) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const responseAsset = await this.companyTwinRepository.find({
        where: { manufacturer_company_id: companyData[0]._id },
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
      return await this.companyTwinRepository.find({
        where: { asset_ifric_id },
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

  async getCompanyTwinCount(assetIds: string[]) {
    try {
      const companyTwinData = await this.companyTwinRepository.find({
        where: { asset_ifric_id: In(assetIds) },
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
      const companyData = await this.companyRepository.find({
        where: { company_ifric_id },
      });
      if (companyData.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      const companyTwinData = await this.companyTwinRepository.find({
        where: { manufacturer_company_id: companyData[0]._id },
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
      const response = await this.companyRepository.find({
        where: { company_ifric_id: id },
      });
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

      // Atomic upsert via raw SQL, not repository.upsert() — the latter
      // builds a raw INSERT that bypasses BaseEntity's @BeforeInsert()
      // hook, so a freshly-inserted row would get a NULL primary key. _id
      // is only used on the insert branch; the update payload here is
      // identical to the filter, so ON CONFLICT DO NOTHING is equivalent
      // to DO UPDATE and cheaper.
      await this.companyProductRepository.query(
        `INSERT INTO company_products (_id, company_id, product_ifric_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (company_id, product_ifric_id) DO NOTHING`,
        [generateId(), response[0]._id, data.product_ifric_id],
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
      const ownerCompanyData = await this.companyRepository.find({
        where: { company_ifric_id: data.owner_company_ifric_id },
      });
      if (ownerCompanyData.length === 0) {
        throw new HttpException(
          'No company found with the provided owner_company_ifric_id',
          HttpStatus.NOT_FOUND,
        );
      }

      const manufacturerCompanyData = await this.companyRepository.find({
        where: { company_ifric_id: data.manufacturer_ifric_id },
      });
      if (manufacturerCompanyData.length === 0) {
        throw new HttpException(
          'No company found with the provided manufacturer_ifric_id',
          HttpStatus.NOT_FOUND,
        );
      }

      if (data.factory_id) {
        const factory = await this.factoryRepository.find({
          where: { factory_id: data.factory_id },
        });
        if (factory.length === 0) {
          throw new HttpException('Invalid factory_id', HttpStatus.BAD_REQUEST);
        }
      }

      // Atomic upsert (create-or-reassign) via raw SQL, not
      // repository.upsert() — the latter builds a raw INSERT that bypasses
      // BaseEntity's @BeforeInsert() hook, so a freshly-inserted row would
      // get a NULL primary key. When factory_id isn't provided, the SET
      // clause omits it entirely (matching the original conditional-spread
      // update object) so an existing row's factory_id is left untouched
      // rather than cleared.
      const twinId = generateId();
      if (data.factory_id) {
        await this.companyTwinRepository.query(
          `INSERT INTO company_twins (_id, manufacturer_company_id, asset_ifric_id, owner_company_id, factory_id)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (manufacturer_company_id, asset_ifric_id)
           DO UPDATE SET owner_company_id = EXCLUDED.owner_company_id, factory_id = EXCLUDED.factory_id`,
          [
            twinId,
            manufacturerCompanyData[0]._id,
            data.asset_ifric_id,
            ownerCompanyData[0]._id,
            data.factory_id,
          ],
        );
      } else {
        await this.companyTwinRepository.query(
          `INSERT INTO company_twins (_id, manufacturer_company_id, asset_ifric_id, owner_company_id)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (manufacturer_company_id, asset_ifric_id)
           DO UPDATE SET owner_company_id = EXCLUDED.owner_company_id`,
          [
            twinId,
            manufacturerCompanyData[0]._id,
            data.asset_ifric_id,
            ownerCompanyData[0]._id,
          ],
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
      return await this.companyProductRepository.delete({ _id: id });
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
      return await this.companyTwinRepository.delete({
        asset_ifric_id: In(assetIds),
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
      return await this.companyTwinRepository.delete({ asset_ifric_id: id });
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
      const product = await this.productRepository.findOne({
        where: { product_name: productName },
      });
      return product ? product._id : null;
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
    const twin = await this.companyTwinRepository.findOne({
      where: { asset_ifric_id: productUrn },
    });
    const company =
      twin &&
      (await this.companyRepository.findOne({
        where: { _id: twin.manufacturer_company_id },
      }));
    if (!company) {
      return {
        company: null,
        message: `No company data found for product URN: ${productUrn}`,
      };
    }
    return company;
  }

  async getProductOwner(productUrn: string): Promise<Record<string, any>> {
    const twin = await this.companyTwinRepository.findOne({
      where: { asset_ifric_id: productUrn },
    });
    const owner =
      twin &&
      (await this.companyRepository.findOne({
        where: { _id: twin.owner_company_id },
      }));
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
    const twin = await this.companyTwinRepository.findOne({
      where: { asset_ifric_id: productUrn },
    });
    const factory =
      twin?.factory_id &&
      (await this.factoryRepository.findOne({
        where: { factory_id: twin.factory_id },
      }));
    if (!factory) {
      return {
        factory: null,
        message: `No factory data found for product URN: ${productUrn}`,
      };
    }
    return factory;
  }
}
