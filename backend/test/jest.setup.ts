// Dummy secrets so modules that fail fast on a missing required env var
// (see endpoints/auth/constants.ts, common/env.constants.ts) can be
// imported during unit tests. Never used for anything real.
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.ICID_SERVICE_BACKEND_URL ??= 'http://test-icid.local';
process.env.HEDERA_KEY_SECRET ??= 'test-hedera-key-secret-32-bytes!';
process.env.COMPANY_DEFAULT_CODE ??= 'ifx-eur-com';
