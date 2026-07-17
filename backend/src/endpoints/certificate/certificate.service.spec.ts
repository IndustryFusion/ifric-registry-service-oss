import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { HttpException } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { Company } from 'src/schemas/company.schema';
import { CompanyUser } from 'src/schemas/company_user.schema';
import { Certificate } from 'src/schemas/certificate.schema';

describe('CertificateService', () => {
  let service: CertificateService;
  let companyModel: { find: jest.Mock };
  let certificateModel: { find: jest.Mock };

  beforeEach(async () => {
    companyModel = { find: jest.fn() };
    certificateModel = {
      find: jest.fn().mockReturnValue({ sort: jest.fn() }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificateService,
        { provide: getModelToken(Company.name), useValue: companyModel },
        { provide: getModelToken(CompanyUser.name), useValue: {} },
        {
          provide: getModelToken(Certificate.name),
          useValue: certificateModel,
        },
      ],
    }).compile();

    service = module.get<CertificateService>(CertificateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('revealPrivateKey', () => {
    it('throws a clean 404 when the company has no certificate at all', async () => {
      companyModel.find.mockResolvedValue([{ id: 'company-1' }]);
      certificateModel.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([]),
      });

      await expect(
        service.revealPrivateKey('urn:ifric:company-1'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('deletePrivateKey', () => {
    it('throws a clean 404 when the company has no certificate at all', async () => {
      companyModel.find.mockResolvedValue([{ id: 'company-1' }]);
      certificateModel.find.mockReturnValue({
        sort: jest.fn().mockResolvedValue([]),
      });

      await expect(
        service.deletePrivateKey('urn:ifric:company-1'),
      ).rejects.toThrow(HttpException);
    });
  });
});
