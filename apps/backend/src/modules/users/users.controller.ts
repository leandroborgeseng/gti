import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles-required.decorator";
import { CreateUserDto, UpdateUserDto } from "./users.dto";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  findAll(): Promise<unknown> {
    return this.service.findAll();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto): Promise<unknown> {
    return this.service.create(dto);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  update(@Param("id") id: string, @Body() dto: UpdateUserDto): Promise<unknown> {
    return this.service.update(id, dto);
  }
}
