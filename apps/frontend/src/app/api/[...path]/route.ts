import { dispatchGestaoApi } from "@/server/gestao/gestao-dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request, ctx: { params: { path: string[] } }): Promise<Response> {
  return dispatchGestaoApi(req, ctx.params.path ?? []);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
