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

// Single source of truth for the predefined company-category taxonomy.
// ScriptService seeds exactly these rows into company_categories, and
// CompanyService.createCompany/updateCompany reject any company_category
// that isn't one of them (see CompanyService.createCompany). Add new roles
// here rather than as free-form strings at the call site.
export const COMPANY_CATEGORY_NAMES = [
  'manufacturer',
  'machine_builder',
  'factory_owner',
  'user',
  'public',
  'service_provider',
  'retailer',
  'logistics',
  'recycler',
] as const;

export type CompanyCategoryName = (typeof COMPANY_CATEGORY_NAMES)[number];
