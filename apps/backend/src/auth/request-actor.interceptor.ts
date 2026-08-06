import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, from, switchMap } from "rxjs";
import { buildActiveContext, loadUserAccessContext, toRequestActor } from "../common/access-context";
import { type RequestActor, requestActorStore } from "../common/audit-actor";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RequestActorInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: { sub: string; email: string; role: string } }>();
    const u = req.user;

    if (!u?.sub) {
      const store: RequestActor = { userId: "anonymous", role: "VIEWER" };
      return new Observable((observer) => {
        requestActorStore.run(store, () => {
          const sub = next.handle().subscribe({
            next: (v) => observer.next(v),
            error: (err) => observer.error(err),
            complete: () => observer.complete()
          });
          return () => sub.unsubscribe();
        });
      });
    }

    return from(loadUserAccessContext(this.prisma, u.sub)).pipe(
      switchMap((accessUser) => {
        let store: RequestActor;
        if (!accessUser) {
          store = { userId: u.sub, email: u.email, role: u.role };
        } else {
          try {
            const ctx = buildActiveContext(accessUser);
            store = toRequestActor(
              {
                id: accessUser.id,
                email: accessUser.email,
                userKind: accessUser.userKind ?? "INTERNAL",
                supplierId: accessUser.supplierId ?? null,
                authorizedContractIds: (accessUser.externalContracts ?? []).map((c) => c.contractId)
              },
              ctx
            );
          } catch {
            store = { userId: u.sub, email: u.email, role: u.role, userKind: "INTERNAL" };
          }
        }
        return new Observable((observer) => {
          requestActorStore.run(store, () => {
            const sub = next.handle().subscribe({
              next: (v) => observer.next(v),
              error: (err) => observer.error(err),
              complete: () => observer.complete()
            });
            return () => sub.unsubscribe();
          });
        });
      })
    );
  }
}
