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

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UpdateUserDetails } from './dto/update-auth.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateUserAccessDto } from './dto/update-user-access.dto';
import { AuthGuard } from './auth.guard';
import { AuthUser } from './auth-user.decorator';
import { AuthTokenClaims } from './auth-token-claims.interface';
import { UserAccessDto } from './dto/user-access-dto';
import { FindOneAuthDto, FindIndexedDbAuthDto } from './dto/find-auth-dto';
import { ApiBearerAuth, ApiTags, ApiBody } from '@nestjs/swagger';

@ApiTags('Auth')
@ApiBearerAuth('access-token')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthGuard)
  @Post('create-user/:admin_mail')
  @ApiBody({
    description:
      'Details for creating a company user. A temporary password is ' +
      'generated and provisioned in Keycloak automatically — returned in ' +
      'the response, not supplied here.',
    required: true,
    schema: {
      type: 'object',
      properties: {
        company_ifric_id: {
          type: 'string',
          example: 'IFRIC12345',
        },
        user_name: {
          type: 'string',
          example: 'John Doe',
        },
        user_email: {
          type: 'string',
          example: 'johndoe@example.com',
        },
        user_role: {
          type: 'string',
          example: 'admin',
          description: 'Access group name (matches AccessGroup.group_name)',
        },
      },
      required: ['company_ifric_id', 'user_name', 'user_email', 'user_role'],
    },
  })
  createCompanyUser(
    @Param('admin_mail') admin_mail: string,
    @Body() data: UserAccessDto,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.authService.createCompanyUser(data, admin_mail, authUser);
  }

  @Post('login')
  @ApiBody({
    description: 'User login details',
    required: true,
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          example: 'user@example.com',
        },
        password: {
          type: 'string',
          example: 'securepassword123',
        },
      },
      required: ['email', 'password'],
    },
  })
  logIn(@Body() data: FindOneAuthDto) {
    return this.authService.logIn(data);
  }

  @UseGuards(AuthGuard)
  @Post('get-indexed-db-data')
  @ApiBody({
    description: 'Retrieve indexed database data',
    required: true,
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          example: 'user@example.com',
          description: 'The email of the user',
        },
        company_id: {
          type: 'string',
          example: 'COMPANY_ID_123',
          description: 'The unique ID of the company',
        },
      },
      required: ['email', 'company_id'],
    },
  })
  getIndexedData(@Body() data: FindIndexedDbAuthDto) {
    return this.authService.getIndexedData(data);
  }

  @Get('/authenticate-token/:token')
  authenticateToken(@Param('token') token: string) {
    return this.authService.authenticateToken(token);
  }

  @UseGuards(AuthGuard)
  @Get('/get-company-users/:id')
  getCompanyUsers(@Param('id') id: string) {
    return this.authService.getCompanyUsers(id);
  }

  @UseGuards(AuthGuard)
  @Get('/get-company-users-access/:company_ifric_id')
  getCompanyUsersAccess(@Param('company_ifric_id') company_ifric_id: string) {
    return this.authService.getCompanyUsersAccess(company_ifric_id);
  }

  @UseGuards(AuthGuard)
  @Get('/get-user-profile-content/:company_ifric_id/:user_id')
  getUserProfileContent(
    @Param('company_ifric_id') company_ifric_id: string,
    @Param('user_id') user_id: string,
  ) {
    return this.authService.getUserProfileContent(company_ifric_id, user_id);
  }

  @UseGuards(AuthGuard)
  @Get('/get-user-product-access/:id')
  getUserProductAccess(@Param('id') id: string) {
    return this.authService.getUserProductAccess(id);
  }

  @UseGuards(AuthGuard)
  @Get('/get-user-details')
  getUserDetails(
    @Query('user_email') user_email: string,
    @Query('company_ifric_id') company_ifric_id: string,
  ) {
    return this.authService.getUserDetails(user_email, company_ifric_id);
  }

  @UseGuards(AuthGuard)
  @Get('get-total-users')
  getTotalUsers() {
    return this.authService.getTotalUsers();
  }

  @UseGuards(AuthGuard)
  @Get('/get-user-details/:id')
  getUserDetailsById(@Param('id') id: string) {
    return this.authService.getUserDetailsById(id);
  }

  @UseGuards(AuthGuard)
  @Get('/get-user-details-by-email/:email')
  getUserDetailsByEmail(@Param('email') email: string) {
    return this.authService.getUserDetailsByEmail(email);
  }

  @Get('/get-user-details-by-email-recover-password/:email')
  getUserDetailsForRecoverPassword(@Param('email') email: string) {
    return this.authService.getUserDetailsByEmail(email);
  }

  @UseGuards(AuthGuard)
  @Get('check-company-admin/:email')
  async checkCompanyAdmin(@Param('email') email: string) {
    return this.authService.checkCompanyAdmin(email);
  }

  @Patch('/update-password')
  @ApiBody({
    description:
      'Change a Company or CompanyUser password, verifying the old ' +
      'password first',
    required: true,
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          example: 'user@example.com',
          description: 'The email of the user',
        },
        oldPassword: {
          type: 'string',
          example: 'OldWeakP@ssw0rd!',
          description: 'The current password, verified before updating',
        },
        newPassword: {
          type: 'string',
          example: 'NewStrongP@ssw0rd!',
          description: 'The new password for the user',
        },
      },
      required: ['email', 'oldPassword', 'newPassword'],
    },
  })
  updateUserPassword(@Body() data: UpdatePasswordDto) {
    return this.authService.updateUserPassword(data);
  }

  @UseGuards(AuthGuard)
  @Patch('/update-user-access-group/:id')
  @ApiBody({
    description:
      'Grants the user (CompanyUser :id) the named access group role.',
    required: true,
    schema: {
      type: 'object',
      properties: {
        user_role: {
          type: 'string',
          example: 'admin',
          description: 'Access group name (matches AccessGroup.group_name)',
        },
      },
      required: ['user_role'],
    },
  })
  updateUserAccessGroup(
    @Param('id') id: string,
    @Body() data: UpdateUserAccessDto,
  ) {
    return this.authService.updateUserAccessGroup(id, data);
  }

  @UseGuards(AuthGuard)
  @Patch('/update-company-user')
  @ApiBody({
    description:
      'Update user details with optional fields for user information and password changes',
    required: true,
    schema: {
      type: 'object',
      properties: {
        company_ifric_id: {
          type: 'string',
          example: 'company-ifric-123',
          description: 'Unique identifier for the company',
        },
        user_id: {
          type: 'string',
          example: 'user-456',
          description: 'Unique identifier for the user',
        },
        user_name: {
          type: 'string',
          example: 'John Doe',
          description: 'Name of the user',
        },
        user_email: {
          type: 'string',
          example: 'john.doe@example.com',
          description: 'Email address of the user',
        },
        user_image: {
          type: 'string',
          example: 'https://example.com/path/to/image.jpg',
          description: "URL to the user's profile image",
        },
        old_password: {
          type: 'string',
          example: 'OldPassword123',
          description: 'Old password for the user (if changing password)',
        },
        new_password: {
          type: 'string',
          example: 'NewPassword456',
          description:
            'New password for the user (if changing password). Verified ' +
            'and updated against Keycloak.',
        },
      },
      required: ['company_ifric_id', 'user_id'],
    },
  })
  updateCompanyUser(@Body() data: UpdateUserDetails) {
    return this.authService.updateCompanyUser(data);
  }

  @UseGuards(AuthGuard)
  @Delete('/delete-company-user/:id')
  deleteCompanyUser(@Param('id') id: string) {
    return this.authService.deleteCompanyUser(id);
  }

  @Post('logout')
  @ApiBody({
    description:
      'Log out a user. Pass refresh_token (the one returned by /auth/login) ' +
      'to also revoke the session at Keycloak — omitting it still returns ' +
      'success but leaves the Keycloak session live until it naturally expires.',
    required: true,
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          example: 'user@example.com',
          description: 'The email address of the user to log out',
        },
        refresh_token: {
          type: 'string',
          description: 'Optional. The refresh token to revoke at Keycloak.',
        },
      },
      required: ['email'],
    },
  })
  logOut(@Body() data: { email: string; refresh_token?: string }) {
    return this.authService.logOut(data);
  }

  @Post('refresh')
  @ApiBody({
    description:
      'Exchange a refresh token (obtained from /auth/login) for a new, ' +
      'short-lived access token. Fails if the refresh token has expired ' +
      'or been revoked (e.g. by /auth/logout). Keycloak rotates refresh ' +
      'tokens by default, so the response also includes a new refresh_token ' +
      '— use it for the next refresh instead of the original.',
    required: true,
    schema: {
      type: 'object',
      properties: {
        refresh_token: {
          type: 'string',
          description: 'The refresh token obtained from /auth/login',
        },
      },
      required: ['refresh_token'],
    },
  })
  refresh(@Body('refresh_token') refreshToken: string) {
    return this.authService.refreshAccessToken(refreshToken);
  }

  @Post('recover-password-request')
  @ApiBody({
    description:
      'Generate a new temporary password for a user, returned directly in ' +
      'the response (no email is sent — this project has no bundled email ' +
      'concept). The caller is responsible for relaying it to the user.',
    required: true,
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          example: 'user@example.com',
          description:
            'The email address of the user requesting password recovery',
        },
      },
      required: ['email'],
    },
  })
  async recoverPasswordRequest(@Body() body: { email: string }) {
    return this.authService.recoverPasswordRequest(body.email);
  }

  @Post('recover-password')
  @ApiBody({
    description:
      'Recover a user password using a temporary password and set a new password',
    required: true,
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          example: 'user@example.com',
          description: 'The email address of the user',
        },
        temporaryPassword: {
          type: 'string',
          example: 'Temp@1234',
          description: 'The temporary password sent to the user',
        },
        newPassword: {
          type: 'string',
          example: 'NewStrongP@ssw0rd!',
          description: 'The new password to be set for the user',
        },
      },
      required: ['email', 'temporaryPassword', 'newPassword'],
    },
  })
  async recoverPassword(
    @Body()
    body: {
      email: string;
      temporaryPassword: string;
      newPassword: string;
    },
  ) {
    return this.authService.recoverPassword(
      body.email,
      body.temporaryPassword,
      body.newPassword,
    );
  }
}
