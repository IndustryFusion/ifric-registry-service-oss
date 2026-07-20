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

import { AccessGroup } from './access-group.entity';
import { CompanyCategory } from './company-category.entity';
import { Product } from './product.entity';
import { Company } from './company.entity';
import { CompanyUser } from './company-user.entity';
import { CompanyCategoryMapping } from './company-category-mapping.entity';
import { UserProductAccessGroup } from './user-product-access-group.entity';
import { CompanyProduct } from './company-product.entity';
import { CompanyTwin } from './company-twin.entity';
import { Certificate } from './certificate.entity';
import { CompanyAsset } from './company-asset.entity';
import { CompanyGateWay } from './company-gateway.entity';
import { CompanyServer } from './company-server.entity';
import { Factory } from './factory.entity';

// Every TypeORM entity, registered once here for app.module.ts's
// TypeOrmModule.forRoot({ entities }). Grows one feature module at a time
// as services migrate off Mongoose — see /home/wsluser/.claude/plans for
// the phase breakdown that added each entity.
export const entities = [
  AccessGroup,
  CompanyCategory,
  Product,
  Company,
  CompanyUser,
  CompanyCategoryMapping,
  UserProductAccessGroup,
  CompanyProduct,
  CompanyTwin,
  Certificate,
  CompanyAsset,
  CompanyGateWay,
  CompanyServer,
  Factory,
];

export {
  AccessGroup,
  CompanyCategory,
  Product,
  Company,
  CompanyUser,
  CompanyCategoryMapping,
  UserProductAccessGroup,
  CompanyProduct,
  CompanyTwin,
  Certificate,
  CompanyAsset,
  CompanyGateWay,
  CompanyServer,
  Factory,
};
