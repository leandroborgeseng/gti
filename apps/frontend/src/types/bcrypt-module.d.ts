/**
 * Com `paths` a apontar `bcrypt` para `./node_modules/bcrypt`, o TS deixa de ligar
 * automaticamente a `@types/bcrypt`. Declaração mínima para `next build` + arquivos `@gestao/*`.
 */
declare module "bcrypt" {
  export function hash(data: string | Buffer, saltOrRounds: string | number): Promise<string>;
  export function compare(data: string | Buffer, encrypted: string): Promise<boolean>;
}
