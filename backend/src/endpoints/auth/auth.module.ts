import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { Company, CompanySchema } from 'src/schemas/company.schema';
import {
  CompanyUser,
  CompanyUserSchema,
} from 'src/schemas/company_user.schema';
import {
  CompanyCategory,
  CompanyCategorySchema,
} from 'src/schemas/company_category.schema';
import {
  AccessGroup,
  AccessGroupSchema,
} from 'src/schemas/access_group.schema';
import {
  CompanyCategoryMapping,
  CompanyCategoryMappingSchema,
} from 'src/schemas/company_category_mapping.schema';
import { Product, ProductSchema } from 'src/schemas/products.schema';
import {
  UserProductAccessGroup,
  UserProductAccessGroupSchema,
} from 'src/schemas/user_product_access_group.schema';
import {
  CompanyProduct,
  CompanyProductSchema,
} from 'src/schemas/company_product.schema';
import {
  CompanyTwin,
  CompanyTwinSchema,
} from 'src/schemas/company_twin.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      { name: CompanyCategory.name, schema: CompanyCategorySchema },
      { name: AccessGroup.name, schema: AccessGroupSchema },
      {
        name: CompanyCategoryMapping.name,
        schema: CompanyCategoryMappingSchema,
      },
      { name: Product.name, schema: ProductSchema },
      {
        name: UserProductAccessGroup.name,
        schema: UserProductAccessGroupSchema,
      },
      { name: CompanyProduct.name, schema: CompanyProductSchema },
      { name: CompanyTwin.name, schema: CompanyTwinSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard],
})
export class AuthModule {}
