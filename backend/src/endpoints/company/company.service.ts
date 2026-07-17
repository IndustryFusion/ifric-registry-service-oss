import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import * as bcrypt from 'bcrypt';
import * as moment from 'moment';
import { getCountryCode, countries } from 'countries-list';
import * as generator from 'generate-password';
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
import { jwtConstants } from '../auth/constants';
import { RegisterAuthDto, AddStatusDto } from '../auth/dto/register-auth.dto';
import { CompanyAssetDto } from '../auth/dto/company-asset.dto';
import { AccessGroupDto } from '../auth/dto/access-group.dto';
import { UserAccessDto } from '../auth/dto/user-access-dto';
import { UpdateAccessGroupDto } from './dto/update-access-group.dto';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { UpdateFactoryDto } from './dto/update-factory.dto';
import { envConstants } from 'src/common/env.constants';

const BCRYPT_SALT_ROUNDS = 10;

// Default internal-module product identifiers granted to every new
// company/admin user — placeholders, replace with your own module lineup
// before a real deployment. Not a local Product catalog lookup: these are
// plain identifiers, stored directly on CompanyProduct/UserProductAccessGroup.
const DEFAULT_PRODUCT_NAMES = [
  'Example Product A',
  'Example Product B',
  'Example Product C',
];

@Injectable()
export class CompanyService {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<Company>,
    @InjectModel(CompanyTwin.name) private companyTwinModel: Model<CompanyTwin>,
    @InjectModel(Factory.name) private factoryModel: Model<Factory>,
    @InjectModel(CompanyUser.name) private companyUserModel: Model<CompanyUser>,
    @InjectModel(CompanyCategory.name)
    private companyCategoryModel: Model<CompanyCategory>,
    @InjectModel(CompanyCategoryMapping.name)
    private companyCategoryMappingModel: Model<CompanyCategoryMapping>,
    @InjectModel(CompanyAsset.name)
    private companyAssetModel: Model<CompanyAsset>,
    @InjectModel(CompanyGateWay.name)
    private companyGateWayModel: Model<CompanyGateWay>,
    @InjectModel(CompanyServer.name)
    private companyServerModel: Model<CompanyServer>,
    @InjectModel(CompanyProduct.name)
    private companyProductModel: Model<CompanyProduct>,
    @InjectModel(Product.name) private productModel: Model<Product>,
    @InjectModel(AccessGroup.name) private accessGroupModel: Model<AccessGroup>,
    @InjectModel(UserProductAccessGroup.name)
    private userProductAccessGroupModel: Model<UserProductAccessGroup>,
    private readonly certificateService: CertificateService,
    private jwtService: JwtService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private readonly icidUrl = envConstants.icidServiceBackendUrl;
  private readonly company_default_code = envConstants.companyDefaultCode;

  // ===========================================================================
  // Factory-keyed lookups — start from a factory id
  //
  // Product-URN-keyed lookups (manufacturer/owner/factory-location for a
  // given product) live on ProductService instead — see
  // src/endpoints/product/product.service.ts.
  // ===========================================================================

  async getFactories(
    ownerCompanyIfricId?: string,
  ): Promise<Record<string, any>[]> {
    const filter = ownerCompanyIfricId
      ? { owner_company_ifric_id: ownerCompanyIfricId }
      : {};
    return this.factoryModel.find(filter);
  }

  async getFactoryById(factoryId: string): Promise<Record<string, any>> {
    const factory = await this.factoryModel.findOne({ factory_id: factoryId });
    if (!factory) {
      return {
        factory: null,
        message: `No factory data found for factory id: ${factoryId}`,
      };
    }
    return factory;
  }

  async getFactoryOwner(factoryId: string): Promise<Record<string, any>> {
    const factory = await this.factoryModel.findOne({ factory_id: factoryId });
    if (!factory) {
      return {
        owner: null,
        message: `No factory data found for factory id: ${factoryId}`,
      };
    }

    const owner = await this.companyModel.findOne({
      company_ifric_id: factory.owner_company_ifric_id,
    });
    if (!owner) {
      return {
        owner: null,
        message: `No owner data found for factory id: ${factoryId}`,
      };
    }
    return owner;
  }

  async getFactoryProducts(factoryId: string): Promise<string[]> {
    const twins = await this.companyTwinModel.find({ factory_id: factoryId });
    return twins.map((twin) => twin.asset_ifric_id);
  }

  async createFactory(data: CreateFactoryDto) {
    try {
      const ownerCompany = await this.companyModel.find({
        company_ifric_id: data.owner_company_ifric_id,
      });
      if (ownerCompany.length === 0) {
        throw new HttpException(
          'Invalid owner_company_ifric_id',
          HttpStatus.NOT_FOUND,
        );
      }
      const existing = await this.factoryModel.find({
        factory_id: data.factory_id,
      });
      if (existing.length > 0) {
        throw new HttpException('Factory already exists', HttpStatus.CONFLICT);
      }
      const factory = new this.factoryModel(data);
      await factory.save();
      return {
        success: true,
        status: 201,
        message: 'Factory created successfully',
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

  async updateFactory(factoryId: string, data: UpdateFactoryDto) {
    try {
      const response = await this.factoryModel.findOneAndUpdate(
        { factory_id: factoryId },
        data,
        { new: true },
      );
      if (!response) {
        throw new HttpException(
          'No factory found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      return { status: 204, message: 'Factory Updated Successfully' };
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

  async deleteFactory(factoryId: string) {
    try {
      const twinsAtFactory = await this.companyTwinModel.find({
        factory_id: factoryId,
      });
      if (twinsAtFactory.length > 0) {
        throw new HttpException(
          'Cannot delete factory: still referenced by company twins',
          HttpStatus.CONFLICT,
        );
      }
      return await this.factoryModel.deleteOne({ factory_id: factoryId });
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

  // ===========================================================================
  // Company CRUD, access groups, physical assets (CompanyAsset/GateWay/
  // Server) — relocated from AuthController/AuthService.
  // ===========================================================================

  async createCompany(data: RegisterAuthDto) {
    let temp_icid_company_id = null;
    let temp_company_user_id = null;
    let temp_product_access_group_ids: string[] = [];
    let temp_company_category_mapping_id = null;
    const temp_company_product_access_ids: string[] = [];
    let temp_company_access_group_ids: string[] = [];
    let temp_company_id = null;

    const session = await this.connection.startSession();
    try {
      const companyResponse = await this.companyModel.find({
        email: data.email,
      });
      const companyCheckResponse = await this.companyModel.find({
        company_name: data.company_name,
      });
      if (companyResponse.length > 0) {
        throw new HttpException('Mail Id already exists', HttpStatus.CONFLICT);
      } else if (companyCheckResponse.length > 0) {
        throw new HttpException('Company already exists', HttpStatus.CONFLICT);
      } else {
        // Fetch IFRIC ID From icid-service
        const countryCode = getCountryCode(data.country);
        const countryKey = Object.keys(countries).find(
          (key) => key == countryCode,
        );
        const regionCode = countries[countryKey].continent;
        const companyCodeArr = this.company_default_code.split('-');
        const ifricResponse = await axios.post(
          `${this.icidUrl}/company`,
          {
            dataspace_code: companyCodeArr[0],
            object_type_code: companyCodeArr[1],
            object_sub_type_code: companyCodeArr[2],
            registration_code: data.registration_number,
            region_code: regionCode,
            country_code: countryCode,
          },
          {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        );
        if (ifricResponse.data.status == '201') {
          data.company_ifric_id = ifricResponse.data.urn_id;
          temp_icid_company_id = ifricResponse.data.urn_id;
        } else {
          throw new HttpException(
            ifricResponse.data.message,
            ifricResponse.data.status,
          );
        }

        // Add Temporary Password
        const temporaryPassword = await generator.generate({
          length: 8,
          numbers: true,
          symbols: true,
          uppercase: true,
          excludeSimilarCharacters: true,
        });

        // encrypt the password
        const encryptedPassword = await this.hashPassword(temporaryPassword);
        data.password = encryptedPassword;

        // add meta data in company data
        data.meta_data = {
          created_at: new Date(),
          updated_at: '',
          modified_by: '',
        };

        // add company image if available
        if (data.company_logo) {
          data.company_image = data.company_logo;
        }

        let companySaveResponse;
        await session.withTransaction(async () => {
          // fail-fast existence checks inside txn (optional but consistent)
          // Save company
          companySaveResponse = await new this.companyModel(data).save({
            session,
          });
          temp_company_id = companySaveResponse.id;

          // Category mapping
          const companyCategory = await this.companyCategoryModel
            .findOne({ category_name: data.company_category })
            .session(session);
          if (!companyCategory)
            throw new HttpException(
              'Company category does not exist',
              HttpStatus.NOT_FOUND,
            );

          const mapping = await new this.companyCategoryMappingModel({
            category_id: companyCategory.id,
            company_id: companySaveResponse.id,
          }).save({ session });

          temp_company_category_mapping_id = mapping.id;

          // Default internal-module product identifiers — matches
          // DEFAULT_PRODUCT_NAMES. These aren't looked up in a local
          // catalog: product data lives in an external system, so linking
          // never fails on seed state — a fresh company always gets these
          // links regardless of whether /script/create-product was ever run.
          for (const name of DEFAULT_PRODUCT_NAMES) {
            const companyProduct = await new this.companyProductModel({
              product_ifric_id: name,
              company_id: companySaveResponse.id,
            }).save({ session });
            temp_company_product_access_ids.push(companyProduct.id);
          }

          // Access groups
          const accessGroups = await this.accessGroupModel.insertMany(
            [
              {
                company_id: companySaveResponse.id,
                group_name: 'read_only',
                create: false,
                read: true,
                update: false,
                delete: false,
              },
              {
                company_id: companySaveResponse.id,
                group_name: 'admin',
                create: true,
                read: true,
                update: true,
                delete: true,
              },
            ],
            { session },
          );
          temp_company_access_group_ids = accessGroups.map((ag) => ag.id);
        });

        const products = DEFAULT_PRODUCT_NAMES.map((product) => ({
          product,
          user_role: 'admin',
        }));

        // Add Admin in Company User
        const companyUserData = {
          user_name: data.admin_name,
          user_email: data.email,
          user_password: temporaryPassword,
          company_ifric_id: data.company_ifric_id,
          products,
        };

        const companyUserResponse = await this.createAdminUser(companyUserData);
        temp_company_user_id = companyUserResponse.userId;
        temp_product_access_group_ids =
          companyUserResponse.productAccessGroupIds;

        if (companyUserResponse.status === 201) {
          return {
            success: true,
            status: 201,
            message: 'Company created successfully',
            company_ifric_id: data.company_ifric_id,
            temporaryPassword,
          };
        } else {
          return companyUserResponse;
        }
      }
    } catch (err) {
      if (temp_icid_company_id) {
        await axios.delete(`${this.icidUrl}/company/` + temp_icid_company_id, {
          headers: {
            'Content-Type': 'application/json',
          },
        });
      }
      if (temp_company_id) {
        await this.companyModel.findByIdAndDelete(temp_company_id);
      }
      if (temp_company_category_mapping_id) {
        await this.companyCategoryMappingModel.findByIdAndDelete(
          temp_company_category_mapping_id,
        );
      }
      if (temp_company_product_access_ids.length > 0) {
        await this.companyProductModel.deleteMany({
          _id: { $in: temp_company_product_access_ids },
        });
      }
      if (temp_company_access_group_ids.length > 0) {
        await this.accessGroupModel.deleteMany({
          _id: { $in: temp_company_access_group_ids },
        });
      }
      if (temp_company_user_id) {
        await this.companyUserModel.findByIdAndDelete(temp_company_user_id);
      }
      if (temp_product_access_group_ids.length > 0 && temp_company_user_id) {
        await this.userProductAccessGroupModel.deleteMany({
          product_ifric_id: { $in: temp_product_access_group_ids },
          user_id: temp_company_user_id,
        });
      }

      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    } finally {
      session.endSession();
    }
  }

  async createCompanyAsset(data: CompanyAssetDto) {
    try {
      const companyData = await this.companyModel.find({
        company_ifric_id: data.company_ifric_id,
      });
      if (companyData.length === 0) {
        throw new HttpException(
          'Invalid Company Ifric Id',
          HttpStatus.CONFLICT,
        );
      }

      switch (data.type) {
        case 'asset': {
          if (!data.asset_ifric_id) {
            throw new HttpException(
              'asset_ifric_id is required when type is "asset"',
              HttpStatus.BAD_REQUEST,
            );
          }
          const assetData = new this.companyAssetModel({
            company_id: companyData[0].id,
            asset_ifric_id: data.asset_ifric_id,
          });
          await assetData.save();
          break;
        }
        case 'gateway': {
          if (!data.gateway_ifric_id) {
            throw new HttpException(
              'gateway_ifric_id is required when type is "gateway"',
              HttpStatus.BAD_REQUEST,
            );
          }
          const gatewayData = new this.companyGateWayModel({
            company_id: companyData[0].id,
            gateway_ifric_id: data.gateway_ifric_id,
          });
          await gatewayData.save();
          break;
        }
        case 'server': {
          if (!data.server_ifric_id) {
            throw new HttpException(
              'server_ifric_id is required when type is "server"',
              HttpStatus.BAD_REQUEST,
            );
          }
          const serverData = new this.companyServerModel({
            company_id: companyData[0].id,
            server_ifric_id: data.server_ifric_id,
          });
          await serverData.save();
          break;
        }
        default:
          throw new HttpException(
            'type must be one of "asset", "gateway", "server"',
            HttpStatus.BAD_REQUEST,
          );
      }

      return {
        success: true,
        status: 201,
        message: 'Company Assets created successfully',
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

  async createAccessGroup(id: string, data: AccessGroupDto) {
    try {
      const response = await this.companyModel.find({ company_ifric_id: id });
      if (response.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      data.company_id = response[0].id;
      const checkAccessGroup = await this.accessGroupModel.find({
        company_id: response[0].id,
        group_name: data.group_name,
      });
      if (checkAccessGroup.length > 0) {
        throw new HttpException(
          'Group Name already exists',
          HttpStatus.CONFLICT,
        );
      }

      const accessData = new this.accessGroupModel(data);
      await accessData.save();
      return {
        success: true,
        status: 201,
        message: 'Access Group created successfully',
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

  async addStatusDetail(data: AddStatusDto) {
    try {
      await this.companyModel.findOneAndUpdate(
        { company_ifric_id: data.company_id },
        { company_verified: data.status.toLowerCase() },
        { new: true },
      );
      return {
        success: true,
        status: 201,
        message: 'Status added successfully',
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

  async getCompanyAssetsbyAsset(id: string) {
    try {
      const response = await this.companyAssetModel.find({
        asset_ifric_id: id,
      });
      if (response.length === 0) {
        const twinResponse = await this.companyTwinModel.find({
          asset_ifric_id: id,
        });
        if (twinResponse.length === 0) {
          throw new HttpException(
            'No Asset found with the provided ID',
            HttpStatus.NOT_FOUND,
          );
        }
        const responseComapny = await this.companyModel.find({
          _id: twinResponse[0].owner_company_id,
        });
        return responseComapny[0];
      } else {
        const responseComapny = await this.companyModel.find({
          _id: response[0].company_id,
        });
        return responseComapny[0];
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

  async getCompanyAssetByAssetId(asset_ifric_id: string) {
    try {
      return await this.companyAssetModel.find({ asset_ifric_id });
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

  async getCompanyAssets(id: string) {
    try {
      const response = await this.companyModel.find({ company_ifric_id: id });
      if (response.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      return await this.companyAssetModel.find({ company_id: response[0].id });
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

  async getCompanyAccessGroup(id: string) {
    try {
      const response = await this.companyModel.find({ company_ifric_id: id });
      if (response.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      return await this.accessGroupModel.find({ company_id: response[0].id });
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

  async getAccessGroupByGroupName(company_id: string, group_name: string) {
    try {
      return await this.accessGroupModel.findOne({ company_id, group_name });
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

  async getAccessGroup(id: string) {
    try {
      return await this.accessGroupModel.findById(id);
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

  async getCategorySpecificCompanies(categoryName: string) {
    try {
      const companyCategory = await this.companyCategoryModel.find({
        category_name: categoryName,
      });
      if (!(companyCategory.length > 0)) {
        throw new HttpException(
          'No company category with the provided name',
          HttpStatus.NOT_FOUND,
        );
      }
      const categoryMappingData = await this.companyCategoryMappingModel.find({
        category_id: companyCategory[0].id,
      });
      const result = [];
      for (let i = 0; i < categoryMappingData.length; i++) {
        const companyData = await this.companyModel.findById(
          categoryMappingData[i].company_id,
        );
        if (companyData) {
          result.push({
            company_ifric_id: companyData.company_ifric_id,
            company_name: companyData.company_name,
            company_category: categoryName,
          });
        }
      }
      return result;
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

  async getCompanyDetails(id: string) {
    try {
      return await this.companyModel.find({ company_ifric_id: id });
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

  async getCompanyDetailsbyRecord(id: string) {
    try {
      return await this.companyModel.find({ _id: id });
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

  async getCompanyContactDetails(company_ifric_id: string) {
    try {
      return await this.companyModel.aggregate([
        { $match: { company_ifric_id } },
        {
          $project: {
            _id: 0,
            admin_name: 1,
            position: 1,
            email: 1,
            mobile_number: '**********',
            address: '$address_1',
            city: 1,
            country: 1,
            zip: 1,
          },
        },
      ]);
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

  async checkCompaniesByCompanyNameAndRegistrationNumber(
    company_name: string,
    registration_number: string,
  ) {
    try {
      if (!company_name) {
        throw new HttpException(
          'Company name is required.',
          HttpStatus.BAD_REQUEST,
        );
      }

      if (!registration_number) {
        throw new HttpException(
          'Registration number is required.',
          HttpStatus.BAD_REQUEST,
        );
      }

      const companyDataByName = await this.companyModel.find({
        company_name: decodeURIComponent(company_name),
      });
      const companyDataByRegistrationNumber = await this.companyModel.find({
        registration_number,
      });

      return {
        company_name: companyDataByName.length ? true : false,
        registration_number: companyDataByRegistrationNumber.length
          ? true
          : false,
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

  async getCompanyDetailsByEmail(email: string) {
    try {
      return await this.companyModel.find({ email });
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

  async getCompanyDetailsByName(company_name: string) {
    try {
      return await this.companyModel.find({ company_name });
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

  async getCompanyAndUserDetails(company_ifric_id: string) {
    try {
      const response = await this.companyModel.aggregate([
        {
          $match: { company_ifric_id },
        },
        {
          $lookup: {
            from: 'companycategorymappings',
            localField: '_id',
            foreignField: 'company_id',
            as: 'mapping',
          },
        },
        {
          $lookup: {
            from: 'companycategories',
            localField: 'mapping.category_id',
            foreignField: '_id',
            as: 'category',
          },
        },
        {
          $lookup: {
            from: 'companyproducts',
            localField: '_id',
            foreignField: 'company_id',
            as: 'companyproducts',
          },
        },
        {
          $lookup: {
            from: 'products',
            localField: 'companyproducts.product_id',
            foreignField: '_id',
            as: 'company_product_details',
          },
        },
        {
          $lookup: {
            from: 'companyusers',
            let: { companyId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$$companyId', '$company_id'] },
                },
              },
              {
                $lookup: {
                  from: 'userproductaccessgroups',
                  localField: '_id',
                  foreignField: 'user_id',
                  as: 'userproductmapping',
                },
              },
              {
                $unwind: {
                  path: '$userproductmapping',
                  preserveNullAndEmptyArrays: true,
                },
              },
              {
                $lookup: {
                  from: 'products',
                  localField: 'userproductmapping.product_id',
                  foreignField: '_id',
                  as: 'productinfo',
                },
              },
              {
                $lookup: {
                  from: 'accessgroups',
                  localField: 'userproductmapping.access_group_id',
                  foreignField: '_id',
                  as: 'accessgroupinfo',
                },
              },
              {
                $group: {
                  _id: '$_id',
                  user_name: { $first: '$user_name' },
                  user_email: { $first: '$user_email' },
                  user_products: {
                    $push: {
                      product_name: {
                        $arrayElemAt: ['$productinfo.product_name', 0],
                      },
                      group_name: {
                        $arrayElemAt: ['$accessgroupinfo.group_name', 0],
                      },
                      create: { $arrayElemAt: ['$accessgroupinfo.create', 0] },
                      read: { $arrayElemAt: ['$accessgroupinfo.read', 0] },
                      update: { $arrayElemAt: ['$accessgroupinfo.update', 0] },
                      delete: { $arrayElemAt: ['$accessgroupinfo.delete', 0] },
                    },
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  user_name: 1,
                  user_email: 1,
                  user_products: 1,
                },
              },
            ],
            as: 'companyusers',
          },
        },
        {
          $project: {
            _id: 0,
            company_name: 1,
            company_ifric_id: 1,
            company_category: { $arrayElemAt: ['$category.category_name', 0] },
            company_address: '$address_1',
            company_city: '$city',
            company_country: '$country',
            company_products: {
              $map: {
                input: '$company_product_details',
                as: 'prod',
                in: '$$prod.product_name',
              },
            },
            company_users: '$companyusers',
          },
        },
      ]);
      return response;
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

  async getAllCompanies() {
    try {
      const companyData = await this.companyModel.aggregate([
        {
          $sort: { _id: -1 },
        },
        {
          $lookup: {
            from: 'companycategorymappings',
            localField: '_id',
            foreignField: 'company_id',
            as: 'maping',
          },
        },
        {
          $lookup: {
            from: 'companycategories',
            localField: 'maping.category_id',
            foreignField: '_id',
            as: 'category',
          },
        },
        {
          $lookup: {
            from: 'companyproducts',
            localField: '_id',
            foreignField: 'company_id',
            as: 'companyproducts',
          },
        },
        {
          $lookup: {
            from: 'products',
            localField: 'companyproducts.product_id',
            foreignField: '_id',
            as: 'company_product_details',
          },
        },
        {
          $lookup: {
            from: 'companyproducts',
            localField: '_id',
            foreignField: 'company_id',
            as: 'companyproducts',
          },
        },
        {
          $lookup: {
            from: 'products',
            localField: 'companyproducts.product_id',
            foreignField: '_id',
            as: 'company_product_details',
          },
        },
        {
          $project: {
            _id: 0,
            company_name: 1,
            company_image: { $ifNull: ['$company_image', null] },
            company_category: { $arrayElemAt: ['$category.category_name', 0] },
            company_ifric_id: 1,
            company_address: '$address_1',
            company_city: '$city',
            company_country: '$country',
            company_industry: '$industry',
            company_products: {
              $map: {
                input: '$company_product_details',
                as: 'prod',
                in: '$$prod.product_name',
              },
            },
            company_verified: 1,
          },
        },
      ]);

      const companyIfricIds = companyData.map(
        (company) => company.company_ifric_id,
      );
      const companiesVerifiedResponse =
        await this.certificateService.verifyAllCompanyCertificate(
          companyIfricIds,
        );
      return companyData.map((company) => {
        company.company_cert =
          companiesVerifiedResponse[company.company_ifric_id] ?? false;
        return company;
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

  async getUniqueOwnerCompanies(company_ifric_id: string) {
    try {
      return await this.companyModel.aggregate([
        {
          $match: { company_ifric_id },
        },
        {
          $lookup: {
            from: 'companytwins',
            let: { companyId: { $toString: '$_id' } },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ['$manufacturer_company_id', '$$companyId'], // match manufacturer_company_id with _id of company
                  },
                },
              },
              // Group by owner_company_id to get unique values
              {
                $group: {
                  _id: '$owner_company_id',
                },
              },
            ],
            as: 'twin',
          },
        },
        { $unwind: '$twin' },
        {
          $lookup: {
            from: 'companies',
            let: { ownerId: '$twin._id' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: [{ $toString: '$_id' }, '$$ownerId'], // match each owner_company_id to _id of company
                  },
                },
              },
              {
                $project: {
                  _id: 1,
                  company_name: 1,
                  company_image: { $ifNull: ['$company_image', null] },
                  company_ifric_id: 1,
                  address_1: 1,
                  city: 1,
                  country: 1,
                },
              },
            ],
            as: 'owner_company',
          },
        },
        { $unwind: '$owner_company' },
        {
          $project: {
            _id: '$owner_company._id',
            company_name: '$owner_company.company_name',
            company_ifric_id: '$owner_company.company_ifric_id',
            company_image: '$owner_company.company_image',
            company_address: '$owner_company.address_1',
            company_city: '$owner_company.city',
            company_country: '$owner_company.country',
          },
        },
      ]);
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

  async getCompanyCategory(company_ifric_id: string) {
    try {
      const companyData = await this.companyModel.find({ company_ifric_id });
      if (!companyData.length) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const companyCategoryData = await this.companyCategoryMappingModel.find({
        company_id: companyData[0].id,
      });
      if (!companyCategoryData.length) {
        throw new HttpException(
          'No company category found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      const categoryDetails = await this.companyCategoryModel.findById(
        companyCategoryData[0].category_id,
      );
      if (!categoryDetails) {
        throw new HttpException(
          'No category found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      return categoryDetails.category_name;
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

  async getManufacturerCompanies(count: number) {
    try {
      const manufacturerCategoryData = await this.companyCategoryModel.find({
        category_name: 'manufacturer',
      });
      if (!manufacturerCategoryData.length) {
        throw new HttpException(
          'No category found with manufacturer category name',
          HttpStatus.NOT_FOUND,
        );
      }

      const companyIds = await this.companyCategoryMappingModel.distinct(
        'company_id',
        { category_id: manufacturerCategoryData[0]._id },
      );

      if (!companyIds.length) {
        throw new HttpException(
          'No companies found with manufacturer category name',
          HttpStatus.NOT_FOUND,
        );
      }
      return await this.companyModel
        .aggregate([
          {
            $match: { _id: { $in: companyIds } },
          },
          {
            $project: {
              _id: 0,
              company_name: 1,
              company_image: { $ifNull: ['$company_image', null] },
              company_category: { $literal: 'manufacturer' },
              company_ifric_id: 1,
            },
          },
        ])
        .skip(count - 20)
        .limit(20);
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

  async getSearchedManufacturerCompanies(searched_text: string) {
    try {
      const manufacturerCategoryData = await this.companyCategoryModel.find({
        category_name: 'manufacturer',
      });
      if (!manufacturerCategoryData.length) {
        throw new HttpException(
          'No category found with manufacturer category name',
          HttpStatus.NOT_FOUND,
        );
      }

      const companyIds = await this.companyCategoryMappingModel.distinct(
        'company_id',
        { category_id: manufacturerCategoryData[0]._id },
      );

      if (!companyIds.length) {
        throw new HttpException(
          'No companies found with manufacturer category name',
          HttpStatus.NOT_FOUND,
        );
      }
      return await this.companyModel.aggregate([
        {
          $match: {
            _id: { $in: companyIds },
            company_name: { $regex: searched_text, $options: 'i' },
          },
        },
        {
          $project: {
            _id: 0,
            company_name: 1,
            company_image: { $ifNull: ['$company_image', null] },
            company_category: { $literal: 'manufacturer' },
            company_ifric_id: 1,
          },
        },
      ]);
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

  async getManufacturerAndOwnerCompanies() {
    try {
      const categoryData = await this.companyCategoryModel.find({
        category_name: { $in: ['manufacturer', 'factory_owner'] },
      });
      const categoryIds = categoryData.map((c) => c._id);

      const companyIds = await this.companyCategoryMappingModel.distinct(
        'company_id',
        { category_id: { $in: categoryIds } },
      );
      return this.companyModel.find({ _id: { $in: companyIds } });
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

  async updateCompany(id: string, data: RegisterAuthDto) {
    try {
      const companyData = await this.companyModel.find({
        company_ifric_id: id,
      });
      if (companyData.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const companyId = companyData[0].id;
      const response = await this.companyModel.findByIdAndUpdate(
        companyId,
        data,
        { new: true },
      );
      const companyCategoryMappingData =
        await this.companyCategoryMappingModel.find({
          company_id: companyId,
        });
      const companyCategoryData = await this.companyCategoryModel.findById(
        companyCategoryMappingData[0].category_id,
      );
      response['company_category'] = companyCategoryData.category_name;
      return {
        status: 204,
        message: 'Company Details Updated Successfully',
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

  async updateAccessGroup(id: string, data: UpdateAccessGroupDto) {
    try {
      const response = await this.accessGroupModel.findByIdAndUpdate(id, data, {
        new: true,
      });
      if (!response) {
        throw new HttpException(
          'Specified Access Group Not Found',
          HttpStatus.NOT_FOUND,
        );
      }
      return {
        status: 204,
        message: 'Company Access Group Updated Successfully',
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

  async deleteCompany(id: string) {
    try {
      const companyResponse = await this.companyModel.find({
        company_ifric_id: id,
      });
      if (companyResponse.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const companyId = companyResponse[0].id;
      await this.companyProductModel.deleteMany({ company_id: companyId });
      await this.companyUserModel.deleteMany({ company_id: companyId });
      await this.accessGroupModel.deleteMany({ company_id: companyId });
      await this.companyCategoryMappingModel.deleteOne({
        company_id: companyId,
      });
      await this.companyAssetModel.deleteMany({ company_id: companyId });
      await this.companyGateWayModel.deleteMany({ company_id: companyId });
      await this.companyServerModel.deleteMany({ company_id: companyId });
      const companyUser = await this.companyUserModel.find({
        company_id: companyId,
      });
      if (companyUser.length > 0) {
        for (let i = 0; i < companyUser.length; i++) {
          await this.userProductAccessGroupModel.deleteMany({
            user_id: companyUser[i].id,
          });
          await this.companyUserModel.deleteOne({ _id: companyUser[i].id });
        }
      }
      return await this.companyModel.deleteOne({ _id: id });
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

  async deleteAccessgroup(id: string) {
    try {
      return await this.accessGroupModel.deleteOne({ _id: id });
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

  async deleteCompanyAsset(id: string) {
    try {
      return await this.companyAssetModel.deleteOne({ asset_ifric_id: id });
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

  async deleteCompanyAssets(assetIds: string[]) {
    try {
      return await this.companyAssetModel.deleteMany({
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

  async deleteCompanyGateway(id: string) {
    try {
      return await this.companyGateWayModel.deleteOne({ _id: id });
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

  async deleteCompanyServer(id: string) {
    try {
      return await this.companyServerModel.deleteOne({ _id: id });
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

  // Only used internally by createCompany — provisions the admin CompanyUser
  // for a newly created company (not a public endpoint).
  private async createAdminUser(data: UserAccessDto) {
    const session = await this.connection.startSession();
    session.startTransaction();
    const temp_product_access_group_ids: string[] = [];

    try {
      // 1. Check if user already exists
      const existingUser = await this.companyUserModel
        .findOne({ user_email: data.user_email })
        .session(session);
      if (existingUser) {
        throw new HttpException('User already exists', HttpStatus.CONFLICT);
      }

      // 2. Get company ID
      const company = await this.companyModel
        .findOne({ company_ifric_id: data.company_ifric_id })
        .session(session);
      if (!company) {
        throw new HttpException('Company not found', HttpStatus.NOT_FOUND);
      }
      const companyId = company.id;

      // 3. Create a refresh token — CompanyUser doesn't exist yet, so this
      // just signs it; it's persisted below as part of the user doc itself.
      const token = await this.signRefreshToken(companyId, data.user_email);

      // 4. Encrypt password
      const encryptedPassword = await this.hashPassword(data.user_password);

      // 5. Save user
      const user = await new this.companyUserModel({
        company_id: companyId,
        user_email: data.user_email,
        user_password: encryptedPassword,
        user_name: data.user_name,
        jwt_token: token,
        meta_data: {
          created_at: moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
          updated_at: moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
          add_by: data.user_email,
        },
      }).save({ session });

      // 6. Assign products + access groups. p.product is a plain product
      // identifier (internal module name or external product_ifric_id),
      // not a local catalog reference — see UserProductAccessGroup schema.
      for (const p of data.products) {
        const accessGroup = await this.accessGroupModel
          .findOne({
            company_id: companyId,
            group_name: p.user_role,
          })
          .session(session);
        if (!accessGroup) continue;

        await new this.userProductAccessGroupModel({
          user_id: user.id,
          product_ifric_id: p.product,
          access_group_id: accessGroup.id,
        }).save({ session });
        temp_product_access_group_ids.push(p.product);
      }

      // 7. Commit if all went fine
      await session.commitTransaction();
      return {
        status: 201,
        message: 'Admin User Created Successfully',
        userId: user.id,
        productAccessGroupIds: temp_product_access_group_ids,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      if (err.response)
        throw new HttpException(err.response.data.message, err.response.status);
      throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
    } finally {
      session.endSession();
    }
  }

  // One-way password hashing, duplicated from AuthService — only used
  // internally by createAdminUser. Passwords are never stored or returned
  // in reversible form.
  private async hashPassword(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, BCRYPT_SALT_ROUNDS);
  }

  // Signs (but does not persist) a refresh-token JWT — duplicated from
  // AuthService.signRefreshToken, since createAdminUser needs to set
  // CompanyUser.jwt_token as part of the initial document, before the user
  // exists for AuthService's persist-and-update version to target.
  private async signRefreshToken(
    companyId: string,
    userEmail: string,
  ): Promise<string> {
    return this.jwtService.signAsync(
      { sub: companyId, user: userEmail, type: 'refresh' },
      { secret: jwtConstants.secret, expiresIn: '30d' },
    );
  }
}
