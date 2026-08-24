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

import { Controller, Post } from '@nestjs/common';
import { ScriptService } from './script.service';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from 'src/common/public.decorator';

/**
 * One-off setup scripts for seeding reference data into a fresh deployment.
 * Not a general-purpose admin API — each endpoint here is meant to be run
 * once against an empty database, not repeatedly against a live one.
 */
@ApiTags('Script')
@ApiBearerAuth('access-token')
@Controller('script')
export class ScriptController {
  constructor(private readonly scriptService: ScriptService) {}

  /**
   * Seeds the default RBAC access-group templates (read_only, create_only,
   * update_only, create_update, admin) and the default company-category
   * taxonomy (see COMPANY_CATEGORY_NAMES in
   * src/common/company-category.constants.ts). Run once against a fresh
   * database.
   */
  @Public()
  @Post()
  @ApiOperation({
    summary: 'Seed default access groups and company categories',
    description:
      'Run once against a fresh database. Fails if the collections already have data (insertMany will reject on duplicates if re-run without clearing first).',
  })
  create() {
    return this.scriptService.create();
  }

  /**
   * Seeds a small set of example products into the Product catalog. Replace
   * the contents of ScriptService.createProduct() with your own product
   * lineup before running this against a real deployment.
   */
  @Public()
  @Post('create-product')
  @ApiOperation({
    summary: 'Seed example products',
    description:
      'Run once against a fresh database. The seeded product names are placeholders — edit ScriptService.createProduct() to reflect your own product catalog.',
  })
  createProduct() {
    return this.scriptService.createProduct();
  }
}
