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

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessGroup, CompanyCategory, Product } from 'src/entities';
import { COMPANY_CATEGORY_NAMES } from 'src/common/company-category.constants';

@Injectable()
export class ScriptService {
  constructor(
    @InjectRepository(AccessGroup)
    private accessRepository: Repository<AccessGroup>,
    @InjectRepository(CompanyCategory)
    private companyCategoryRepository: Repository<CompanyCategory>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  /**
   * Seeds the default RBAC access-group templates and company-category
   * taxonomy. Intended to run once against a fresh database.
   */
  async create() {
    try {
      // Adding Access Data
      const accessData = [
        {
          group_name: 'read_only',
          create: false,
          read: true,
          update: false,
          delete: false,
        },
        {
          group_name: 'create_only',
          create: true,
          read: true,
          update: false,
          delete: false,
        },
        {
          group_name: 'update_only',
          create: false,
          read: true,
          update: true,
          delete: false,
        },
        {
          group_name: 'create_update',
          create: true,
          read: true,
          update: true,
          delete: false,
        },
        {
          group_name: 'admin',
          create: true,
          read: true,
          update: true,
          delete: true,
        },
      ];
      await this.accessRepository.save(
        accessData.map((d) => this.accessRepository.create(d)),
      );

      // Adding Property Data
      await this.companyCategoryRepository.save(
        COMPANY_CATEGORY_NAMES.map((category_name) =>
          this.companyCategoryRepository.create({ category_name }),
        ),
      );

      return {
        success: true,
        status: 201,
        message: 'Data added successfully',
      };
    } catch (err) {
      throw err;
    }
  }

  /**
   * Seeds a handful of example products. These names are placeholders —
   * replace them with your own product lineup before running this against
   * a real deployment.
   */
  async createProduct() {
    try {
      const productData = [
        {
          product_name: 'Example Product A',
        },
        {
          product_name: 'Example Product B',
        },
        {
          product_name: 'Example Product C',
        },
      ];
      await this.productRepository.save(
        productData.map((d) => this.productRepository.create(d)),
      );

      return {
        success: true,
        status: 201,
        message: 'Data added successfully',
      };
    } catch (err) {
      throw err;
    }
  }
}
