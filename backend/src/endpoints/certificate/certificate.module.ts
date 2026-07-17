import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CertificateController } from './certificate.controller';
import { CertificateService } from './certificate.service';
import { Company, CompanySchema } from 'src/schemas/company.schema';
import {
  CompanyUser,
  CompanyUserSchema,
} from 'src/schemas/company_user.schema';
import { Certificate, CertificateSchema } from 'src/schemas/certificate.schema';
import { envConstants } from 'src/common/env.constants';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Company.name, schema: CompanySchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      { name: Certificate.name, schema: CertificateSchema },
    ]),
  ],
  // /certificate/* only exists when HEDERA_KEY_SECRET is set — CompanyModule
  // still needs CertificateService itself (see CompanyService.getAllCompanies),
  // so only the controller (the HTTP surface) is conditional, not the provider.
  controllers: envConstants.certificatesEnabled ? [CertificateController] : [],
  providers: [CertificateService],
  exports: [CertificateService],
})
export class CertificateModule {}
