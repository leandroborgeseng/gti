/** Política de senha do SIGTI (troca obrigatória e redefinição). */

export const PASSWORD_POLICY_HINTS = [
  "Mínimo de 8 caracteres",
  "Pelo menos 1 letra maiúscula",
  "Pelo menos 1 letra minúscula",
  "Pelo menos 1 número",
  "Pelo menos 1 caractere especial (ex.: !@#$%&*)"
] as const;

export type PasswordPolicyResult = { ok: true } | { ok: false; message: string };

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  if (password.length < 8) {
    return { ok: false, message: "A senha deve ter pelo menos 8 caracteres." };
  }
  if (!/[A-ZÀ-Ý]/.test(password)) {
    return { ok: false, message: "A senha deve conter pelo menos 1 letra maiúscula." };
  }
  if (!/[a-zà-ÿ]/.test(password)) {
    return { ok: false, message: "A senha deve conter pelo menos 1 letra minúscula." };
  }
  if (!/[0-9]/.test(password)) {
    return { ok: false, message: "A senha deve conter pelo menos 1 número." };
  }
  if (!/[^A-Za-zÀ-ÿ0-9\s]/.test(password)) {
    return { ok: false, message: "A senha deve conter pelo menos 1 caractere especial." };
  }
  return { ok: true };
}

export function passwordPolicyChecklist(password: string): Array<{ label: string; met: boolean }> {
  return [
    { label: PASSWORD_POLICY_HINTS[0], met: password.length >= 8 },
    { label: PASSWORD_POLICY_HINTS[1], met: /[A-ZÀ-Ý]/.test(password) },
    { label: PASSWORD_POLICY_HINTS[2], met: /[a-zà-ÿ]/.test(password) },
    { label: PASSWORD_POLICY_HINTS[3], met: /[0-9]/.test(password) },
    { label: PASSWORD_POLICY_HINTS[4], met: /[^A-Za-zÀ-ÿ0-9\s]/.test(password) }
  ];
}
