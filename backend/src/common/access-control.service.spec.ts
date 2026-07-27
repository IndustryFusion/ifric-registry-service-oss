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
  let userProductAccessGroupRepository: { find: jest.Mock };

  beforeEach(() => {
    accessGroupRepository = { findOne: jest.fn() };
    userProductAccessGroupRepository = { find: jest.fn() };
    service = new AccessControlService(
      accessGroupRepository as any,
      userProductAccessGroupRepository as any,
    );
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
      expect(userProductAccessGroupRepository.find).not.toHaveBeenCalled();
    });

    it('allows an admin-role user to create (any AccessGroup grant with create=true)', async () => {
      userProductAccessGroupRepository.find.mockResolvedValue([
        { access_group_id: 'ag-admin' },
      ]);
      accessGroupRepository.findOne.mockResolvedValue({
        _id: 'ag-admin',
        create: true,
      });

      await expect(
        service.assertPermission({ user_id: 'user-1' }, 'create'),
      ).resolves.toBeUndefined();
    });

    it('rejects a read_only-role user trying to create', async () => {
      userProductAccessGroupRepository.find.mockResolvedValue([
        { access_group_id: 'ag-readonly' },
      ]);
      accessGroupRepository.findOne.mockResolvedValue(null); // no create=true match

      await expect(
        service.assertPermission({ user_id: 'user-1' }, 'create'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a read_only-role user to read', async () => {
      userProductAccessGroupRepository.find.mockResolvedValue([
        { access_group_id: 'ag-readonly' },
      ]);
      accessGroupRepository.findOne.mockResolvedValue({
        _id: 'ag-readonly',
        read: true,
      });

      await expect(
        service.assertPermission({ user_id: 'user-1' }, 'read'),
      ).resolves.toBeUndefined();
    });

    it('rejects when the user has no grants at all in the company', async () => {
      userProductAccessGroupRepository.find.mockResolvedValue([]);

      await expect(
        service.assertPermission({ user_id: 'user-1' }, 'read'),
      ).rejects.toThrow(ForbiddenException);
      expect(accessGroupRepository.findOne).not.toHaveBeenCalled();
    });

    it('scopes the grant lookup to a specific product when given', async () => {
      userProductAccessGroupRepository.find.mockResolvedValue([
        { access_group_id: 'ag-1' },
      ]);
      accessGroupRepository.findOne.mockResolvedValue({
        _id: 'ag-1',
        create: true,
      });

      await service.assertPermission(
        { user_id: 'user-1' },
        'create',
        'urn:product:alpha',
      );

      expect(userProductAccessGroupRepository.find).toHaveBeenCalledWith({
        where: { user_id: 'user-1', product_ifric_id: 'urn:product:alpha' },
      });
    });
  });
});
