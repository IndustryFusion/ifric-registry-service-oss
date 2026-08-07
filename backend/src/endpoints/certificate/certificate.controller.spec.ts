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
import { AccessControlService } from 'src/common/access-control.service';
import { KeycloakService } from '../auth/keycloak.service';
import { CertificateController } from './certificate.controller';
import { CertificateService } from './certificate.service';
import { Company, CompanyUser, Certificate } from 'src/entities';

describe('CertificateController', () => {
  let controller: CertificateController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CertificateController],
      providers: [
        CertificateService,
        { provide: getRepositoryToken(Company), useValue: {} },
        { provide: getRepositoryToken(CompanyUser), useValue: {} },
        { provide: getRepositoryToken(Certificate), useValue: {} },
        // Satisfies AuthGuard's dependencies (applied via @UseGuards on
        // this controller's routes, so its own deps must resolve too).
        // Both come from @Global() modules in the real app, which a bare
        // TestingModule doesn't pull in.
        { provide: KeycloakService, useValue: {} },
        { provide: AccessControlService, useValue: {} },
      ],
    }).compile();

    controller = module.get<CertificateController>(CertificateController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
