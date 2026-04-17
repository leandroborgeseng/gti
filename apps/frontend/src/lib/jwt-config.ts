/** Alinhado com `apps/backend/src/auth/auth.module.ts` (Nest). */
export const JWT_SECRET_DEFAULT = "desenvolvimento-apenas-altere-em-producao";

export function jwtSecretBytes(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET?.trim() || JWT_SECRET_DEFAULT);
}

export function jwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN?.trim() || "7d";
}
