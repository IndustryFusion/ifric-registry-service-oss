import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { CertificateController } from './certificate.controller';
import { CertificateService } from './certificate.service';
import { Company } from 'src/schemas/company.schema';
import { CompanyUser } from 'src/schemas/company_user.schema';
import { Certificate } from 'src/schemas/certificate.schema';

describe('CertificateController', () => {
  let controller: CertificateController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CertificateController],
      providers: [
        CertificateService,
        { provide: getModelToken(Company.name), useValue: {} },
        { provide: getModelToken(CompanyUser.name), useValue: {} },
        { provide: getModelToken(Certificate.name), useValue: {} },
        // Satisfies AuthGuard's dependencies (applied via @UseGuards on
        // this controller's routes, so its own deps must resolve too).
        { provide: JwtService, useValue: {} },
      ],
    }).compile();

    controller = module.get<CertificateController>(CertificateController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
