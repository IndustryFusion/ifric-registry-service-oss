import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { Company, CompanySchema } from 'src/schemas/company.schema';
import {
  CompanyTwin,
  CompanyTwinSchema,
} from 'src/schemas/company_twin.schema';
import { Factory, FactorySchema } from 'src/schemas/factory.schema';
import {
  CompanyUser,
  CompanyUserSchema,
} from 'src/schemas/company_user.schema';
import {
  CompanyCategory,
  CompanyCategorySchema,
} from 'src/schemas/company_category.schema';
import {
  CompanyCategoryMapping,
  CompanyCategoryMappingSchema,
} from 'src/schemas/company_category_mapping.schema';
import {
  CompanyAsset,
  CompanyAssetSchema,
} from 'src/schemas/company_asset.schema';
import {
  CompanyGateWay,
  CompanyGateWaySchema,
} from 'src/schemas/company_gateway.schema';
import {
  CompanyServer,
  CompanyServerSchema,
} from 'src/schemas/company_server.schema';
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
import { AuthModule } from '../auth/auth.module';
import { CertificateModule } from '../certificate/certificate.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: CompanyTwin.name, schema: CompanyTwinSchema },
      { name: Factory.name, schema: FactorySchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      { name: CompanyCategory.name, schema: CompanyCategorySchema },
      {
        name: CompanyCategoryMapping.name,
        schema: CompanyCategoryMappingSchema,
      },
      { name: CompanyAsset.name, schema: CompanyAssetSchema },
      { name: CompanyGateWay.name, schema: CompanyGateWaySchema },
      { name: CompanyServer.name, schema: CompanyServerSchema },
      { name: CompanyProduct.name, schema: CompanyProductSchema },
      { name: Product.name, schema: ProductSchema },
      { name: AccessGroup.name, schema: AccessGroupSchema },
      {
        name: UserProductAccessGroup.name,
        schema: UserProductAccessGroupSchema,
      },
    ]),
    AuthModule,
    CertificateModule,
  ],
  controllers: [CompanyController],
  providers: [CompanyService],
})
export class CompanyModule {}
