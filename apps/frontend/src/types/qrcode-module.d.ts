/**
 * Importado desde `apps/backend` (externalDir). No Docker não há
 * `apps/backend/node_modules`; o `paths` aponta para o qrcode do frontend.
 */
declare module "qrcode" {
  export function toDataURL(
    text: string,
    options?: {
      margin?: number;
      width?: number;
      errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    }
  ): Promise<string>;
}
