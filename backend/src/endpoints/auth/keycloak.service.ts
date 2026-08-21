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
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import * as jwksRsa from 'jwks-rsa';
import { envConstants } from 'src/common/env.constants';

interface KeycloakTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * Splits the single free-text person name this app collects (CompanyUser.
 * user_name / RegisterAuthDto.admin_name) into the firstName/lastName pair
 * Keycloak's user profile insists on.
 *
 * Both fields are required by the default declarative user profile, and a
 * user missing either one gets the VERIFY_PROFILE required action attached
 * at login. Logins here are ROPC (passwordGrant), where a pending required
 * action can only fail the grant with `invalid_grant` ("Account is not
 * fully set up") — there is no browser flow in which the user could ever
 * complete the profile. So neither field may be left blank.
 *
 * The first whitespace-separated token is the given name and the remainder
 * is the surname ("Ada Lovelace" -> "Ada" / "Lovelace", "Jean Luc Picard"
 * -> "Jean" / "Luc Picard"). A single-token name has no surname to take, so
 * it is used for both rather than inventing a placeholder. If the name is
 * empty or whitespace-only, the email's local part stands in for it.
 */
export function splitPersonName(
  name: string | undefined | null,
  email: string,
): { firstName: string; lastName: string } {
  const tokens = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    const fallback = String(email ?? '').split('@')[0] || 'user';
    return { firstName: fallback, lastName: fallback };
  }
  if (tokens.length === 1) {
    return { firstName: tokens[0], lastName: tokens[0] };
  }
  return { firstName: tokens[0], lastName: tokens.slice(1).join(' ') };
}

/**
 * Keycloak is this app's sole identity provider — see env.constants.ts.
 * End-user token flows (passwordGrant/refreshGrant/revoke/verifyAccessToken)
 * go through the "ifric" client (Resource Owner Password Credentials grant,
 * Direct Access Grants enabled). Admin-API methods (findUserIdByEmail/
 * createUser/setPassword/sendPasswordResetEmail/deleteUser) go through a
 * separate "ifric-admin" client (client-credentials grant, service account
 * granted the realm-management client's manage-users role) — kept separate
 * so a leaked end-user-facing client secret can't also manage the realm's
 * users. Both clients must already exist in the target realm (one-time
 * manual setup, see docs/keycloak-first-time-checklist.md) — this service
 * does not provision them.
 */
@Injectable()
export class KeycloakService {
  private readonly realmUrl = `${envConstants.keycloak.url}/realms/${envConstants.keycloak.realm}`;
  private readonly adminUrl = `${envConstants.keycloak.url}/admin/realms/${envConstants.keycloak.realm}`;
  private readonly jwksClient = jwksRsa({
    jwksUri: `${this.realmUrl}/protocol/openid-connect/certs`,
    cache: true,
    cacheMaxAge: 600_000,
    rateLimit: true,
  });
  private adminToken?: { token: string; expiresAt: number };

  async passwordGrant(
    email: string,
    password: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    try {
      const { data } = await axios.post<KeycloakTokenResponse>(
        `${this.realmUrl}/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: 'password',
          client_id: envConstants.keycloak.clientId,
          client_secret: envConstants.keycloak.clientSecret,
          username: email,
          password,
        }),
      );
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      };
    } catch {
      throw new HttpException('Invalid Password', HttpStatus.BAD_REQUEST);
    }
  }

  async refreshGrant(
    refreshToken: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    try {
      const { data } = await axios.post<KeycloakTokenResponse>(
        `${this.realmUrl}/protocol/openid-connect/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: envConstants.keycloak.clientId,
          client_secret: envConstants.keycloak.clientSecret,
          refresh_token: refreshToken,
        }),
      );
      return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      };
    } catch (err) {
      const description = err?.response?.data?.error_description ?? '';
      if (/revoked|not active|session/i.test(description)) {
        throw new UnauthorizedException('Refresh token has been revoked');
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  // Best-effort — logout must not fail because Keycloak's revoke endpoint
  // is briefly unreachable.
  async revoke(refreshToken: string): Promise<void> {
    try {
      await axios.post(
        `${this.realmUrl}/protocol/openid-connect/logout`,
        new URLSearchParams({
          client_id: envConstants.keycloak.clientId,
          client_secret: envConstants.keycloak.clientSecret,
          refresh_token: refreshToken,
        }),
      );
    } catch {
      // swallowed — see comment above
    }
  }

  async verifyAccessToken(token: string): Promise<Record<string, any>> {
    try {
      const decodedHeader = jwt.decode(token, { complete: true });
      const kid = decodedHeader?.header?.kid;
      if (!kid) throw new Error('token has no kid');

      const signingKey = await this.jwksClient.getSigningKey(kid);
      const payload = jwt.verify(token, signingKey.getPublicKey(), {
        algorithms: ['RS256'],
        issuer: this.realmUrl,
      });
      return payload as Record<string, any>;
    } catch {
      throw new UnauthorizedException();
    }
  }

  private async getAdminToken(): Promise<string> {
    if (this.adminToken && this.adminToken.expiresAt > Date.now()) {
      return this.adminToken.token;
    }
    const { data } = await axios.post<KeycloakTokenResponse>(
      `${this.realmUrl}/protocol/openid-connect/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: envConstants.keycloak.adminClientId,
        client_secret: envConstants.keycloak.adminClientSecret,
      }),
    );
    // Refresh a little before actual expiry to avoid racing token expiry
    // mid-request.
    this.adminToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 10) * 1000,
    };
    return this.adminToken.token;
  }

  async findUserIdByEmail(email: string): Promise<string | null> {
    const adminToken = await this.getAdminToken();
    const { data } = await axios.get(`${this.adminUrl}/users`, {
      params: { email, exact: true },
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    return data[0]?.id ?? null;
  }

  // Returns the new Keycloak user id. temporary: false — the generated
  // password is immediately usable, matching this app's existing UX (no
  // forced-change-on-first-login flow exists today). `attributes` (e.g.
  // company_ifric_id/user_id) are stored on the Keycloak user record and
  // projected into access tokens via a realm protocol mapper — see README.
  async createUser(
    email: string,
    name: string,
    password: string,
    attributes?: Record<string, string>,
  ): Promise<string> {
    const adminToken = await this.getAdminToken();
    // Both names are set from the one collected name — see splitPersonName;
    // a user with no lastName cannot log in through the password grant.
    const { firstName, lastName } = splitPersonName(name, email);
    try {
      await axios.post(
        `${this.adminUrl}/users`,
        {
          username: email,
          email,
          firstName,
          lastName,
          enabled: true,
          credentials: [
            { type: 'password', value: password, temporary: false },
          ],
          ...(attributes && {
            attributes: Object.fromEntries(
              Object.entries(attributes).map(([key, value]) => [key, [value]]),
            ),
          }),
        },
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
    } catch (err) {
      throw new HttpException(
        err?.response?.data?.errorMessage ?? 'Failed to create Keycloak user',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const userId = await this.findUserIdByEmail(email);
    if (!userId) {
      throw new HttpException(
        'Keycloak user was created but could not be looked up afterward',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return userId;
  }

  // Keeps Keycloak's username/email in sync when CompanyUser.user_email
  // changes — Keycloak users are created with username === email
  // (createUser), so a stale username/email here would silently lock the
  // user out of future logins.
  async setEmail(oldEmail: string, newEmail: string): Promise<void> {
    const [adminToken, userId] = await Promise.all([
      this.getAdminToken(),
      this.findUserIdByEmail(oldEmail),
    ]);
    if (!userId) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    try {
      await axios.put(
        `${this.adminUrl}/users/${userId}`,
        { email: newEmail, username: newEmail },
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
    } catch (err) {
      throw new HttpException(
        err?.response?.data?.errorMessage ?? 'Failed to update Keycloak email',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Backfills firstName/lastName onto a Keycloak user created before this
  // service started setting lastName — those accounts are the only ones the
  // VERIFY_PROFILE required action can still block. See
  // backend/scripts/backfill-keycloak-user-attributes.ts.
  async setName(email: string, name: string): Promise<void> {
    const [adminToken, userId] = await Promise.all([
      this.getAdminToken(),
      this.findUserIdByEmail(email),
    ]);
    if (!userId) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    try {
      await axios.put(
        `${this.adminUrl}/users/${userId}`,
        splitPersonName(name, email),
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
    } catch (err) {
      throw new HttpException(
        err?.response?.data?.errorMessage ?? 'Failed to update Keycloak name',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Backfills company_ifric_id/user_id attributes onto a Keycloak user
  // created before the protocol-mapper migration — see
  // backend/scripts/backfill-keycloak-user-attributes.ts.
  async setUserAttributes(
    email: string,
    attributes: Record<string, string>,
  ): Promise<void> {
    const [adminToken, userId] = await Promise.all([
      this.getAdminToken(),
      this.findUserIdByEmail(email),
    ]);
    if (!userId) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    try {
      await axios.put(
        `${this.adminUrl}/users/${userId}`,
        {
          attributes: Object.fromEntries(
            Object.entries(attributes).map(([key, value]) => [key, [value]]),
          ),
        },
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
    } catch (err) {
      throw new HttpException(
        err?.response?.data?.errorMessage ??
          'Failed to update Keycloak user attributes',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async setPassword(email: string, newPassword: string): Promise<void> {
    const [adminToken, userId] = await Promise.all([
      this.getAdminToken(),
      this.findUserIdByEmail(email),
    ]);
    if (!userId) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    try {
      await axios.put(
        `${this.adminUrl}/users/${userId}/reset-password`,
        { type: 'password', value: newPassword, temporary: false },
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
    } catch (err) {
      throw new HttpException(
        err?.response?.data?.errorMessage ??
          'Failed to update Keycloak password',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Asks Keycloak to email the account holder a one-time UPDATE_PASSWORD
   * action link. Keycloak generates the link, sends it, and collects the
   * new password itself — no credential passes through this service, and
   * the user's current password stays valid until they follow the link.
   *
   * Requires realm SMTP (Realm settings -> Email); without it Keycloak
   * answers with an error and so does this — deliberately, see
   * AuthService.recoverPasswordRequest, which must fail closed rather than
   * fall back to handing a password to whoever asked. client_id/
   * redirect_uri are omitted, so the link lands on Keycloak's own
   * "account updated" page; pass them here if you want it to bounce back
   * into a frontend (the URI must be registered on that client).
   */
  async sendPasswordResetEmail(email: string): Promise<void> {
    const [adminToken, userId] = await Promise.all([
      this.getAdminToken(),
      this.findUserIdByEmail(email),
    ]);
    if (!userId) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }
    try {
      await axios.put(
        `${this.adminUrl}/users/${userId}/execute-actions-email`,
        ['UPDATE_PASSWORD'],
        { headers: { Authorization: `Bearer ${adminToken}` } },
      );
    } catch (err) {
      throw new HttpException(
        err?.response?.data?.errorMessage ??
          'Failed to send the password recovery email',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async deleteUser(email: string): Promise<void> {
    const [adminToken, userId] = await Promise.all([
      this.getAdminToken(),
      this.findUserIdByEmail(email),
    ]);
    if (!userId) {
      // Already gone (or never existed in Keycloak) — deleteCompanyUser's
      // local-side cleanup should still proceed.
      return;
    }
    await axios.delete(`${this.adminUrl}/users/${userId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
  }
}
