import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";
import { type RequestActor, requestActorStore } from "../common/audit-actor";

@Injectable()
export class RequestActorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: { sub: string; email: string; role: string } }>();
    const u = req.user;
    const store: RequestActor = u
      ? { userId: u.sub, email: u.email, role: u.role }
      : { userId: "anonymous", role: "VIEWER" };
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
}
