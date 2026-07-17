interface Product {
  product: string;
  product_roles?: string[];
  last_active?: string;
  user_role: string;
}

export interface UserAccessDto {
  company_ifric_id: string;
  user_name: string;
  user_email: string;
  user_password: string;
  products: Product[];
}

export interface userDetailsByMail {
  company_ifric_id: string;
  user_email: string;
}
