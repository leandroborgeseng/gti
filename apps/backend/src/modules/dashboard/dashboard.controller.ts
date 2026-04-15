import { Controller, Get } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get("summary")
  summary(): Promise<unknown> {
    return this.service.summary();
  }

  @Get("alerts")
  alerts(): Promise<unknown> {
    return this.service.alerts();
  }

  @Get("notifications")
  notifications(): Promise<unknown> {
    return this.service.notificationsPlaceholder();
  }
}
