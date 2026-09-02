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

import { EntityManager } from 'typeorm';
import { RegisterAuthDto } from '../auth/dto/register-auth.dto';

/** What a registration hook is told about the company that was just created. */
export interface CompanyRegistrationEvent {
  /** The registration payload, including the IFRIC id assigned by icid-service. */
  data: RegisterAuthDto;
  /** Primary key of the new `companies` row. */
  companyId: string;
  /** Primary key of the new `company_users` row for the admin. */
  userId: string;
  /**
   * The generated first-login password. Present so a deployment can deliver
   * it however it delivers credentials; this service does not send mail.
   */
  temporaryPassword: string;
  /**
   * The registration transaction's manager. Rows written through it are
   * committed with the registration and rolled back with it, so a deployment
   * storing its own per-company records (a subscription, an entitlement) gets
   * the same all-or-nothing guarantee as the company itself. Writing through
   * a repository instead would put those rows in their own transaction, and
   * a later failure would strand them.
   */
  manager: EntityManager;
}

/**
 * Lets a deployment attach its own work to company registration — a CRM
 * record, a welcome email, a billing account — without that work living in
 * this service, and without it being able to leave a half-registered company
 * behind.
 *
 * `onCompanyRegistered` runs **inside the registration transaction**, before
 * the commit. Throwing from it rolls the whole registration back: the
 * company, its admin user, its access groups, and the IFRIC id reserved with
 * icid-service. That is the point of the hook running where it does — a
 * deployment whose CRM refuses the record can refuse the registration, rather
 * than being left to reconcile it afterwards.
 *
 * `onRegistrationRolledBack` is the other half. Anything the hook created
 * outside this database is not covered by the rollback, so it is called when
 * the registration fails — including when the failure came from the hook
 * itself, since a hook can fail after it has already created something. It
 * must be safe to call when nothing was created, and its own errors are
 * logged and swallowed: a failed compensation must not mask the original
 * error, which is what the caller actually needs to see.
 *
 * No implementation is bound by default, so this service behaves exactly as
 * it did before unless a deployment provides one.
 */
export interface CompanyRegistrationHook {
  onCompanyRegistered(event: CompanyRegistrationEvent): Promise<void>;
  onRegistrationRolledBack(event: CompanyRegistrationEvent): Promise<void>;
}

/**
 * Injection token for the optional hook above. Bind it in a deployment's own
 * module: `{ provide: COMPANY_REGISTRATION_HOOK, useClass: MyHook }`.
 */
export const COMPANY_REGISTRATION_HOOK = Symbol('COMPANY_REGISTRATION_HOOK');
