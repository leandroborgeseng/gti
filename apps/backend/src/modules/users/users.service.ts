import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto, UpdateUserDto } from "./users.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Array<{ id: string; email: string; role: UserRole; createdAt: Date; updatedAt: Date }>> {
    return this.prisma.user.findMany({
      orderBy: { email: "asc" },
      select: { id: true, email: true, role: true, createdAt: true, updatedAt: true }
    });
  }

  async create(dto: CreateUserDto): Promise<{ id: string; email: string; role: UserRole; createdAt: Date; updatedAt: Date }> {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) {
      throw new ConflictException("Já existe utilizador com este e-mail");
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        role: dto.role ?? UserRole.EDITOR
      },
      select: { id: true, email: true, role: true, createdAt: true, updatedAt: true }
    });
    return created;
  }

  async update(
    id: string,
    dto: UpdateUserDto
  ): Promise<{ id: string; email: string; role: UserRole; createdAt: Date; updatedAt: Date }> {
    const prev = await this.prisma.user.findUnique({ where: { id } });
    if (!prev) {
      throw new NotFoundException("Utilizador não encontrado");
    }
    const passwordHash =
      dto.password !== undefined && dto.password !== "" ? await bcrypt.hash(dto.password, 10) : undefined;
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        role: dto.role ?? undefined,
        ...(passwordHash ? { passwordHash } : {})
      },
      select: { id: true, email: true, role: true, createdAt: true, updatedAt: true }
    });
    return updated;
  }
}
