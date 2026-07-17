//
// Copyright (c) 2024 IB Systems GmbH
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
import { AccessGroup } from 'src/schemas/access_group.schema';
import { CompanyCategory } from 'src/schemas/company_category.schema';
import { Product } from 'src/schemas/products.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

@Injectable()
export class ScriptService {
  constructor(
    @InjectModel(AccessGroup.name)
    private accessModel: Model<AccessGroup>,
    @InjectModel(CompanyCategory.name)
    private companyCategoryModel: Model<CompanyCategory>,
    @InjectModel(Product.name)
    private productModel: Model<Product>,
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
      await this.accessModel.insertMany(accessData);

      // Adding Property Data
      const companyCategoryData = [
        {
          category_name: 'manufacturer',
        },
        {
          category_name: 'user',
        },
        {
          category_name: 'public',
        },
        {
          category_name: 'service_provider',
        },
        {
          category_name: 'retailer',
        },
        {
          category_name: 'logistics',
        },
        {
          category_name: 'recycler',
        },
        {
          category_name: 'factory_owner',
        },
      ];

      await this.companyCategoryModel.insertMany(companyCategoryData);

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
      await this.productModel.insertMany(productData);

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
