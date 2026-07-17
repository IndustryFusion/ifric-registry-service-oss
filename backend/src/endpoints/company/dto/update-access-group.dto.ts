export interface UpdateAccessGroupDto {
  group_name?: string;
  create?: boolean;
  read?: boolean;
  update?: boolean;
  delete?: boolean;
}
