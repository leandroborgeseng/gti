import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { UserApprovalStatus, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto, UpdateMyProfileDto, UpdateUserDto } from "./users.dto";

const USER_SELECT = {
  id: true,
  email: true,
  displayName: true,
  profileColor: true,
  role: true,
  approvalStatus: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true
} as const;

const PROFILE_COLORS = new Set([
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#dc2626",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#0891b2",
  "#475569",
  "#111827"
]);

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Array<{ id: string; email: string; displayName: string | null; profileColor: string | null; role: UserRole; approvalStatus: UserApprovalStatus; mustChangePassword: boolean; createdAt: Date; updatedAt: Date }>> {
    return this.prisma.user.findMany({
      orderBy: { email: "asc" },
      select: USER_SELECT
    });
  }

  async create(dto: CreateUserDto): Promise<{ id: string; email: string; displayName: string | null; profileColor: string | null; role: UserRole; approvalStatus: UserApprovalStatus; mustChangePassword: boolean; createdAt: Date; updatedAt: Date }> {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) {
      throw new ConflictException("Já existe usuário com este e-mail");
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        mustChangePassword: true,
        approvalStatus: UserApprovalStatus.APPROVED,
        role: dto.role ?? UserRole.EDITOR
      },
      select: USER_SELECT
    });
    return created;
  }

  async update(
    id: string,
    dto: UpdateUserDto
  ): Promise<{ id: string; email: string; displayName: string | null; profileColor: string | null; role: UserRole; approvalStatus: UserApprovalStatus; mustChangePassword: boolean; createdAt: Date; updatedAt: Date }> {
    const prev = await this.prisma.user.findUnique({ where: { id } });
    if (!prev) {
      throw new NotFoundException("Usuário não encontrado");
    }
    const passwordHash =
      dto.password !== undefined && dto.password !== "" ? await bcrypt.hash(dto.password, 10) : undefined;
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        role: dto.role ?? undefined,
        approvalStatus: dto.approvalStatus ?? undefined,
        ...(passwordHash ? { passwordHash, mustChangePassword: true } : {})
      },
      select: USER_SELECT
    });
    return updated;
  }

  async updateMyProfile(
    id: string,
    dto: UpdateMyProfileDto
  ): Promise<{ id: string; email: string; displayName: string | null; profileColor: string | null; role: UserRole; approvalStatus: UserApprovalStatus; mustChangePassword: boolean; createdAt: Date; updatedAt: Date }> {
    const displayName = typeof dto.displayName === "string" ? dto.displayName.trim() : "";
    const profileColor = typeof dto.profileColor === "string" ? dto.profileColor.trim().toLowerCase() : "";
    if (displayName.length > 80) {
      throw new BadRequestException("O nome de exibição deve ter no máximo 80 caracteres.");
    }
    if (profileColor && !PROFILE_COLORS.has(profileColor)) {
      throw new BadRequestException("Selecione uma cor válida da paleta.");
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        displayName: displayName || null,
        profileColor: profileColor || null
      },
      select: USER_SELECT
    });
  }
}
