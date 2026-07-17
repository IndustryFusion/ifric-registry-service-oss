export interface UpdateUserDetails {
  company_ifric_id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  user_image?: string;
  old_password?: string;
  new_password?: string;
  jwt_token?: string;
}
