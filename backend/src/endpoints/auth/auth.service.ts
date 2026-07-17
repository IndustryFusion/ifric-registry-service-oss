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

import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { UpdateUserDetails } from './dto/update-auth.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateUserProductAccessDto } from './dto/update-user-product-access.dto';
import { FindOneAuthDto, FindIndexedDbAuthDto } from './dto/find-auth-dto';
import { UserAccessDto } from './dto/user-access-dto';
import { Model, Types } from 'mongoose';
import { Company } from 'src/schemas/company.schema';
import { CompanyUser } from 'src/schemas/company_user.schema';
import { CompanyCategory } from 'src/schemas/company_category.schema';
import { AccessGroup } from 'src/schemas/access_group.schema';
import { CompanyCategoryMapping } from 'src/schemas/company_category_mapping.schema';
import { UserProductAccessGroup } from 'src/schemas/user_product_access_group.schema';
import { CompanyProduct } from 'src/schemas/company_product.schema';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as generator from 'generate-password';
import * as dotenv from 'dotenv';
import { CompanyTwin } from 'src/schemas/company_twin.schema';
import { HttpException, HttpStatus } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as moment from 'moment';
import { jwtConstants } from './constants';

dotenv.config();

// Passwords are hashed with bcrypt (see hashPassword/comparePassword below)
// — never stored or returned in reversible form.
const BCRYPT_SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    @InjectModel(Company.name)
    private companyModel: Model<Company>,
    @InjectModel(CompanyUser.name)
    private companyUserModel: Model<CompanyUser>,
    @InjectModel(CompanyCategory.name)
    private companyCategoryModel: Model<CompanyCategory>,
    @InjectModel(AccessGroup.name)
    private accessGroupModel: Model<AccessGroup>,
    @InjectModel(CompanyCategoryMapping.name)
    private companyCategoryMappingModel: Model<CompanyCategoryMapping>,
    @InjectModel(UserProductAccessGroup.name)
    private userProductAccessGroupModel: Model<UserProductAccessGroup>,
    @InjectModel(CompanyProduct.name)
    private companyProductModel: Model<CompanyProduct>,
    @InjectModel(CompanyTwin.name)
    private companyTwinModel: Model<CompanyTwin>,
    private jwtService: JwtService,
  ) {}

  async createCompanyUser(data: UserAccessDto, adminMail: string) {
    try {
      // Fetch User From Company User
      const companyUserResponse = await this.companyUserModel.find({
        user_email: data.user_email,
      });
      if (companyUserResponse.length > 0) {
        throw new HttpException('User already exists', HttpStatus.CONFLICT);
      }

      // Fetch Company Id from Company Ifric Id
      const companyData = await this.companyModel.find({
        company_ifric_id: data.company_ifric_id,
      });
      const companyId = companyData[0].id;

      // Create a refresh token — CompanyUser doesn't exist yet, so this
      // just signs it; it's persisted below as part of the user doc itself.
      const token = await this.signRefreshToken(companyId, data.user_email);

      // Add Temporary Password
      const temporaryPassword = await generator.generate({
        length: 8,
        numbers: true,
        symbols: true,
        uppercase: true,
        excludeSimilarCharacters: true,
      });

      // encrypt the password
      const encryptedPassword = await this.hashPassword(temporaryPassword);

      const userData = new this.companyUserModel({
        company_id: companyId,
        user_email: data.user_email,
        user_password: encryptedPassword,
        user_name: data.user_name,
        jwt_token: token,
        meta_data: {
          created_at: moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
          updated_at: moment().utc().format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
          add_by: adminMail,
        },
      });

      const response = await userData.save();

      // Add Products To the User
      // data.products[i].product is a plain product identifier (internal
      // module name or external product_ifric_id) — no local catalog lookup.
      for (let i = 0; i < data.products.length; i++) {
        const accessGroupData = await this.accessGroupModel.find({
          company_id: companyId,
          group_name: data.products[i].user_role,
        });
        if (accessGroupData.length > 0) {
          const userProductAccessGroupResponse =
            new this.userProductAccessGroupModel({
              user_id: response.id,
              product_ifric_id: data.products[i].product,
              access_group_id: accessGroupData[0].id,
            });
          await userProductAccessGroupResponse.save();
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
      const companyUserResponse = await this.companyUserModel.find({
        user_email: data.email,
      });
      if (companyUserResponse.length > 0) {
        const passwordMatches = await bcrypt.compare(
          data.password,
          companyUserResponse[0].user_password,
        );
        if (!passwordMatches) {
          throw new HttpException('Invalid Password', HttpStatus.BAD_REQUEST);
        }

        // Fetch Company IFRIC ID
        const companyResponse = await this.companyModel.findById(
          companyUserResponse[0].company_id,
        );
        if (!companyResponse) {
          throw new HttpException(
            'No company found with the provided ID',
            HttpStatus.NOT_FOUND,
          );
        }

        // Fetch Data from Company Category Mapping
        const companyCategoryMappingData =
          await this.companyCategoryMappingModel.find({
            company_id: companyUserResponse[0].company_id,
          });
        if (companyCategoryMappingData.length > 0) {
          // Fetch Data from Company Category
          const companyCategoryData = await this.companyCategoryModel.findById(
            companyCategoryMappingData[0].category_id,
          );
          if (Object.keys(companyCategoryData).length > 0) {
            if (data.product_name === 'DPP Creator') {
              const companyProductDppCreator =
                await this.companyProductModel.findOne({
                  company_id: companyUserResponse[0].company_id,
                  product_ifric_id: 'DPP Creator',
                });
              if (!companyProductDppCreator) {
                throw new HttpException(
                  'Product not found please install the application',
                  HttpStatus.NOT_FOUND,
                );
              }
              const companyProductIfricdDashboard =
                await this.companyProductModel.findOne({
                  company_id: companyUserResponse[0].company_id,
                  product_ifric_id: 'IFRIC Dashboard',
                });
              const userProductAccessDataDPP =
                await this.userProductAccessGroupModel.find({
                  user_id: companyUserResponse[0].id,
                  product_ifric_id: companyProductDppCreator.product_ifric_id,
                });
              const userProductAccessDataIfric = companyProductIfricdDashboard
                ? await this.userProductAccessGroupModel.find({
                    user_id: companyUserResponse[0].id,
                    product_ifric_id:
                      companyProductIfricdDashboard.product_ifric_id,
                  })
                : [];
              if (
                userProductAccessDataIfric.length ||
                userProductAccessDataDPP.length
              ) {
                const tokens = await this.issueTokenPair(
                  companyUserResponse[0].company_id.toString(),
                  companyUserResponse[0].user_email,
                );
                const accessDataDPP = userProductAccessDataDPP[0]
                  ? await this.accessGroupModel.findById(
                      userProductAccessDataDPP[0].access_group_id,
                    )
                  : null;
                const accessDataIfricDashBoard = userProductAccessDataIfric[0]
                  ? await this.accessGroupModel.findById(
                      userProductAccessDataIfric[0].access_group_id,
                    )
                  : null;
                return {
                  status: 200,
                  data: {
                    company_ifric_id: companyResponse.company_ifric_id,
                    user_name: companyUserResponse[0].user_name,
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    user_role: companyCategoryData.category_name,
                    access_group_DPP: accessDataDPP,
                    access_group_Ifric_Dashboard: accessDataIfricDashBoard,
                    user_email: companyUserResponse[0].user_email,
                  },
                };
              }
            } else {
              const companyProduct = await this.companyProductModel.findOne({
                company_id: companyUserResponse[0].company_id,
                product_ifric_id: data.product_name,
              });
              if (companyProduct) {
                const userProductAccessData =
                  await this.userProductAccessGroupModel.find({
                    user_id: companyUserResponse[0].id,
                    product_ifric_id: companyProduct.product_ifric_id,
                  });

                if (userProductAccessData.length > 0) {
                  const accessData = await this.accessGroupModel.findById(
                    userProductAccessData[0].access_group_id,
                  );
                  const tokens = await this.issueTokenPair(
                    companyUserResponse[0].company_id.toString(),
                    companyUserResponse[0].user_email,
                  );
                  return {
                    status: 200,
                    data: {
                      company_ifric_id: companyResponse.company_ifric_id,
                      user_name: companyUserResponse[0].user_name,
                      access_token: tokens.access_token,
                      refresh_token: tokens.refresh_token,
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
      const companyUserResponse = await this.companyUserModel.find({
        user_email: data.email,
      });
      if (companyUserResponse.length > 0) {
        // Fetch Company IFRIC ID
        const companyResponse = await this.companyModel.findById(
          data.company_id,
        );
        if (!companyResponse) {
          throw new HttpException(
            'No company found with the provided ID',
            HttpStatus.NOT_FOUND,
          );
        }

        // Fetch Data from Company Category Mapping
        const companyCategoryMappingData =
          await this.companyCategoryMappingModel.find({
            company_id: companyUserResponse[0].company_id,
          });
        if (companyCategoryMappingData.length > 0) {
          // Fetch Data from Company Category
          const companyCategoryData = await this.companyCategoryModel.findById(
            companyCategoryMappingData[0].category_id,
          );
          if (Object.keys(companyCategoryData).length > 0) {
            if (data.product_name === 'DPP Creator') {
              const companyProductDppCreator =
                await this.companyProductModel.findOne({
                  company_id: companyUserResponse[0].company_id,
                  product_ifric_id: 'DPP Creator',
                });
              const companyProductIfricdDashboard =
                await this.companyProductModel.findOne({
                  company_id: companyUserResponse[0].company_id,
                  product_ifric_id: 'IFRIC Dashboard',
                });
              const userProductAccessDataDPP = companyProductDppCreator
                ? await this.userProductAccessGroupModel.find({
                    user_id: companyUserResponse[0].id,
                    product_ifric_id: companyProductDppCreator.product_ifric_id,
                  })
                : [];
              const userProductAccessDataIfric = companyProductIfricdDashboard
                ? await this.userProductAccessGroupModel.find({
                    user_id: companyUserResponse[0].id,
                    product_ifric_id:
                      companyProductIfricdDashboard.product_ifric_id,
                  })
                : [];
              if (
                userProductAccessDataIfric.length ||
                userProductAccessDataDPP.length
              ) {
                const tokens = await this.issueTokenPair(
                  companyUserResponse[0].company_id.toString(),
                  companyUserResponse[0].user_email,
                );
                const accessDataDPP = userProductAccessDataDPP[0]
                  ? await this.accessGroupModel.findById(
                      userProductAccessDataDPP[0].access_group_id,
                    )
                  : null;
                const accessDataIfricDashBoard = userProductAccessDataIfric[0]
                  ? await this.accessGroupModel.findById(
                      userProductAccessDataIfric[0].access_group_id,
                    )
                  : null;
                return {
                  status: 200,
                  data: {
                    company_ifric_id: companyResponse.company_ifric_id,
                    user_name: companyUserResponse[0].user_name,
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    user_role: companyCategoryData.category_name,
                    access_group_DPP: accessDataDPP,
                    access_group_Ifric_Dashboard: accessDataIfricDashBoard,
                    user_email: companyUserResponse[0].user_email,
                  },
                };
              }
            }
            const companyProduct = await this.companyProductModel.findOne({
              company_id: companyUserResponse[0].company_id,
              product_ifric_id: data.product_name,
            });
            if (companyProduct) {
              const userProductAccessData =
                await this.userProductAccessGroupModel.find({
                  user_id: companyUserResponse[0].id,
                  product_ifric_id: companyProduct.product_ifric_id,
                });

              if (userProductAccessData.length > 0) {
                const accessData = await this.accessGroupModel.findById(
                  userProductAccessData[0].access_group_id,
                );
                const tokens = await this.issueTokenPair(
                  companyUserResponse[0].company_id.toString(),
                  companyUserResponse[0].user_email,
                );
                return {
                  status: 200,
                  data: {
                    company_ifric_id: companyResponse.company_ifric_id,
                    user_name: companyUserResponse[0].user_name,
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
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
      await this.jwtService.verifyAsync(token, {
        secret: jwtConstants.secret,
      });

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
      const response = await this.companyModel.find({ company_ifric_id: id });
      if (response.length === 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      return await this.companyUserModel.find({ company_id: response[0].id });
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

  async getCompanyUsersAccess(company_ifric_id: string) {
    try {
      const response = await this.companyModel.findOne({ company_ifric_id });
      if (!response) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      return await this.companyUserModel.aggregate([
        {
          $match: {
            company_id: response._id,
          },
        },
        {
          $lookup: {
            from: 'userproductaccessgroups',
            localField: '_id',
            foreignField: 'user_id',
            as: 'userAccessGroups',
          },
        },
        {
          $lookup: {
            from: 'accessgroups',
            localField: 'userAccessGroups.access_group_id',
            foreignField: '_id',
            as: 'accessGroups',
          },
        },
        {
          $project: {
            id: '$_id',
            name: '$user_name',
            email: '$user_email',
            img: '',
            status: 'active',
            access: {
              $setUnion: [
                {
                  $map: {
                    input: '$accessGroups',
                    as: 'group',
                    in: '$$group.group_name',
                  },
                },
              ],
            },
            date_added: {
              $cond: [
                { $ifNull: ['$meta_data.created_at', false] },
                {
                  $dateToString: {
                    format: '%d-%m-%Y %H:%M',
                    date: { $toDate: '$meta_data.created_at' },
                  },
                },
                '',
              ],
            },
            date_updated: {
              $cond: [
                { $ifNull: ['$meta_data.updated_at', false] },
                {
                  $dateToString: {
                    format: '%d-%m-%Y %H:%M',
                    date: { $toDate: '$meta_data.updated_at' },
                  },
                },
                '',
              ],
            },
            add_by: {
              $ifNull: ['$meta_data.add_by', ''],
            },
          },
        },
      ]);
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

  async getUserProfileContent(company_ifric_id: string, user_id: string) {
    try {
      const response = await this.companyModel.findOne({ company_ifric_id });
      if (!response) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      return await this.userProductAccessGroupModel.aggregate([
        {
          $match: {
            user_id: new Types.ObjectId(user_id),
          },
        },
        {
          $lookup: {
            from: 'accessgroups',
            let: { companyId: response._id.toString() },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$company_id', '$$companyId'] },
                },
              },
            ],
            as: 'accessGroups',
          },
        },
        {
          $lookup: {
            from: 'accessgroups',
            localField: 'access_group_id',
            foreignField: '_id',
            as: 'userRoleData',
          },
        },
        { $unwind: '$userRoleData' },
        {
          $project: {
            product: '$product_ifric_id',
            product_roles: {
              $setUnion: [
                {
                  $map: {
                    input: '$accessGroups',
                    as: 'group',
                    in: '$$group.group_name',
                  },
                },
              ],
            },
            last_active: 'Jul 23, 2024',
            user_role: '$userRoleData.group_name',
          },
        },
      ]);
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
      return await this.userProductAccessGroupModel.find({ user_id: id });
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
      const companyData = await this.companyModel.find({
        company_ifric_id: company_ifric_id,
      });
      if (companyData.length == 0) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const response = await this.companyUserModel.find({
        user_email: user_email,
        company_id: companyData[0].id,
      });
      // Never return the password hash to a caller.
      if (response.length) {
        response[0].user_password = undefined;
      }
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
      const companyUserData = await this.companyUserModel.find({ _id: id });
      if (companyUserData.length == 0) {
        throw new HttpException(
          'No User found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      // Never return the password hash to a caller.
      if (companyUserData.length) {
        companyUserData[0].user_password = undefined;
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
      const companyUserData = await this.companyUserModel.find({
        user_email: email,
      });
      if (companyUserData.length == 0) {
        throw new HttpException(
          'No User found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      // Never return the password hash to a caller.
      if (companyUserData.length) {
        companyUserData[0].user_password = undefined;
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
      return await this.companyUserModel.countDocuments();
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
      return await this.userProductAccessGroupModel.find({
        product_ifric_id: product_name,
        user_id,
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
    const companyUser = await this.companyUserModel.findOne({
      user_email: email,
    });

    if (!companyUser) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const company = await this.companyModel.findOne({ email });

    return {
      isAdmin: !!company,
    };
  }

  async updateUserPassword(data: UpdatePasswordDto) {
    try {
      const companyResponse = await this.companyModel.find({
        email: data.email,
      });
      const companyUserResponse = await this.companyUserModel.find({
        user_email: data.email,
      });

      if (data.oldPassword && data.newPassword) {
        // hash the new password
        const encryptedPassword = await this.hashPassword(data.newPassword);

        if (companyResponse.length > 0) {
          const oldPasswordMatches = await this.comparePassword(
            data.oldPassword,
            companyResponse[0].password,
          );
          if (!oldPasswordMatches) {
            throw new UnauthorizedException();
          }
          await this.companyModel.findByIdAndUpdate(companyResponse[0].id, {
            password: encryptedPassword,
          });
        }
        if (companyUserResponse.length > 0) {
          const oldPasswordMatches = await this.comparePassword(
            data.oldPassword,
            companyUserResponse[0].user_password,
          );
          if (!oldPasswordMatches) {
            throw new UnauthorizedException();
          }
          const response = await this.companyUserModel.findByIdAndUpdate(
            companyUserResponse[0].id,
            { user_password: encryptedPassword },
          );
          if (response) {
            return { status: 204, message: 'Password Updated Successfully' };
          }
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
      const companyUserResponse = await this.companyUserModel.findById(id);
      if (companyUserResponse) {
        const companyId = companyUserResponse.company_id;
        for (let i = 0; i < data.length; i++) {
          const accessGroupData = await this.accessGroupModel.find({
            company_id: companyId,
            group_name: data[i].user_role,
          });
          if (accessGroupData.length > 0) {
            const filter = { user_id: id, product_ifric_id: data[i].product };
            const update = { access_group_id: accessGroupData[0].id };
            const options = { new: true, upsert: true };
            await this.userProductAccessGroupModel.findOneAndUpdate(
              filter,
              update,
              options,
            );
          }
        }
        await this.companyUserModel.findByIdAndUpdate(companyUserResponse.id, {
          'meta_data.updated_at': moment()
            .utc()
            .format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
        });
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
      const companyData = await this.companyModel.find({
        company_ifric_id: data.company_ifric_id,
      });

      if (!companyData.length) {
        throw new HttpException(
          'No company found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }

      const companyUserResponse = await this.companyUserModel.findById(
        data.user_id,
      );
      if (!companyUserResponse) {
        throw new HttpException('User Not Found', HttpStatus.NOT_FOUND);
      }

      if (data.old_password && data.new_password) {
        const oldPasswordMatches = await this.comparePassword(
          data.old_password,
          companyUserResponse.user_password,
        );
        if (!oldPasswordMatches) {
          throw new UnauthorizedException();
        }

        if (companyUserResponse.jwt_token !== data.jwt_token) {
          throw new UnauthorizedException(
            'Token does not match the one stored for the user.',
          );
        }

        const decodedToken = this.jwtService.verify(data.jwt_token);
        if (decodedToken.sub !== companyUserResponse.company_id.toString()) {
          throw new UnauthorizedException('Token does not match user.');
        }

        // hash the new password
        const encryptedPassword = await this.hashPassword(data.new_password);

        const response = await this.companyUserModel.findByIdAndUpdate(
          companyUserResponse.id,
          { user_password: encryptedPassword },
        );
        if (!response) {
          throw new HttpException(
            'Error Updating User Password',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }

      if (data.user_email) {
        // check whether the user is admin then update email in company table
        if (companyUserResponse.user_email === companyData[0].email) {
          const companyMailUpdate = await this.companyModel.findByIdAndUpdate(
            companyData[0].id,
            { email: data.user_email },
          );

          if (!companyMailUpdate) {
            throw new HttpException(
              'Error Updating Company Email',
              HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }
        }

        const response = await this.companyUserModel.findByIdAndUpdate(
          companyUserResponse.id,
          { user_email: data.user_email },
        );
        if (!response) {
          throw new HttpException(
            'Error Updating User Email',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }

      if (data.user_name) {
        const response = await this.companyUserModel.findByIdAndUpdate(
          companyUserResponse.id,
          { user_name: data.user_name },
        );
        if (!response) {
          throw new HttpException(
            'Error Updating User Name',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }

      if (data.user_image) {
        const response = await this.companyUserModel.findByIdAndUpdate(
          companyUserResponse.id,
          { user_image: data.user_image },
        );
        if (!response) {
          throw new HttpException(
            'Error Updating User Image',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }
      await this.companyUserModel.findByIdAndUpdate(companyUserResponse.id, {
        'meta_data.updated_at': moment()
          .utc()
          .format('YYYY-MM-DDTHH:mm:ss.SSS[Z]'),
      });
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
      await this.userProductAccessGroupModel.deleteMany({ user_id: id });
      return await this.companyUserModel.deleteOne({ _id: id });
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

  async logOut(data: { email: string }) {
    try {
      const companyUser = await this.companyUserModel.findOne({
        user_email: data.email,
      });
      if (companyUser) {
        // Clears the stored refresh token, so /auth/refresh will reject it —
        // this is what revocation means now that access tokens are
        // stateless (see AuthGuard); any access token issued before logout
        // remains valid until it naturally expires.
        await this.companyUserModel.updateOne(
          { user_email: data.email },
          { $set: { jwt_token: null } },
        );
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
      const companyUser = await this.companyUserModel.findOne({
        user_email: email,
      });

      if (!companyUser) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Check if the current password matches
      const temporaryPasswordMatches = await this.comparePassword(
        temporaryPassword,
        companyUser.user_password,
      );
      if (!temporaryPasswordMatches) {
        throw new HttpException(
          'Current password is incorrect',
          HttpStatus.UNAUTHORIZED,
        );
      }
      const encryptedPassword = await this.hashPassword(newPassword);
      await this.companyUserModel.updateOne(
        { user_email: email },
        { $set: { user_password: encryptedPassword } },
      );

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
      const companyUser = await this.companyUserModel.findOne({
        user_email: email,
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

      const encryptedPassword = await this.hashPassword(temporaryPassword);
      //  update the password in CompanyUserModel
      await this.companyUserModel.updateOne(
        { user_email: email },
        { $set: { user_password: encryptedPassword } },
      );

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

  // Short-lived, stateless — verified by signature only (see AuthGuard),
  // no database round trip per request.
  private async generateAccessToken(
    companyId: string,
    userEmail: string,
  ): Promise<string> {
    return this.jwtService.signAsync(
      { sub: companyId, user: userEmail, type: 'access' },
      { secret: jwtConstants.secret, expiresIn: '1h' },
    );
  }

  // Long-lived. Signing only — does not touch the database. Use
  // generateRefreshToken to also persist it to an existing CompanyUser.
  private async signRefreshToken(
    companyId: string,
    userEmail: string,
  ): Promise<string> {
    return this.jwtService.signAsync(
      { sub: companyId, user: userEmail, type: 'refresh' },
      { secret: jwtConstants.secret, expiresIn: '30d' },
    );
  }

  // Persisted to CompanyUser.jwt_token — this is the only place revocation
  // is checked (see refreshAccessToken/logOut), since access tokens are
  // stateless. Requires the CompanyUser document to already exist.
  private async generateRefreshToken(
    companyId: string,
    userEmail: string,
  ): Promise<string> {
    const token = await this.signRefreshToken(companyId, userEmail);
    await this.companyUserModel.updateOne(
      { user_email: userEmail },
      { $set: { jwt_token: token } },
    );
    return token;
  }

  private async issueTokenPair(
    companyId: string,
    userEmail: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const access_token = await this.generateAccessToken(companyId, userEmail);
    const refresh_token = await this.generateRefreshToken(companyId, userEmail);
    return { access_token, refresh_token };
  }

  /**
   * Exchanges a refresh token for a new access token. This is where
   * session revocation is actually enforced: the refresh token must still
   * match CompanyUser.jwt_token (logOut clears that field).
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ access_token: string }> {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: jwtConstants.secret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Token is not a valid refresh token');
    }
    const companyId =
      typeof payload.sub === 'string'
        ? Types.ObjectId.createFromHexString(payload.sub)
        : payload.sub;
    const companyUser = await this.companyUserModel.findOne({
      jwt_token: refreshToken,
      user_email: payload.user,
      company_id: companyId,
    });
    if (!companyUser) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    const access_token = await this.generateAccessToken(
      payload.sub,
      payload.user,
    );
    return { access_token };
  }

  // One-way password hashing. Passwords are never stored or returned in
  // reversible form — compare with comparePassword, never decrypt.
  async hashPassword(plainText: string): Promise<string> {
    return bcrypt.hash(plainText, BCRYPT_SALT_ROUNDS);
  }

  async comparePassword(plainText: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plainText, hash);
  }
}
