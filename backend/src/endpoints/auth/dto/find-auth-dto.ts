export interface FindOneAuthDto {
  email: string;
  password: string;
  product_name: string;
}

export interface FindIndexedDbAuthDto {
  email: string;
  product_name: string;
  company_id: string;
}
