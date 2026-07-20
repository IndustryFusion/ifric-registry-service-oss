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
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { CompanyService } from './company.service';
import { AuthGuard } from '../auth/auth.guard';
import { RegisterAuthDto, AddStatusDto } from '../auth/dto/register-auth.dto';
import { CompanyAssetDto } from '../auth/dto/company-asset.dto';
import { AccessGroupDto } from '../auth/dto/access-group.dto';
import { UpdateAccessGroupDto } from './dto/update-access-group.dto';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { UpdateFactoryDto } from './dto/update-factory.dto';
import { COMPANY_CATEGORY_NAMES } from 'src/common/company-category.constants';

@ApiTags('Company')
@ApiBearerAuth('access-token')
@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  // Product-URN-keyed lookups (manufacturer/owner/factory-location for a
  // given product) live on ProductController instead — see
  // src/endpoints/product/product.controller.ts (GET /product/:id,
  // /product/:id/owner, /product/:id/factory-location).

  // ===========================================================================
  // Factory-keyed lookups — start from a factory id
  // ===========================================================================

  /**
   * Collection endpoint. Pass owner_company_ifric_id as a query parameter
   * to list only the factories owned by that company.
   */
  @UseGuards(AuthGuard)
  @Get('factories')
  @ApiOperation({
    summary: 'Get all factories, optionally filtered by owner',
    description:
      'Returns every known factory. Pass owner_company_ifric_id to filter ' +
      'to just the factories owned by that company (the same id returned ' +
      'as company_ifric_id by /company/owners/:id and /company/factories/:id/owner).',
  })
  @ApiQuery({
    name: 'owner_company_ifric_id',
    required: false,
    description: 'Filter to factories owned by this company',
    example: 'urn:ifric:ifx-eur-com-own-42ced491-b35d-41f7-9949-fcbb5fa4dcd9',
  })
  getFactories(@Query('owner_company_ifric_id') ownerCompanyIfricId?: string) {
    return this.companyService.getFactories(ownerCompanyIfricId);
  }

  /**
   * Factory-centric entry point: starts from a factory id instead of a
   * product URN. Pass the factory id as the :id path parameter.
   */
  @UseGuards(AuthGuard)
  @Get('factories/:id')
  @ApiOperation({
    summary: 'Get factory details for a factory id',
    description:
      'Returns the physical factory location for a factory id, the same ' +
      'object shape as /company/factory-locations/:id but looked up ' +
      'directly by factory id rather than via a product URN.',
  })
  @ApiParam({
    name: 'id',
    description:
      'Factory id, e.g. urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
    example: 'urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
  })
  getFactoryById(@Param('id') factoryId: string) {
    return this.companyService.getFactoryById(factoryId);
  }

  /**
   * Pass the factory id as the :id path parameter.
   */
  @UseGuards(AuthGuard)
  @Get('factories/:id/owner')
  @ApiOperation({
    summary: 'Get the owner company for a factory id',
    description:
      'Resolves a factory id to its owner_company_ifric_id and returns the ' +
      'full owner company object, the same schema as /company/owners/:id ' +
      'and /company/products/:id.',
  })
  @ApiParam({
    name: 'id',
    description:
      'Factory id, e.g. urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
    example: 'urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
  })
  getFactoryOwner(@Param('id') factoryId: string) {
    return this.companyService.getFactoryOwner(factoryId);
  }

  /**
   * Pass the factory id as the :id path parameter.
   */
  @UseGuards(AuthGuard)
  @Get('factories/:id/products')
  @ApiOperation({
    summary: 'Get all product URNs located at a factory id',
    description:
      'Returns every product URN whose factory location (per ' +
      '/company/factory-locations/:id) resolves to this factory id. ' +
      'Pass any of the returned URNs to /company/products/:id to get that ' +
      "product's manufacturer.",
  })
  @ApiParam({
    name: 'id',
    description:
      'Factory id, e.g. urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
    example: 'urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
  })
  getFactoryProducts(@Param('id') factoryId: string) {
    return this.companyService.getFactoryProducts(factoryId);
  }

  @UseGuards(AuthGuard)
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
  createFactory(@Body() data: CreateFactoryDto) {
    return this.companyService.createFactory(data);
  }

  @UseGuards(AuthGuard)
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
  updateFactory(@Param('id') id: string, @Body() data: UpdateFactoryDto) {
    return this.companyService.updateFactory(id, data);
  }

  @UseGuards(AuthGuard)
  @Delete('factories/:id')
  @ApiOperation({
    summary: 'Delete a factory',
    description:
      'Deletes a factory. Fails with 409 if any company twin still ' +
      'references this factory_id.',
  })
  @ApiParam({
    name: 'id',
    description: 'Factory id',
    example: 'urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
  })
  deleteFactory(@Param('id') id: string) {
    return this.companyService.deleteFactory(id);
  }

  // ===========================================================================
  // Company CRUD, access groups, physical assets (CompanyAsset/GateWay/
  // Server)
  // ===========================================================================

  @UseGuards(AuthGuard)
  @Post('company-asset')
  @ApiBody({
    description: 'Details for creating a company asset',
    required: true,
    schema: {
      type: 'object',
      required: ['type', 'company_ifric_id'],
      properties: {
        type: {
          type: 'string',
          enum: ['asset', 'gateway', 'server'],
          example: 'asset',
        },
        company_ifric_id: {
          type: 'string',
          example: 'IFRIC12345',
        },
        asset_ifric_id: {
          type: 'string',
          description: 'Required when type is "asset"',
          example: 'ASSET67890',
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
  createCompanyAsset(@Body() data: CompanyAssetDto) {
    return this.companyService.createCompanyAsset(data);
  }

  @UseGuards(AuthGuard)
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
  createAccessGroup(@Param('id') id: string, @Body() data: AccessGroupDto) {
    return this.companyService.createAccessGroup(id, data);
  }

  @Post('create-company')
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
        company_ifric_id: {
          type: 'string',
          example: 'IFRIC54321',
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
          example: 'USA',
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
        password: {
          type: 'string',
          example: 'strongpassword123',
        },
        company_size: {
          type: 'string',
          example: '100-500',
        },
        company_category_id: {
          type: 'number',
          example: 1,
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
        'company_ifric_id',
        'address_1',
        'city',
        'country',
        'zip',
        'admin_name',
        'position',
        'email',
        'password',
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
  addStatusDetail(@Body() data: AddStatusDto) {
    return this.companyService.addStatusDetail(data);
  }

  @UseGuards(AuthGuard)
  @Get('/get-company-assets/:id')
  getCompanyAssets(@Param('id') id: string) {
    return this.companyService.getCompanyAssets(id);
  }

  @UseGuards(AuthGuard)
  @Get('/get-company-assets-by-asset/:assetId')
  getCompanyAssetsbyAsset(@Param('assetId') id: string) {
    return this.companyService.getCompanyAssetsbyAsset(id);
  }

  @UseGuards(AuthGuard)
  @Get('/get-company-asset-by-assetid/:asset_ifric_id')
  getCompanyAssetByAssetId(@Param('asset_ifric_id') asset_ifric_id: string) {
    return this.companyService.getCompanyAssetByAssetId(asset_ifric_id);
  }

  @UseGuards(AuthGuard)
  @Get('/get-company-access-group/:id')
  getCompanyAccessGroup(@Param('id') id: string) {
    return this.companyService.getCompanyAccessGroup(id);
  }

  @UseGuards(AuthGuard)
  @Get('/get-access-group-by-group-name/:company_id/:group_name')
  getAccessGroupByGroupName(
    @Param('company_id') company_id: string,
    @Param('group_name') group_name: string,
  ) {
    return this.companyService.getAccessGroupByGroupName(
      company_id,
      group_name,
    );
  }

  @UseGuards(AuthGuard)
  @Get('/get-access-group/:id')
  getAccessGroup(@Param('id') id: string) {
    return this.companyService.getAccessGroup(id);
  }

  @UseGuards(AuthGuard)
  @Get('/get-category-specific-company/:categoryName')
  getCategorySpecificCompanies(@Param('categoryName') categoryName: string) {
    return this.companyService.getCategorySpecificCompanies(categoryName);
  }

  @UseGuards(AuthGuard)
  @Get('/get-company-details/:id')
  getCompanyDetails(@Param('id') id: string) {
    return this.companyService.getCompanyDetails(id);
  }

  @UseGuards(AuthGuard)
  @Get('/get-company-details-id/:id')
  getCompanyDetailsByID(@Param('id') id: string) {
    return this.companyService.getCompanyDetailsbyRecord(id);
  }

  @UseGuards(AuthGuard)
  @Get('/get-company-contact-details/:company_ifric_id')
  getCompanyContactDetails(
    @Param('company_ifric_id') company_ifric_id: string,
  ) {
    return this.companyService.getCompanyContactDetails(company_ifric_id);
  }

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
  getCompanyDetailsByEmail(@Param('email') email: string) {
    return this.companyService.getCompanyDetailsByEmail(email);
  }

  @UseGuards(AuthGuard)
  @Get('/get-company-details-by-name/:company_name')
  getCompanyDetailsByName(@Param('company_name') company_name: string) {
    return this.companyService.getCompanyDetailsByName(company_name);
  }

  @UseGuards(AuthGuard)
  @Get('/get-company-and-user-details/:company_ifric_id')
  getCompanyAndUserDetails(
    @Param('company_ifric_id') company_ifric_id: string,
  ) {
    return this.companyService.getCompanyAndUserDetails(company_ifric_id);
  }

  @UseGuards(AuthGuard)
  @Get('/get-all-companies')
  getAllCompanies() {
    return this.companyService.getAllCompanies();
  }

  @UseGuards(AuthGuard)
  @Get('/get-all-owner-companies/:company_ifric_id')
  getUniqueOwnerCompanies(@Param('company_ifric_id') company_ifric_id: string) {
    return this.companyService.getUniqueOwnerCompanies(company_ifric_id);
  }

  @UseGuards(AuthGuard)
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
  @UseGuards(AuthGuard)
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

  @UseGuards(AuthGuard)
  @Get('get-manufacturer-companies/:count')
  getManufacturerCompanies(@Param('count') count: string) {
    return this.companyService.getManufacturerCompanies(+count);
  }

  @UseGuards(AuthGuard)
  @Get('get-searched-manufacturer-companies/:searched_text')
  getSearchedManufacturerCompanies(
    @Param('searched_text') searched_text: string,
  ) {
    return this.companyService.getSearchedManufacturerCompanies(searched_text);
  }

  @UseGuards(AuthGuard)
  @Get('get-manufacturer-owner-companies')
  getManufacturerAndOwnerCompanies() {
    return this.companyService.getManufacturerAndOwnerCompanies();
  }

  @UseGuards(AuthGuard)
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
        company_ifric_id: {
          type: 'string',
          example: 'IFRIC54321',
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
          example: 'USA',
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
        password: {
          type: 'string',
          example: 'strongpassword123',
        },
        company_size: {
          type: 'string',
          example: '100-500',
        },
        company_category_id: {
          type: 'number',
          example: 1,
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
        'company_ifric_id',
        'address_1',
        'city',
        'country',
        'zip',
        'admin_name',
        'position',
        'email',
        'password',
        'company_size',
        'company_category',
        'meta_data',
        'company_domain',
      ],
    },
  })
  updateCompany(@Param('id') id: string, @Body() data: RegisterAuthDto) {
    return this.companyService.updateCompany(id, data);
  }

  @UseGuards(AuthGuard)
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
  ) {
    return this.companyService.updateAccessGroup(id, data);
  }

  @UseGuards(AuthGuard)
  @Delete('/delete-company/:id')
  deleteCompany(@Param('id') id: string) {
    return this.companyService.deleteCompany(id);
  }

  @UseGuards(AuthGuard)
  @Delete('/delete-access-group/:id')
  deleteAccessgroup(@Param('id') id: string) {
    return this.companyService.deleteAccessgroup(id);
  }

  @UseGuards(AuthGuard)
  @Delete('/delete-company-asset/:id')
  deleteCompanyAsset(@Param('id') id: string) {
    return this.companyService.deleteCompanyAsset(id);
  }

  @UseGuards(AuthGuard)
  @Delete('/delete-bulk-company-assets')
  deleteCompanyAssets(@Body() data: string[]) {
    return this.companyService.deleteCompanyAssets(data);
  }

  @UseGuards(AuthGuard)
  @Delete('/delete-company-gateway/:id')
  deleteCompanyGateway(@Param('id') id: string) {
    return this.companyService.deleteCompanyGateway(id);
  }

  @UseGuards(AuthGuard)
  @Delete('/delete-company-server/:id')
  deleteCompanyServer(@Param('id') id: string) {
    return this.companyService.deleteCompanyServer(id);
  }
}
