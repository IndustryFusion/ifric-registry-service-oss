import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { Company, CompanySchema } from 'src/schemas/company.schema';
import {
  CompanyUser,
  CompanyUserSchema,
} from 'src/schemas/company_user.schema';
import {
  CompanyTwin,
  CompanyTwinSchema,
} from 'src/schemas/company_twin.schema';
import {
  CompanyProduct,
  CompanyProductSchema,
} from 'src/schemas/company_product.schema';
import { Product, ProductSchema } from 'src/schemas/products.schema';
import {
  AccessGroup,
  AccessGroupSchema,
} from 'src/schemas/access_group.schema';
import {
  UserProductAccessGroup,
  UserProductAccessGroupSchema,
} from 'src/schemas/user_product_access_group.schema';
import { Factory, FactorySchema } from 'src/schemas/factory.schema';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      { name: CompanyTwin.name, schema: CompanyTwinSchema },
      { name: CompanyProduct.name, schema: CompanyProductSchema },
      { name: Product.name, schema: ProductSchema },
      { name: AccessGroup.name, schema: AccessGroupSchema },
      {
        name: UserProductAccessGroup.name,
        schema: UserProductAccessGroupSchema,
      },
      { name: Factory.name, schema: FactorySchema },
    ]),
    AuthModule,
  ],
  controllers: [ProductController],
  providers: [ProductService],
})
export class ProductModule {}
