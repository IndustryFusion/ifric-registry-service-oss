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
import { HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { KeycloakService } from './keycloak.service';
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

describe('AuthService', () => {
  let service: AuthService;
  let keycloakService: {
    passwordGrant: jest.Mock;
    refreshGrant: jest.Mock;
    revoke: jest.Mock;
    verifyAccessToken: jest.Mock;
    createUser: jest.Mock;
    setPassword: jest.Mock;
    setEmail: jest.Mock;
    deleteUser: jest.Mock;
  };
  let companyRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
  };
  let companyUserRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  let companyCategoryRepository: { findOne: jest.Mock };
  let companyCategoryMappingRepository: { find: jest.Mock };
  let companyProductRepository: { findOne: jest.Mock };
  let userProductAccessGroupRepository: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    query: jest.Mock;
    delete: jest.Mock;
  };
  let accessGroupRepository: { findOne: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    keycloakService = {
      passwordGrant: jest.fn().mockResolvedValue({
        access_token: 'kc-access-token',
        refresh_token: 'kc-refresh-token',
      }),
      refreshGrant: jest.fn(),
      revoke: jest.fn().mockResolvedValue(undefined),
      verifyAccessToken: jest.fn(),
      createUser: jest.fn().mockResolvedValue('kc-user-1'),
      setPassword: jest.fn().mockResolvedValue(undefined),
      setEmail: jest.fn().mockResolvedValue(undefined),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    };
    companyRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    companyUserRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    companyCategoryRepository = { findOne: jest.fn() };
    companyCategoryMappingRepository = { find: jest.fn() };
    companyProductRepository = { findOne: jest.fn() };

    userProductAccessGroupRepository = {
      find: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      query: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    accessGroupRepository = { findOne: jest.fn(), find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: CACHE_MANAGER, useValue: {} },
        { provide: getRepositoryToken(Company), useValue: companyRepository },
        {
          provide: getRepositoryToken(CompanyUser),
          useValue: companyUserRepository,
        },
        {
          provide: getRepositoryToken(CompanyCategory),
          useValue: companyCategoryRepository,
        },
        {
          provide: getRepositoryToken(AccessGroup),
          useValue: accessGroupRepository,
        },
        {
          provide: getRepositoryToken(CompanyCategoryMapping),
          useValue: companyCategoryMappingRepository,
        },
        {
          provide: getRepositoryToken(UserProductAccessGroup),
          useValue: userProductAccessGroupRepository,
        },
        {
          provide: getRepositoryToken(CompanyProduct),
          useValue: companyProductRepository,
        },
        { provide: getRepositoryToken(CompanyTwin), useValue: {} },
        { provide: KeycloakService, useValue: keycloakService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('refreshAccessToken', () => {
    it('delegates to KeycloakService.refreshGrant and returns its result', async () => {
      keycloakService.refreshGrant.mockResolvedValue({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      });

      const result = await service.refreshAccessToken('a-valid-refresh-token');

      expect(keycloakService.refreshGrant).toHaveBeenCalledWith(
        'a-valid-refresh-token',
      );
      expect(result).toEqual({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
      });
    });

    it('propagates KeycloakService.refreshGrant rejections unchanged', async () => {
      keycloakService.refreshGrant.mockRejectedValue(
        new Error('Invalid or expired refresh token'),
      );

      await expect(
        service.refreshAccessToken('a-revoked-refresh-token'),
      ).rejects.toThrow('Invalid or expired refresh token');
    });
  });

  describe('logOut', () => {
    it('throws when the user does not exist', async () => {
      companyUserRepository.findOne.mockResolvedValue(null);

      await expect(
        service.logOut({ email: 'nobody@example.com' }),
      ).rejects.toThrow(HttpException);
    });

    it('does not call KeycloakService.revoke when no refresh_token is supplied', async () => {
      companyUserRepository.findOne.mockResolvedValue({ _id: 'user-1' });

      const result = await service.logOut({ email: 'user@example.com' });

      expect(keycloakService.revoke).not.toHaveBeenCalled();
      expect(result).toMatchObject({ success: true, status: 200 });
    });

    it('revokes the Keycloak session when a refresh_token is supplied', async () => {
      companyUserRepository.findOne.mockResolvedValue({ _id: 'user-1' });

      await service.logOut({
        email: 'user@example.com',
        refresh_token: 'a-refresh-token',
      });

      expect(keycloakService.revoke).toHaveBeenCalledWith('a-refresh-token');
    });
  });

  describe('logIn', () => {
    beforeEach(() => {
      companyUserRepository.find.mockResolvedValue([
        {
          _id: 'user-1',
          company_id: 'company-1',
          user_email: 'user@example.com',
          user_name: 'Test User',
        },
      ]);
      companyRepository.findOne.mockResolvedValue({
        company_ifric_id: 'urn:ifric:company-1',
      });
      companyCategoryMappingRepository.find.mockResolvedValue([
        { category_id: 'cat-1' },
      ]);
      companyCategoryRepository.findOne.mockResolvedValue({
        category_name: 'manufacturer',
      });
    });

    it('rejects an incorrect password (KeycloakService.passwordGrant rejects)', async () => {
      keycloakService.passwordGrant.mockRejectedValue(
        new HttpException('Invalid Password', 400),
      );

      await expect(
        service.logIn({
          email: 'user@example.com',
          password: 'wrong-password',
          product_name: 'DPP Creator',
        } as any),
      ).rejects.toThrow(HttpException);
    });

    it('calls KeycloakService.passwordGrant exactly once per login', async () => {
      companyProductRepository.findOne.mockResolvedValue({
        product_ifric_id: 'urn:product:widget',
      });
      userProductAccessGroupRepository.find.mockResolvedValue([
        { access_group_id: 'ag-1' },
      ]);
      accessGroupRepository.findOne.mockResolvedValue({ group_name: 'admin' });

      await service.logIn({
        email: 'user@example.com',
        password: 'correct-password',
        product_name: 'urn:product:widget',
      } as any);

      expect(keycloakService.passwordGrant).toHaveBeenCalledTimes(1);
      expect(keycloakService.passwordGrant).toHaveBeenCalledWith(
        'user@example.com',
        'correct-password',
      );
    });

    it('generic path: resolves product_ifric_id directly, no local catalog lookup, and returns the Keycloak tokens', async () => {
      companyProductRepository.findOne.mockResolvedValue({
        product_ifric_id: 'urn:product:widget',
      });
      userProductAccessGroupRepository.find.mockResolvedValue([
        { access_group_id: 'ag-1' },
      ]);
      accessGroupRepository.findOne.mockResolvedValue({ group_name: 'admin' });

      const result = await service.logIn({
        email: 'user@example.com',
        password: 'correct-password',
        product_name: 'urn:product:widget',
      } as any);

      expect(companyProductRepository.findOne).toHaveBeenCalledWith({
        where: {
          company_id: 'company-1',
          product_ifric_id: 'urn:product:widget',
        },
      });
      expect(userProductAccessGroupRepository.find).toHaveBeenCalledWith({
        where: { user_id: 'user-1', product_ifric_id: 'urn:product:widget' },
      });
      expect(result.status).toBe(200);
      expect(result.data.access_group).toEqual({ group_name: 'admin' });
      expect(result.data.access_token).toBe('kc-access-token');
      expect(result.data.refresh_token).toBe('kc-refresh-token');
    });

    it('generic path: throws 404 when the product is not tagged to the company', async () => {
      companyProductRepository.findOne.mockResolvedValue(null);

      await expect(
        service.logIn({
          email: 'user@example.com',
          password: 'correct-password',
          product_name: 'urn:product:unknown',
        } as any),
      ).rejects.toThrow(HttpException);
    });

    it('DPP Creator path: grants both DPP and IFRIC Dashboard access when both are tagged', async () => {
      companyProductRepository.findOne.mockImplementation(({ where }) =>
        Promise.resolve({ product_ifric_id: where.product_ifric_id }),
      );
      userProductAccessGroupRepository.find.mockResolvedValue([
        { access_group_id: 'ag-1' },
      ]);
      accessGroupRepository.findOne.mockResolvedValue({ group_name: 'admin' });

      const result = await service.logIn({
        email: 'user@example.com',
        password: 'correct-password',
        product_name: 'DPP Creator',
      } as any);

      expect(companyProductRepository.findOne).toHaveBeenCalledWith({
        where: { company_id: 'company-1', product_ifric_id: 'DPP Creator' },
      });
      expect(companyProductRepository.findOne).toHaveBeenCalledWith({
        where: { company_id: 'company-1', product_ifric_id: 'IFRIC Dashboard' },
      });
      expect(result.data.access_group_DPP).toBeDefined();
      expect(result.data.access_group_Ifric_Dashboard).toBeDefined();
    });

    it('DPP Creator path: does not crash when IFRIC Dashboard is not tagged (null-guard regression)', async () => {
      companyProductRepository.findOne.mockImplementation(({ where }) =>
        Promise.resolve(
          where.product_ifric_id === 'DPP Creator'
            ? { product_ifric_id: where.product_ifric_id }
            : null,
        ),
      );
      userProductAccessGroupRepository.find.mockResolvedValue([
        { access_group_id: 'ag-1' },
      ]);
      accessGroupRepository.findOne.mockResolvedValue({ group_name: 'admin' });

      const result = await service.logIn({
        email: 'user@example.com',
        password: 'correct-password',
        product_name: 'DPP Creator',
      } as any);

      expect(result.data.access_group_DPP).toBeDefined();
      expect(result.data.access_group_Ifric_Dashboard).toBeNull();
    });

    it('DPP Creator path: throws 404 when DPP Creator itself is not tagged', async () => {
      companyProductRepository.findOne.mockResolvedValue(null);

      await expect(
        service.logIn({
          email: 'user@example.com',
          password: 'correct-password',
          product_name: 'DPP Creator',
        } as any),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('getIndexedData', () => {
    beforeEach(() => {
      companyUserRepository.find.mockResolvedValue([
        {
          _id: 'user-1',
          company_id: 'company-1',
          user_email: 'user@example.com',
        },
      ]);
      companyRepository.findOne.mockResolvedValue({
        company_ifric_id: 'urn:ifric:company-1',
      });
      companyCategoryMappingRepository.find.mockResolvedValue([
        { category_id: 'cat-1' },
      ]);
      companyCategoryRepository.findOne.mockResolvedValue({
        category_name: 'manufacturer',
      });
    });

    it('DPP Creator path: does not crash when neither product is tagged, falls through to generic path', async () => {
      companyProductRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getIndexedData({
          email: 'user@example.com',
          company_id: 'company-1',
          product_name: 'DPP Creator',
        } as any),
      ).rejects.toThrow(HttpException);

      expect(companyProductRepository.findOne).toHaveBeenCalledWith({
        where: { company_id: 'company-1', product_ifric_id: 'DPP Creator' },
      });
    });

    it('generic path: resolves product_ifric_id directly and does not mint tokens', async () => {
      companyProductRepository.findOne.mockResolvedValue({
        product_ifric_id: 'urn:product:widget',
      });
      userProductAccessGroupRepository.find.mockResolvedValue([
        { access_group_id: 'ag-1' },
      ]);
      accessGroupRepository.findOne.mockResolvedValue({ group_name: 'admin' });

      const result = await service.getIndexedData({
        email: 'user@example.com',
        company_id: 'company-1',
        product_name: 'urn:product:widget',
      } as any);

      expect(result.status).toBe(200);
      expect((result.data as any).access_token).toBeUndefined();
      expect((result.data as any).refresh_token).toBeUndefined();
      expect(keycloakService.passwordGrant).not.toHaveBeenCalled();
    });
  });

  describe('createCompanyUser', () => {
    it('provisions the user in Keycloak instead of hashing a local password', async () => {
      companyUserRepository.find.mockResolvedValue([]); // no existing user
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      companyUserRepository.save.mockResolvedValue({ _id: 'new-user-1' });
      accessGroupRepository.find.mockResolvedValue([{ _id: 'ag-1' }]);
      userProductAccessGroupRepository.save.mockResolvedValue({});

      await service.createCompanyUser(
        {
          user_email: 'newuser@example.com',
          user_name: 'New User',
          company_ifric_id: 'urn:ifric:company-1',
          products: [{ product: 'urn:product:widget', user_role: 'admin' }],
        } as any,
        'admin@example.com',
      );

      expect(keycloakService.createUser).toHaveBeenCalledWith(
        'newuser@example.com',
        'New User',
        expect.any(String),
      );
      expect(companyUserRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          user_password: expect.anything(),
          jwt_token: expect.anything(),
        }),
      );
      expect(userProductAccessGroupRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          product_ifric_id: 'urn:product:widget',
          access_group_id: 'ag-1',
        }),
      );
      expect(userProductAccessGroupRepository.save).toHaveBeenCalled();
    });
  });

  describe('deleteCompanyUser', () => {
    it('deletes the Keycloak identity before removing the local rows', async () => {
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'user-1',
        user_email: 'user@example.com',
      });

      await service.deleteCompanyUser('user-1');

      expect(keycloakService.deleteUser).toHaveBeenCalledWith(
        'user@example.com',
      );
      expect(companyUserRepository.delete).toHaveBeenCalledWith({
        _id: 'user-1',
      });
    });
  });

  describe('updateUserPassword', () => {
    it('verifies the old password via Keycloak, then updates it via the Admin API', async () => {
      companyUserRepository.find.mockResolvedValue([{ _id: 'user-1' }]);

      const result = await service.updateUserPassword({
        email: 'user@example.com',
        oldPassword: 'old-pw',
        newPassword: 'new-pw',
      } as any);

      expect(keycloakService.passwordGrant).toHaveBeenCalledWith(
        'user@example.com',
        'old-pw',
      );
      expect(keycloakService.setPassword).toHaveBeenCalledWith(
        'user@example.com',
        'new-pw',
      );
      expect(result).toEqual({
        status: 204,
        message: 'Password Updated Successfully',
      });
    });

    it('propagates the Invalid Password error when the old password is wrong', async () => {
      companyUserRepository.find.mockResolvedValue([{ _id: 'user-1' }]);
      keycloakService.passwordGrant.mockRejectedValue(
        new HttpException('Invalid Password', 400),
      );

      await expect(
        service.updateUserPassword({
          email: 'user@example.com',
          oldPassword: 'wrong-pw',
          newPassword: 'new-pw',
        } as any),
      ).rejects.toThrow(HttpException);
      expect(keycloakService.setPassword).not.toHaveBeenCalled();
    });
  });

  describe('recoverPasswordRequest', () => {
    it('generates a temporary password and sets it in Keycloak', async () => {
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'user-1',
        user_email: 'user@example.com',
      });

      const result = await service.recoverPasswordRequest('user@example.com');

      expect(keycloakService.setPassword).toHaveBeenCalledWith(
        'user@example.com',
        expect.any(String),
      );
      expect(result.temporaryPassword).toEqual(expect.any(String));
    });
  });

  describe('recoverPassword', () => {
    it('verifies the temporary password via Keycloak, then sets the new one', async () => {
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'user-1',
        user_email: 'user@example.com',
      });

      await service.recoverPassword(
        'user@example.com',
        'temp-pw',
        'brand-new-pw',
      );

      expect(keycloakService.passwordGrant).toHaveBeenCalledWith(
        'user@example.com',
        'temp-pw',
      );
      expect(keycloakService.setPassword).toHaveBeenCalledWith(
        'user@example.com',
        'brand-new-pw',
      );
    });

    it('rejects when the temporary password is incorrect', async () => {
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'user-1',
        user_email: 'user@example.com',
      });
      keycloakService.passwordGrant.mockRejectedValue(new Error('bad creds'));

      await expect(
        service.recoverPassword('user@example.com', 'wrong-temp-pw', 'new-pw'),
      ).rejects.toThrow(HttpException);
      expect(keycloakService.setPassword).not.toHaveBeenCalled();
    });
  });

  describe('updateUserAccessGroup', () => {
    it('upserts UserProductAccessGroup keyed on product_ifric_id, no catalog lookup', async () => {
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'user-1',
        company_id: 'company-1',
      });
      accessGroupRepository.find.mockResolvedValue([{ _id: 'ag-1' }]);
      userProductAccessGroupRepository.query.mockResolvedValue({});

      await service.updateUserAccessGroup('user-1', [
        { product: 'urn:product:widget', user_role: 'admin' },
      ] as any);

      expect(userProductAccessGroupRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        [expect.any(String), 'user-1', 'urn:product:widget', 'ag-1'],
      );
    });
  });

  describe('getUserSpecificProductAccess', () => {
    it('filters UserProductAccessGroup directly by product_ifric_id, no catalog lookup', async () => {
      const rows = [{ product_ifric_id: 'urn:product:widget' }];
      userProductAccessGroupRepository.find.mockResolvedValue(rows);

      const result = await service.getUserSpecificProductAccess(
        'urn:product:widget',
        'user-1',
      );

      expect(userProductAccessGroupRepository.find).toHaveBeenCalledWith({
        where: { product_ifric_id: 'urn:product:widget', user_id: 'user-1' },
      });
      expect(result).toBe(rows);
    });
  });
});
