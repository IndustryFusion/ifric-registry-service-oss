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
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { CreateCompanyCertificateDto } from './dto/create-certificate.dto';
import { AuthGuard } from '../auth/auth.guard';
import { ApiBearerAuth, ApiTags, ApiBody } from '@nestjs/swagger';

@ApiTags('Certificate')
@ApiBearerAuth('access-token')
@Controller('certificate')
export class CertificateController {
  constructor(private readonly certificateService: CertificateService) {}

  @UseGuards(AuthGuard)
  @Post('create-company-certificate')
  @ApiBody({
    description: 'Details for creating a company certificate',
    required: true,
    schema: {
      type: 'object',
      properties: {
        company_ifric_id: {
          type: 'string',
          example: 'IFRIC12345',
        },
        expiry: {
          type: 'string',
          format: 'date',
          example: '2024-12-31',
        },
        user_email: {
          type: 'string',
          example: 'user@example.com',
        },
      },
      required: ['company_ifric_id', 'expiry', 'user_email'],
    },
  })
  async generateCompanyCertificate(@Body() data: CreateCompanyCertificateDto) {
    try {
      return await this.certificateService.generateCompanyCertificate(
        data.company_ifric_id,
        new Date(data.expiry),
        data.user_email,
      );
    } catch (err) {
      throw err;
    }
  }

  @UseGuards(AuthGuard)
  @Post('verify-company-certificate')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        company_ifric_id: {
          type: 'string',
          description: 'Unique identifier for the company',
          example: 'IFRIC12345',
        },
        certificate_data: {
          type: 'string',
          description: 'Certificate data to be verified',
          example: 'base64encodedcertificatestring',
        },
      },
      required: ['company_ifric_id', 'certificate_data'],
    },
  })
  async verifyCompanyCertificate(
    @Body() data: { company_ifric_id: string; certificate_data: string },
  ) {
    try {
      const response = await this.certificateService.verifyCompanyCertificate(
        data.company_ifric_id,
      );
      return response.data;
    } catch (err) {
      throw err;
    }
  }

  @UseGuards(AuthGuard)
  @Get('get-company-certificate/:company_ifric_id')
  async getCompanyCertificate(
    @Param('company_ifric_id') company_ifric_id: string,
  ) {
    try {
      return await this.certificateService.getCompanyCertificate(
        company_ifric_id,
      );
    } catch (err) {
      throw err;
    }
  }

  @UseGuards(AuthGuard)
  @Get('reveal-private-key/:company_ifric_id')
  async revealPrivateKey(@Param('company_ifric_id') company_ifric_id: string) {
    try {
      return await this.certificateService.revealPrivateKey(company_ifric_id);
    } catch (err) {
      throw err;
    }
  }

  @UseGuards(AuthGuard)
  @Delete('delete-private-key/:company_ifric_id')
  async deletePrivateKey(@Param('company_ifric_id') company_ifric_id: string) {
    try {
      return await this.certificateService.deletePrivateKey(company_ifric_id);
    } catch (err) {
      throw err;
    }
  }
}
