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
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { In, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Asset, Company, Factory } from 'src/entities';
import { CreateAssetDto, UpdateAssetDto } from './dto/asset.dto';
import { AccessControlService } from 'src/common/access-control.service';
import { PublicCompanyService } from 'src/common/public-company.service';
import { AuthTokenClaims } from '../auth/auth-token-claims.interface';

// Owns the merged Asset concept — a row starts physical-only (company_id
// only) and becomes a "twin" once owner_company_id (+ optionally
// factory_id) is set. Replaces the old CompanyAsset (physical-only tags,
// previously on CompanyService) and CompanyTwin (previously on
// ProductService) — see entities/asset.entity.ts.
@Injectable()
export class AssetService {
  constructor(
    @InjectRepository(Asset) private assetRepository: Repository<Asset>,
    @InjectRepository(Company) private companyRepository: Repository<Company>,
    @InjectRepository(Factory) private factoryRepository: Repository<Factory>,
    private readonly accessControlService: AccessControlService,
    private readonly publicCompanyService: PublicCompanyService,
  ) {}

  // Both the manufacturer (company_id) and the owner (owner_company_id, if
  // set) are legitimate parties to look an asset up by its own id — a
  // deployed asset's owner needs to be able to trace back to its
  // manufacturer just as much as the reverse.
  private async assertCallerIsPartyTo(
    authUser: AuthTokenClaims,
    asset: Asset,
  ): Promise<void> {
    const [manufacturer, owner] = await Promise.all([
      this.companyRepository.findOne({ where: { _id: asset.company_id } }),
      asset.owner_company_id
        ? this.companyRepository.findOne({
            where: { _id: asset.owner_company_id },
          })
        : null,
    ]);
    const partyIfricIds = [
      manufacturer?.company_ifric_id,
      owner?.company_ifric_id,
    ].filter(Boolean);
    if (!partyIfricIds.includes(authUser.company_ifric_id)) {
      throw new ForbiddenException(
        "Caller's company is not a party to this asset",
      );
    }
  }

  // The counterparty lookups below are reachable by both parties to an
  // asset, so "the company this endpoint names" is routinely not the
  // caller's. Full row for your own company, public profile for the other.
  private async projectUnlessOwn(
    company: Company,
    authUser: AuthTokenClaims,
  ): Promise<Record<string, any>> {
    if (
      this.accessControlService.isOwnCompany(authUser, company.company_ifric_id)
    ) {
      return company;
    }
    return await this.publicCompanyService.toPublicCompany(company);
  }

  async createAsset(data: CreateAssetDto, authUser: AuthTokenClaims) {
    try {
      if (!data.asset_ifric_id || !data.company_ifric_id) {
        throw new HttpException(
          'asset_ifric_id and company_ifric_id are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      const companyData = await this.companyRepository.find({
        where: { company_ifric_id: data.company_ifric_id },
      });
      if (companyData.length === 0) {
        throw new HttpException(
          'Invalid company_ifric_id',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.accessControlService.assertCompanyMatch(
        authUser,
        data.company_ifric_id,
      );
      await this.accessControlService.assertPermission(authUser, 'create');

      let ownerCompanyId: string | undefined;
      if (data.owner_company_ifric_id) {
        const ownerData = await this.companyRepository.find({
          where: { company_ifric_id: data.owner_company_ifric_id },
        });
        if (ownerData.length === 0) {
          throw new HttpException(
            'Invalid owner_company_ifric_id',
            HttpStatus.BAD_REQUEST,
          );
        }
        ownerCompanyId = ownerData[0]._id;
      }

      if (data.factory_id) {
        const factory = await this.factoryRepository.find({
          where: { factory_id: data.factory_id },
        });
        if (factory.length === 0) {
          throw new HttpException('Invalid factory_id', HttpStatus.BAD_REQUEST);
        }
      }

      await this.assetRepository.save(
        this.assetRepository.create({
          asset_ifric_id: data.asset_ifric_id,
          company_id: companyData[0]._id,
          ...(ownerCompanyId && { owner_company_id: ownerCompanyId }),
          ...(data.factory_id && { factory_id: data.factory_id }),
          is_twin: !!ownerCompanyId,
        }),
      );

      return {
        success: true,
        status: 201,
        message: 'Asset created successfully',
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

  // Upsert-style update: setting owner_company_ifric_id (+ optionally
  // factory_id) on a physical-only asset is what "twins" it. factory_id
  // alone (no owner change) is left untouched if omitted, matching the
  // original conditional-SET behavior.
  async updateAsset(
    assetIfricId: string,
    data: UpdateAssetDto,
    authUser: AuthTokenClaims,
  ) {
    try {
      const asset = await this.assetRepository.findOne({
        where: { asset_ifric_id: assetIfricId },
      });
      if (!asset) {
        throw new HttpException(
          'No asset found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      const company = await this.companyRepository.findOne({
        where: { _id: asset.company_id },
      });
      this.accessControlService.assertCompanyMatch(
        authUser,
        company?.company_ifric_id,
      );
      await this.accessControlService.assertPermission(authUser, 'update');

      let ownerCompanyId: string | undefined;
      if (data.owner_company_ifric_id) {
        const ownerData = await this.companyRepository.find({
          where: { company_ifric_id: data.owner_company_ifric_id },
        });
        if (ownerData.length === 0) {
          throw new HttpException(
            'Invalid owner_company_ifric_id',
            HttpStatus.BAD_REQUEST,
          );
        }
        ownerCompanyId = ownerData[0]._id;
      }

      if (data.factory_id) {
        const factory = await this.factoryRepository.find({
          where: { factory_id: data.factory_id },
        });
        if (factory.length === 0) {
          throw new HttpException('Invalid factory_id', HttpStatus.BAD_REQUEST);
        }
      }

      // Raw upsert, not repository.update() — keeps the same
      // ON-CONFLICT-DO-UPDATE shape as the rest of this codebase for
      // conditional-column updates (see CLAUDE.md's note on
      // repository.upsert()).
      if (ownerCompanyId && data.factory_id) {
        await this.assetRepository.query(
          `UPDATE assets SET owner_company_id = $1, factory_id = $2, is_twin = true
           WHERE _id = $3`,
          [ownerCompanyId, data.factory_id, asset._id],
        );
      } else if (ownerCompanyId) {
        await this.assetRepository.query(
          `UPDATE assets SET owner_company_id = $1, is_twin = true WHERE _id = $2`,
          [ownerCompanyId, asset._id],
        );
      } else if (data.factory_id) {
        await this.assetRepository.query(
          `UPDATE assets SET factory_id = $1 WHERE _id = $2`,
          [data.factory_id, asset._id],
        );
      }

      return { status: 204, message: 'Asset Updated Successfully' };
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

  async deleteAsset(assetIfricId: string, authUser: AuthTokenClaims) {
    try {
      const asset = await this.assetRepository.findOne({
        where: { asset_ifric_id: assetIfricId },
      });
      if (!asset) {
        throw new HttpException(
          'No asset found with the provided ID',
          HttpStatus.NOT_FOUND,
        );
      }
      const company = await this.companyRepository.findOne({
        where: { _id: asset.company_id },
      });
      this.accessControlService.assertCompanyMatch(
        authUser,
        company?.company_ifric_id,
      );
      await this.accessControlService.assertPermission(authUser, 'delete');

      return await this.assetRepository.delete({
        asset_ifric_id: assetIfricId,
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

  // Bulk delete spans potentially many assets — every one must belong to
  // the caller's own company, or the whole call is rejected (a bulk delete
  // touching another company's asset is a caller error, not a
  // partial-success case).
  async deleteAssets(assetIds: string[], authUser: AuthTokenClaims) {
    try {
      const assets = await this.assetRepository.find({
        where: { asset_ifric_id: In(assetIds) },
      });
      const companyIds = [...new Set(assets.map((a) => a.company_id))];
      const companies = companyIds.length
        ? await this.companyRepository.find({ where: { _id: In(companyIds) } })
        : [];
      const foreignCompany = companies.find(
        (c) => c.company_ifric_id !== authUser.company_ifric_id,
      );
      if (foreignCompany) {
        throw new ForbiddenException(
          'Bulk delete includes an asset belonging to a different company',
        );
      }
      await this.accessControlService.assertPermission(authUser, 'delete');

      return await this.assetRepository.delete({
        asset_ifric_id: In(assetIds),
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

  // Always scoped by company — there is no "list every asset across every
  // company" mode.
  async getAssets(companyIfricId: string, authUser: AuthTokenClaims) {
    const companyData = await this.companyRepository.find({
      where: { company_ifric_id: companyIfricId },
    });
    if (companyData.length === 0) {
      throw new HttpException(
        'No company found with the provided ID',
        HttpStatus.NOT_FOUND,
      );
    }
    this.accessControlService.assertCompanyMatch(authUser, companyIfricId);
    await this.accessControlService.assertPermission(authUser, 'read');

    return this.assetRepository.find({
      where: { company_id: companyData[0]._id },
    });
  }

  async getAssetByAssetIfricId(
    assetIfricId: string,
    authUser: AuthTokenClaims,
  ) {
    const asset = await this.assetRepository.findOne({
      where: { asset_ifric_id: assetIfricId },
    });
    if (!asset) {
      throw new HttpException(
        'No asset found with the provided ID',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.assertCallerIsPartyTo(authUser, asset);
    await this.accessControlService.assertPermission(authUser, 'read');
    return asset;
  }

  async getAssetManufacturer(
    assetIfricId: string,
    authUser: AuthTokenClaims,
  ): Promise<Record<string, any>> {
    const asset = await this.assetRepository.findOne({
      where: { asset_ifric_id: assetIfricId },
    });
    if (!asset) {
      return {
        company: null,
        message: `No company data found for asset URN: ${assetIfricId}`,
      };
    }
    await this.assertCallerIsPartyTo(authUser, asset);
    await this.accessControlService.assertPermission(authUser, 'read');

    const company = await this.companyRepository.findOne({
      where: { _id: asset.company_id },
    });
    if (!company) {
      return { company: null, message: 'No manufacturer found' };
    }
    // assertCallerIsPartyTo admits *either* party, so for an owner asking
    // who built their machine this is a foreign company — it used to hand
    // back the counterparty's whole row.
    return this.projectUnlessOwn(company, authUser);
  }

  async getAssetOwner(
    assetIfricId: string,
    authUser: AuthTokenClaims,
  ): Promise<Record<string, any>> {
    const asset = await this.assetRepository.findOne({
      where: { asset_ifric_id: assetIfricId },
    });
    if (!asset?.owner_company_id) {
      return {
        owner: null,
        message: `No owner data found for asset URN: ${assetIfricId}`,
      };
    }
    await this.assertCallerIsPartyTo(authUser, asset);
    await this.accessControlService.assertPermission(authUser, 'read');

    const owner = await this.companyRepository.findOne({
      where: { _id: asset.owner_company_id },
    });
    if (!owner) {
      return { owner: null, message: 'No owner found' };
    }
    return this.projectUnlessOwn(owner, authUser);
  }

  async getAssetFactoryLocation(
    assetIfricId: string,
    authUser: AuthTokenClaims,
  ): Promise<Record<string, any>> {
    const asset = await this.assetRepository.findOne({
      where: { asset_ifric_id: assetIfricId },
    });
    if (!asset?.factory_id) {
      return {
        factory: null,
        message: `No factory data found for asset URN: ${assetIfricId}`,
      };
    }
    await this.assertCallerIsPartyTo(authUser, asset);
    await this.accessControlService.assertPermission(authUser, 'read');

    const factory = await this.factoryRepository.findOne({
      where: { factory_id: asset.factory_id },
    });
    return factory ?? { factory: null, message: 'No factory found' };
  }

  async getManufacturerAssets(
    companyIfricId: string,
    authUser: AuthTokenClaims,
  ) {
    const companyData = await this.companyRepository.find({
      where: { company_ifric_id: companyIfricId },
    });
    if (companyData.length === 0) {
      throw new HttpException(
        'No company found with the provided ID',
        HttpStatus.NOT_FOUND,
      );
    }
    this.accessControlService.assertCompanyMatch(authUser, companyIfricId);
    await this.accessControlService.assertPermission(authUser, 'read');

    return this.assetRepository.find({
      where: { company_id: companyData[0]._id },
      order: { _id: 'DESC' },
    });
  }

  async getOwnerAssets(companyIfricId: string, authUser: AuthTokenClaims) {
    const companyData = await this.companyRepository.find({
      where: { company_ifric_id: companyIfricId },
    });
    if (companyData.length === 0) {
      throw new HttpException(
        'No company found with the provided ID',
        HttpStatus.NOT_FOUND,
      );
    }
    this.accessControlService.assertCompanyMatch(authUser, companyIfricId);
    await this.accessControlService.assertPermission(authUser, 'read');

    return this.assetRepository.find({
      where: { owner_company_id: companyData[0]._id },
      order: { _id: 'DESC' },
    });
  }

  async getManufacturerOwnerAssets(
    manufacturerIfricId: string,
    ownerIfricId: string,
    authUser: AuthTokenClaims,
  ) {
    const [manufacturerData, ownerData] = await Promise.all([
      this.companyRepository.find({
        where: { company_ifric_id: manufacturerIfricId },
      }),
      this.companyRepository.find({
        where: { company_ifric_id: ownerIfricId },
      }),
    ]);
    if (manufacturerData.length === 0) {
      throw new HttpException(
        'No manufacturer company found with the provided ID',
        HttpStatus.NOT_FOUND,
      );
    }
    if (ownerData.length === 0) {
      throw new HttpException(
        'No owner company found with the provided ID',
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      ![manufacturerIfricId, ownerIfricId].includes(authUser.company_ifric_id)
    ) {
      throw new ForbiddenException(
        "Caller's company is not a party to this manufacturer/owner pair",
      );
    }
    await this.accessControlService.assertPermission(authUser, 'read');

    return this.assetRepository.find({
      where: {
        company_id: manufacturerData[0]._id,
        owner_company_id: ownerData[0]._id,
      },
      order: { _id: 'DESC' },
    });
  }

  // Keyed on asset ids rather than a company, so there is no company match
  // to make — but it ran with no permission check at all, which made it the
  // one asset endpoint a token with no RBAC grant could still use.
  async getAssetCount(assetIds: string[], authUser: AuthTokenClaims) {
    await this.accessControlService.assertPermission(authUser, 'read');
    return this.assetRepository.count({
      where: { asset_ifric_id: In(assetIds) },
    });
  }

  async getAssetCountByCompany(
    companyIfricId: string,
    authUser: AuthTokenClaims,
  ) {
    const companyData = await this.companyRepository.find({
      where: { company_ifric_id: companyIfricId },
    });
    if (companyData.length === 0) {
      throw new HttpException(
        'No company found with the provided ID',
        HttpStatus.NOT_FOUND,
      );
    }
    this.accessControlService.assertCompanyMatch(authUser, companyIfricId);
    await this.accessControlService.assertPermission(authUser, 'read');

    return this.assetRepository.count({
      where: { company_id: companyData[0]._id },
    });
  }
}
