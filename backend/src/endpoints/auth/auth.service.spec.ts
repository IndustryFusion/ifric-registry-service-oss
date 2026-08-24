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
import { ForbiddenException, HttpException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { KeycloakService } from './keycloak.service';
import {
  Company,
  CompanyUser,
  CompanyCategory,
  AccessGroup,
  CompanyCategoryMapping,
  UserAccessGroup,
} from 'src/entities';
import { AccessControlService } from 'src/common/access-control.service';

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
    sendPasswordResetEmail: jest.Mock;
    deleteUser: jest.Mock;
  };
  let cacheManager: { get: jest.Mock; set: jest.Mock };
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
  let userAccessGroupRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    query: jest.Mock;
    delete: jest.Mock;
  };
  let accessGroupRepository: { findOne: jest.Mock; find: jest.Mock };
  let accessControlService: {
    assertCompanyMatch: jest.Mock;
    assertPermission: jest.Mock;
  };

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
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      deleteUser: jest.fn().mockResolvedValue(undefined),
    };

    // Stands in for the in-memory CacheModule store the recovery throttle
    // uses; TTLs are irrelevant here since each test gets a fresh map.
    const cacheStore = new Map<string, unknown>();
    cacheManager = {
      get: jest.fn(async (key: string) => cacheStore.get(key)),
      set: jest.fn(async (key: string, value: unknown) => {
        cacheStore.set(key, value);
      }),
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

    userAccessGroupRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      query: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    accessGroupRepository = { findOne: jest.fn(), find: jest.fn() };
    accessControlService = {
      assertCompanyMatch: jest.fn(),
      assertPermission: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: CACHE_MANAGER, useValue: cacheManager },
        { provide: AccessControlService, useValue: accessControlService },
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
          provide: getRepositoryToken(UserAccessGroup),
          useValue: userAccessGroupRepository,
        },
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
        } as any),
      ).rejects.toThrow(HttpException);
    });

    it('calls KeycloakService.passwordGrant exactly once per login', async () => {
      userAccessGroupRepository.findOne.mockResolvedValue({
        access_group_id: 'ag-1',
      });
      accessGroupRepository.findOne.mockResolvedValue({ group_name: 'admin' });

      await service.logIn({
        email: 'user@example.com',
        password: 'correct-password',
      } as any);

      expect(keycloakService.passwordGrant).toHaveBeenCalledTimes(1);
      expect(keycloakService.passwordGrant).toHaveBeenCalledWith(
        'user@example.com',
        'correct-password',
      );
    });

    it("resolves the user's one AccessGroup grant and returns the Keycloak tokens", async () => {
      userAccessGroupRepository.findOne.mockResolvedValue({
        access_group_id: 'ag-1',
      });
      accessGroupRepository.findOne.mockResolvedValue({ group_name: 'admin' });

      const result = await service.logIn({
        email: 'user@example.com',
        password: 'correct-password',
      } as any);

      expect(userAccessGroupRepository.findOne).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
      });
      expect(result.status).toBe(200);
      expect(result.data.access_group).toEqual({ group_name: 'admin' });
      expect(result.data.access_token).toBe('kc-access-token');
      expect(result.data.refresh_token).toBe('kc-refresh-token');
    });

    it('throws 404 when the user has no AccessGroup grant yet', async () => {
      userAccessGroupRepository.findOne.mockResolvedValue(null);

      await expect(
        service.logIn({
          email: 'user@example.com',
          password: 'correct-password',
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

    it('resolves the AccessGroup grant and does not mint tokens', async () => {
      userAccessGroupRepository.findOne.mockResolvedValue({
        access_group_id: 'ag-1',
      });
      accessGroupRepository.findOne.mockResolvedValue({ group_name: 'admin' });

      const result = await service.getIndexedData({
        email: 'user@example.com',
        company_id: 'company-1',
      } as any);

      expect(result.status).toBe(200);
      expect((result.data as any).access_token).toBeUndefined();
      expect((result.data as any).refresh_token).toBeUndefined();
      expect(keycloakService.passwordGrant).not.toHaveBeenCalled();
    });

    it('throws 404 when the user has no AccessGroup grant yet', async () => {
      userAccessGroupRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getIndexedData({
          email: 'user@example.com',
          company_id: 'company-1',
        } as any),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('createCompanyUser', () => {
    it('rejects (without touching Keycloak) when the caller is scoped to a different company', async () => {
      accessControlService.assertCompanyMatch.mockImplementation(() => {
        throw new Error('company mismatch');
      });

      await expect(
        service.createCompanyUser(
          {
            user_email: 'newuser@example.com',
            user_name: 'New User',
            company_ifric_id: 'urn:ifric:company-1',
            user_role: 'admin',
          } as any,
          'admin@example.com',
          { company_ifric_id: 'urn:ifric:other-company', user_id: 'caller-1' },
        ),
      ).rejects.toThrow('company mismatch');
      expect(keycloakService.createUser).not.toHaveBeenCalled();
    });

    it('rejects when the caller lacks create permission', async () => {
      accessControlService.assertPermission.mockRejectedValue(
        new Error('no create permission'),
      );

      await expect(
        service.createCompanyUser(
          {
            user_email: 'newuser@example.com',
            user_name: 'New User',
            company_ifric_id: 'urn:ifric:company-1',
            user_role: 'admin',
          } as any,
          'admin@example.com',
          { company_ifric_id: 'urn:ifric:company-1', user_id: 'caller-1' },
        ),
      ).rejects.toThrow('no create permission');
      expect(keycloakService.createUser).not.toHaveBeenCalled();
    });

    it("sources meta_data.add_by from the caller's verified token email, not the unverified admin_mail param", async () => {
      companyUserRepository.find.mockResolvedValue([]);
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      companyUserRepository.save.mockResolvedValue({ _id: 'new-user-1' });
      accessGroupRepository.find.mockResolvedValue([]);

      await service.createCompanyUser(
        {
          user_email: 'newuser@example.com',
          user_name: 'New User',
          company_ifric_id: 'urn:ifric:company-1',
          user_role: 'admin',
        } as any,
        'spoofed-admin@example.com',
        {
          company_ifric_id: 'urn:ifric:company-1',
          user_id: 'caller-1',
          email: 'real-caller@example.com',
        },
      );

      expect(companyUserRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          meta_data: expect.objectContaining({
            add_by: 'real-caller@example.com',
          }),
        }),
      );
    });

    it('provisions the user in Keycloak instead of hashing a local password', async () => {
      companyUserRepository.find.mockResolvedValue([]); // no existing user
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      companyUserRepository.save.mockResolvedValue({ _id: 'new-user-1' });
      accessGroupRepository.find.mockResolvedValue([{ _id: 'ag-1' }]);
      userAccessGroupRepository.save.mockResolvedValue({});

      await service.createCompanyUser(
        {
          user_email: 'newuser@example.com',
          user_name: 'New User',
          company_ifric_id: 'urn:ifric:company-1',
          user_role: 'admin',
        } as any,
        'admin@example.com',
        { company_ifric_id: 'urn:ifric:company-1', user_id: 'caller-1' },
      );

      expect(keycloakService.createUser).toHaveBeenCalledWith(
        'newuser@example.com',
        'New User',
        expect.any(String),
        {
          company_ifric_id: 'urn:ifric:company-1',
          user_id: expect.any(String),
        },
      );
      expect(companyUserRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({
          user_password: expect.anything(),
          jwt_token: expect.anything(),
        }),
      );
      expect(userAccessGroupRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          access_group_id: 'ag-1',
        }),
      );
      expect(userAccessGroupRepository.save).toHaveBeenCalled();
    });
  });

  describe('deleteCompanyUser', () => {
    it('deletes the Keycloak identity before removing the local rows', async () => {
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'user-1',
        user_email: 'user@example.com',
      });

      await service.deleteCompanyUser('user-1', {
        company_ifric_id: 'urn:ifric:company-1',
        user_id: 'caller-1',
      });

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
    it('hands delivery to Keycloak and returns no credential', async () => {
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'user-1',
        user_email: 'user@example.com',
      });

      const result = await service.recoverPasswordRequest('user@example.com');

      expect(keycloakService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'user@example.com',
      );
      // The whole point: nothing here touches or returns a password, and
      // the existing one is left working until the emailed link is used.
      expect(keycloakService.setPassword).not.toHaveBeenCalled();
      expect(Object.keys(result)).toEqual(['success', 'status', 'message']);
      expect(JSON.stringify(result)).not.toMatch(/password.{0,4}:/i);
    });

    it('answers unknown addresses identically, so it cannot be used to enumerate accounts', async () => {
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'user-1',
        user_email: 'user@example.com',
      });
      const known = await service.recoverPasswordRequest('user@example.com');

      companyUserRepository.findOne.mockResolvedValue(null);
      const unknown =
        await service.recoverPasswordRequest('nobody@example.com');

      expect(unknown).toEqual(known);
      expect(keycloakService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    });

    it('fails closed when delivery fails, rather than returning a password', async () => {
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'user-1',
        user_email: 'user@example.com',
      });
      keycloakService.sendPasswordResetEmail.mockRejectedValue(
        new HttpException('Failed to send the password recovery email', 500),
      );

      await expect(
        service.recoverPasswordRequest('user@example.com'),
      ).rejects.toThrow(HttpException);
    });

    it('throttles repeat requests for the same address, existing or not', async () => {
      companyUserRepository.findOne.mockResolvedValue(null);

      await service.recoverPasswordRequest('User@Example.com');

      // Same address, different casing, and an address with no account —
      // still throttled, so a 429 says nothing about who is registered.
      await expect(
        service.recoverPasswordRequest('user@example.com'),
      ).rejects.toThrow(HttpException);
    });

    it('throttles a caller hammering many addresses from one IP', async () => {
      companyUserRepository.findOne.mockResolvedValue(null);

      await service.recoverPasswordRequest('a@example.com', '203.0.113.9');

      await expect(
        service.recoverPasswordRequest('b@example.com', '203.0.113.9'),
      ).rejects.toThrow(HttpException);
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

    it('does not echo the supplied password back in the response', async () => {
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'user-1',
        user_email: 'user@example.com',
      });

      const result = await service.recoverPassword(
        'user@example.com',
        'temp-pw',
        'brand-new-pw',
      );

      expect(JSON.stringify(result)).not.toContain('temp-pw');
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
    it('upserts UserAccessGroup keyed on user_id alone', async () => {
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'user-1',
        company_id: 'company-1',
      });
      accessGroupRepository.find.mockResolvedValue([{ _id: 'ag-1' }]);
      userAccessGroupRepository.query.mockResolvedValue({});

      await service.updateUserAccessGroup(
        'user-1',
        { user_role: 'admin' },
        { company_ifric_id: 'urn:ifric:company-1', user_id: 'caller-1' },
      );

      expect(userAccessGroupRepository.query).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        [expect.any(String), 'user-1', 'ag-1'],
      );
    });
  });
  // The whole /auth/get-* surface used to take no caller identity at all:
  // any valid realm token could read any company's user roster, including
  // every user's email address.
  describe('company scoping on user lookups', () => {
    const caller = {
      company_ifric_id: 'urn:ifric:company-1',
      user_id: 'user-1',
    };
    const userRow = {
      _id: 'user-9',
      company_id: 'company-2',
      user_email: 'someone@other.example',
      user_name: 'Someone Else',
    };

    it('getCompanyUsers rejects a caller from another company', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-2' }]);
      accessControlService.assertCompanyMatch.mockImplementation(() => {
        throw new ForbiddenException('mismatch');
      });

      await expect(
        service.getCompanyUsers('urn:ifric:other-company', caller),
      ).rejects.toThrow(ForbiddenException);
      expect(companyUserRepository.find).not.toHaveBeenCalled();
    });

    it('getCompanyUsers returns the roster for the caller own company', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      companyUserRepository.find.mockResolvedValue([userRow]);

      await expect(
        service.getCompanyUsers('urn:ifric:company-1', caller),
      ).resolves.toEqual([userRow]);
      expect(accessControlService.assertPermission).toHaveBeenCalledWith(
        caller,
        'read',
      );
    });

    it('getUserDetails rejects a caller from another company', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-2' }]);
      accessControlService.assertCompanyMatch.mockImplementation(() => {
        throw new ForbiddenException('mismatch');
      });

      await expect(
        service.getUserDetails(
          'someone@other.example',
          'urn:ifric:other-company',
          caller,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(companyUserRepository.find).not.toHaveBeenCalled();
    });

    // Keyed on a user id/email rather than a company, so the boundary has
    // to be recovered from the row before it can be asserted.
    it('getUserDetailsById asserts against the company the user belongs to', async () => {
      companyUserRepository.find.mockResolvedValue([userRow]);
      companyRepository.findOne.mockResolvedValue({
        _id: 'company-2',
        company_ifric_id: 'urn:ifric:other-company',
      });

      await service.getUserDetailsById('user-9', caller);

      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        caller,
        'urn:ifric:other-company',
      );
    });

    it('getUserDetailsByEmail rejects a caller from another company', async () => {
      companyUserRepository.find.mockResolvedValue([userRow]);
      companyRepository.findOne.mockResolvedValue({
        _id: 'company-2',
        company_ifric_id: 'urn:ifric:other-company',
      });
      accessControlService.assertCompanyMatch.mockImplementation(() => {
        throw new ForbiddenException('mismatch');
      });

      await expect(
        service.getUserDetailsByEmail('someone@other.example', caller),
      ).rejects.toThrow(ForbiddenException);
    });

    // A user row whose company row has gone missing must not fall through
    // the check — an empty id can never match a real claim.
    it('denies when the user company cannot be resolved', async () => {
      companyUserRepository.find.mockResolvedValue([userRow]);
      companyRepository.findOne.mockResolvedValue(null);

      await service.getUserDetailsById('user-9', caller).catch(() => undefined);

      expect(accessControlService.assertCompanyMatch).toHaveBeenCalledWith(
        caller,
        '',
      );
    });
  });
  // Write-side counterparts to the read scoping above. These took no caller
  // identity at all, so any authenticated user could manage users and roles
  // in any company.
  describe('company scoping on user writes', () => {
    const caller = {
      company_ifric_id: 'urn:ifric:company-1',
      user_id: 'caller-1',
    };
    const targetUser = { _id: 'user-9', company_id: 'company-2' };

    const denyCompanyMatch = () =>
      accessControlService.assertCompanyMatch.mockImplementation(() => {
        throw new ForbiddenException('mismatch');
      });

    // The sharpest one: this writes UserAccessGroup, i.e. it assigns a
    // user's role.
    it('updateUserAccessGroup rejects a target user in another company', async () => {
      companyUserRepository.findOne.mockResolvedValue(targetUser);
      companyRepository.findOne.mockResolvedValue({
        _id: 'company-2',
        company_ifric_id: 'urn:ifric:other-company',
      });
      denyCompanyMatch();

      await expect(
        service.updateUserAccessGroup('user-9', { user_role: 'admin' }, caller),
      ).rejects.toThrow(ForbiddenException);
      expect(userAccessGroupRepository.query).not.toHaveBeenCalled();
    });

    // No self-exemption: granting yourself a role is the escalation being
    // closed, so 'update' is required even when acting on your own user.
    it('updateUserAccessGroup requires update permission, not just a company match', async () => {
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'caller-1',
        company_id: 'company-1',
      });
      companyRepository.findOne.mockResolvedValue({
        _id: 'company-1',
        company_ifric_id: 'urn:ifric:company-1',
      });
      accessControlService.assertPermission.mockRejectedValue(
        new ForbiddenException('No update permission'),
      );

      await expect(
        service.updateUserAccessGroup(
          'caller-1',
          { user_role: 'admin' },
          caller,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(userAccessGroupRepository.query).not.toHaveBeenCalled();
    });

    it('deleteCompanyUser rejects a target user in another company', async () => {
      companyUserRepository.findOne.mockResolvedValue({
        ...targetUser,
        user_email: 'someone@other.example',
      });
      companyRepository.findOne.mockResolvedValue({
        _id: 'company-2',
        company_ifric_id: 'urn:ifric:other-company',
      });
      denyCompanyMatch();

      await expect(service.deleteCompanyUser('user-9', caller)).rejects.toThrow(
        ForbiddenException,
      );
      expect(keycloakService.deleteUser).not.toHaveBeenCalled();
      expect(companyUserRepository.delete).not.toHaveBeenCalled();
    });

    it('updateCompanyUser rejects a caller from another company', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-2' }]);
      denyCompanyMatch();

      await expect(
        service.updateCompanyUser(
          {
            company_ifric_id: 'urn:ifric:other-company',
            user_id: 'user-9',
            user_name: 'Renamed',
          } as any,
          caller,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    // company_ifric_id is caller-supplied, so a matching claim alone does
    // not prove the target user belongs to that company.
    it('updateCompanyUser rejects a target user belonging to a different company', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      companyUserRepository.findOne.mockResolvedValue(targetUser);

      await expect(
        service.updateCompanyUser(
          {
            company_ifric_id: 'urn:ifric:company-1',
            user_id: 'user-9',
            user_name: 'Renamed',
          } as any,
          caller,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    // A read_only user must still be able to edit their own profile and
    // change their own password through this endpoint.
    it('updateCompanyUser lets a user edit themselves without update permission', async () => {
      companyRepository.find.mockResolvedValue([
        { _id: 'company-1', email: 'admin@example.com' },
      ]);
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'caller-1',
        company_id: 'company-1',
        user_email: 'caller@example.com',
      });
      accessControlService.assertPermission.mockRejectedValue(
        new ForbiddenException('No update permission'),
      );

      await service.updateCompanyUser(
        {
          company_ifric_id: 'urn:ifric:company-1',
          user_id: 'caller-1',
          user_name: 'My New Name',
        } as any,
        caller,
      );

      expect(accessControlService.assertPermission).not.toHaveBeenCalled();
    });

    it('updateCompanyUser requires update permission to edit somebody else', async () => {
      companyRepository.find.mockResolvedValue([{ _id: 'company-1' }]);
      companyUserRepository.findOne.mockResolvedValue({
        _id: 'user-9',
        company_id: 'company-1',
        user_email: 'someone@example.com',
      });
      accessControlService.assertPermission.mockRejectedValue(
        new ForbiddenException('No update permission'),
      );

      await expect(
        service.updateCompanyUser(
          {
            company_ifric_id: 'urn:ifric:company-1',
            user_id: 'user-9',
            user_name: 'Renamed',
          } as any,
          caller,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
