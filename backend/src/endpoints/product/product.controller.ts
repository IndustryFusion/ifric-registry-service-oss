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

import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ProductService } from './product.service';

// Everything asset/digital-twin-related moved to CompanyController's
// /company/assets/* (see AssetService) — this controller is left with just
// the local Product catalog (seeded via POST /script/create-product),
// unrelated to that merge.
@ApiTags('Product')
@ApiBearerAuth('access-token')
@Controller('product')
export class ProductController {
  constructor(private readonly productService: ProductService) {}
  @Get(':id/name')
  @ApiOperation({ summary: "Look up a catalog Product's name by id" })
  @ApiParam({ name: 'id', description: 'Product catalog id' })
  getProductName(@Param('id') id: string) {
    return this.productService.getProductName(id);
  }
  @Get('by-name/:product_name/id')
  @ApiOperation({ summary: 'Reverse lookup: catalog Product id by name' })
  @ApiParam({ name: 'product_name', description: 'Product catalog name' })
  findProductIdByProductName(@Param('product_name') product_name: string) {
    return this.productService.findProductIdByProductName(product_name);
  }
}
