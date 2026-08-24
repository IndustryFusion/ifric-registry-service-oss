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

import { Inject, Injectable } from '@nestjs/common';
import { UpdateUserDetails } from './dto/update-auth.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateUserAccessDto } from './dto/update-user-access.dto';
import { FindOneAuthDto, FindIndexedDbAuthDto } from './dto/find-auth-dto';
import { UserAccessDto } from './dto/user-access-dto';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { generateId } from 'src/database/generate-id';
import {
  Company,
  CompanyUser,
  CompanyCategory,
  AccessGroup,
  CompanyCategoryMapping,
  UserAccessGroup,
} from 'src/entities';
import { KeycloakService } from './keycloak.service';
import { AccessControlService } from 'src/common/access-control.service';
import { AuthTokenClaims } from './auth-token-claims.interface';
import * as generator from 'generate-password';
import * as dotenv from 'dotenv';
import { HttpException, HttpStatus } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as moment from 'moment';

dotenv.config();

// Window for the unauthenticated password-recovery throttle
// (AuthService.recoverPasswordRequest), in milliseconds.
const RECOVERY_THROTTLE_MS = 60_000;

@Injectable()
export class AuthService {
  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(CompanyUser)
    private companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(CompanyCategory)
    private companyCategoryRepository: Repository<CompanyCategory>,
    @InjectRepository(AccessGroup)
    private accessGroupRepository: Repository<AccessGroup>,
    @InjectRepository(CompanyCategoryMapping)
    private companyCategoryMappingRepository: Repository<CompanyCategoryMapping>,
    @InjectRepository(UserAccessGroup)
    private userAccessGroupRepository: Repository<UserAccessGroup>,
    private keycloakService: KeycloakService,
    private readonly accessControlService: AccessControlService,
  ) {}

  async createCompanyUser(
    data: UserAccessDto,
    adminMail: string,
    authUser: AuthTokenClaims,
  ) {
    try {
      this.accessControlService.assertCompanyMatch(
        authUser,
        data.company_ifric_id,
      );
      await this.accessControlService.assertPermission(authUser, 'create');

      // Fetch User From Company User
      const companyUserResponse = await this.companyUserRepository.find({
        where: { user_email: data.user_email },
      });
      if (companyUserResponse.length > 0) {
        throw new HttpException('User already exists', HttpStatus.CONFLICT);
      }

      // Fetch Company Id from Company Ifric Id
      const companyData = await this.companyRepository.find({
        where: { company_ifric_id: data.company_ifric_id },
      });
      if (companyData.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      const companyId = companyData[0]._id;

      // Add Temporary Password
      const temporaryPassword = await generator.generate({
        length: 8,
        numbers: true,
        symbols: true,
        uppercase: true,
        excludeSimilarCharacters: true,
      });

      // Pre-generated so it can be stamped onto the Keycloak identity below
      // before the CompanyUser row exists — see CompanyService.createCompany
      // for the same pattern.
      const newUserId = generateId();

      // Provision the identity in Keycloak — credentials live there, not
      // in this table. company_ifric_id/user_id become Keycloak user
      // attributes, projected into access tokens via a realm protocol
      // mapper (see docs/keycloak-setup.md).
      await this.keycloakService.createUser(
        data.user_email,
        data.user_name,
        temporaryPassword,
        { company_ifric_id: data.company_ifric_id, user_id: newUserId },
      );

      const response = await this.companyUserRepository.save(
        this.companyUserRepository.create({
          _id: newUserId,
          company_id: companyId,
          user_email: data.user_email,
          user_name: data.user_name,
          meta_data: {
            created_at: moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
            updated_at: moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
            // Sourced from the verified caller's own token now, not the
            // unverified :admin_mail path param — adminMail is kept only
            // for the route shape, not trusted for anything.
            add_by: authUser.email ?? authUser.preferred_username ?? adminMail,
          },
        }),
      );

      // Grant the new user their one AccessGroup role for this company.
      const accessGroupData = await this.accessGroupRepository.find({
        where: {
          company_id: companyId,
          group_name: data.user_role,
        },
      });
      if (accessGroupData.length > 0) {
        await this.userAccessGroupRepository.save(
          this.userAccessGroupRepository.create({
            user_id: response._id,
            access_group_id: accessGroupData[0]._id,
          }),
        );
      }

      return {
        success: true,
        status: 201,
        message: 'User created successfully',
        temporaryPassword,
      };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async logIn(data: FindOneAuthDto) {
    try {
      // Fetch Data from Company User
      const companyUserResponse = await this.companyUserRepository.find({
        where: { user_email: data.email },
      });
      if (companyUserResponse.length > 0) {
        // Throws HttpException('Invalid Password', BAD_REQUEST) itself on
        // bad credentials. Called exactly once — the resulting tokens are
        // reused at whichever response branch fires below, since asking
        // Keycloak to authenticate the same credentials twice would open a
        // second, redundant session.
        const keycloakTokens = await this.keycloakService.passwordGrant(
          data.email,
          data.password,
        );

        // Fetch Company IFRIC ID
        const companyResponse = await this.companyRepository.findOne({
          where: { _id: companyUserResponse[0].company_id },
        });
        if (!companyResponse) {
          throw new HttpException(
            'No company found with the provided ID',
            HttpStatus.NOT_FOUND,
          );
        }

        // Fetch Data from Company Category Mapping
        const companyCategoryMappingData =
          await this.companyCategoryMappingRepository.find({
            where: { company_id: companyUserResponse[0].company_id },
          });
        if (companyCategoryMappingData.length > 0) {
          // Fetch Data from Company Category
          const companyCategoryData =
            await this.companyCategoryRepository.findOne({
              where: { _id: companyCategoryMappingData[0].category_id },
            });
          if (Object.keys(companyCategoryData).length > 0) {
            // One AccessGroup grant per user (no per-product dimension) —
            // see UserAccessGroup.
            const userAccessData = await this.userAccessGroupRepository.findOne(
              {
                where: { user_id: companyUserResponse[0]._id },
              },
            );
            if (!userAccessData) {
              throw new HttpException(
                'Access Group Mapping Not Found',
                HttpStatus.NOT_FOUND,
              );
            }
            const accessData = await this.accessGroupRepository.findOne({
              where: { _id: userAccessData.access_group_id },
            });
            return {
              status: 200,
              data: {
                company_ifric_id: companyResponse.company_ifric_id,
                user_name: companyUserResponse[0].user_name,
                access_token: keycloakTokens.access_token,
                refresh_token: keycloakTokens.refresh_token,
                user_role: companyCategoryData.category_name,
                access_group: accessData,
                user_email: companyUserResponse[0].user_email,
              },
            };
          } else {
            throw new HttpException(
              'Company Category Not Found',
              HttpStatus.NOT_FOUND,
            );
          }
        } else {
          throw new HttpException(
            'Company Category Mapping Not Found',
            HttpStatus.NOT_FOUND,
          );
        }
      } else {
        throw new HttpException('User Not Found', HttpStatus.NOT_FOUND);
      }
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  // These lookups are keyed on a user id or email rather than a company, so
  // the company boundary has to be recovered from the row before it can be
  // asserted. Kept in one place so every user-facing read enforces it the
  // same way.
  private async assertCallerOwnsUsersCompany(
    user: CompanyUser,
    authUser: AuthTokenClaims,
  ): Promise<void> {
    const company = await this.companyRepository.findOne({
      where: { _id: user.company_id },
    });
    this.accessControlService.assertCompanyMatch(
      authUser,
      company?.company_ifric_id ?? '',
    );
    await this.accessControlService.assertPermission(authUser, 'read');
  }

  async getIndexedData(data: FindIndexedDbAuthDto) {
    try {
      // Fetch Data from Company User
      const companyUserResponse = await this.companyUserRepository.find({
        where: { user_email: data.email },
      });
      if (companyUserResponse.length > 0) {
        // Fetch Company IFRIC ID
        const companyResponse = await this.companyRepository.findOne({
          where: { _id: data.company_id },
        });
        if (!companyResponse) {
          throw new HttpException(
            'No company found with the provided ID',
            HttpStatus.NOT_FOUND,
          );
        }

        // Fetch Data from Company Category Mapping
        const companyCategoryMappingData =
          await this.companyCategoryMappingRepository.find({
            where: { company_id: companyUserResponse[0].company_id },
          });
        if (companyCategoryMappingData.length > 0) {
          // Fetch Data from Company Category
          const companyCategoryData =
            await this.companyCategoryRepository.findOne({
              where: { _id: companyCategoryMappingData[0].category_id },
            });
          if (Object.keys(companyCategoryData).length > 0) {
            const userAccessData = await this.userAccessGroupRepository.findOne(
              {
                where: { user_id: companyUserResponse[0]._id },
              },
            );
            if (!userAccessData) {
              throw new HttpException(
                'Access Group Mapping Not Found',
                HttpStatus.NOT_FOUND,
              );
            }
            const accessData = await this.accessGroupRepository.findOne({
              where: { _id: userAccessData.access_group_id },
            });
            return {
              status: 200,
              data: {
                company_ifric_id: companyResponse.company_ifric_id,
                user_name: companyUserResponse[0].user_name,
                user_role: companyCategoryData.category_name,
                access_group: accessData,
                user_email: companyUserResponse[0].user_email,
              },
            };
          } else {
            throw new HttpException(
              'Company Category Not Found',
              HttpStatus.NOT_FOUND,
            );
          }
        } else {
          throw new HttpException(
            'Company Category Mapping Not Found',
            HttpStatus.NOT_FOUND,
          );
        }
      } else {
        throw new HttpException('User Not Found', HttpStatus.NOT_FOUND);
      }
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async authenticateToken(token: string) {
    try {
      await this.keycloakService.verifyAccessToken(token);

      return true;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getCompanyUsers(id: string, authUser: AuthTokenClaims) {
    try {
      const response = await this.companyRepository.find({
        where: { company_ifric_id: id },
      });
      if (response.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      this.accessControlService.assertCompanyMatch(authUser, id);
      await this.accessControlService.assertPermission(authUser, 'read');

      return await this.companyUserRepository.find({
        where: { company_id: response[0]._id },
      });
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  // Ported from a $lookup aggregation (companyusers -> userproductaccessgroups
  // -> accessgroups). Assembled as plain queries + in-memory joins instead of
  // one SQL mega-join, to keep the output shape easy to verify field-by-field
  // against the original $project stage.
  async getCompanyUsersAccess(
    company_ifric_id: string,
    authUser: AuthTokenClaims,
  ) {
    try {
      const response = await this.companyRepository.findOne({
        where: { company_ifric_id },
      });
      if (!response) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      this.accessControlService.assertCompanyMatch(authUser, company_ifric_id);
      await this.accessControlService.assertPermission(authUser, 'read');

      const users = await this.companyUserRepository.find({
        where: { company_id: response._id },
      });
      if (users.length === 0) {
        return [];
      }

      const userIds = users.map((u) => u._id);
      const accessRows = await this.userAccessGroupRepository.find({
        where: { user_id: In(userIds) },
      });
      const accessGroupIds = [
        ...new Set(accessRows.map((r) => r.access_group_id)),
      ];
      const accessGroups = accessGroupIds.length
        ? await this.accessGroupRepository.find({
            where: { _id: In(accessGroupIds) },
          })
        : [];
      const groupNameById = new Map(
        accessGroups.map((g) => [g._id, g.group_name]),
      );
      // One grant per user now (UserAccessGroup.user_id is unique).
      const groupNameByUser = new Map(
        accessRows.map((row) => [
          row.user_id,
          groupNameById.get(row.access_group_id),
        ]),
      );

      const formatDate = (value: any) =>
        value ? moment.utc(value).format('DD-MM-YYYY HH:mm') : '';

      return users.map((user) => ({
        id: user._id,
        name: user.user_name,
        email: user.user_email,
        img: '',
        status: 'active',
        access: groupNameByUser.get(user._id) ?? null,
        date_added: formatDate(user.meta_data?.created_at),
        date_updated: formatDate(user.meta_data?.updated_at),
        add_by: user.meta_data?.add_by ?? '',
      }));
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  // One AccessGroup grant per user (no per-product dimension) — returns
  // that single role, or null if the user has none yet.
  async getUserProfileContent(
    company_ifric_id: string,
    user_id: string,
    authUser: AuthTokenClaims,
  ) {
    try {
      const response = await this.companyRepository.findOne({
        where: { company_ifric_id },
      });
      if (!response) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      this.accessControlService.assertCompanyMatch(authUser, company_ifric_id);
      await this.accessControlService.assertPermission(authUser, 'read');

      const row = await this.userAccessGroupRepository.findOne({
        where: { user_id },
      });
      if (!row) {
        return null;
      }
      const userRoleData = await this.accessGroupRepository.findOne({
        where: { _id: row.access_group_id },
      });
      if (!userRoleData) {
        return null;
      }
      return {
        last_active: 'Jul 23, 2024',
        user_role: userRoleData.group_name,
      };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getUserProductAccess(id: string) {
    try {
      return await this.userAccessGroupRepository.findOne({
        where: { user_id: id },
      });
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getUserDetails(
    user_email: string,
    company_ifric_id: string,
    authUser: AuthTokenClaims,
  ) {
    try {
      const companyData = await this.companyRepository.find({
        where: { company_ifric_id: company_ifric_id },
      });
      if (companyData.length == 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      this.accessControlService.assertCompanyMatch(authUser, company_ifric_id);
      await this.accessControlService.assertPermission(authUser, 'read');

      const response = await this.companyUserRepository.find({
        where: { user_email: user_email, company_id: companyData[0]._id },
      });
      return response;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getUserDetailsById(id: string, authUser: AuthTokenClaims) {
    try {
      const companyUserData = await this.companyUserRepository.find({
        where: { _id: id },
      });
      if (companyUserData.length == 0) {
        throw new HttpException(
          'No User found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      await this.assertCallerOwnsUsersCompany(companyUserData[0], authUser);

      return companyUserData;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getUserDetailsByEmail(email: string, authUser: AuthTokenClaims) {
    try {
      const companyUserData = await this.companyUserRepository.find({
        where: { user_email: email },
      });
      if (companyUserData.length == 0) {
        throw new HttpException(
          'No User found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      await this.assertCallerOwnsUsersCompany(companyUserData[0], authUser);
      return companyUserData;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async getTotalUsers() {
    try {
      return await this.companyUserRepository.count();
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async checkCompanyAdmin(email: string) {
    const companyUser = await this.companyUserRepository.findOne({
      where: { user_email: email },
    });

    if (!companyUser) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const company = await this.companyRepository.findOne({ where: { email } });

    return {
      isAdmin: !!company,
    };
  }

  async updateUserPassword(data: UpdatePasswordDto) {
    try {
      const companyUserResponse = await this.companyUserRepository.find({
        where: { user_email: data.email },
      });

      if (data.oldPassword && data.newPassword) {
        if (companyUserResponse.length > 0) {
          // Verifies the old password against Keycloak and throws
          // HttpException('Invalid Password', BAD_REQUEST) itself on
          // mismatch — replaces the old bare UnauthorizedException() this
          // branch used to throw.
          await this.keycloakService.passwordGrant(
            data.email,
            data.oldPassword,
          );
          await this.keycloakService.setPassword(data.email, data.newPassword);
          return { status: 204, message: 'Password Updated Successfully' };
        } else {
          throw new HttpException(
            'No User found with the provided ID',
            HttpStatus.NOT_FOUND,
          );
        }
      } else {
        throw new HttpException(
          'Required Data is missing',
          HttpStatus.BAD_REQUEST,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async updateUserAccessGroup(id: string, data: UpdateUserAccessDto) {
    try {
      const companyUserResponse = await this.companyUserRepository.findOne({
        where: { _id: id },
      });
      if (companyUserResponse) {
        const companyId = companyUserResponse.company_id;
        const accessGroupData = await this.accessGroupRepository.find({
          where: { company_id: companyId, group_name: data.user_role },
        });
        if (accessGroupData.length > 0) {
          // Atomic upsert via raw SQL, not repository.upsert() — the
          // latter builds a raw INSERT that bypasses BaseEntity's
          // @BeforeInsert() hook, so a freshly-inserted row would get a
          // NULL primary key. _id is only used on the insert branch; the
          // ON CONFLICT DO UPDATE never touches it.
          await this.userAccessGroupRepository.query(
            `INSERT INTO user_access_groups (_id, user_id, access_group_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id)
             DO UPDATE SET access_group_id = EXCLUDED.access_group_id`,
            [generateId(), id, accessGroupData[0]._id],
          );
        }
        await this.companyUserRepository.update(
          { _id: companyUserResponse._id },
          {
            meta_data: {
              ...(companyUserResponse.meta_data ?? {}),
              updated_at: moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
            } as Record<string, any>,
          },
        );
        return {
          status: 204,
          message: 'User Access Updated Successfully',
        };
      } else {
        throw new HttpException('User Not Found', HttpStatus.NOT_FOUND);
      }
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async updateCompanyUser(data: UpdateUserDetails) {
    try {
      const companyData = await this.companyRepository.find({
        where: { company_ifric_id: data.company_ifric_id },
      });

      if (!companyData.length) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const companyUserResponse = await this.companyUserRepository.findOne({
        where: { _id: data.user_id },
      });
      if (!companyUserResponse) {
        throw new HttpException('User Not Found', HttpStatus.NOT_FOUND);
      }

      if (data.old_password && data.new_password) {
        // Verifies the old password against Keycloak and throws
        // HttpException('Invalid Password', BAD_REQUEST) itself on
        // mismatch. The old jwt_token/decodedToken.sub check this branch
        // used to do had no purpose beyond re-validating the caller's
        // current session — AuthGuard (now backed by Keycloak) already did
        // that before this guarded route was ever reached, so it's dropped
        // along with the jwt_token column.
        await this.keycloakService.passwordGrant(
          companyUserResponse.user_email,
          data.old_password,
        );
        await this.keycloakService.setPassword(
          companyUserResponse.user_email,
          data.new_password,
        );
      }

      if (data.user_email) {
        await this.keycloakService.setEmail(
          companyUserResponse.user_email,
          data.user_email,
        );

        // check whether the user is admin then update email in company table
        if (companyUserResponse.user_email === companyData[0].email) {
          const companyMailResult = await this.companyRepository.update(
            { _id: companyData[0]._id },
            { email: data.user_email },
          );

          if (!(companyMailResult.affected > 0)) {
            throw new HttpException(
              'Error Updating Company Email',
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }
        }

        const result = await this.companyUserRepository.update(
          { _id: companyUserResponse._id },
          { user_email: data.user_email },
        );
        if (!(result.affected > 0)) {
          throw new HttpException(
            'Error Updating User Email',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }

      if (data.user_name) {
        const result = await this.companyUserRepository.update(
          { _id: companyUserResponse._id },
          { user_name: data.user_name },
        );
        if (!(result.affected > 0)) {
          throw new HttpException(
            'Error Updating User Name',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }

      if (data.user_image) {
        const result = await this.companyUserRepository.update(
          { _id: companyUserResponse._id },
          { user_image: data.user_image },
        );
        if (!(result.affected > 0)) {
          throw new HttpException(
            'Error Updating User Image',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }
      await this.companyUserRepository.update(
        { _id: companyUserResponse._id },
        {
          meta_data: {
            ...(companyUserResponse.meta_data ?? {}),
            updated_at: moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
          } as Record<string, any>,
        },
      );
      return { status: 204, message: 'User Details Updated Successfully' };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async deleteCompanyUser(id: string) {
    try {
      const companyUser = await this.companyUserRepository.findOne({
        where: { _id: id },
      });
      if (companyUser) {
        await this.keycloakService.deleteUser(companyUser.user_email);
      }
      await this.userAccessGroupRepository.delete({ user_id: id });
      return await this.companyUserRepository.delete({ _id: id });
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async logOut(data: { email: string; refresh_token?: string }) {
    try {
      const companyUser = await this.companyUserRepository.findOne({
        where: { user_email: data.email },
      });
      if (companyUser) {
        // Best-effort — KeycloakService.revoke() swallows its own errors,
        // so a briefly-unreachable Keycloak can't turn a successful logout
        // into a failed one.
        if (data.refresh_token) {
          await this.keycloakService.revoke(data.refresh_token);
        }
        return {
          success: true,
          status: 200,
          message: 'User logged out successfully',
        };
      } else {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  async recoverPassword(
    email: string,
    temporaryPassword: string,
    newPassword: string,
  ) {
    try {
      const companyUser = await this.companyUserRepository.findOne({
        where: { user_email: email },
      });

      if (!companyUser) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Check if the current (temporary) password matches, via Keycloak.
      try {
        await this.keycloakService.passwordGrant(email, temporaryPassword);
      } catch {
        throw new HttpException(
          'Current password is incorrect',
          HttpStatus.UNAUTHORIZED,
        );
      }
      await this.keycloakService.setPassword(email, newPassword);

      return {
        success: true,
        status: 200,
        message: 'Password updated successfully',
      };
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  /**
   * Starts password recovery for an account. This endpoint is
   * unauthenticated and reachable by anyone, so it deliberately does three
   * things and no more:
   *
   * - It never returns a credential. Keycloak owns credentials here, so it
   *   also owns delivery: it emails the account's *own* address a one-time
   *   UPDATE_PASSWORD action link and collects the new password itself.
   *   Nothing here sees it. (This replaces an earlier version that
   *   generated a temporary password, set it in Keycloak, and returned it
   *   in the response body — which handed any anonymous caller a working
   *   password for any address they could name, and locked the real user
   *   out on the way.)
   * - It doesn't change anything on its own. The user's existing password
   *   keeps working until they follow the link, so a hostile caller can't
   *   use this to lock anyone out either.
   * - It answers identically whether or not the address belongs to an
   *   account, so it isn't an account-enumeration oracle. The one seam is
   *   a delivery failure (below), which is a global outage rather than a
   *   per-address signal.
   *
   * It fails closed: if the mail can't be sent — realm SMTP unconfigured
   * is the usual cause, see docs/keycloak-first-time-checklist.md — the
   * call errors. There is no fallback that returns the password.
   */
  async recoverPasswordRequest(email: string, requesterIp?: string) {
    // Identical for every outcome below; see the doc comment.
    const acknowledgement = {
      success: true,
      status: 200,
      message:
        'If that email address belongs to an account, a password recovery ' +
        'email has been sent to it',
    };

    // Cheap in-process throttle: one request per address and per caller IP
    // per window. Keyed on the submitted address whether or not it exists,
    // so a 429 leaks nothing. The cache is this process's own memory
    // (CacheModule, store: 'memory'), so across replicas the limit is
    // per-replica — put a real limiter at the gateway for anything
    // internet-facing. requesterIp is only as trustworthy as the
    // deployment's proxy configuration.
    const throttleKeys = [
      `recover-password-request:email:${String(email ?? '')
        .trim()
        .toLowerCase()}`,
      ...(requesterIp ? [`recover-password-request:ip:${requesterIp}`] : []),
    ];
    for (const key of throttleKeys) {
      if (await this.cacheManager.get(key)) {
        throw new HttpException(
          'Too many password recovery requests, try again shortly',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    // Marked before any work, so a failed attempt still spends the window.
    // cache-manager v5 takes the TTL in milliseconds.
    await Promise.all(
      throttleKeys.map((key) =>
        this.cacheManager.set(key, true, RECOVERY_THROTTLE_MS),
      ),
    );

    try {
      const companyUser = await this.companyUserRepository.findOne({
        where: { user_email: email },
      });

      if (!companyUser) {
        // Deliberately not a 404 — that would answer "does this address
        // have an account?" for anyone who asks.
        return acknowledgement;
      }

      try {
        await this.keycloakService.sendPasswordResetEmail(email);
      } catch (err) {
        // Fail closed, and with a single shape. Keycloak's own error is
        // logged rather than returned: the informative one here is a 404
        // for an address that has a local row but no Keycloak identity,
        // which would say more about that address than the
        // acknowledgement does.
        console.error('Password recovery email could not be sent:', err);
        throw new HttpException(
          'Could not send the password recovery email',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return acknowledgement;
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      } else if (err.response) {
        throw new HttpException(err.response.data.message, err.response.status);
      } else {
        throw new HttpException(err.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }
  }

  /**
   * Exchanges a refresh token for a new access token (and, since Keycloak
   * rotates refresh tokens by default, typically a new refresh token too —
   * surfaced as an additive field). Session revocation/expiry is enforced
   * entirely by Keycloak now, not by a local DB lookup.
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    return this.keycloakService.refreshGrant(refreshToken);
  }
}
