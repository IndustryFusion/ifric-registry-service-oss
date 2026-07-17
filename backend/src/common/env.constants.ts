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
