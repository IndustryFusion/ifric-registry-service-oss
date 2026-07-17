export interface CompanyAssetDto {
  type: 'asset' | 'gateway' | 'server';
  company_ifric_id: string;
  asset_ifric_id?: string;
  gateway_ifric_id?: string;
  server_ifric_id?: string;
}
