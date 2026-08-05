import { Controller, Get, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { DeadlinesService } from "./deadlines.service";

@Controller("deadlines")
export class DeadlinesController {
  constructor(private readonly service: DeadlinesService) {}

  @Get()
  list(
    @Query("origin") origin?: string,
    @Query("status") status?: string,
    @Query("attentionLevel") attentionLevel?: string,
    @Query("contractId") contractId?: string,
    @Query("responsibleUserId") responsibleUserId?: string,
    @Query("q") q?: string,
    @Query("includeCancelled") includeCancelled?: string
  ): Promise<unknown> {
    return this.service.list({
      origin,
      status,
      attentionLevel,
      contractId,
      responsibleUserId,
      q,
      includeCancelled: includeCancelled === "1" || includeCancelled === "true"
    });
  }

  @Post("recalculate")
  @Roles(UserRole.ADMIN)
  recalculate(): Promise<unknown> {
    return this.service.recalculate();
  }
}
