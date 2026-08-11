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

import { CompanyCategoryName } from 'src/common/company-category.constants';

export interface RegisterAuthDto {
  industry: string;
  company_name: string;
  registration_number: string;
  // Assigned by CompanyService.createCompany from the ICID mint response
  // (urn_id), never by the caller — anything sent here is overwritten before
  // it is read. Optional so the request contract doesn't demand a value that
  // has no effect; the property stays on the interface because the service
  // writes it in place and everything downstream reads it back.
  company_ifric_id?: string;
  address_1: string;
  city: string;
  country: string;
  zip: string;
  admin_name: string;
  position: string;
  email: string;
  company_size: string;
  // No `password` here on purpose: Company.password was dropped in
  // DropLocalAuthColumns1784546767848, and createCompany generates its own
  // temporary password for the admin's Keycloak account. A caller-supplied
  // one was silently discarded, so the field is gone rather than misleading.
  //
  // No `company_category_id` either: the category is resolved from
  // company_category by name and recorded on CompanyCategoryMapping, so an id
  // sent here matched no Company column and was dropped by TypeORM's create().
  company_category: CompanyCategoryName;
  meta_data: Record<string, any>;
  company_domain: string;
  newsLetter: boolean;
  company_logo: string;
  company_image: string;
}

export interface AddStatusDto {
  company_id: string;
  status: string;
}
