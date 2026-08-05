/**
 * Identidade visual e nomenclatura do SIGTI · ponto único de configuração.
 * Alterar aqui reflete em login, menu, metadados, e-mails e textos ao usuário.
 */

export const BRAND = {
  /** Sigla exibida junto ao símbolo. */
  shortName: "SIGTI",
  /** Nome completo institucional. */
  fullName: "Sistema Integrado de Gestão de Tecnologia da Informação",
  /** Separador institucional entre sigla e nome completo (ponto mediano · ticket 32). */
  nameSeparator: "·",
  /**
   * Separador da tela de login (hífen · ticket 24).
   * Demais superfícies usam `nameSeparator` / `displayTitle`.
   */
  loginNameSeparator: "-",
  /** Título composto (metadados, e-mails, sidebar). */
  get displayTitle(): string {
    return `${this.shortName} ${this.nameSeparator} ${this.fullName}`;
  },
  /** Título da tela de login (hífen simples, conforme identidade pedida no ticket 24). */
  get loginTitle(): string {
    return `${this.shortName} ${this.loginNameSeparator} ${this.fullName}`;
  },
  /** Título curto para abas e PWA short_name. */
  get tabTitle(): string {
    return this.shortName;
  },
  /** Template de título do documento: «Página · SIGTI». */
  get titleTemplate(): string {
    return `%s · ${this.shortName}`;
  },
  description:
    "Contratos, chamados, medições, metas e projetos em um ambiente único de acompanhamento operacional.",
  /** Arquivo oficial da marca em `public/brand/`. */
  logoSrc: "/brand/sigti-logo.png",
  logoAlt: "Prefeitura de Franca · marca institucional do SIGTI",
  /** Dimensões intrínsecas do ficheiro oficial (quadrado). */
  logoWidth: 900,
  logoHeight: 900,
  /** Remetente de e-mail quando RESEND_FROM não está definido. */
  emailFromName: "SIGTI",
  /** Assunto/corpo de e-mails transacionais. */
  emailProductName: "SIGTI"
} as const;

export type BrandConfig = typeof BRAND;
