export interface RegisterAuthDto {
  industry: string;
  company_name: string;
  registration_number: string;
  company_ifric_id: string;
  address_1: string;
  city: string;
  country: string;
  zip: string;
  admin_name: string;
  position: string;
  email: string;
  password: string;
  company_size: string;
  company_category_id?: number;
  company_category: string;
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
