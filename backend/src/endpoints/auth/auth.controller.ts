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
import { UpdateUserProductAccessDto } from './dto/update-user-product-access.dto';
import { AuthGuard } from './auth.guard';
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
    description: 'Details for creating a company user',
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
        user_password: {
          type: 'string',
          example: 'securepassword123',
        },
        products: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              product_name: {
                type: 'string',
                example: 'ProductA',
              },
              product_version: {
                type: 'string',
                example: 'v1.0',
              },
            },
          },
          example: [
            { product_name: 'ProductA', product_version: 'v1.0' },
            { product_name: 'ProductB', product_version: 'v2.1' },
          ],
        },
      },
      required: [
        'company_ifric_id',
        'user_name',
        'user_email',
        'user_password',
        'products',
      ],
    },
  })
  createCompanyUser(
    @Param('admin_mail') admin_mail: string,
    @Body() data: UserAccessDto,
  ) {
    return this.authService.createCompanyUser(data, admin_mail);
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
        product_name: {
          type: 'string',
          example: 'Product A',
        },
      },
      required: ['email', 'password', 'product_name'],
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
        product_name: {
          type: 'string',
          example: 'Product A',
          description: 'The name of the product',
        },
        company_id: {
          type: 'string',
          example: 'COMPANY_ID_123',
          description: 'The unique ID of the company',
        },
      },
      required: ['email', 'product_name', 'company_id'],
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
  @Get('/get-user-specific-product-access')
  getUserSpecificProductAccess(
    @Query('product_name') product_name: string,
    @Query('user_id') user_id: string,
  ) {
    return this.authService.getUserSpecificProductAccess(product_name, user_id);
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
      'For each entry, grants the user (CompanyUser :id) the named access ' +
      'group role on the named product',
    required: true,
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          product: {
            type: 'string',
            example: 'Software',
            description: 'Product name',
          },
          user_role: {
            type: 'string',
            example: 'admin',
            description: 'Access group name (matches AccessGroup.group_name)',
          },
        },
        required: ['product', 'user_role'],
      },
    },
  })
  updateUserAccessGroup(
    @Param('id') id: string,
    @Body() data: UpdateUserProductAccessDto[],
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
          description: 'New password for the user (if changing password)',
        },
        jwt_token: {
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR...',
          description: 'JWT token for authenticating the user',
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
    description: 'Log out a user by providing their email address',
    required: true,
    schema: {
      type: 'object',
      properties: {
        email: {
          type: 'string',
          example: 'user@example.com',
          description: 'The email address of the user to log out',
        },
      },
      required: ['email'],
    },
  })
  logOut(@Body() data: { email: string }) {
    return this.authService.logOut(data);
  }

  @Post('refresh')
  @ApiBody({
    description:
      'Exchange a refresh token (obtained from /auth/login) for a new, ' +
      'short-lived access token. Fails if the refresh token has expired ' +
      'or been revoked (e.g. by /auth/logout).',
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
