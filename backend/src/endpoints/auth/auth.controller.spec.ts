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
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { KeycloakService } from './keycloak.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import {
  Company,
  CompanyUser,
  CompanyCategory,
  AccessGroup,
  CompanyCategoryMapping,
  UserProductAccessGroup,
  CompanyProduct,
  CompanyTwin,
} from 'src/entities';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: CACHE_MANAGER, useValue: {} },
        { provide: getRepositoryToken(Company), useValue: {} },
        { provide: getRepositoryToken(CompanyUser), useValue: {} },
        { provide: getRepositoryToken(CompanyCategory), useValue: {} },
        { provide: getRepositoryToken(AccessGroup), useValue: {} },
        { provide: getRepositoryToken(CompanyCategoryMapping), useValue: {} },
        { provide: getRepositoryToken(UserProductAccessGroup), useValue: {} },
        { provide: getRepositoryToken(CompanyProduct), useValue: {} },
        { provide: getRepositoryToken(CompanyTwin), useValue: {} },
        { provide: KeycloakService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('refresh', () => {
    it('delegates to AuthService.refreshAccessToken with the given token', async () => {
      const authService = {
        refreshAccessToken: jest.fn().mockResolvedValue({
          access_token: 'new-token',
          refresh_token: 'rotated-refresh-token',
        }),
      };
      (controller as any).authService = authService;

      const result = await controller.refresh('a-refresh-token');

      expect(authService.refreshAccessToken).toHaveBeenCalledWith(
        'a-refresh-token',
      );
      expect(result).toEqual({
        access_token: 'new-token',
        refresh_token: 'rotated-refresh-token',
      });
    });
  });

  describe('logOut', () => {
    it('delegates to AuthService.logOut with the optional refresh_token', async () => {
      const authService = {
        logOut: jest.fn().mockResolvedValue({ success: true, status: 200 }),
      };
      (controller as any).authService = authService;
      const data = { email: 'user@example.com', refresh_token: 'a-token' };

      const result = await controller.logOut(data);

      expect(authService.logOut).toHaveBeenCalledWith(data);
      expect(result).toEqual({ success: true, status: 200 });
    });
  });
});
