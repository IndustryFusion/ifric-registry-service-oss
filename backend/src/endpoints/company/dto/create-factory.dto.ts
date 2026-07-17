export interface CreateFactoryDto {
  factory_id: string;
  owner_company_ifric_id: string;
  location_name?: string;
  address_1?: string;
  city?: string;
  country?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}
