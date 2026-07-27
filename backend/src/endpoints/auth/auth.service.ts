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
import { UpdateUserProductAccessDto } from './dto/update-user-product-access.dto';
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
  UserProductAccessGroup,
  CompanyProduct,
  CompanyTwin,
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
    @InjectRepository(UserProductAccessGroup)
    private userProductAccessGroupRepository: Repository<UserProductAccessGroup>,
    @InjectRepository(CompanyProduct)
    private companyProductRepository: Repository<CompanyProduct>,
    @InjectRepository(CompanyTwin)
    private companyTwinRepository: Repository<CompanyTwin>,
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
      // mapper (see README.md).
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

      // Add Products To the User
      // data.products[i].product is a plain product identifier (internal
      // module name or external product_ifric_id) — no local catalog lookup.
      for (let i = 0; i < data.products.length; i++) {
        const accessGroupData = await this.accessGroupRepository.find({
          where: {
            company_id: companyId,
            group_name: data.products[i].user_role,
          },
        });
        if (accessGroupData.length > 0) {
          await this.userProductAccessGroupRepository.save(
            this.userProductAccessGroupRepository.create({
              user_id: response._id,
              product_ifric_id: data.products[i].product,
              access_group_id: accessGroupData[0]._id,
            }),
          );
        }
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
            if (data.product_name === 'DPP Creator') {
              const companyProductDppCreator =
                await this.companyProductRepository.findOne({
                  where: {
                    company_id: companyUserResponse[0].company_id,
                    product_ifric_id: 'DPP Creator',
                  },
                });
              if (!companyProductDppCreator) {
                throw new HttpException(
                  'Product not found please install the application',
                  HttpStatus.NOT_FOUND,
                );
              }
              const companyProductIfricdDashboard =
                await this.companyProductRepository.findOne({
                  where: {
                    company_id: companyUserResponse[0].company_id,
                    product_ifric_id: 'IFRIC Dashboard',
                  },
                });
              const userProductAccessDataDPP =
                await this.userProductAccessGroupRepository.find({
                  where: {
                    user_id: companyUserResponse[0]._id,
                    product_ifric_id: companyProductDppCreator.product_ifric_id,
                  },
                });
              const userProductAccessDataIfric = companyProductIfricdDashboard
                ? await this.userProductAccessGroupRepository.find({
                    where: {
                      user_id: companyUserResponse[0]._id,
                      product_ifric_id:
                        companyProductIfricdDashboard.product_ifric_id,
                    },
                  })
                : [];
              if (
                userProductAccessDataIfric.length ||
                userProductAccessDataDPP.length
              ) {
                const accessDataDPP = userProductAccessDataDPP[0]
                  ? await this.accessGroupRepository.findOne({
                      where: {
                        _id: userProductAccessDataDPP[0].access_group_id,
                      },
                    })
                  : null;
                const accessDataIfricDashBoard = userProductAccessDataIfric[0]
                  ? await this.accessGroupRepository.findOne({
                      where: {
                        _id: userProductAccessDataIfric[0].access_group_id,
                      },
                    })
                  : null;
                return {
                  status: 200,
                  data: {
                    company_ifric_id: companyResponse.company_ifric_id,
                    user_name: companyUserResponse[0].user_name,
                    access_token: keycloakTokens.access_token,
                    refresh_token: keycloakTokens.refresh_token,
                    user_role: companyCategoryData.category_name,
                    access_group_DPP: accessDataDPP,
                    access_group_Ifric_Dashboard: accessDataIfricDashBoard,
                    user_email: companyUserResponse[0].user_email,
                  },
                };
              }
            } else {
              const companyProduct =
                await this.companyProductRepository.findOne({
                  where: {
                    company_id: companyUserResponse[0].company_id,
                    product_ifric_id: data.product_name,
                  },
                });
              if (companyProduct) {
                const userProductAccessData =
                  await this.userProductAccessGroupRepository.find({
                    where: {
                      user_id: companyUserResponse[0]._id,
                      product_ifric_id: companyProduct.product_ifric_id,
                    },
                  });

                if (userProductAccessData.length > 0) {
                  const accessData = await this.accessGroupRepository.findOne({
                    where: { _id: userProductAccessData[0].access_group_id },
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
                    'Access Group Mapping Not Found',
                    HttpStatus.NOT_FOUND,
                  );
                }
              } else {
                throw new HttpException(
                  'Product not found please install the application',
                  HttpStatus.NOT_FOUND,
                );
              }
            }
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
            if (data.product_name === 'DPP Creator') {
              const companyProductDppCreator =
                await this.companyProductRepository.findOne({
                  where: {
                    company_id: companyUserResponse[0].company_id,
                    product_ifric_id: 'DPP Creator',
                  },
                });
              const companyProductIfricdDashboard =
                await this.companyProductRepository.findOne({
                  where: {
                    company_id: companyUserResponse[0].company_id,
                    product_ifric_id: 'IFRIC Dashboard',
                  },
                });
              const userProductAccessDataDPP = companyProductDppCreator
                ? await this.userProductAccessGroupRepository.find({
                    where: {
                      user_id: companyUserResponse[0]._id,
                      product_ifric_id:
                        companyProductDppCreator.product_ifric_id,
                    },
                  })
                : [];
              const userProductAccessDataIfric = companyProductIfricdDashboard
                ? await this.userProductAccessGroupRepository.find({
                    where: {
                      user_id: companyUserResponse[0]._id,
                      product_ifric_id:
                        companyProductIfricdDashboard.product_ifric_id,
                    },
                  })
                : [];
              if (
                userProductAccessDataIfric.length ||
                userProductAccessDataDPP.length
              ) {
                const accessDataDPP = userProductAccessDataDPP[0]
                  ? await this.accessGroupRepository.findOne({
                      where: {
                        _id: userProductAccessDataDPP[0].access_group_id,
                      },
                    })
                  : null;
                const accessDataIfricDashBoard = userProductAccessDataIfric[0]
                  ? await this.accessGroupRepository.findOne({
                      where: {
                        _id: userProductAccessDataIfric[0].access_group_id,
                      },
                    })
                  : null;
                return {
                  status: 200,
                  data: {
                    company_ifric_id: companyResponse.company_ifric_id,
                    user_name: companyUserResponse[0].user_name,
                    user_role: companyCategoryData.category_name,
                    access_group_DPP: accessDataDPP,
                    access_group_Ifric_Dashboard: accessDataIfricDashBoard,
                    user_email: companyUserResponse[0].user_email,
                  },
                };
              }
            }
            const companyProduct = await this.companyProductRepository.findOne({
              where: {
                company_id: companyUserResponse[0].company_id,
                product_ifric_id: data.product_name,
              },
            });
            if (companyProduct) {
              const userProductAccessData =
                await this.userProductAccessGroupRepository.find({
                  where: {
                    user_id: companyUserResponse[0]._id,
                    product_ifric_id: companyProduct.product_ifric_id,
                  },
                });

              if (userProductAccessData.length > 0) {
                const accessData = await this.accessGroupRepository.findOne({
                  where: { _id: userProductAccessData[0].access_group_id },
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
                  'Access Group Mapping Not Found',
                  HttpStatus.NOT_FOUND,
                );
              }
            } else {
              throw new HttpException(
                'product not found in the company',
                HttpStatus.NOT_FOUND,
              );
            }
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

  async getCompanyUsers(id: string) {
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
  async getCompanyUsersAccess(company_ifric_id: string) {
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

      const users = await this.companyUserRepository.find({
        where: { company_id: response._id },
      });
      if (users.length === 0) {
        return [];
      }

      const userIds = users.map((u) => u._id);
      const accessRows = await this.userProductAccessGroupRepository.find({
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

      const accessByUser = new Map<string, Set<string>>();
      for (const row of accessRows) {
        if (!accessByUser.has(row.user_id)) {
          accessByUser.set(row.user_id, new Set());
        }
        const name = groupNameById.get(row.access_group_id);
        if (name) {
          accessByUser.get(row.user_id).add(name);
        }
      }

      const formatDate = (value: any) =>
        value ? moment.utc(value).format('DD-MM-YYYY HH:mm') : '';

      return users.map((user) => ({
        id: user._id,
        name: user.user_name,
        email: user.user_email,
        img: '',
        status: 'active',
        access: Array.from(accessByUser.get(user._id) ?? []),
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

  // Ported from a $lookup aggregation on userproductaccessgroups. One row per
  // (user, product) access grant; product_roles is the full list of role
  // names defined for the company (same for every row, not specific to it —
  // matches the original sub-pipeline, which filtered accessgroups by
  // company_id only). Rows whose access_group_id doesn't resolve to a real
  // AccessGroup are dropped, matching the original's non-preserving $unwind.
  async getUserProfileContent(company_ifric_id: string, user_id: string) {
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

      const rows = await this.userProductAccessGroupRepository.find({
        where: { user_id },
      });
      const companyAccessGroups = await this.accessGroupRepository.find({
        where: { company_id: response._id },
      });
      const productRoles = [
        ...new Set(companyAccessGroups.map((g) => g.group_name)),
      ];

      const results = [];
      for (const row of rows) {
        const userRoleData = await this.accessGroupRepository.findOne({
          where: { _id: row.access_group_id },
        });
        if (!userRoleData) {
          continue;
        }
        results.push({
          product: row.product_ifric_id,
          product_roles: productRoles,
          last_active: 'Jul 23, 2024',
          user_role: userRoleData.group_name,
        });
      }
      return results;
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
      return await this.userProductAccessGroupRepository.find({
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

  async getUserDetails(user_email: string, company_ifric_id: string) {
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

  async getUserDetailsById(id: string) {
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

  async getUserDetailsByEmail(email: string) {
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

  async getUserSpecificProductAccess(product_name: string, user_id: string) {
    try {
      return await this.userProductAccessGroupRepository.find({
        where: { product_ifric_id: product_name, user_id },
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

  async updateUserAccessGroup(id: string, data: UpdateUserProductAccessDto[]) {
    try {
      const companyUserResponse = await this.companyUserRepository.findOne({
        where: { _id: id },
      });
      if (companyUserResponse) {
        const companyId = companyUserResponse.company_id;
        for (let i = 0; i < data.length; i++) {
          const accessGroupData = await this.accessGroupRepository.find({
            where: { company_id: companyId, group_name: data[i].user_role },
          });
          if (accessGroupData.length > 0) {
            // Atomic upsert via raw SQL, not repository.upsert() — the
            // latter builds a raw INSERT that bypasses BaseEntity's
            // @BeforeInsert() hook, so a freshly-inserted row would get a
            // NULL primary key. _id is only used on the insert branch; the
            // ON CONFLICT DO UPDATE never touches it.
            await this.userProductAccessGroupRepository.query(
              `INSERT INTO user_product_access_groups (_id, user_id, product_ifric_id, access_group_id)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (user_id, product_ifric_id)
               DO UPDATE SET access_group_id = EXCLUDED.access_group_id`,
              [generateId(), id, data[i].product, accessGroupData[0]._id],
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
        return {
          status: 204,
          message: 'User Product Access Updated Successfully',
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
      await this.userProductAccessGroupRepository.delete({ user_id: id });
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

  async recoverPasswordRequest(email: string) {
    try {
      const companyUser = await this.companyUserRepository.findOne({
        where: { user_email: email },
      });

      if (!companyUser) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }
      // Generate a new temporary password
      const temporaryPassword = generator.generate({
        length: 12,
        numbers: true,
        symbols: true,
        uppercase: true,
        excludeSimilarCharacters: true,
      });

      await this.keycloakService.setPassword(email, temporaryPassword);

      return {
        success: true,
        status: 200,
        message: 'Temporary password generated successfully',
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
