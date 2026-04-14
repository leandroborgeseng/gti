import { Prisma } from "@prisma/client";

export interface GlpiAuthResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export interface NormalizedTicket {
  id: number;
  title: string | null;
  content: string | null;
  status: string | null;
  priority: string | null;
  date_creation: string | null;
  date_modification: string | null;
  contract_group_id: number | null;
  contract_group_name: string | null;
  raw: Prisma.InputJsonValue;
}
