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

import { ForbiddenException } from '@nestjs/common';
import { AccessControlService } from './access-control.service';

describe('AccessControlService', () => {
  let service: AccessControlService;
  let accessGroupRepository: { findOne: jest.Mock };
  let userAccessGroupRepository: { findOne: jest.Mock };
  let companyRepository: { findOne: jest.Mock };

  beforeEach(() => {
    accessGroupRepository = { findOne: jest.fn() };
    userAccessGroupRepository = { findOne: jest.fn() };
    companyRepository = { findOne: jest.fn() };
    service = new AccessControlService(
      accessGroupRepository as any,
      userAccessGroupRepository as any,
      companyRepository as any,
    );
  });

  describe('isOwnCompany', () => {
    it('is true when the claim matches the target company', () => {
      expect(
        service.isOwnCompany(
          { company_ifric_id: 'urn:ifric:company-a' },
          'urn:ifric:company-a',
        ),
      ).toBe(true);
    });

    it('is false for a different company', () => {
      expect(
        service.isOwnCompany(
          { company_ifric_id: 'urn:ifric:company-a' },
          'urn:ifric:company-b',
        ),
      ).toBe(false);
    });

    // Call sites use this to decide between the full record and the public
    // projection. A token missing the claim must land on the projection, not
    // slip through as "own" — otherwise omitting a claim would be an upgrade.
    it('is false when the token has no company_ifric_id claim at all', () => {
      expect(service.isOwnCompany({}, 'urn:ifric:company-a')).toBe(false);
    });

    it('is false when the target company id is empty', () => {
      expect(service.isOwnCompany({ company_ifric_id: '' }, '')).toBe(false);
    });
  });

  describe('assertCompanyMatch', () => {
    it('passes when the claim matches the target company', () => {
      expect(() =>
        service.assertCompanyMatch(
          { company_ifric_id: 'urn:ifric:company-a' },
          'urn:ifric:company-a',
        ),
      ).not.toThrow();
    });

    it('throws when the claim is for a different company', () => {
      expect(() =>
        service.assertCompanyMatch(
          { company_ifric_id: 'urn:ifric:company-a' },
          'urn:ifric:company-b',
        ),
      ).toThrow(ForbiddenException);
    });

    it('throws when the token has no company_ifric_id claim at all', () => {
      expect(() =>
        service.assertCompanyMatch({}, 'urn:ifric:company-a'),
      ).toThrow(ForbiddenException);
    });
  });

  describe('assertPermission', () => {
    it('throws when the token has no user_id claim', async () => {
      await expect(service.assertPermission({}, 'create')).rejects.toThrow(
        ForbiddenException,
      );
      expect(userAccessGroupRepository.findOne).not.toHaveBeenCalled();
    });

    it('allows an admin-role user to create (their one AccessGroup grant has create=true)', async () => {
      userAccessGroupRepository.findOne.mockResolvedValue({
        access_group_id: 'ag-admin',
      });
      accessGroupRepository.findOne.mockResolvedValue({
        _id: 'ag-admin',
        create: true,
      });

      await expect(
        service.assertPermission({ user_id: 'user-1' }, 'create'),
      ).resolves.toBeUndefined();
    });

    it('rejects a read_only-role user trying to create', async () => {
      userAccessGroupRepository.findOne.mockResolvedValue({
        access_group_id: 'ag-readonly',
      });
      accessGroupRepository.findOne.mockResolvedValue(null); // no create=true match

      await expect(
        service.assertPermission({ user_id: 'user-1' }, 'create'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a read_only-role user to read', async () => {
      userAccessGroupRepository.findOne.mockResolvedValue({
        access_group_id: 'ag-readonly',
      });
      accessGroupRepository.findOne.mockResolvedValue({
        _id: 'ag-readonly',
        read: true,
      });

      await expect(
        service.assertPermission({ user_id: 'user-1' }, 'read'),
      ).resolves.toBeUndefined();
    });

    it('rejects when the user has no grant at all', async () => {
      userAccessGroupRepository.findOne.mockResolvedValue(null);

      await expect(
        service.assertPermission({ user_id: 'user-1' }, 'read'),
      ).rejects.toThrow(ForbiddenException);
      expect(accessGroupRepository.findOne).not.toHaveBeenCalled();
    });

    it('skips the role lookup entirely for a verified participant', async () => {
      await expect(
        service.assertPermission(
          {
            company_ifric_id: 'urn:ifric:company-a',
            participant_verified: true,
          },
          'delete',
        ),
      ).resolves.toBeUndefined();
      expect(userAccessGroupRepository.findOne).not.toHaveBeenCalled();
      expect(accessGroupRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('resolveClaims', () => {
    it('returns an ifric token untouched and without querying', async () => {
      const claims = {
        company_ifric_id: 'urn:ifric:company-a',
        user_id: 'user-1',
      };

      await expect(service.resolveClaims(claims)).resolves.toEqual(claims);
      expect(companyRepository.findOne).not.toHaveBeenCalled();
    });

    it('aliases a participant_id that matches a company into company_ifric_id', async () => {
      companyRepository.findOne.mockResolvedValue({
        company_ifric_id: 'urn:ifric:company-a',
      });

      await expect(
        service.resolveClaims({ participant_id: 'urn:ifric:company-a' }),
      ).resolves.toEqual({
        participant_id: 'urn:ifric:company-a',
        company_ifric_id: 'urn:ifric:company-a',
        participant_verified: true,
      });
      expect(companyRepository.findOne).toHaveBeenCalledWith({
        where: { company_ifric_id: 'urn:ifric:company-a' },
      });
    });

    it('leaves a participant from the dataspace’s own registry unresolved, so the existing checks deny it', async () => {
      companyRepository.findOne.mockResolvedValue(null);

      const resolved = await service.resolveClaims({
        participant_id: 'dataspace-only-participant',
      });

      expect(resolved.company_ifric_id).toBeUndefined();
      expect(resolved.participant_verified).toBeUndefined();
      expect(() =>
        service.assertCompanyMatch(resolved, 'urn:ifric:company-a'),
      ).toThrow(ForbiddenException);
    });

    it('never trusts participant_verified arriving on the token itself', async () => {
      companyRepository.findOne.mockResolvedValue(null);

      const resolved = await service.resolveClaims({
        participant_id: 'dataspace-only-participant',
        participant_verified: true,
      });

      expect(resolved.participant_verified).toBeUndefined();
      await expect(
        service.assertPermission(resolved, 'delete'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('does not let a contradictory participant_id overwrite an existing company_ifric_id', async () => {
      await expect(
        service.resolveClaims({
          company_ifric_id: 'urn:ifric:company-a',
          participant_id: 'urn:ifric:company-b',
        }),
      ).resolves.toMatchObject({ company_ifric_id: 'urn:ifric:company-a' });
      expect(companyRepository.findOne).not.toHaveBeenCalled();
    });

    it('confines a resolved participant to its own company', async () => {
      companyRepository.findOne.mockResolvedValue({
        company_ifric_id: 'urn:ifric:company-a',
      });

      const resolved = await service.resolveClaims({
        participant_id: 'urn:ifric:company-a',
      });

      expect(() =>
        service.assertCompanyMatch(resolved, 'urn:ifric:company-a'),
      ).not.toThrow();
      expect(() =>
        service.assertCompanyMatch(resolved, 'urn:ifric:company-b'),
      ).toThrow(ForbiddenException);
    });

    it('leaves a token carrying neither claim exactly as it was', async () => {
      await expect(
        service.resolveClaims({ sub: 'kc-user-1' }),
      ).resolves.toEqual({ sub: 'kc-user-1' });
      expect(companyRepository.findOne).not.toHaveBeenCalled();
    });
  });
});
