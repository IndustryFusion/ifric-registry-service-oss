//
// Copyright (c) 2026 IndustryFusion Europe UG
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

export interface CreateFactoryDto {
  /**
   * Optional since factory identifiers became centrally minted. Supplied, it
   * is used as-is — that is how every factory registered before the mint
   * existed, and those ids remain valid. Omitted, one is minted from
   * factory_key.
   */
  factory_id?: string;
  /**
   * The caller's stable handle for this factory, used to derive the minted
   * identifier. Required when factory_id is absent, and never stored: it is
   * an input to the identifier, not a column.
   */
  factory_key?: string;
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
