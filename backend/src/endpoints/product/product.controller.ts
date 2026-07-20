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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ProductService } from './product.service';
import { AuthGuard } from '../auth/auth.guard';
import { AddProductDto } from './dto/add-product.dto';
import { CompanyTwinDto } from './dto/company-twin.dto';
import { UpdateCompanyProductDto } from './dto/update-company-product.dto';

@ApiTags('Product')
@ApiBearerAuth('access-token')
@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  // ===========================================================================
  // Product-URN-keyed lookups — start from a product URN
  // ===========================================================================

  /**
   * Pass the product URN as the :id path parameter.
   */
  @UseGuards(AuthGuard)
  @Get(':id')
  @ApiOperation({
    summary: 'Get company schema data for a product URN',
    description:
      'Resolves the product URN to a CompanyTwin record and returns the ' +
      'manufacturer Company (twin.manufacturer_company_id).',
  })
  @ApiParam({
    name: 'id',
    description: 'Product URN (CompanyTwin.asset_ifric_id)',
    example: 'urn:product:alpha-machine-001',
  })
  getProductCompany(@Param('id') productUrn: string) {
    return this.productService.getProductCompany(productUrn);
  }

  /**
   * Pass the product URN as the :id path parameter.
   */
  @UseGuards(AuthGuard)
  @Get(':id/owner')
  @ApiOperation({
    summary: 'Get owner company data for a product URN',
    description:
      'Resolves the product URN to a CompanyTwin record and returns the ' +
      'owner Company (twin.owner_company_id), as opposed to /product/:id ' +
      'which returns the manufacturer.',
  })
  @ApiParam({
    name: 'id',
    description: 'Product URN (CompanyTwin.asset_ifric_id)',
    example: 'urn:product:alpha-machine-001',
  })
  getProductOwner(@Param('id') productUrn: string) {
    return this.productService.getProductOwner(productUrn);
  }

  /**
   * Pass the product URN as the :id path parameter.
   */
  @UseGuards(AuthGuard)
  @Get(':id/factory-location')
  @ApiOperation({
    summary: 'Get the factory location for a product URN',
    description:
      'Resolves the product URN to a CompanyTwin record, then looks up the ' +
      'Factory referenced by twin.factory_id. Its owner_company_ifric_id ' +
      'matches the company_ifric_id of the company returned by ' +
      '/product/:id/owner.',
  })
  @ApiParam({
    name: 'id',
    description: 'Product URN (CompanyTwin.asset_ifric_id)',
    example: 'urn:product:alpha-machine-001',
  })
  getProductFactoryLocation(@Param('id') productUrn: string) {
    return this.productService.getProductFactoryLocation(productUrn);
  }

  // ===========================================================================
  // Product catalog + company-product linking
  // ===========================================================================

  @UseGuards(AuthGuard)
  @Post('company-product')
  @ApiBody({
    description:
      'Tags an externally-catalogued product (by its external ID) to a ' +
      'company. Product data lives outside this service — only the ID is ' +
      'stored here.',
    required: true,
    schema: {
      type: 'object',
      properties: {
        company_ifric_id: {
          type: 'string',
          example: 'COMPANY_IFRIC_ID_456',
          description: 'The unique IFRIC ID of the company',
        },
        product_ifric_id: {
          type: 'string',
          example: 'urn:product:alpha-machine-001',
          description: 'External product identifier to tag to the company',
        },
        billing_id: {
          type: 'string',
          example: 'BILLING_ID_789',
          description: 'Optional billing ID for the product',
        },
      },
      required: ['company_ifric_id', 'product_ifric_id'],
    },
  })
  addCompanyProduct(@Body() data: AddProductDto) {
    return this.productService.addCompanyProduct(data);
  }

  /**
   * Pass the company's company_ifric_id (not its internal _id) as :id.
   */
  @UseGuards(AuthGuard)
  @Get('company/:id')
  @ApiOperation({
    summary: 'Get all products tagged to a company',
    description:
      'Returns every CompanyProduct row tagged to this company — the ' +
      'external product_ifric_id values assigned via ' +
      'POST /product/company-product, plus the default product tags ' +
      'granted at company creation.',
  })
  @ApiParam({
    name: 'id',
    description: "The company's company_ifric_id (not its internal _id)",
    example: 'COMPANY_IFRIC_ID_456',
  })
  getCompanyProducts(@Param('id') id: string) {
    return this.productService.getCompanyProducts(id);
  }

  @UseGuards(AuthGuard)
  @Get(':id/name')
  getProductName(@Param('id') id: string) {
    return this.productService.getProductName(id);
  }

  /**
   * Route corrected to include :product_name — the original route declared
   * no path parameter at all while the handler read @Param('product_name'),
   * so product_name always resolved to undefined.
   */
  @UseGuards(AuthGuard)
  @Get('by-name/:product_name/id')
  findProductIdByProductName(@Param('product_name') product_name: string) {
    return this.productService.findProductIdByProductName(product_name);
  }

  @UseGuards(AuthGuard)
  @Patch('company-product/:id')
  @ApiBody({
    description:
      'Upserts an external product tag for this company, keyed by ' +
      'product_ifric_id.',
    required: true,
    schema: {
      type: 'object',
      properties: {
        product_ifric_id: {
          type: 'string',
          example: 'urn:product:alpha-machine-001',
          description: 'External product identifier',
        },
      },
      required: ['product_ifric_id'],
    },
  })
  updateCompanyProduct(
    @Param('id') id: string,
    @Body() data: UpdateCompanyProductDto,
  ) {
    return this.productService.updateCompanyProduct(id, data);
  }

  @UseGuards(AuthGuard)
  @Delete('company-product/:id')
  deleteCompanyProduct(@Param('id') id: string) {
    return this.productService.deleteCompanyProduct(id);
  }

  // ===========================================================================
  // Digital twins (CompanyTwin) — links a product/asset URN to its
  // manufacturer and owner companies, and optionally a Factory.
  // ===========================================================================

  @UseGuards(AuthGuard)
  @Post('twin')
  @ApiBody({
    description: 'Details for creating a company twin',
    required: true,
    schema: {
      type: 'object',
      properties: {
        owner_company_ifric_id: {
          type: 'string',
          example: 'COMPANY_IFRIC_ID_123',
        },
        manufacturer_ifric_id: {
          type: 'string',
          example: 'MANUFACTURER_IFRIC_ID_456',
        },
        asset_ifric_id: {
          type: 'string',
          example: 'ASSET_IFRIC_ID_789',
        },
        factory_id: {
          type: 'string',
          example:
            'urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
          description: 'Optional — ties this twin to an existing factory',
        },
      },
      required: [
        'owner_company_ifric_id',
        'manufacturer_ifric_id',
        'asset_ifric_id',
      ],
    },
  })
  createCompanyTwin(@Body() data: CompanyTwinDto) {
    return this.productService.createCompanyTwin(data);
  }

  @UseGuards(AuthGuard)
  @Get('twin/:id')
  getCompanyTwinById(@Param('id') id: string) {
    return this.productService.getCompanyTwinById(id);
  }

  @UseGuards(AuthGuard)
  @Get('twin/by-asset/:asset_ifric_id')
  getCompanyTwinByAssetId(@Param('asset_ifric_id') asset_ifric_id: string) {
    return this.productService.getCompanyTwinByAssetId(asset_ifric_id);
  }

  @UseGuards(AuthGuard)
  @Post('twin/count')
  getCompanyTwinCount(@Body() data: string[]) {
    return this.productService.getCompanyTwinCount(data);
  }

  @UseGuards(AuthGuard)
  @Get('twin/count/:company_ifric_id')
  getCompanyTwinCountByCompanyIfricId(
    @Param('company_ifric_id') company_ifric_id: string,
  ) {
    return this.productService.getCompanyTwinCountByCompanyIfricId(
      company_ifric_id,
    );
  }

  @UseGuards(AuthGuard)
  @Patch('twin')
  @ApiBody({
    description: 'Details for updating a company twin',
    required: true,
    schema: {
      type: 'object',
      properties: {
        owner_company_ifric_id: {
          type: 'string',
          example: 'COMPANY_IFRIC_ID_123',
        },
        manufacturer_ifric_id: {
          type: 'string',
          example: 'MANUFACTURER_IFRIC_ID_456',
        },
        asset_ifric_id: {
          type: 'string',
          example: 'ASSET_IFRIC_ID_789',
        },
        factory_id: {
          type: 'string',
          example:
            'urn:ifric:ifx-eur-loc-fac-bd063b72-8748-461f-888d-3ea75058f205',
          description: 'Optional — ties this twin to an existing factory',
        },
      },
      required: [
        'owner_company_ifric_id',
        'manufacturer_ifric_id',
        'asset_ifric_id',
      ],
    },
  })
  updateCompanyTwin(@Body() data: CompanyTwinDto) {
    return this.productService.updateCompanyTwin(data);
  }

  @UseGuards(AuthGuard)
  @Delete('twin/bulk')
  deleteCompanyTwins(@Body() data: string[]) {
    return this.productService.deleteCompanyTwins(data);
  }

  @UseGuards(AuthGuard)
  @Delete('twin/:id')
  deleteCompanyTwinAsset(@Param('id') id: string) {
    return this.productService.deleteCompanyTwinAsset(id);
  }

  // ===========================================================================
  // CompanyTwin-based asset queries (kept "asset" naming from the original
  // routes — these operate on the same CompanyTwin/digital-twin data as the
  // rest of this controller, not the physical CompanyAsset/GateWay/Server
  // records, which live on CompanyController).
  // ===========================================================================

  @UseGuards(AuthGuard)
  @Get('manufacturer-assets/:id')
  getManufacturerAssets(@Param('id') id: string) {
    return this.productService.getManufacturerAssets(id);
  }

  @UseGuards(AuthGuard)
  @Get(
    'manufacturer-owner-assets/:manufacturer_company_ifric_id/:owner_company_ifric_id',
  )
  getManufacturerOwnerAssets(
    @Param('manufacturer_company_ifric_id')
    manufacturer_company_ifric_id: string,
    @Param('owner_company_ifric_id') owner_company_ifric_id: string,
  ) {
    return this.productService.getManufacturerOwnerAssets(
      manufacturer_company_ifric_id,
      owner_company_ifric_id,
    );
  }

  @UseGuards(AuthGuard)
  @Get('owner-assets/:id')
  getOwnerAssets(@Param('id') id: string) {
    return this.productService.getOwnerAssets(id);
  }
}
