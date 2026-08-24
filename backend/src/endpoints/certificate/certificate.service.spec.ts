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
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpException } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { AccessControlService } from 'src/common/access-control.service';
import { Company, CompanyUser, Certificate } from 'src/entities';

const OWN_COMPANY = 'urn:ifric:company-1';
const authorizedUser = { company_ifric_id: OWN_COMPANY, user_id: 'user-1' };

describe('CertificateService', () => {
  let service: CertificateService;
  let companyRepository: { find: jest.Mock };
  let certificateRepository: { find: jest.Mock };
  let accessControlService: {
    assertCompanyMatch: jest.Mock;
    assertPermission: jest.Mock;
  };

  beforeEach(async () => {
    companyRepository = { find: jest.fn() };
    certificateRepository = { find: jest.fn() };
    accessControlService = {
      assertCompanyMatch: jest.fn(),
      assertPermission: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificateService,
        { provide: getRepositoryToken(Company), useValue: companyRepository },
        { provide: getRepositoryToken(CompanyUser), useValue: {} },
        {
          provide: getRepositoryToken(Certificate),
          useValue: certificateRepository,
        },
        { provide: AccessControlService, useValue: accessControlService },
      ],
    }).compile();

    service = module.get<CertificateService>(CertificateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('revealPrivateKey', () => {
    it('throws a clean 404 when the company has no certificate at all', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      certificateRepository.find.mockResolvedValue([]);

      await expect(
        service.revealPrivateKey(OWN_COMPANY, authorizedUser),
      ).rejects.toThrow(HttpException);
    });

    // This endpoint decrypts and hands back a company's Hedera private key.
    // It used to take no caller identity at all, so any valid realm token
    // could read any company's key.
    it('checks the caller owns the company before touching the key', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      certificateRepository.find.mockResolvedValue([]);

      await expect(
        service.revealPrivateKey(OWN_COMPANY, authorizedUser),
      ).rejects.toThrow(HttpException);
      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        authorizedUser,
        OWN_COMPANY,
      );
      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        authorizedUser,
        'read',
      );
    });

    it('rejects a caller scoped to a different company, and never reads the key', async () => {
      accessControlService.assertCompanyMatch.mockImplementation(() => {
        throw new HttpException('Forbidden', 403);
      });

      await expect(
        service.revealPrivateKey('urn:ifric:other-company', authorizedUser),
      ).rejects.toMatchObject({ status: 403 });
      expect(certificateRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('deletePrivateKey', () => {
    it('throws a clean 404 when the company has no certificate at all', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      certificateRepository.find.mockResolvedValue([]);

      await expect(
        service.deletePrivateKey(OWN_COMPANY, authorizedUser),
      ).rejects.toThrow(HttpException);
    });

    it('rejects a caller scoped to a different company', async () => {
      accessControlService.assertCompanyMatch.mockImplementation(() => {
        throw new HttpException('Forbidden', 403);
      });

      await expect(
        service.deletePrivateKey('urn:ifric:other-company', authorizedUser),
      ).rejects.toMatchObject({ status: 403 });
      expect(certificateRepository.find).not.toHaveBeenCalled();
    });
  });

  describe('getCompanyCertificate', () => {
    // The raw Certificate rows include the (encrypted) private_key column.
    it('rejects a caller scoped to a different company', async () => {
      accessControlService.assertCompanyMatch.mockImplementation(() => {
        throw new HttpException('Forbidden', 403);
      });

      await expect(
        service.getCompanyCertificate(
          'urn:ifric:other-company',
          authorizedUser,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(certificateRepository.find).not.toHaveBeenCalled();
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
