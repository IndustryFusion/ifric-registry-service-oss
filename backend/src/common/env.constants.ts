if (!process.env.ICID_SERVICE_BACKEND_URL) {
  throw new Error('ICID_SERVICE_BACKEND_URL environment variable is required');
}
if (!process.env.HEDERA_KEY_SECRET) {
  throw new Error('HEDERA_KEY_SECRET environment variable is required');
}
if (!process.env.COMPANY_DEFAULT_CODE) {
  throw new Error('COMPANY_DEFAULT_CODE environment variable is required');
}

export const envConstants = {
  icidServiceBackendUrl: process.env.ICID_SERVICE_BACKEND_URL,
  hederaKeySecret: process.env.HEDERA_KEY_SECRET,
  companyDefaultCode: process.env.COMPANY_DEFAULT_CODE,
};
