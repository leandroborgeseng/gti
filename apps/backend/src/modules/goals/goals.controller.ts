import { Body, Controller, Get, Param, Post, Put } from "@nestjs/common";
import {
  CreateGoalActionDto,
  CreateGoalDto,
  LinkGoalDto,
  ManualProgressDto,
  UpdateGoalActionDto,
  UpdateGoalDto
} from "./goals.dto";
import { GoalsService } from "./goals.service";

@Controller("goals")
export class GoalsController {
  constructor(private readonly service: GoalsService) {}

  @Post()
  create(@Body() dto: CreateGoalDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Get()
  findAll(): Promise<unknown> {
    return this.service.findAll();
  }

  @Get("dashboard")
  dashboard(): Promise<unknown> {
    return this.service.dashboard();
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.service.findOne(id);
  }

  @Put(":id")
  update(@Param("id") id: string, @Body() dto: UpdateGoalDto): Promise<unknown> {
    return this.service.update(id, dto);
  }

  @Post(":id/actions")
  addAction(@Param("id") id: string, @Body() dto: CreateGoalActionDto): Promise<unknown> {
    return this.service.addAction(id, dto);
  }

  @Put(":id/actions/:actionId")
  updateAction(@Param("id") id: string, @Param("actionId") actionId: string, @Body() dto: UpdateGoalActionDto): Promise<unknown> {
    return this.service.updateAction(id, actionId, dto);
  }

  @Post(":id/manual-progress")
  setManualProgress(@Param("id") id: string, @Body() dto: ManualProgressDto): Promise<unknown> {
    return this.service.setManualProgress(id, dto);
  }

  @Post(":id/links")
  link(@Param("id") id: string, @Body() dto: LinkGoalDto): Promise<unknown> {
    return this.service.link(id, dto);
  }
}
