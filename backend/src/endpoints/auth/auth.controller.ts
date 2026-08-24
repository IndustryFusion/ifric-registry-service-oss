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
  Query,
  Ip,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UpdateUserDetails } from './dto/update-auth.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateUserAccessDto } from './dto/update-user-access.dto';
import { AuthUser } from './auth-user.decorator';
import { AuthTokenClaims } from './auth-token-claims.interface';
import { UserAccessDto } from './dto/user-access-dto';
import { FindOneAuthDto, FindIndexedDbAuthDto } from './dto/find-auth-dto';
import { ApiBearerAuth, ApiTags, ApiBody } from '@nestjs/swagger';
import { Public } from 'src/common/public.decorator';

@ApiTags('Auth')
@ApiBearerAuth('access-token')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
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

  @Public()
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

  // POST with the token in the body, not GET /:token — a bearer token in a
  // URL path ends up in access logs, proxy logs and browser history.
  @ApiBody({
    schema: {
      type: 'object',
      properties: { token: { type: 'string' } },
      required: ['token'],
    },
  })
  @Public()
  @Post('/authenticate-token')
  authenticateToken(@Body() data: { token: string }) {
    return this.authService.authenticateToken(data.token);
  }
  @Get('/get-company-users/:id')
  getCompanyUsers(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.authService.getCompanyUsers(id, authUser);
  }
  @Get('/get-company-users-access/:company_ifric_id')
  getCompanyUsersAccess(
    @Param('company_ifric_id') company_ifric_id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.authService.getCompanyUsersAccess(company_ifric_id, authUser);
  }
  @Get('/get-user-profile-content/:company_ifric_id/:user_id')
  getUserProfileContent(
    @Param('company_ifric_id') company_ifric_id: string,
    @Param('user_id') user_id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.authService.getUserProfileContent(
      company_ifric_id,
      user_id,
      authUser,
    );
  }
  @Get('/get-user-product-access/:id')
  getUserProductAccess(@Param('id') id: string) {
    return this.authService.getUserProductAccess(id);
  }
  @Get('/get-user-details')
  getUserDetails(
    @Query('user_email') user_email: string,
    @Query('company_ifric_id') company_ifric_id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.authService.getUserDetails(
      user_email,
      company_ifric_id,
      authUser,
    );
  }
  @Get('get-total-users')
  getTotalUsers() {
    return this.authService.getTotalUsers();
  }
  @Get('/get-user-details/:id')
  getUserDetailsById(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.authService.getUserDetailsById(id, authUser);
  }
  @Get('/get-user-details-by-email/:email')
  getUserDetailsByEmail(
    @Param('email') email: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.authService.getUserDetailsByEmail(email, authUser);
  }
  @Get('check-company-admin/:email')
  async checkCompanyAdmin(@Param('email') email: string) {
    return this.authService.checkCompanyAdmin(email);
  }

  @Public()
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
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.authService.updateUserAccessGroup(id, data, authUser);
  }
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
  updateCompanyUser(
    @Body() data: UpdateUserDetails,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.authService.updateCompanyUser(data, authUser);
  }
  @Delete('/delete-company-user/:id')
  deleteCompanyUser(
    @Param('id') id: string,
    @AuthUser() authUser: AuthTokenClaims,
  ) {
    return this.authService.deleteCompanyUser(id, authUser);
  }

  @Public()
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

  @Public()
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

  @Public()
  @Post('recover-password-request')
  @ApiBody({
    description:
      'Start password recovery. Keycloak emails the account holder a ' +
      'one-time link to set a new password; the response is a fixed ' +
      'acknowledgement that never contains a credential and is identical ' +
      'whether or not the address has an account. The existing password ' +
      'keeps working until the link is used. Requires realm SMTP to be ' +
      'configured (docs/keycloak-first-time-checklist.md) — if the mail ' +
      'cannot be sent the call fails rather than falling back to anything. ' +
      'Throttled per address and per caller IP (429 when exceeded).',
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
  async recoverPasswordRequest(
    @Body() body: { email: string },
    @Ip() ip: string,
  ) {
    return this.authService.recoverPasswordRequest(body.email, ip);
  }

  @Public()
  @Post('recover-password')
  @ApiBody({
    description:
      'Set a new password for a user who already knows their current one ' +
      '(verified against Keycloak first). Recovery itself no longer issues ' +
      'a temporary password — recover-password-request hands the user off ' +
      'to Keycloak — so this is now just a password change that does not ' +
      'need a bearer token; `temporaryPassword` is whatever the current ' +
      'password is.',
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
          description:
            "The user's current password (historically a temporary one)",
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
