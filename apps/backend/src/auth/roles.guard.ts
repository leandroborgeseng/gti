import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { ROLES_KEY } from "./roles-required.decorator";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()]);
    if (isPublic) {
      return true;
    }
    const req = context.switchToHttp().getRequest<{ method?: string; user?: { role: UserRole } }>();
    const user = req.user as { role: UserRole } | undefined;
    if (!user) {
      return false;
    }
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(user.role)) {
        throw new ForbiddenException("Sem permissão para esta operação");
      }
      return true;
    }
    const method = (req.method ?? "GET").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      return true;
    }
    if (user.role === UserRole.VIEWER) {
      throw new ForbiddenException("Perfil apenas de leitura não pode alterar dados");
    }
    return user.role === UserRole.ADMIN || user.role === UserRole.EDITOR;
  }
}
