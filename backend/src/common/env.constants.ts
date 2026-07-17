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

if (!process.env.ICID_SERVICE_BACKEND_URL) {
  throw new Error('ICID_SERVICE_BACKEND_URL environment variable is required');
}
if (!process.env.COMPANY_DEFAULT_CODE) {
  throw new Error('COMPANY_DEFAULT_CODE environment variable is required');
}

// HEDERA_KEY_SECRET is optional — it's only used by the certificate
// feature (encrypting/decrypting the private key ICID returns). Its
// presence is what turns certificates on: see CertificateModule and
// CompanyService.getAllCompanies.
export const envConstants = {
  icidServiceBackendUrl: process.env.ICID_SERVICE_BACKEND_URL,
  hederaKeySecret: process.env.HEDERA_KEY_SECRET,
  companyDefaultCode: process.env.COMPANY_DEFAULT_CODE,
  certificatesEnabled: !!process.env.HEDERA_KEY_SECRET,
};
