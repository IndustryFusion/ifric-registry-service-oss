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
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CompanyService } from './company.service';
import { AssetService } from './asset.service';
import { CompanyCreationApiKeyGuard } from './company-creation-key.guard';
import { AuthUser } from '../auth/auth-user.decorator';
import { AuthTokenClaims } from '../auth/auth-token-claims.interface';
import { RegisterAuthDto, AddStatusDto } from '../auth/dto/register-auth.dto';
import { CompanyDeviceDto } from '../auth/dto/company-device.dto';
import { AccessGroupDto } from '../auth/dto/access-group.dto';
import { UpdateAccessGroupDto } from './dto/update-access-group.dto';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { UpdateFactoryDto } from './dto/update-factory.dto';
import { CreateAssetDto, UpdateAssetDto } from './dto/asset.dto';
import { COMPANY_CATEGORY_NAMES } from 'src/common/company-category.constants';
import { Public } from 'src/common/public.decorator';

@ApiTags('Company')
@ApiBearerAuth('access-token')
@Controller('company')
export class CompanyController {
  constructor(
    private readonly companyService: CompanyService,
    private readonly assetService: AssetService,
  ) {}

  // ===========================================================================
  // Factory-keyed lookups — start from a factory id
  // ===========================================================================

  /**
   * Collection endpoint. Pass owner_company_ifric_id as a query parameter
   * to list only the factories owned by that company.
   */
  @Get('factories')
  @ApiOperation({
    summary: 'Get all factories, optionally filtered by owner',
    description:
      'Pass owner_company_ifric_id to filter to just the factories owned ' +
      'by that company (required to be your own company — this is not a ' +
      'cross-company directory). Omitting it lists every factory across ' +
      'every company.',
  })
  @ApiQuery({
    name: 'owner_company_ifric_id',
    required: false,
    description: 'Filter to factories owned by this company',
    example: 'urn:ifric:ifx-eur-com-own-42ced491-b35d-41f7-9949-fcbb5fa4dcd9',
  })
  getFactories(
    @Query('owner_company_ifric_id') ownerCompanyIfricId: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getFactories(ownerCompanyIfricId, authUser);
  }

  /**
   * Factory-centric entry point: starts from a factory id instead of a
   * product URN. Pass the factory id as the :id path parameter.
   */
  @Get('factories/:id')
  @ApiOperation({
    summary: 'Get factory details for a factory id',
  })
  @ApiParam({
    name: 'id',
    description:
      'Factory id, e.g. urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
    example: 'urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
  })
  getFactoryById(
    @Param('id') factoryId: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getFactoryById(factoryId, authUser);
  }

  /**
   * Pass the factory id as the :id path parameter.
   */
  @Get('factories/:id/owner')
  @ApiOperation({
    summary: 'Get the owner company for a factory id',
  })
  @ApiParam({
    name: 'id',
    description:
      'Factory id, e.g. urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
    example: 'urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
  })
  getFactoryOwner(
    @Param('id') factoryId: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getFactoryOwner(factoryId, authUser);
  }

  /**
   * Pass the factory id as the :id path parameter.
   */
  @Get('factories/:id/products')
  @ApiOperation({
    summary: 'Get all asset URNs located at a factory id',
    description:
      'Returns every asset URN (see GET /company/assets/*) whose ' +
      'factory_id resolves to this factory id.',
  })
  @ApiParam({
    name: 'id',
    description:
      'Factory id, e.g. urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
    example: 'urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
  })
  getFactoryProducts(
    @Param('id') factoryId: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getFactoryProducts(factoryId, authUser);
  }
  @Post('factories')
  @ApiOperation({
    summary: 'Create a factory tagged to an owner company',
    description:
      'Creates a physical factory location and tags it to an owner ' +
      'company via owner_company_ifric_id.',
  })
  @ApiBody({
    description: 'Details for creating a factory',
    required: true,
    schema: {
      type: 'object',
      required: ['factory_id', 'owner_company_ifric_id'],
      properties: {
        factory_id: {
          type: 'string',
          example:
            'urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
        },
        owner_company_ifric_id: {
          type: 'string',
          example:
            'urn:ifric:ifx-eur-com-own-42ced491-b35d-41f7-9949-fcbb5fa4dcd9',
        },
        location_name: { type: 'string', example: 'Plant 1' },
        address_1: { type: 'string', example: '123 Main St' },
        city: { type: 'string', example: 'Berlin' },
        country: { type: 'string', example: 'Germany' },
        zip: { type: 'string', example: '10115' },
        latitude: { type: 'number', example: 52.52 },
        longitude: { type: 'number', example: 13.405 },
        timezone: { type: 'string', example: 'Europe/Berlin' },
      },
    },
  })
  createFactory(
    @Body() data: CreateFactoryDto,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.createFactory(data, authUser);
  }
  @Patch('factories/:id')
  @ApiOperation({
    summary: 'Update a factory',
    description: 'Updates the location details of an existing factory.',
  })
  @ApiParam({
    name: 'id',
    description: 'Factory id',
    example: 'urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
  })
  updateFactory(
    @Param('id') id: string,
    @Body() data: UpdateFactoryDto,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.updateFactory(id, data, authUser);
  }
  @Delete('factories/:id')
  @ApiOperation({
    summary: 'Delete a factory',
    description:
      'Deletes a factory. Fails with 409 if any asset still references this factory_id.',
  })
  @ApiParam({
    name: 'id',
    description: 'Factory id',
    example: 'urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
  })
  deleteFactory(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.deleteFactory(id, authUser);
  }

  // ===========================================================================
  // Assets — merges what used to be separate "physical asset" and "digital
  // twin" concepts. A row starts physical-only (just company_ifric_id) and
  // becomes a twin once owner_company_ifric_id (+ optionally factory_id)
  // is set — same asset, same id, throughout. See AssetService.
  // ===========================================================================
  @Post('assets')
  @ApiOperation({
    summary: 'Create an asset',
    description:
      'company_ifric_id is the registering/manufacturer company (always ' +
      'required). Provide owner_company_ifric_id (+ optionally factory_id) ' +
      'now to create it already "twinned", or add them later via PATCH.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['asset_ifric_id', 'company_ifric_id'],
      properties: {
        asset_ifric_id: {
          type: 'string',
          example: 'urn:asset:alpha-machine-001',
        },
        company_ifric_id: {
          type: 'string',
          example:
            'urn:ifric:ifx-eur-com-own-42ced491-b35d-41f7-9949-fcbb5fa4dcd9',
        },
        owner_company_ifric_id: { type: 'string' },
        factory_id: { type: 'string' },
      },
    },
  })
  createAsset(
    @Body() data: CreateAssetDto,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.assetService.createAsset(data, authUser);
  }
  @Patch('assets/:id')
  @ApiOperation({
    summary: 'Update an asset — setting owner_company_ifric_id "twins" it',
  })
  @ApiParam({ name: 'id', description: 'Asset URN (asset_ifric_id)' })
  updateAsset(
    @Param('id') id: string,
    @Body() data: UpdateAssetDto,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.assetService.updateAsset(id, data, authUser);
  }
  @Delete('assets/bulk')
  @ApiBody({ schema: { type: 'array', items: { type: 'string' } } })
  deleteAssets(
    @Body() assetIds: string[],
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.assetService.deleteAssets(assetIds, authUser);
  }
  @Delete('assets/:id')
  @ApiParam({ name: 'id', description: 'Asset URN (asset_ifric_id)' })
  deleteAsset(@Param('id') id: string, @AuthUser() authUser: AuthTokenClaims) {
    return this.assetService.deleteAsset(id, authUser);
  }
  @Get('assets')
  @ApiQuery({ name: 'company_ifric_id', required: true })
  getAssets(
    @Query('company_ifric_id') companyIfricId: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.assetService.getAssets(companyIfricId, authUser);
  }
  @Get('assets/manufacturer/:company_ifric_id')
  getManufacturerAssets(
    @Param('company_ifric_id') companyIfricId: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.assetService.getManufacturerAssets(companyIfricId, authUser);
  }
  @Get('assets/owner/:company_ifric_id')
  getOwnerAssets(
    @Param('company_ifric_id') companyIfricId: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.assetService.getOwnerAssets(companyIfricId, authUser);
  }
  @Get(
    'assets/manufacturer/:manufacturer_company_ifric_id/owner/:owner_company_ifric_id',
  )
  getManufacturerOwnerAssets(
    @Param('manufacturer_company_ifric_id') manufacturerIfricId: string,
    @Param('owner_company_ifric_id') ownerIfricId: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.assetService.getManufacturerOwnerAssets(
      manufacturerIfricId,
      ownerIfricId,
      authUser,
    );
  }
  @Get('assets/count')
  @ApiQuery({
    name: 'asset_ifric_ids',
    required: true,
    description: 'Comma-separated asset URNs',
  })
  getAssetCount(
    @Query('asset_ifric_ids') assetIfricIds: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.assetService.getAssetCount(
      (assetIfricIds ?? '').split(','),
      authUser,
    );
  }
  @Get('assets/count/:company_ifric_id')
  getAssetCountByCompany(
    @Param('company_ifric_id') companyIfricId: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.assetService.getAssetCountByCompany(companyIfricId, authUser);
  }
  @Get('assets/:id/manufacturer')
  getAssetManufacturer(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.assetService.getAssetManufacturer(id, authUser);
  }
  @Get('assets/:id/owner')
  getAssetOwner(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.assetService.getAssetOwner(id, authUser);
  }
  @Get('assets/:id/factory-location')
  getAssetFactoryLocation(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.assetService.getAssetFactoryLocation(id, authUser);
  }
  @Get('assets/:id')
  getAssetByAssetIfricId(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.assetService.getAssetByAssetIfricId(id, authUser);
  }

  // ===========================================================================
  // Company CRUD, access groups, gateway/server
  // ===========================================================================
  @Post('devices')
  @ApiBody({
    description: 'Details for creating a company gateway/server',
    required: true,
    schema: {
      type: 'object',
      required: ['type', 'company_ifric_id'],
      properties: {
        type: {
          type: 'string',
          enum: ['gateway', 'server'],
          example: 'gateway',
        },
        company_ifric_id: {
          type: 'string',
          example: 'IFRIC12345',
        },
        gateway_ifric_id: {
          type: 'string',
          description: 'Required when type is "gateway"',
          example: 'GATEWAY112233',
        },
        server_ifric_id: {
          type: 'string',
          description: 'Required when type is "server"',
          example: 'SERVER445566',
        },
      },
    },
  })
  createCompanyDevice(
    @Body() data: CompanyDeviceDto,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.createCompanyDevice(data, authUser);
  }
  @Post('create-access-group/:id')
  @ApiBody({
    description: 'Details for creating an access group',
    required: true,
    schema: {
      type: 'object',
      properties: {
        company_id: {
          type: 'string',
          example: 'COMPANY12345',
        },
        group_name: {
          type: 'string',
          example: 'Admin Group',
        },
        create: {
          type: 'boolean',
          example: true,
        },
        read: {
          type: 'boolean',
          example: true,
        },
        update: {
          type: 'boolean',
          example: false,
        },
        delete: {
          type: 'boolean',
          example: false,
        },
      },
      required: [
        'company_id',
        'group_name',
        'create',
        'read',
        'update',
        'delete',
      ],
    },
  })
  createAccessGroup(
    @Param('id') id: string,
    @Body() data: AccessGroupDto,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.createAccessGroup(id, data, authUser);
  }

  @UseGuards(CompanyCreationApiKeyGuard)
  @ApiHeader({
    name: 'X-API-Key',
    description:
      'Placeholder gate ahead of a real external-API-token flow — must ' +
      'match COMPANY_CREATION_API_KEY. No Keycloak bearer token is ' +
      "required here, since the company's users have no Keycloak accounts " +
      'yet at creation time.',
    required: true,
  })
  @Public()
  @Post('create-company')
  @ApiBody({
    description:
      'Details for creating a company. company_ifric_id is deliberately ' +
      'absent: it is minted by ICID during this call and assigned by ' +
      'CompanyService.createCompany, so anything a caller sends is ' +
      'overwritten before it is ever read.',
    required: true,
    schema: {
      type: 'object',
      properties: {
        company_name: {
          type: 'string',
          example: 'Example Company Ltd.',
        },
        registration_number: {
          type: 'string',
          example: 'REG123456',
        },
        address_1: {
          type: 'string',
          example: '123 Main Street',
        },
        city: {
          type: 'string',
          example: 'New York',
        },
        country: {
          type: 'string',
          description:
            'Full official country name as recognised by the countries-list ' +
            "package — e.g. 'United States', 'United Kingdom', 'Germany'. " +
            'Abbreviations and ISO codes are rejected.',
          example: 'United States',
        },
        zip: {
          type: 'string',
          example: '10001',
        },
        admin_name: {
          type: 'string',
          example: 'John Admin',
        },
        position: {
          type: 'string',
          example: 'CEO',
        },
        email: {
          type: 'string',
          example: 'admin@example.com',
        },
        company_size: {
          type: 'string',
          example: '100-500',
        },
        company_category: {
          type: 'string',
          enum: [...COMPANY_CATEGORY_NAMES],
          example: 'manufacturer',
          description:
            'Must be one of the predefined company categories — see ' +
            'GET /company/get-categories for the current list.',
        },
        meta_data: {
          type: 'object',
          additionalProperties: true,
          example: { industry: 'Technology', revenue: '1M+' },
        },
        company_domain: {
          type: 'string',
          example: 'example.com',
        },
      },
      required: [
        'company_name',
        'registration_number',
        'address_1',
        'city',
        'country',
        'zip',
        'admin_name',
        'position',
        'email',
        'company_size',
        'company_category',
        'meta_data',
        'company_domain',
      ],
    },
  })
  createCompany(@Body() data: RegisterAuthDto) {
    return this.companyService.createCompany(data);
  }
  @Post('add-status-detail')
  @ApiBody({
    description: 'Add a status for a company',
    required: true,
    schema: {
      type: 'object',
      properties: {
        company_id: {
          type: 'string',
          example: 'COMPANY_ID_123',
          description: 'The unique ID of the company',
        },
        status: {
          type: 'string',
          example: 'verified',
          description:
            'The status to be set for the company (e.g., new, verify, verified, unverified)',
        },
      },
      required: ['company_id', 'status'],
    },
  })
  addStatusDetail(
    @Body() data: AddStatusDto,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.addStatusDetail(data, authUser);
  }
  @Get('/get-company-access-group/:id')
  getCompanyAccessGroup(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getCompanyAccessGroup(id, authUser);
  }
  @Get('/get-access-group-by-group-name/:company_id/:group_name')
  getAccessGroupByGroupName(
    @Param('company_id') company_id: string,
    @Param('group_name') group_name: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getAccessGroupByGroupName(
      company_id,
      group_name,
      authUser,
    );
  }
  @Get('/get-access-group/:id')
  getAccessGroup(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getAccessGroup(id, authUser);
  }
  @Get('/get-category-specific-company/:categoryName')
  getCategorySpecificCompanies(@Param('categoryName') categoryName: string) {
    return this.companyService.getCategorySpecificCompanies(categoryName);
  }
  @Get('/get-company-details/:id')
  getCompanyDetails(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getCompanyDetails(id, authUser);
  }
  @Get('/get-company-details-id/:id')
  getCompanyDetailsByID(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getCompanyDetailsbyRecord(id, authUser);
  }
  @Get('/get-company-contact-details/:company_ifric_id')
  getCompanyContactDetails(
    @Param('company_ifric_id') company_ifric_id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getCompanyContactDetails(
      company_ifric_id,
      authUser,
    );
  }

  @Public()
  @Get('/companies/check')
  checkCompaniesByCompanyNameAndRegistrationNumber(
    @Query('company_name') company_name: string,
    @Query('registration_number') registration_number: string,
  ) {
    return this.companyService.checkCompaniesByCompanyNameAndRegistrationNumber(
      company_name,
      registration_number,
    );
  }
  @Get('/get-company-details-by-email/:email')
  getCompanyDetailsByEmail(
    @Param('email') email: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getCompanyDetailsByEmail(email, authUser);
  }
  @Get('/get-company-details-by-name/:company_name')
  getCompanyDetailsByName(
    @Param('company_name') company_name: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getCompanyDetailsByName(company_name, authUser);
  }
  @Get('/get-company-and-user-details/:company_ifric_id')
  getCompanyAndUserDetails(
    @Param('company_ifric_id') company_ifric_id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getCompanyAndUserDetails(
      company_ifric_id,
      authUser,
    );
  }
  @Get('/get-all-companies')
  getAllCompanies() {
    return this.companyService.getAllCompanies();
  }
  @Get('/get-all-owner-companies/:company_ifric_id')
  getUniqueOwnerCompanies(
    @Param('company_ifric_id') company_ifric_id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.getUniqueOwnerCompanies(
      company_ifric_id,
      authUser,
    );
  }
  @Get('get-company-category/:company_ifric_id')
  getCompanyCategory(@Param('company_ifric_id') company_ifric_id: string) {
    return this.companyService.getCompanyCategory(company_ifric_id);
  }

  /**
   * Returns the predefined, closed list of company categories (e.g.
   * manufacturer, machine_builder, factory_owner) as seeded by
   * POST /script. company_category on create-company/update-company must
   * be one of the category_name values returned here.
   */
  @Get('get-categories')
  @ApiOperation({
    summary: 'Get the predefined list of company categories',
    description:
      'Returns every row in company_categories — the closed, seeded set ' +
      'of valid values for company_category on POST /company/create-company ' +
      'and PATCH /company/update-company/:id. Seed with POST /script if ' +
      'this returns empty.',
  })
  getCompanyCategories() {
    return this.companyService.getCompanyCategories();
  }
  @Get('get-manufacturer-companies/:count')
  getManufacturerCompanies(@Param('count') count: string) {
    return this.companyService.getManufacturerCompanies(+count);
  }
  @Get('get-searched-manufacturer-companies/:searched_text')
  getSearchedManufacturerCompanies(
    @Param('searched_text') searched_text: string,
  ) {
    return this.companyService.getSearchedManufacturerCompanies(searched_text);
  }
  @Get('get-manufacturer-owner-companies')
  getManufacturerAndOwnerCompanies() {
    return this.companyService.getManufacturerAndOwnerCompanies();
  }
  @Patch('/update-company/:id')
  @ApiBody({
    description: 'Details for creating a company',
    required: true,
    schema: {
      type: 'object',
      properties: {
        company_name: {
          type: 'string',
          example: 'Example Company Ltd.',
        },
        registration_number: {
          type: 'string',
          example: 'REG123456',
        },
        address_1: {
          type: 'string',
          example: '123 Main Street',
        },
        city: {
          type: 'string',
          example: 'New York',
        },
        country: {
          type: 'string',
          description:
            'Full official country name as recognised by the countries-list ' +
            "package — e.g. 'United States', 'United Kingdom', 'Germany'. " +
            'Abbreviations and ISO codes are rejected.',
          example: 'United States',
        },
        zip: {
          type: 'string',
          example: '10001',
        },
        admin_name: {
          type: 'string',
          example: 'John Admin',
        },
        position: {
          type: 'string',
          example: 'CEO',
        },
        email: {
          type: 'string',
          example: 'admin@example.com',
        },
        company_size: {
          type: 'string',
          example: '100-500',
        },
        company_category: {
          type: 'string',
          enum: [...COMPANY_CATEGORY_NAMES],
          example: 'manufacturer',
          description:
            'Must be one of the predefined company categories — see ' +
            'GET /company/get-categories for the current list.',
        },
        meta_data: {
          type: 'object',
          additionalProperties: true,
          example: { industry: 'Technology', revenue: '1M+' },
        },
        company_domain: {
          type: 'string',
          example: 'example.com',
        },
      },
      required: [
        'company_name',
        'registration_number',
        'address_1',
        'city',
        'country',
        'zip',
        'admin_name',
        'position',
        'email',
        'company_size',
        'company_category',
        'meta_data',
        'company_domain',
      ],
    },
  })
  updateCompany(
    @Param('id') id: string,
    @Body() data: RegisterAuthDto,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.updateCompany(id, data, authUser);
  }
  @Patch('/update-access-group/:id')
  @ApiBody({
    description: 'Fields to update on an access group',
    required: true,
    schema: {
      type: 'object',
      properties: {
        group_name: {
          type: 'string',
          example: 'Admin Group',
          description: 'Name of the access group',
        },
        create: {
          type: 'boolean',
          example: true,
          description: 'Permission to create resources',
        },
        read: {
          type: 'boolean',
          example: true,
          description: 'Permission to read resources',
        },
        update: {
          type: 'boolean',
          example: true,
          description: 'Permission to update resources',
        },
        delete: {
          type: 'boolean',
          example: false,
          description: 'Permission to delete resources',
        },
      },
    },
  })
  updateAccessGroup(
    @Param('id') id: string,
    @Body() data: UpdateAccessGroupDto,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.updateAccessGroup(id, data, authUser);
  }
  @Delete('/delete-company/:id')
  deleteCompany(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.deleteCompany(id, authUser);
  }
  @Delete('/delete-access-group/:id')
  deleteAccessgroup(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.deleteAccessgroup(id, authUser);
  }
  @Delete('/delete-company-gateway/:id')
  deleteCompanyGateway(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.deleteCompanyGateway(id, authUser);
  }
  @Delete('/delete-company-server/:id')
  deleteCompanyServer(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.companyService.deleteCompanyServer(id, authUser);
  }
}
