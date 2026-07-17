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
