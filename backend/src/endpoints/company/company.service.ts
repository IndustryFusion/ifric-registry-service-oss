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

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, Repository } from 'typeorm';
import axios from 'axios';
import * as moment from 'moment';
import { getCountryCode, countries } from 'countries-list';
import * as generator from 'generate-password';
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
import { COMPANY_CATEGORY_NAMES } from 'src/common/company-category.constants';
import { CertificateService } from '../certificate/certificate.service';
import { KeycloakService } from '../auth/keycloak.service';
import { RegisterAuthDto, AddStatusDto } from '../auth/dto/register-auth.dto';
import { CompanyDeviceDto } from '../auth/dto/company-device.dto';
import { AccessGroupDto } from '../auth/dto/access-group.dto';
import { UpdateAccessGroupDto } from './dto/update-access-group.dto';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { UpdateFactoryDto } from './dto/update-factory.dto';
import { envConstants } from 'src/common/env.constants';
import { generateId } from 'src/database/generate-id';
import {
  AccessControlService,
  Permission,
} from 'src/common/access-control.service';
import { PublicCompanyService } from 'src/common/public-company.service';
import { AuthTokenClaims } from '../auth/auth-token-claims.interface';
import {
  COMPANY_REGISTRATION_HOOK,
  CompanyRegistrationEvent,
  CompanyRegistrationHook,
} from './company-registration.hook';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    @InjectRepository(Company) private companyRepository: Repository<Company>,
    @InjectRepository(Asset)
    private assetRepository: Repository<Asset>,
    @InjectRepository(Factory) private factoryRepository: Repository<Factory>,
    @InjectRepository(CompanyUser)
    private companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(CompanyCategory)
    private companyCategoryRepository: Repository<CompanyCategory>,
    @InjectRepository(CompanyCategoryMapping)
    private companyCategoryMappingRepository: Repository<CompanyCategoryMapping>,
    @InjectRepository(CompanyGateWay)
    private companyGateWayRepository: Repository<CompanyGateWay>,
    @InjectRepository(CompanyServer)
    private companyServerRepository: Repository<CompanyServer>,
    @InjectRepository(Product) private productRepository: Repository<Product>,
    @InjectRepository(AccessGroup)
    private accessGroupRepository: Repository<AccessGroup>,
    @InjectRepository(UserAccessGroup)
    private userAccessGroupRepository: Repository<UserAccessGroup>,
    private readonly certificateService: CertificateService,
    private keycloakService: KeycloakService,
    private readonly accessControlService: AccessControlService,
    private readonly publicCompanyService: PublicCompanyService,
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional()
    @Inject(COMPANY_REGISTRATION_HOOK)
    private readonly companyRegistrationHook: CompanyRegistrationHook | null = null,
  ) {}

  private readonly icidUrl = envConstants.icidServiceBackendUrl;
  private readonly company_default_code = envConstants.companyDefaultCode;
  private readonly certificatesEnabled = envConstants.certificatesEnabled;

  // ===========================================================================
  // Factory-keyed lookups — start from a factory id
  //
  // Product-URN-keyed lookups (manufacturer/owner/factory-location for a
  // given product) live on ProductService instead — see
  // src/endpoints/product/product.service.ts.
  // ===========================================================================

  // The unfiltered form is a deliberate cross-company directory (same as
  // getAllCompanies), but it used to be the way *around* the owner check
  // rather than a narrower view: dropping the query parameter returned
  // every company's factories with full street address and coordinates.
  // Both branches now require read permission, and the directory branch is
  // projected — precise siting data is for the owner only.
  async getFactories(
    ownerCompanyIfricId: string | undefined,
    authUser: AuthTokenClaims,
  ): Promise<Record<string, any>[]> {
    await this.accessControlService.assertPermission(authUser, 'read');
    if (ownerCompanyIfricId) {
      this.accessControlService.assertCompanyMatch(
        authUser,
        ownerCompanyIfricId,
      );
      return this.factoryRepository.find({
        where: { owner_company_ifric_id: ownerCompanyIfricId },
      });
    }
    const factories = await this.factoryRepository.find();
    return factories.map((factory) => ({
      factory_id: factory.factory_id,
      owner_company_ifric_id: factory.owner_company_ifric_id,
      location_name: factory.location_name,
      city: factory.city,
      country: factory.country,
    }));
  }

  async getFactoryById(
    factoryId: string,
    authUser: AuthTokenClaims,
  ): Promise<Record<string, any>> {
    const factory = await this.factoryRepository.findOne({
      where: { factory_id: factoryId },
    });
    if (!factory) {
      return {
        factory: null,
        message: `No factory data found for factory id: ${factoryId}`,
      };
    }
    this.accessControlService.assertCompanyMatch(
      authUser,
      factory.owner_company_ifric_id,
    );
    await this.accessControlService.assertPermission(authUser, 'read');
    return factory;
  }

  async getFactoryOwner(
    factoryId: string,
    authUser: AuthTokenClaims,
  ): Promise<Record<string, any>> {
    const factory = await this.factoryRepository.findOne({
      where: { factory_id: factoryId },
    });
    if (!factory) {
      return {
        owner: null,
        message: `No factory data found for factory id: ${factoryId}`,
      };
    }
    this.accessControlService.assertCompanyMatch(
      authUser,
      factory.owner_company_ifric_id,
    );
    await this.accessControlService.assertPermission(authUser, 'read');

    const owner = await this.companyRepository.findOne({
      where: { company_ifric_id: factory.owner_company_ifric_id },
    });
    if (!owner) {
      return {
        owner: null,
        message: `No owner data found for factory id: ${factoryId}`,
      };
    }
    return owner;
  }

  async getFactoryProducts(
    factoryId: string,
    authUser: AuthTokenClaims,
  ): Promise<string[]> {
    const factory = await this.factoryRepository.findOne({
      where: { factory_id: factoryId },
    });
    if (!factory) {
      return [];
    }
    this.accessControlService.assertCompanyMatch(
      authUser,
      factory.owner_company_ifric_id,
    );
    await this.accessControlService.assertPermission(authUser, 'read');

    const assets = await this.assetRepository.find({
      where: { factory_id: factoryId },
    });
    return assets.map((asset) => asset.asset_ifric_id);
  }

  async createFactory(data: CreateFactoryDto, authUser: AuthTokenClaims) {
    try {
      const ownerCompany = await this.companyRepository.find({
        where: { company_ifric_id: data.owner_company_ifric_id },
      });
      if (ownerCompany.length === 0) {
        throw new HttpException(
          'Invalid owner_company_ifric_id',
          HttpStatus.NOT_FOUND,
        );
      }
      this.accessControlService.assertCompanyMatch(
        authUser,
        data.owner_company_ifric_id,
      );
      await this.accessControlService.assertPermission(authUser, 'create');

      const existing = await this.factoryRepository.find({
        where: { factory_id: data.factory_id },
      });
      if (existing.length > 0) {
        throw new HttpException('Factory already exists', HttpStatus.CONFLICT);
      }
      await this.factoryRepository.save(this.factoryRepository.create(data));
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

  async updateFactory(
    factoryId: string,
    data: UpdateFactoryDto,
    authUser: AuthTokenClaims,
  ) {
    try {
      const factory = await this.factoryRepository.findOne({
        where: { factory_id: factoryId },
      });
      if (!factory) {
        throw new HttpException(
          'No factory found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      this.accessControlService.assertCompanyMatch(
        authUser,
        factory.owner_company_ifric_id,
      );
      await this.accessControlService.assertPermission(authUser, 'update');

      const result = await this.factoryRepository.update(
        { factory_id: factoryId },
        data,
      );
      if (!(result.affected > 0)) {
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

  async deleteFactory(factoryId: string, authUser: AuthTokenClaims) {
    try {
      const factory = await this.factoryRepository.findOne({
        where: { factory_id: factoryId },
      });
      if (!factory) {
        throw new HttpException(
          'No factory found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      this.accessControlService.assertCompanyMatch(
        authUser,
        factory.owner_company_ifric_id,
      );
      await this.accessControlService.assertPermission(authUser, 'delete');

      const assetsAtFactory = await this.assetRepository.find({
        where: { factory_id: factoryId },
      });
      if (assetsAtFactory.length > 0) {
        throw new HttpException(
          'Cannot delete factory: still referenced by an asset',
          HttpStatus.CONFLICT,
        );
      }
      return await this.factoryRepository.delete({ factory_id: factoryId });
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

  // createCompany + the admin CompanyUser it provisions run as a single
  // QueryRunner transaction (previously two independent Mongo sessions,
  // collapsed now that cross-table ACID is native — a genuine
  // simplification with no visible change to this method's HTTP contract).
  // The ICID mint call stays outside the DB transaction and keeps its own
  // manual compensating DELETE on failure, since ICID is external and
  // can't be rolled back by SQL.
  async createCompany(data: RegisterAuthDto) {
    let temp_icid_company_id: string | null = null;
    // Kept outside the try so the rollback path can tell the hook what to
    // compensate. Null until the company and its admin actually exist.
    let registrationEvent: CompanyRegistrationEvent | null = null;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      const companyResponse = await this.companyRepository.find({
        where: { email: data.email },
      });
      const companyCheckResponse = await this.companyRepository.find({
        where: { company_name: data.company_name },
      });
      if (companyResponse.length > 0) {
        throw new HttpException('Mail Id already exists', HttpStatus.CONFLICT);
      } else if (companyCheckResponse.length > 0) {
        throw new HttpException('Company already exists', HttpStatus.CONFLICT);
      }

      // Fetch IFRIC ID From icid-service
      //
      // getCountryCode matches full official names only — no ISO codes, no
      // abbreviations, and case-sensitively — returning `false` for anything
      // else. Unguarded, that `false` reaches countries[undefined] and the
      // caller sees "Cannot read properties of undefined (reading
      // 'continent')" as a 500, which says nothing about which field was
      // wrong. A bad country is a caller error, so answer 400 and name it.
      const countryCode = getCountryCode(data.country);
      if (!countryCode || !countries[countryCode]) {
        throw new HttpException(
          `Unknown country "${data.country}". Use the full official name, ` +
            `e.g. "United States", "United Kingdom", "Germany" — ISO codes ` +
            `and abbreviations such as "USA" or "DE" are not accepted.`,
          HttpStatus.BAD_REQUEST,
        );
      }
      const regionCode = countries[countryCode].continent;
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

      await queryRunner.startTransaction();

      const company = await queryRunner.manager.save(
        Company,
        queryRunner.manager.create(Company, data as any),
      );

      const companyCategory = await queryRunner.manager.findOne(
        CompanyCategory,
        { where: { category_name: data.company_category } },
      );
      if (!companyCategory) {
        throw new HttpException(
          `Company category does not exist. Must be one of: ${COMPANY_CATEGORY_NAMES.join(', ')}`,
          HttpStatus.NOT_FOUND,
        );
      }

      await queryRunner.manager.save(
        CompanyCategoryMapping,
        queryRunner.manager.create(CompanyCategoryMapping, {
          category_id: companyCategory._id,
          company_id: company._id,
        }),
      );

      await queryRunner.manager.save(AccessGroup, [
        queryRunner.manager.create(AccessGroup, {
          company_id: company._id,
          group_name: 'read_only',
          create: false,
          read: true,
          update: false,
          delete: false,
        }),
        queryRunner.manager.create(AccessGroup, {
          company_id: company._id,
          group_name: 'admin',
          create: true,
          read: true,
          update: true,
          delete: true,
        }),
      ]);

      // Admin CompanyUser + per-product access grants — previously a
      // separate call to a private createAdminUser() opening its own
      // independent transaction; now folded into this same one.
      const existingUser = await queryRunner.manager.findOne(CompanyUser, {
        where: { user_email: data.email },
      });
      if (existingUser) {
        throw new HttpException('User already exists', HttpStatus.CONFLICT);
      }

      // Pre-generated so it can be stamped onto the Keycloak identity below
      // before the CompanyUser row exists — BaseEntity.assignId() only
      // fills _id in when it's unset, so passing it explicitly here is
      // preserved as-is.
      const adminUserId = generateId();

      // Provision the identity in Keycloak — credentials live there, not
      // in this table. company_ifric_id/user_id are stored as Keycloak user
      // attributes and projected into access tokens via a realm protocol
      // mapper (see docs/keycloak-setup.md), so every company-scoped
      // endpoint can check
      // the caller's own company/user against the request instead of
      // trusting body-supplied ids.
      await this.keycloakService.createUser(
        data.email,
        data.admin_name,
        temporaryPassword,
        { company_ifric_id: data.company_ifric_id, user_id: adminUserId },
      );
      const user = await queryRunner.manager.save(
        CompanyUser,
        queryRunner.manager.create(CompanyUser, {
          _id: adminUserId,
          company_id: company._id,
          user_email: data.email,
          user_name: data.admin_name,
          meta_data: {
            created_at: moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
            updated_at: moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
            add_by: data.email,
          },
        }),
      );

      // Grant the new admin their one AccessGroup role for this company.
      const adminAccessGroup = await queryRunner.manager.findOne(AccessGroup, {
        where: { company_id: company._id, group_name: 'admin' },
      });
      if (adminAccessGroup) {
        await queryRunner.manager.save(
          UserAccessGroup,
          queryRunner.manager.create(UserAccessGroup, {
            user_id: user._id,
            access_group_id: adminAccessGroup._id,
          }),
        );
      }

      // Inside the transaction on purpose: a deployment that cannot record
      // this company externally can throw here and the whole registration —
      // company, admin user, access groups, and the IFRIC id reserved above —
      // is undone, rather than leaving the two systems disagreeing.
      registrationEvent = {
        data,
        companyId: company._id,
        userId: user._id,
        temporaryPassword,
        manager: queryRunner.manager,
      };
      if (this.companyRegistrationHook) {
        await this.companyRegistrationHook.onCompanyRegistered(
          registrationEvent,
        );
      }

      await queryRunner.commitTransaction();

      return {
        success: true,
        status: 201,
        message: 'Company created successfully',
        company_ifric_id: data.company_ifric_id,
        temporaryPassword,
      };
    } catch (err) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      // Whatever the hook created lives outside this database, so the
      // rollback above does not touch it. Its own failure is logged rather
      // than thrown: it must not replace the error the caller needs to see.
      if (this.companyRegistrationHook && registrationEvent) {
        try {
          await this.companyRegistrationHook.onRegistrationRolledBack(
            registrationEvent,
          );
        } catch (hookErr) {
          this.logger.error(
            `Could not undo external registration side effects for ` +
              `${registrationEvent.data.email}: ${hookErr.message}`,
          );
        }
      }

      if (temp_icid_company_id) {
        await axios.delete(`${this.icidUrl}/company/` + temp_icid_company_id, {
          headers: {
            'Content-Type': 'application/json',
          },
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
      await queryRunner.release();
    }
  }

  // "asset" was dropped from this discriminator — POST /company/assets
  // supersedes it (see AssetService). Only gateway/server remain here.
  async createCompanyDevice(data: CompanyDeviceDto, authUser: AuthTokenClaims) {
    try {
      const companyData = await this.companyRepository.find({
        where: { company_ifric_id: data.company_ifric_id },
      });
      if (companyData.length === 0) {
        throw new HttpException(
          'Invalid Company Ifric Id',
          HttpStatus.CONFLICT,
        );
      }
      this.accessControlService.assertCompanyMatch(
        authUser,
        data.company_ifric_id,
      );
      await this.accessControlService.assertPermission(authUser, 'create');

      switch (data.type) {
        case 'gateway': {
          if (!data.gateway_ifric_id) {
            throw new HttpException(
              'gateway_ifric_id is required when type is "gateway"',
              HttpStatus.BAD_REQUEST,
            );
          }
          await this.companyGateWayRepository.save(
            this.companyGateWayRepository.create({
              company_id: companyData[0]._id,
              gateway_ifric_id: data.gateway_ifric_id,
            }),
          );
          break;
        }
        case 'server': {
          if (!data.server_ifric_id) {
            throw new HttpException(
              'server_ifric_id is required when type is "server"',
              HttpStatus.BAD_REQUEST,
            );
          }
          await this.companyServerRepository.save(
            this.companyServerRepository.create({
              company_id: companyData[0]._id,
              server_ifric_id: data.server_ifric_id,
            }),
          );
          break;
        }
        default:
          throw new HttpException(
            'type must be one of "gateway", "server"',
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

  // Access groups are the RBAC table itself, so writing one for another
  // company is a direct grant of permissions inside that company.
  async createAccessGroup(
    id: string,
    data: AccessGroupDto,
    authUser: AuthTokenClaims,
  ) {
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
      this.accessControlService.assertCompanyMatch(authUser, id);
      await this.accessControlService.assertPermission(authUser, 'create');

      data.company_id = response[0]._id;
      const checkAccessGroup = await this.accessGroupRepository.find({
        where: { company_id: response[0]._id, group_name: data.group_name },
      });
      if (checkAccessGroup.length > 0) {
        throw new HttpException(
          'Group Name already exists',
          HttpStatus.CONFLICT,
        );
      }

      await this.accessGroupRepository.save(
        this.accessGroupRepository.create(data),
      );
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

  // data.company_id is a company_ifric_id despite the name. This used to
  // take no caller identity at all, so any authenticated user could set any
  // company's verification status.
  async addStatusDetail(data: AddStatusDto, authUser: AuthTokenClaims) {
    try {
      this.accessControlService.assertCompanyMatch(authUser, data.company_id);
      await this.accessControlService.assertPermission(authUser, 'update');

      await this.companyRepository.update(
        { company_ifric_id: data.company_id },
        { company_verified: data.status.toLowerCase() },
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

  // Access groups are keyed on Company._id, not company_ifric_id, so the
  // boundary has to be recovered from the row before it can be asserted.
  // A row whose company has vanished falls through to '', which can never
  // match a real claim — missing context denies rather than skips.
  private async assertCallerOwnsCompanyRecord(
    companyId: string | undefined,
    authUser: AuthTokenClaims,
    permission: Permission = 'read',
  ): Promise<void> {
    const company = companyId
      ? await this.companyRepository.findOne({ where: { _id: companyId } })
      : null;
    this.accessControlService.assertCompanyMatch(
      authUser,
      company?.company_ifric_id ?? '',
    );
    await this.accessControlService.assertPermission(authUser, permission);
  }

  async getCompanyAccessGroup(id: string, authUser: AuthTokenClaims) {
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
      this.accessControlService.assertCompanyMatch(authUser, id);
      await this.accessControlService.assertPermission(authUser, 'read');

      return await this.accessGroupRepository.find({
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

  async getAccessGroupByGroupName(
    company_id: string,
    group_name: string,
    authUser: AuthTokenClaims,
  ) {
    try {
      await this.assertCallerOwnsCompanyRecord(company_id, authUser);
      return await this.accessGroupRepository.findOne({
        where: { company_id, group_name },
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

  async getAccessGroup(id: string, authUser: AuthTokenClaims) {
    try {
      const accessGroup = await this.accessGroupRepository.findOne({
        where: { _id: id },
      });
      if (!accessGroup) {
        return accessGroup;
      }
      await this.assertCallerOwnsCompanyRecord(
        accessGroup.company_id,
        authUser,
      );
      return accessGroup;
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
      const companyCategory = await this.companyCategoryRepository.find({
        where: { category_name: categoryName },
      });
      if (!(companyCategory.length > 0)) {
        throw new HttpException(
          'No company category with the provided name',
          HttpStatus.NOT_FOUND,
        );
      }
      const categoryMappingData =
        await this.companyCategoryMappingRepository.find({
          where: { category_id: companyCategory[0]._id },
        });
      const companyIds = categoryMappingData.map((m) => m.company_id);
      const companies = companyIds.length
        ? await this.companyRepository.find({ where: { _id: In(companyIds) } })
        : [];
      const companyById = new Map(companies.map((c) => [c._id, c]));

      const result = [];
      for (const mapping of categoryMappingData) {
        const companyData = companyById.get(mapping.company_id);
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

  // Cross-company reads are allowed but projected: the full record is the
  // caller's own company only. See PublicCompanyService for what "public"
  // means and why it is an allow-list.
  async getCompanyDetails(id: string, authUser: AuthTokenClaims) {
    try {
      await this.accessControlService.assertPermission(authUser, 'read');

      const companies = await this.companyRepository.find({
        where: { company_ifric_id: id },
      });
      if (this.accessControlService.isOwnCompany(authUser, id)) {
        return companies;
      }
      return await this.publicCompanyService.toPublicCompanies(companies);
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

  async getCompanyDetailsbyRecord(id: string, authUser: AuthTokenClaims) {
    try {
      const companies = await this.companyRepository.find({
        where: { _id: id },
      });
      if (!companies.length) {
        return companies;
      }
      await this.accessControlService.assertPermission(authUser, 'read');
      if (
        this.accessControlService.isOwnCompany(
          authUser,
          companies[0].company_ifric_id,
        )
      ) {
        return companies;
      }
      return await this.publicCompanyService.toPublicCompanies(companies);
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

  // Ported from a $match+$project aggregation with an explicit `_id: 0`
  // exclusion — this response never included `_id`/`__v`, unlike most other
  // endpoints in this file that return raw documents.
  async getCompanyContactDetails(
    company_ifric_id: string,
    authUser: AuthTokenClaims,
  ) {
    try {
      const company = await this.companyRepository.findOne({
        where: { company_ifric_id },
      });
      if (!company) {
        return [];
      }
      await this.accessControlService.assertPermission(authUser, 'read');
      // The named admin, their position and the company mailbox are not
      // public — a foreign caller gets the public profile instead, which
      // still carries the postal address this endpoint is mostly used for.
      if (!this.accessControlService.isOwnCompany(authUser, company_ifric_id)) {
        return await this.publicCompanyService.toPublicCompanies([company]);
      }

      return [
        {
          admin_name: company.admin_name,
          position: company.position,
          email: company.email,
          mobile_number: '**********',
          address: company.address_1,
          city: company.city,
          country: company.country,
          zip: company.zip,
        },
      ];
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

      const companyDataByName = await this.companyRepository.find({
        where: { company_name: decodeURIComponent(company_name) },
      });
      const companyDataByRegistrationNumber = await this.companyRepository.find(
        { where: { registration_number } },
      );

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

  // Was unscoped and returned raw Company rows to any authenticated caller
  // — including registration_number, meta_data and the legacy
  // temp_password column. Now the caller's own company is the only one that
  // resolves to a full record.
  async getCompanyDetailsByEmail(email: string, authUser: AuthTokenClaims) {
    try {
      await this.accessControlService.assertPermission(authUser, 'read');
      const companies = await this.companyRepository.find({ where: { email } });
      if (
        companies.length &&
        this.accessControlService.isOwnCompany(
          authUser,
          companies[0].company_ifric_id,
        )
      ) {
        return companies;
      }
      return await this.publicCompanyService.toPublicCompanies(companies);
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

  // Same over-exposure as getCompanyDetailsByEmail. Company names are not
  // unique, so this projects per row rather than off the first match.
  async getCompanyDetailsByName(
    company_name: string,
    authUser: AuthTokenClaims,
  ) {
    try {
      await this.accessControlService.assertPermission(authUser, 'read');
      const companies = await this.companyRepository.find({
        where: { company_name },
      });
      const own = companies.filter((company) =>
        this.accessControlService.isOwnCompany(
          authUser,
          company.company_ifric_id,
        ),
      );
      const foreign = companies.filter(
        (company) =>
          !this.accessControlService.isOwnCompany(
            authUser,
            company.company_ifric_id,
          ),
      );
      return [
        ...own,
        ...(await this.publicCompanyService.toPublicCompanies(foreign)),
      ];
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

  // Ported from the most complex aggregation in the codebase (2-level nested
  // $lookup+$group+$unwind). Assembled as plain queries + in-memory joins.
  //
  // Preserves a real pre-existing schema/query mismatch from the Mongo
  // version: its $lookups joined `companyproducts.product_id`/
  // `userproductmapping.product_id` against `products._id`, but
  // CompanyProduct/UserProductAccessGroup only ever had `product_ifric_id`
  // (a plain external identifier), never `product_id` — so those two
  // $lookups always matched zero documents. That means `company_products`
  // was always `[]` and every `user_products[].product_name` was always
  // absent, regardless of what products are actually tagged. Reproduced
  // as-is here (not "fixed") since this port's job is behavioral parity,
  // not a product-catalog redesign.
  async getCompanyAndUserDetails(
    company_ifric_id: string,
    authUser: AuthTokenClaims,
  ) {
    try {
      const company = await this.companyRepository.findOne({
        where: { company_ifric_id },
      });
      if (!company) {
        return [];
      }
      await this.accessControlService.assertPermission(authUser, 'read');
      // The user roster is the private half of this endpoint — a foreign
      // caller gets the public company profile with no company_users key at
      // all. An empty array would read as "this company has no users",
      // which is a different and untrue claim.
      if (!this.accessControlService.isOwnCompany(authUser, company_ifric_id)) {
        return await this.publicCompanyService.toPublicCompanies([company]);
      }

      const mapping = await this.companyCategoryMappingRepository.find({
        where: { company_id: company._id },
      });
      const category = mapping.length
        ? await this.companyCategoryRepository.findOne({
            where: { _id: mapping[0].category_id },
          })
        : null;

      const users = await this.companyUserRepository.find({
        where: { company_id: company._id },
      });
      const companyUsers = [];
      for (const user of users) {
        const accessRows = await this.userAccessGroupRepository.find({
          where: { user_id: user._id },
        });
        if (accessRows.length === 0) {
          // Matches $unwind(preserveNullAndEmptyArrays) on a user with no
          // access-group rows at all: a single user_products entry with
          // every field absent.
          companyUsers.push({
            user_name: user.user_name,
            user_email: user.user_email,
            user_products: [{}],
          });
          continue;
        }
        const user_products = [];
        for (const row of accessRows) {
          const accessGroup = await this.accessGroupRepository.findOne({
            where: { _id: row.access_group_id },
          });
          user_products.push({
            group_name: accessGroup?.group_name,
            create: accessGroup?.create,
            read: accessGroup?.read,
            update: accessGroup?.update,
            delete: accessGroup?.delete,
          });
        }
        companyUsers.push({
          user_name: user.user_name,
          user_email: user.user_email,
          user_products,
        });
      }

      return [
        {
          company_name: company.company_name,
          company_ifric_id: company.company_ifric_id,
          company_category: category?.category_name,
          company_address: company.address_1,
          company_city: company.city,
          company_country: company.country,
          company_products: [],
          company_users: companyUsers,
        },
      ];
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

  // Ported from an aggregation whose company-products $lookup pair was
  // duplicated verbatim (a no-op copy/paste in the Mongo version) — only
  // implemented once here. company_products is always [] for the same
  // schema-mismatch reason documented on getCompanyAndUserDetails.
  async getAllCompanies() {
    try {
      const companies = await this.companyRepository.find({
        order: { _id: 'DESC' },
      });
      const companyIds = companies.map((c) => c._id);
      const mappings = companyIds.length
        ? await this.companyCategoryMappingRepository.find({
            where: { company_id: In(companyIds) },
          })
        : [];
      const categoryIds = [...new Set(mappings.map((m) => m.category_id))];
      const categories = categoryIds.length
        ? await this.companyCategoryRepository.find({
            where: { _id: In(categoryIds) },
          })
        : [];
      const categoryNameById = new Map(
        categories.map((c) => [c._id, c.category_name]),
      );
      const mappingByCompanyId = new Map(
        mappings.map((m) => [m.company_id, m.category_id]),
      );

      const companyData = companies.map((company) => {
        const categoryId = mappingByCompanyId.get(company._id);
        return {
          company_name: company.company_name,
          company_image: company.company_image ?? null,
          company_category: categoryId
            ? categoryNameById.get(categoryId)
            : undefined,
          company_ifric_id: company.company_ifric_id,
          company_address: company.address_1,
          company_city: company.city,
          company_country: company.country,
          company_industry: company.industry,
          company_products: [],
          company_verified: company.company_verified,
        };
      });

      // Certificates are optional (see envConstants.certificatesEnabled) —
      // when disabled, or when ICID is unreachable, company listing should
      // still work; company_cert just defaults to false instead of failing
      // the whole request.
      let companiesVerifiedResponse: Record<string, boolean> = {};
      if (this.certificatesEnabled) {
        try {
          const companyIfricIds = companyData.map(
            (company) => company.company_ifric_id,
          );
          companiesVerifiedResponse =
            await this.certificateService.verifyAllCompanyCertificate(
              companyIfricIds,
            );
        } catch {
          companiesVerifiedResponse = {};
        }
      }
      return companyData.map((company) => ({
        ...company,
        company_cert:
          companiesVerifiedResponse[company.company_ifric_id] ?? false,
      }));
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

  // Ported from a self-join aggregation (Company -> Asset -> Company). The
  // original's explicit $toString ObjectId casts on both sides of the join
  // are unnecessary here — every id is already a plain string under this
  // migration's ID strategy, so this is a genuinely simpler port.
  async getUniqueOwnerCompanies(
    company_ifric_id: string,
    authUser: AuthTokenClaims,
  ) {
    try {
      const company = await this.companyRepository.findOne({
        where: { company_ifric_id },
      });
      if (!company) {
        return [];
      }
      this.accessControlService.assertCompanyMatch(authUser, company_ifric_id);
      await this.accessControlService.assertPermission(authUser, 'read');
      const assets = await this.assetRepository.find({
        where: { company_id: company._id, is_twin: true },
      });
      const ownerIds = [...new Set(assets.map((a) => a.owner_company_id))];
      if (!ownerIds.length) {
        return [];
      }
      const owners = await this.companyRepository.find({
        where: { _id: In(ownerIds) },
      });
      return owners.map((owner) => ({
        _id: owner._id,
        company_name: owner.company_name,
        company_ifric_id: owner.company_ifric_id,
        company_image: owner.company_image ?? null,
        company_address: owner.address_1,
        company_city: owner.city,
        company_country: owner.country,
      }));
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
      const companyData = await this.companyRepository.find({
        where: { company_ifric_id },
      });
      if (!companyData.length) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const companyCategoryData =
        await this.companyCategoryMappingRepository.find({
          where: { company_id: companyData[0]._id },
        });
      if (!companyCategoryData.length) {
        throw new HttpException(
          'No company category found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      const categoryDetails = await this.companyCategoryRepository.findOne({
        where: { _id: companyCategoryData[0].category_id },
      });
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

  async getCompanyCategories() {
    return this.companyCategoryRepository.find();
  }

  async getManufacturerCompanies(count: number) {
    try {
      const manufacturerCategoryData =
        await this.companyCategoryRepository.find({
          where: { category_name: 'manufacturer' },
        });
      if (!manufacturerCategoryData.length) {
        throw new HttpException(
          'No category found with manufacturer category name',
          HttpStatus.NOT_FOUND,
        );
      }

      const mappings = await this.companyCategoryMappingRepository.find({
        where: { category_id: manufacturerCategoryData[0]._id },
      });
      const companyIds = [...new Set(mappings.map((m) => m.company_id))];

      if (!companyIds.length) {
        throw new HttpException(
          'No companies found with manufacturer category name',
          HttpStatus.NOT_FOUND,
        );
      }

      // Postgres errors on a negative OFFSET (Mongo silently clamps it to
      // zero) — explicit clamp required to keep count < 20 working.
      const offset = Math.max(count - 20, 0);
      const companies = await this.companyRepository.find({
        where: { _id: In(companyIds) },
        skip: offset,
        take: 20,
      });
      return companies.map((c) => ({
        company_name: c.company_name,
        company_image: c.company_image ?? null,
        company_category: 'manufacturer',
        company_ifric_id: c.company_ifric_id,
      }));
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

  // $regex/$options:'i' ported to ILIKE — a minor, accepted behavior
  // difference: regex metacharacters in searched_text are matched literally
  // by ILIKE instead of interpreted as regex syntax.
  async getSearchedManufacturerCompanies(searched_text: string) {
    try {
      const manufacturerCategoryData =
        await this.companyCategoryRepository.find({
          where: { category_name: 'manufacturer' },
        });
      if (!manufacturerCategoryData.length) {
        throw new HttpException(
          'No category found with manufacturer category name',
          HttpStatus.NOT_FOUND,
        );
      }

      const mappings = await this.companyCategoryMappingRepository.find({
        where: { category_id: manufacturerCategoryData[0]._id },
      });
      const companyIds = [...new Set(mappings.map((m) => m.company_id))];

      if (!companyIds.length) {
        throw new HttpException(
          'No companies found with manufacturer category name',
          HttpStatus.NOT_FOUND,
        );
      }
      const companies = await this.companyRepository.find({
        where: {
          _id: In(companyIds),
          company_name: ILike(`%${searched_text}%`),
        },
      });
      return companies.map((c) => ({
        company_name: c.company_name,
        company_image: c.company_image ?? null,
        company_category: 'manufacturer',
        company_ifric_id: c.company_ifric_id,
      }));
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
      const categoryData = await this.companyCategoryRepository.find({
        where: { category_name: In(['manufacturer', 'factory_owner']) },
      });
      const categoryIds = categoryData.map((c) => c._id);
      if (!categoryIds.length) {
        return [];
      }

      const mappings = await this.companyCategoryMappingRepository.find({
        where: { category_id: In(categoryIds) },
      });
      const companyIds = [...new Set(mappings.map((m) => m.company_id))];
      if (!companyIds.length) {
        return [];
      }
      // A cross-company directory listing, like getAllCompanies — it
      // previously returned raw Company rows to every authenticated caller.
      // Public projection unconditionally: there is no "own company" branch
      // to take on a listing.
      const companies = await this.companyRepository.find({
        where: { _id: In(companyIds) },
      });
      return await this.publicCompanyService.toPublicCompanies(companies);
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

  async updateCompany(
    id: string,
    data: RegisterAuthDto,
    authUser: AuthTokenClaims,
  ) {
    try {
      const companyData = await this.companyRepository.find({
        where: { company_ifric_id: id },
      });
      if (companyData.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      this.accessControlService.assertCompanyMatch(authUser, id);
      await this.accessControlService.assertPermission(authUser, 'update');

      // company_category isn't a Company column — it lives on
      // CompanyCategoryMapping (see createCompany), so companyRepository.update
      // below silently ignores it. Re-point the mapping row explicitly
      // whenever a category change is requested.
      if (data.company_category) {
        const companyCategory = await this.companyCategoryRepository.findOne({
          where: { category_name: data.company_category },
        });
        if (!companyCategory) {
          throw new HttpException(
            `Company category does not exist. Must be one of: ${COMPANY_CATEGORY_NAMES.join(', ')}`,
            HttpStatus.NOT_FOUND,
          );
        }

        const existingMapping =
          await this.companyCategoryMappingRepository.findOne({
            where: { company_id: companyData[0]._id },
          });
        if (existingMapping) {
          await this.companyCategoryMappingRepository.update(
            { _id: existingMapping._id },
            { category_id: companyCategory._id },
          );
        } else {
          await this.companyCategoryMappingRepository.save(
            this.companyCategoryMappingRepository.create({
              category_id: companyCategory._id,
              company_id: companyData[0]._id,
            }),
          );
        }
      }

      // company_ifric_id is ICID-minted and is this tenant's identity: it is
      // what the access token's claim is matched against, and what the
      // dataspace's participant_id is a verbatim copy of. Letting it through
      // this blind pass-through would let a caller rename their own company
      // out from under their users' tokens, collide with another company's
      // id, and desync from ICID — so strip it rather than trust the body.
      // company_category_id goes too: the category is repointed above via
      // CompanyCategoryMapping, and it matches no Company column anyway.
      const updatable = { ...(data as any) };
      delete updatable.company_ifric_id;
      delete updatable.company_category_id;

      await this.companyRepository.update(
        { _id: companyData[0]._id },
        updatable,
      );
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

  async updateAccessGroup(
    id: string,
    data: UpdateAccessGroupDto,
    authUser: AuthTokenClaims,
  ) {
    try {
      const accessGroup = await this.accessGroupRepository.findOne({
        where: { _id: id },
      });
      if (!accessGroup) {
        throw new HttpException(
          'Specified Access Group Not Found',
          HttpStatus.NOT_FOUND,
        );
      }
      await this.assertCallerOwnsCompanyRecord(
        accessGroup.company_id,
        authUser,
        'update',
      );

      const result = await this.accessGroupRepository.update({ _id: id }, data);
      if (!(result.affected > 0)) {
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

  async deleteCompany(id: string, authUser: AuthTokenClaims) {
    try {
      const companyResponse = await this.companyRepository.find({
        where: { company_ifric_id: id },
      });
      if (companyResponse.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      this.accessControlService.assertCompanyMatch(authUser, id);
      await this.accessControlService.assertPermission(authUser, 'delete');

      const companyId = companyResponse[0]._id;

      // Fixed (per migration plan, not a Mongo-behavior-preserving port):
      // fetch the company's users BEFORE deleting them below, so their
      // UserAccessGroup rows can actually be cascade-deleted. The Mongo
      // version re-queried CompanyUser for this AFTER already deleting
      // them, so the cascade loop never ran and those rows were silently
      // orphaned on every company delete.
      const companyUser = await this.companyUserRepository.find({
        where: { company_id: companyId },
      });

      await this.companyUserRepository.delete({ company_id: companyId });
      await this.accessGroupRepository.delete({ company_id: companyId });
      await this.companyCategoryMappingRepository.delete({
        company_id: companyId,
      });
      await this.assetRepository.delete({ company_id: companyId });
      await this.companyGateWayRepository.delete({ company_id: companyId });
      await this.companyServerRepository.delete({ company_id: companyId });
      if (companyUser.length > 0) {
        for (const user of companyUser) {
          await this.userAccessGroupRepository.delete({
            user_id: user._id,
          });
        }
      }
      // Fixed: delete by the already-resolved internal _id, not the raw
      // company_ifric_id parameter (the Mongo version passed `id` — the
      // ifric id — directly as `_id`, which matched nothing).
      return await this.companyRepository.delete({ _id: companyId });
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

  async deleteAccessgroup(id: string, authUser: AuthTokenClaims) {
    try {
      const accessGroup = await this.accessGroupRepository.findOne({
        where: { _id: id },
      });
      if (!accessGroup) {
        return { affected: 0 };
      }
      await this.assertCallerOwnsCompanyRecord(
        accessGroup.company_id,
        authUser,
        'delete',
      );
      return await this.accessGroupRepository.delete({ _id: id });
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

  async deleteCompanyGateway(id: string, authUser: AuthTokenClaims) {
    try {
      const gateway = await this.companyGateWayRepository.findOne({
        where: { _id: id },
      });
      if (!gateway) {
        throw new HttpException(
          'No gateway found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      const company = await this.companyRepository.findOne({
        where: { _id: gateway.company_id },
      });
      this.accessControlService.assertCompanyMatch(
        authUser,
        company?.company_ifric_id,
      );
      await this.accessControlService.assertPermission(authUser, 'delete');

      return await this.companyGateWayRepository.delete({ _id: id });
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

  async deleteCompanyServer(id: string, authUser: AuthTokenClaims) {
    try {
      const server = await this.companyServerRepository.findOne({
        where: { _id: id },
      });
      if (!server) {
        throw new HttpException(
          'No server found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      const company = await this.companyRepository.findOne({
        where: { _id: server.company_id },
      });
      this.accessControlService.assertCompanyMatch(
        authUser,
        company?.company_ifric_id,
      );
      await this.accessControlService.assertPermission(authUser, 'delete');

      return await this.companyServerRepository.delete({ _id: id });
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
}
