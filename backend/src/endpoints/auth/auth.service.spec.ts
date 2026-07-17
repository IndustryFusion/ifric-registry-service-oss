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
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { JwtService } from '@nestjs/jwt';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Company } from 'src/schemas/company.schema';
import { CompanyUser } from 'src/schemas/company_user.schema';
import { CompanyCategory } from 'src/schemas/company_category.schema';
import { AccessGroup } from 'src/schemas/access_group.schema';
import { CompanyCategoryMapping } from 'src/schemas/company_category_mapping.schema';
import { Product } from 'src/schemas/products.schema';
import { UserProductAccessGroup } from 'src/schemas/user_product_access_group.schema';
import { CompanyProduct } from 'src/schemas/company_product.schema';
import { CompanyTwin } from 'src/schemas/company_twin.schema';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let companyModel: { find: jest.Mock; findById: jest.Mock };
  let companyUserModel: jest.Mock & {
    find: jest.Mock;
    findOne: jest.Mock;
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    updateOne: jest.Mock;
  };
  let companyCategoryModel: { findById: jest.Mock };
  let companyCategoryMappingModel: { find: jest.Mock };
  let companyProductModel: { findOne: jest.Mock };
  let userProductAccessGroupModel: jest.Mock & {
    find: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let accessGroupModel: { findById: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('token'),
      verifyAsync: jest.fn(),
    };
    companyModel = { find: jest.fn(), findById: jest.fn() };

    companyUserModel = jest.fn() as any;
    companyUserModel.find = jest.fn();
    companyUserModel.findOne = jest.fn();
    companyUserModel.findById = jest.fn();
    companyUserModel.findByIdAndUpdate = jest.fn().mockResolvedValue({});
    companyUserModel.updateOne = jest.fn().mockResolvedValue({});

    companyCategoryModel = { findById: jest.fn() };
    companyCategoryMappingModel = { find: jest.fn() };
    companyProductModel = { findOne: jest.fn() };

    userProductAccessGroupModel = jest.fn() as any;
    userProductAccessGroupModel.find = jest.fn();
    userProductAccessGroupModel.findOneAndUpdate = jest.fn();

    accessGroupModel = { findById: jest.fn(), find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: CACHE_MANAGER, useValue: {} },
        { provide: getModelToken(Company.name), useValue: companyModel },
        {
          provide: getModelToken(CompanyUser.name),
          useValue: companyUserModel,
        },
        {
          provide: getModelToken(CompanyCategory.name),
          useValue: companyCategoryModel,
        },
        {
          provide: getModelToken(AccessGroup.name),
          useValue: accessGroupModel,
        },
        {
          provide: getModelToken(CompanyCategoryMapping.name),
          useValue: companyCategoryMappingModel,
        },
        { provide: getModelToken(Product.name), useValue: {} },
        {
          provide: getModelToken(UserProductAccessGroup.name),
          useValue: userProductAccessGroupModel,
        },
        {
          provide: getModelToken(CompanyProduct.name),
          useValue: companyProductModel,
        },
        { provide: getModelToken(CompanyTwin.name), useValue: {} },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('password hashing', () => {
    it('hashes a password to a bcrypt hash distinct from the plaintext', async () => {
      const hash = await service.hashPassword('correct horse battery staple');
      expect(hash).not.toBe('correct horse battery staple');
      expect(hash).toMatch(/^\$2[aby]\$/); // bcrypt hash prefix
    });

    it('produces a different hash each time (random salt)', async () => {
      const [hashOne, hashTwo] = await Promise.all([
        service.hashPassword('same-password'),
        service.hashPassword('same-password'),
      ]);
      expect(hashOne).not.toBe(hashTwo);
    });

    it('comparePassword succeeds for the correct password', async () => {
      const hash = await service.hashPassword('correct horse battery staple');
      await expect(
        service.comparePassword('correct horse battery staple', hash),
      ).resolves.toBe(true);
    });

    it('comparePassword fails for an incorrect password', async () => {
      const hash = await service.hashPassword('correct horse battery staple');
      await expect(
        service.comparePassword('wrong password', hash),
      ).resolves.toBe(false);
    });
  });

  describe('refreshAccessToken', () => {
    it('rejects a token that fails signature verification', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('bad signature'));

      await expect(service.refreshAccessToken('garbage')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a token whose type is not "refresh"', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'company-1',
        user: 'user@example.com',
        type: 'access',
      });

      await expect(
        service.refreshAccessToken('some-access-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a refresh token that no longer matches CompanyUser.jwt_token (revoked)', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: '507f1f77bcf86cd799439011',
        user: 'user@example.com',
        type: 'refresh',
      });
      companyUserModel.findOne.mockResolvedValue(null);

      await expect(
        service.refreshAccessToken('a-revoked-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('mints a new access token when the refresh token is valid and unrevoked', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: '507f1f77bcf86cd799439011',
        user: 'user@example.com',
        type: 'refresh',
      });
      companyUserModel.findOne.mockResolvedValue({ _id: 'user-1' });
      jwtService.signAsync.mockResolvedValue('new-access-token');

      const result = await service.refreshAccessToken('a-valid-refresh-token');

      expect(result).toEqual({ access_token: 'new-access-token' });
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'access' }),
        expect.any(Object),
      );
    });
  });

  describe('logOut', () => {
    it('clears the stored refresh token for an existing user', async () => {
      companyUserModel.findOne.mockResolvedValue({ _id: 'user-1' });
      companyUserModel.updateOne.mockResolvedValue({});

      await service.logOut({ email: 'user@example.com' });

      expect(companyUserModel.updateOne).toHaveBeenCalledWith(
        { user_email: 'user@example.com' },
        { $set: { jwt_token: null } },
      );
    });
  });

  describe('logIn', () => {
    let hashedPassword: string;

    beforeEach(async () => {
      hashedPassword = await service.hashPassword('correct-password');
      companyUserModel.find.mockResolvedValue([
        {
          id: 'user-1',
          company_id: 'company-1',
          user_email: 'user@example.com',
          user_name: 'Test User',
          user_password: hashedPassword,
        },
      ]);
      companyModel.findById.mockResolvedValue({
        company_ifric_id: 'urn:ifric:company-1',
      });
      companyCategoryMappingModel.find.mockResolvedValue([
        { category_id: 'cat-1' },
      ]);
      companyCategoryModel.findById.mockResolvedValue({
        category_name: 'manufacturer',
      });
    });

    it('rejects an incorrect password', async () => {
      await expect(
        service.logIn({
          email: 'user@example.com',
          password: 'wrong-password',
          product_name: 'DPP Creator',
        } as any),
      ).rejects.toThrow(HttpException);
    });

    it('generic path: resolves product_ifric_id directly, no local catalog lookup', async () => {
      companyProductModel.findOne.mockResolvedValue({
        product_ifric_id: 'urn:product:widget',
      });
      userProductAccessGroupModel.find.mockResolvedValue([
        { access_group_id: 'ag-1' },
      ]);
      accessGroupModel.findById.mockResolvedValue({ group_name: 'admin' });

      const result = await service.logIn({
        email: 'user@example.com',
        password: 'correct-password',
        product_name: 'urn:product:widget',
      } as any);

      expect(companyProductModel.findOne).toHaveBeenCalledWith({
        company_id: 'company-1',
        product_ifric_id: 'urn:product:widget',
      });
      expect(userProductAccessGroupModel.find).toHaveBeenCalledWith({
        user_id: 'user-1',
        product_ifric_id: 'urn:product:widget',
      });
      expect(result.status).toBe(200);
      expect(result.data.access_group).toEqual({ group_name: 'admin' });
    });

    it('generic path: throws 404 when the product is not tagged to the company', async () => {
      companyProductModel.findOne.mockResolvedValue(null);

      await expect(
        service.logIn({
          email: 'user@example.com',
          password: 'correct-password',
          product_name: 'urn:product:unknown',
        } as any),
      ).rejects.toThrow(HttpException);
    });

    it('DPP Creator path: grants both DPP and IFRIC Dashboard access when both are tagged', async () => {
      companyProductModel.findOne.mockImplementation(({ product_ifric_id }) =>
        Promise.resolve({ product_ifric_id }),
      );
      userProductAccessGroupModel.find.mockResolvedValue([
        { access_group_id: 'ag-1' },
      ]);
      accessGroupModel.findById.mockResolvedValue({ group_name: 'admin' });

      const result = await service.logIn({
        email: 'user@example.com',
        password: 'correct-password',
        product_name: 'DPP Creator',
      } as any);

      expect(companyProductModel.findOne).toHaveBeenCalledWith({
        company_id: 'company-1',
        product_ifric_id: 'DPP Creator',
      });
      expect(companyProductModel.findOne).toHaveBeenCalledWith({
        company_id: 'company-1',
        product_ifric_id: 'IFRIC Dashboard',
      });
      expect(result.data.access_group_DPP).toBeDefined();
      expect(result.data.access_group_Ifric_Dashboard).toBeDefined();
    });

    it('DPP Creator path: does not crash when IFRIC Dashboard is not tagged (null-guard regression)', async () => {
      companyProductModel.findOne.mockImplementation(({ product_ifric_id }) =>
        Promise.resolve(
          product_ifric_id === 'DPP Creator' ? { product_ifric_id } : null,
        ),
      );
      userProductAccessGroupModel.find.mockResolvedValue([
        { access_group_id: 'ag-1' },
      ]);
      accessGroupModel.findById.mockResolvedValue({ group_name: 'admin' });

      const result = await service.logIn({
        email: 'user@example.com',
        password: 'correct-password',
        product_name: 'DPP Creator',
      } as any);

      expect(result.data.access_group_DPP).toBeDefined();
      expect(result.data.access_group_Ifric_Dashboard).toBeNull();
    });

    it('DPP Creator path: throws 404 when DPP Creator itself is not tagged', async () => {
      companyProductModel.findOne.mockResolvedValue(null);

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
      companyUserModel.find.mockResolvedValue([
        {
          id: 'user-1',
          company_id: 'company-1',
          user_email: 'user@example.com',
        },
      ]);
      companyModel.findById.mockResolvedValue({
        company_ifric_id: 'urn:ifric:company-1',
      });
      companyCategoryMappingModel.find.mockResolvedValue([
        { category_id: 'cat-1' },
      ]);
      companyCategoryModel.findById.mockResolvedValue({
        category_name: 'manufacturer',
      });
    });

    it('DPP Creator path: does not crash when neither product is tagged, falls through to generic path', async () => {
      companyProductModel.findOne.mockResolvedValue(null);

      await expect(
        service.getIndexedData({
          email: 'user@example.com',
          company_id: 'company-1',
          product_name: 'DPP Creator',
        } as any),
      ).rejects.toThrow(HttpException);

      expect(companyProductModel.findOne).toHaveBeenCalledWith({
        company_id: 'company-1',
        product_ifric_id: 'DPP Creator',
      });
    });

    it('generic path: resolves product_ifric_id directly', async () => {
      companyProductModel.findOne.mockResolvedValue({
        product_ifric_id: 'urn:product:widget',
      });
      userProductAccessGroupModel.find.mockResolvedValue([
        { access_group_id: 'ag-1' },
      ]);
      accessGroupModel.findById.mockResolvedValue({ group_name: 'admin' });

      const result = await service.getIndexedData({
        email: 'user@example.com',
        company_id: 'company-1',
        product_name: 'urn:product:widget',
      } as any);

      expect(result.status).toBe(200);
    });
  });

  describe('createCompanyUser', () => {
    it('grants access using the product identifier directly, with no catalog lookup', async () => {
      companyUserModel.find.mockResolvedValue([]); // no existing user
      companyModel.find.mockResolvedValue([{ id: 'company-1' }]);
      companyUserModel.mockReturnValue({
        save: jest.fn().mockResolvedValue({ id: 'new-user-1' }),
      });
      accessGroupModel.find.mockResolvedValue([{ id: 'ag-1' }]);
      const grantSave = jest.fn().mockResolvedValue({});
      userProductAccessGroupModel.mockReturnValue({ save: grantSave });

      await service.createCompanyUser(
        {
          user_email: 'newuser@example.com',
          user_name: 'New User',
          company_ifric_id: 'urn:ifric:company-1',
          products: [{ product: 'urn:product:widget', user_role: 'admin' }],
        } as any,
        'admin@example.com',
      );

      expect(userProductAccessGroupModel).toHaveBeenCalledWith(
        expect.objectContaining({
          product_ifric_id: 'urn:product:widget',
          access_group_id: 'ag-1',
        }),
      );
      expect(grantSave).toHaveBeenCalled();
    });
  });

  describe('updateUserAccessGroup', () => {
    it('upserts UserProductAccessGroup keyed on product_ifric_id, no catalog lookup', async () => {
      companyUserModel.findById.mockResolvedValue({
        id: 'user-1',
        company_id: 'company-1',
      });
      accessGroupModel.find.mockResolvedValue([{ id: 'ag-1' }]);
      userProductAccessGroupModel.findOneAndUpdate.mockResolvedValue({});

      await service.updateUserAccessGroup('user-1', [
        { product: 'urn:product:widget', user_role: 'admin' },
      ] as any);

      expect(userProductAccessGroupModel.findOneAndUpdate).toHaveBeenCalledWith(
        { user_id: 'user-1', product_ifric_id: 'urn:product:widget' },
        { access_group_id: 'ag-1' },
        { new: true, upsert: true },
      );
    });
  });

  describe('getUserSpecificProductAccess', () => {
    it('filters UserProductAccessGroup directly by product_ifric_id, no catalog lookup', async () => {
      const rows = [{ product_ifric_id: 'urn:product:widget' }];
      userProductAccessGroupModel.find.mockResolvedValue(rows);

      const result = await service.getUserSpecificProductAccess(
        'urn:product:widget',
        'user-1',
      );

      expect(userProductAccessGroupModel.find).toHaveBeenCalledWith({
        product_ifric_id: 'urn:product:widget',
        user_id: 'user-1',
      });
      expect(result).toBe(rows);
    });
  });
});
