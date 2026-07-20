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

import { HttpException, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { KeycloakService } from './keycloak.service';

jest.mock('axios');
jest.mock('jsonwebtoken');

const mockGetSigningKey = jest.fn();
jest.mock('jwks-rsa', () =>
  jest.fn().mockImplementation(() => ({
    getSigningKey: mockGetSigningKey,
  })),
);

describe('KeycloakService', () => {
  let service: KeycloakService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KeycloakService();
  });

  describe('passwordGrant', () => {
    it('returns the token pair on success', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'at', refresh_token: 'rt', expires_in: 60 },
      });

      const result = await service.passwordGrant('user@example.com', 'pw');

      expect(result).toEqual({ access_token: 'at', refresh_token: 'rt' });
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/protocol/openid-connect/token'),
        expect.any(URLSearchParams),
      );
    });

    it('throws HttpException(Invalid Password, 400) on failure', async () => {
      (axios.post as jest.Mock).mockRejectedValue(new Error('invalid_grant'));

      await expect(
        service.passwordGrant('user@example.com', 'wrong-pw'),
      ).rejects.toMatchObject({
        message: 'Invalid Password',
        status: 400,
      });
    });
  });

  describe('refreshGrant', () => {
    it('returns the rotated token pair on success', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'at2', refresh_token: 'rt2', expires_in: 60 },
      });

      const result = await service.refreshGrant('rt');

      expect(result).toEqual({ access_token: 'at2', refresh_token: 'rt2' });
    });

    it('throws a generic UnauthorizedException for an unrecognized failure', async () => {
      (axios.post as jest.Mock).mockRejectedValue({
        response: { data: { error_description: 'malformed token' } },
      });

      await expect(service.refreshGrant('bad-rt')).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });

    it('throws a revoked-specific UnauthorizedException when Keycloak signals it', async () => {
      (axios.post as jest.Mock).mockRejectedValue({
        response: { data: { error_description: 'Session was revoked' } },
      });

      await expect(service.refreshGrant('revoked-rt')).rejects.toThrow(
        new UnauthorizedException('Refresh token has been revoked'),
      );
    });
  });

  describe('revoke', () => {
    it('does not throw when the revoke call fails (best-effort)', async () => {
      (axios.post as jest.Mock).mockRejectedValue(new Error('unreachable'));

      await expect(service.revoke('rt')).resolves.toBeUndefined();
    });

    it('posts to the logout endpoint on success', async () => {
      (axios.post as jest.Mock).mockResolvedValue({});

      await service.revoke('rt');

      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/protocol/openid-connect/logout'),
        expect.any(URLSearchParams),
      );
    });
  });

  describe('verifyAccessToken', () => {
    it('returns the decoded payload for a valid token', async () => {
      (jwt.decode as jest.Mock).mockReturnValue({ header: { kid: 'kid-1' } });
      mockGetSigningKey.mockResolvedValue({
        getPublicKey: () => 'public-key-pem',
      });
      (jwt.verify as jest.Mock).mockReturnValue({ sub: 'kc-user-1' });

      const result = await service.verifyAccessToken('a-valid-token');

      expect(result).toEqual({ sub: 'kc-user-1' });
      expect(jwt.verify).toHaveBeenCalledWith(
        'a-valid-token',
        'public-key-pem',
        expect.objectContaining({ algorithms: ['RS256'] }),
      );
    });

    it('rejects when the token has no kid header', async () => {
      (jwt.decode as jest.Mock).mockReturnValue({ header: {} });

      await expect(service.verifyAccessToken('no-kid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects when the JWKS key lookup fails', async () => {
      (jwt.decode as jest.Mock).mockReturnValue({ header: { kid: 'kid-1' } });
      mockGetSigningKey.mockRejectedValue(new Error('unknown kid'));

      await expect(
        service.verifyAccessToken('a-token-with-unknown-kid'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when signature verification fails', async () => {
      (jwt.decode as jest.Mock).mockReturnValue({ header: { kid: 'kid-1' } });
      mockGetSigningKey.mockResolvedValue({
        getPublicKey: () => 'public-key-pem',
      });
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid signature');
      });

      await expect(
        service.verifyAccessToken('a-tampered-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('findUserIdByEmail', () => {
    it('returns the matching user id', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'admin-token', expires_in: 60 },
      });
      (axios.get as jest.Mock).mockResolvedValue({
        data: [{ id: 'kc-user-1' }],
      });

      const result = await service.findUserIdByEmail('user@example.com');

      expect(result).toBe('kc-user-1');
    });

    it('returns null when no user matches', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'admin-token', expires_in: 60 },
      });
      (axios.get as jest.Mock).mockResolvedValue({ data: [] });

      const result = await service.findUserIdByEmail('nobody@example.com');

      expect(result).toBeNull();
    });

    it('reuses the cached admin token instead of requesting a new one every call', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'admin-token', expires_in: 60 },
      });
      (axios.get as jest.Mock).mockResolvedValue({ data: [{ id: 'u1' }] });

      await service.findUserIdByEmail('a@example.com');
      await service.findUserIdByEmail('b@example.com');

      expect(axios.post).toHaveBeenCalledTimes(1);
      expect(axios.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('createUser', () => {
    beforeEach(() => {
      (axios.post as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/protocol/openid-connect/token')) {
          return Promise.resolve({
            data: { access_token: 'admin-token', expires_in: 60 },
          });
        }
        return Promise.resolve({}); // POST .../users
      });
    });

    it('creates the user then returns the looked-up id', async () => {
      (axios.get as jest.Mock).mockResolvedValue({
        data: [{ id: 'new-kc-user' }],
      });

      const result = await service.createUser(
        'new@example.com',
        'New User',
        'temp-pw',
      );

      expect(result).toBe('new-kc-user');
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/users'),
        expect.objectContaining({
          username: 'new@example.com',
          email: 'new@example.com',
          credentials: [
            { type: 'password', value: 'temp-pw', temporary: false },
          ],
        }),
        expect.any(Object),
      );
    });

    it('throws when the create call itself fails', async () => {
      (axios.post as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('/protocol/openid-connect/token')) {
          return Promise.resolve({
            data: { access_token: 'admin-token', expires_in: 60 },
          });
        }
        return Promise.reject({
          response: { data: { errorMessage: 'User exists' } },
        });
      });

      await expect(
        service.createUser('dup@example.com', 'Dup User', 'pw'),
      ).rejects.toThrow(HttpException);
    });

    it('throws when the user cannot be looked up after creation', async () => {
      (axios.get as jest.Mock).mockResolvedValue({ data: [] });

      await expect(
        service.createUser('ghost@example.com', 'Ghost', 'pw'),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('setPassword', () => {
    it('resets the password for an existing user', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'admin-token', expires_in: 60 },
      });
      (axios.get as jest.Mock).mockResolvedValue({
        data: [{ id: 'kc-user-1' }],
      });
      (axios.put as jest.Mock).mockResolvedValue({});

      await service.setPassword('user@example.com', 'new-pw');

      expect(axios.put).toHaveBeenCalledWith(
        expect.stringContaining('/users/kc-user-1/reset-password'),
        { type: 'password', value: 'new-pw', temporary: false },
        expect.any(Object),
      );
    });

    it('throws NOT_FOUND when the user does not exist in Keycloak', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'admin-token', expires_in: 60 },
      });
      (axios.get as jest.Mock).mockResolvedValue({ data: [] });

      await expect(
        service.setPassword('nobody@example.com', 'new-pw'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('deleteUser', () => {
    it('deletes the matching Keycloak user', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'admin-token', expires_in: 60 },
      });
      (axios.get as jest.Mock).mockResolvedValue({
        data: [{ id: 'kc-user-1' }],
      });
      (axios.delete as jest.Mock).mockResolvedValue({});

      await service.deleteUser('user@example.com');

      expect(axios.delete).toHaveBeenCalledWith(
        expect.stringContaining('/users/kc-user-1'),
        expect.any(Object),
      );
    });

    it('no-ops when the user does not exist in Keycloak', async () => {
      (axios.post as jest.Mock).mockResolvedValue({
        data: { access_token: 'admin-token', expires_in: 60 },
      });
      (axios.get as jest.Mock).mockResolvedValue({ data: [] });

      await expect(
        service.deleteUser('nobody@example.com'),
      ).resolves.toBeUndefined();
      expect(axios.delete).not.toHaveBeenCalled();
    });
  });
});
