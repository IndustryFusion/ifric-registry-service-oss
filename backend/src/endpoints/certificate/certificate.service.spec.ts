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

  describe('when certificates are not configured (HEDERA_KEY_SECRET unset)', () => {
    beforeEach(() => {
      // ENCRYPTION_SECRET is captured from envConstants at construction —
      // override it directly to simulate an instance booted without
      // HEDERA_KEY_SECRET, matching how CertificateModule would still
      // provide CertificateService (just with no HTTP surface) in that case.
      (service as any).ENCRYPTION_SECRET = undefined;
    });

    it('encryptPrivateKey throws a clean, explicit error instead of crashing', () => {
      expect(() => service.encryptPrivateKey('some-private-key')).toThrow(
        HttpException,
      );
    });

    it('decryptPrivateKey throws a clean, explicit error instead of crashing', () => {
      expect(() => service.decryptPrivateKey('aa:bb')).toThrow(HttpException);
    });
  });
});
