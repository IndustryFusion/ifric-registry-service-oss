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

import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AccessGroup, UserProductAccessGroup } from 'src/entities';
import { AuthTokenClaims } from '../endpoints/auth/auth-token-claims.interface';

export type Permission = 'create' | 'read' | 'update' | 'delete';

/**
 * Enforces the two checks every company-scoped endpoint needs, using the
 * company_ifric_id/user_id claims a Keycloak protocol mapper projects onto
 * the access token (see README.md) instead of trusting body-supplied ids:
 *   1. the caller's own company matches the company they're acting on
 *   2. the caller's RBAC role (AccessGroup, via UserProductAccessGroup)
 *      actually grants the permission being exercised
 */
@Injectable()
export class AccessControlService {
  constructor(
    @InjectRepository(AccessGroup)
    private readonly accessGroupRepository: Repository<AccessGroup>,
    @InjectRepository(UserProductAccessGroup)
    private readonly userProductAccessGroupRepository: Repository<UserProductAccessGroup>,
  ) {}

  // A missing claim means the caller's token predates the protocol-mapper
  // migration (or the backfill script hasn't run for their account yet) —
  // treated as a hard failure, never as an implicit bypass.
  assertCompanyMatch(
    claims: AuthTokenClaims,
    targetCompanyIfricId: string,
  ): void {
    if (
      !claims.company_ifric_id ||
      claims.company_ifric_id !== targetCompanyIfricId
    ) {
      throw new ForbiddenException(
        "Caller's company does not match the requested company",
      );
    }
  }

  // productIfricId given: checks that specific UserProductAccessGroup ->
  // AccessGroup grant (e.g. product CRUD). Omitted: for company-level
  // actions not tied to one product (factory/user creation, company reads),
  // checks whether the caller holds ANY AccessGroup grant in their company
  // with this permission bit set — true for every product an "admin"-role
  // user was granted at company/user creation, false for a "read_only" user
  // asking for anything beyond `read`.
  async assertPermission(
    claims: AuthTokenClaims,
    permission: Permission,
    productIfricId?: string,
  ): Promise<void> {
    if (!claims.user_id) {
      throw new ForbiddenException('Token is missing a user_id claim');
    }

    const grants = await this.userProductAccessGroupRepository.find({
      where: {
        user_id: claims.user_id,
        ...(productIfricId && { product_ifric_id: productIfricId }),
      },
    });
    const accessGroupIds = grants.map((g) => g.access_group_id);
    const matchingGroup = accessGroupIds.length
      ? await this.accessGroupRepository.findOne({
          where: { _id: In(accessGroupIds), [permission]: true },
        })
      : null;
    if (!matchingGroup) {
      throw new ForbiddenException(
        `No ${permission} permission for this ${productIfricId ? 'product' : 'company'}`,
      );
    }
  }
}
