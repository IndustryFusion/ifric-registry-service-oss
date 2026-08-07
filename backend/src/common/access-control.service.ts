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
import { Repository } from 'typeorm';
import { AccessGroup, Company, UserAccessGroup } from 'src/entities';
import {
  AuthTokenClaims,
  PARTICIPANT_VERIFIED,
} from '../endpoints/auth/auth-token-claims.interface';

export type Permission = 'create' | 'read' | 'update' | 'delete';

/**
 * Enforces the two checks every company-scoped endpoint needs, using the
 * company_ifric_id/user_id claims a Keycloak protocol mapper projects onto
 * the access token (see README.md) instead of trusting body-supplied ids:
 *   1. the caller's own company matches the company they're acting on
 *   2. the caller's one AccessGroup role (via UserAccessGroup) actually
 *      grants the permission being exercised
 *
 * Tokens minted by the separate "data-space" client carry neither claim —
 * only participant_id — so resolveClaims normalizes them into the same
 * shape before either check runs. That normalization is the single place
 * the two token formats differ; every call site sees one shape.
 */
@Injectable()
export class AccessControlService {
  constructor(
    @InjectRepository(AccessGroup)
    private readonly accessGroupRepository: Repository<AccessGroup>,
    @InjectRepository(UserAccessGroup)
    private readonly userAccessGroupRepository: Repository<UserAccessGroup>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  /**
   * Normalizes a verified token payload so the rest of the app never has to
   * know which Keycloak client issued it. Called once by AuthGuard; the
   * result is what lands on request.user.
   *
   * A dataspace participant that was onboarded from IFRIC has its
   * participant_id set to a verbatim copy of its company_ifric_id, so no
   * mapping table is needed — matching the claim against Company is the
   * whole resolution. A participant from the dataspace's own registry
   * matches nothing here and is returned unchanged, which leaves it failing
   * assertCompanyMatch's existing "missing claim is a hard denial" rule
   * rather than needing a rejection path of its own.
   */
  async resolveClaims(claims: AuthTokenClaims): Promise<AuthTokenClaims> {
    // Dropped before anything reads it: the marker means "this service
    // matched a participant_id against a real Company", which no identity
    // provider can vouch for. A token arriving with it set must not be
    // believed.
    const resolved: AuthTokenClaims = { ...claims };
    delete resolved[PARTICIPANT_VERIFIED];

    // An ifric-client token already carries what both checks need. Return
    // it untouched and, deliberately, without a query — the existing login
    // path must not pay for this feature. This also means a token asserting
    // both ids can never have its company_ifric_id overwritten by a
    // contradictory participant_id.
    if (resolved.company_ifric_id || !resolved.participant_id) {
      return resolved;
    }

    const company = await this.companyRepository.findOne({
      where: { company_ifric_id: resolved.participant_id },
    });
    if (!company) {
      return resolved;
    }

    return {
      ...resolved,
      company_ifric_id: company.company_ifric_id,
      [PARTICIPANT_VERIFIED]: true,
    };
  }

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

  // Every user holds exactly one AccessGroup role (UserAccessGroup is
  // unique on user_id) — checks whether that role's permission flag for
  // the given action is set (true for "admin", false for "read_only"
  // asking for anything beyond `read`).
  async assertPermission(
    claims: AuthTokenClaims,
    permission: Permission,
  ): Promise<void> {
    // A dataspace token identifies a company, not a person, so there is no
    // user_id to key UserAccessGroup on and this check has nothing to
    // evaluate — it would deny every participant outright. Skipping it is
    // what makes participant access work at all; the tenant boundary is
    // still held by assertCompanyMatch, which resolveClaims populated.
    // Note this grants full create/read/update/delete within that company,
    // regardless of any role the caller holds on the IFRIC side.
    if (claims[PARTICIPANT_VERIFIED] === true) {
      return;
    }

    if (!claims.user_id) {
      throw new ForbiddenException('Token is missing a user_id claim');
    }

    const grant = await this.userAccessGroupRepository.findOne({
      where: { user_id: claims.user_id },
    });
    const accessGroup = grant
      ? await this.accessGroupRepository.findOne({
          where: { _id: grant.access_group_id, [permission]: true },
        })
      : null;
    if (!accessGroup) {
      throw new ForbiddenException(`No ${permission} permission`);
    }
  }
}
