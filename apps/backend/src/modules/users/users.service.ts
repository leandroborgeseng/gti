import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { UserApprovalStatus, UserRole } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateUserDto, UpdateMyProfileDto, UpdateUserDto } from "./users.dto";

const USER_SELECT = {
  id: true,
  email: true,
  cpf: true,
  firstName: true,
  lastName: true,
  displayName: true,
  profileColor: true,
  jobTitle: true,
  department: true,
  phone: true,
  organizationId: true,
  organization: { select: { id: true, name: true, acronym: true, active: true } },
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

function normalizeCpfDigits(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return digits;
}

function validateCpfDigits(cpf: string): void {
  if (cpf.length !== 11) {
    throw new BadRequestException("CPF deve conter 11 dígitos.");
  }
}

function maskCpf(cpf: string | null): string | null {
  if (!cpf || cpf.length !== 11) return null;
  return `***.***.***-${cpf.slice(-2)}`;
}

function resolveNameParts(dto: { fullName?: string; firstName?: string; lastName?: string }): {
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
} {
  if (dto.fullName?.trim()) {
    const parts = dto.fullName.trim().split(/\s+/);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ") || null;
    const displayName = [firstName, lastName].filter(Boolean).join(" ") || null;
    return { firstName: firstName || null, lastName, displayName };
  }
  const firstName = dto.firstName?.trim() || null;
  const lastName = dto.lastName?.trim() || null;
  const displayName = [firstName, lastName].filter(Boolean).join(" ") || null;
  return { firstName, lastName, displayName };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<
    Array<{
      id: string;
      email: string;
      cpfMasked: string | null;
      cpfDigits: string | null;
      firstName: string | null;
      lastName: string | null;
      displayName: string | null;
      profileColor: string | null;
      jobTitle: string | null;
      department: string | null;
      phone: string | null;
      organizationId: string | null;
      organization: { id: string; name: string; acronym: string; active: boolean } | null;
      role: UserRole;
      approvalStatus: UserApprovalStatus;
      mustChangePassword: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    const rows = await this.prisma.user.findMany({
      orderBy: { email: "asc" },
      select: USER_SELECT
    });
    return rows.map((row) => {
      const { cpf, ...rest } = row;
      return {
        ...rest,
        cpfMasked: maskCpf(cpf),
        cpfDigits: cpf
      };
    });
  }

  async create(dto: CreateUserDto): Promise<{
    id: string;
    email: string;
    cpfMasked: string | null;
    cpfDigits: string | null;
    firstName: string | null;
    lastName: string | null;
    displayName: string | null;
    profileColor: string | null;
    jobTitle: string | null;
    department: string | null;
    phone: string | null;
    organizationId: string | null;
    organization: { id: string; name: string; acronym: string; active: boolean } | null;
    role: UserRole;
    approvalStatus: UserApprovalStatus;
    mustChangePassword: boolean;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } }
    });
    if (exists) {
      throw new ConflictException("Já existe usuário com este e-mail.");
    }
    const cpf = normalizeCpfDigits(dto.cpf);
    if (cpf) {
      validateCpfDigits(cpf);
      const cpfTaken = await this.prisma.user.findUnique({ where: { cpf } });
      if (cpfTaken) throw new ConflictException("Já existe usuário com este CPF.");
    }
    if (dto.organizationId) {
      await this.ensureOrganization(dto.organizationId);
    }
    const names = resolveNameParts(dto);
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.user.create({
      data: {
        email,
        cpf,
        ...names,
        organizationId: dto.organizationId ?? null,
        passwordHash,
        mustChangePassword: true,
        approvalStatus: UserApprovalStatus.APPROVED,
        role: dto.role ?? UserRole.EDITOR
      },
      select: USER_SELECT
    });
    return { ...created, cpfMasked: maskCpf(created.cpf), cpfDigits: created.cpf };
  }

  async update(id: string, dto: UpdateUserDto): Promise<unknown> {
    const prev = await this.prisma.user.findUnique({ where: { id } });
    if (!prev) {
      throw new NotFoundException("Usuário não encontrado");
    }
    if (dto.cpf !== undefined) {
      const cpf = normalizeCpfDigits(dto.cpf);
      if (cpf) {
        validateCpfDigits(cpf);
        const cpfTaken = await this.prisma.user.findFirst({
          where: { cpf, id: { not: id } }
        });
        if (cpfTaken) throw new ConflictException("Já existe usuário com este CPF.");
      }
    }
    if (dto.organizationId) {
      await this.ensureOrganization(dto.organizationId);
    }
    const passwordHash =
      dto.password !== undefined && dto.password !== "" ? await bcrypt.hash(dto.password, 10) : undefined;
    const names =
      dto.fullName !== undefined || dto.firstName !== undefined || dto.lastName !== undefined
        ? resolveNameParts(dto)
        : null;
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        role: dto.role ?? undefined,
        approvalStatus: dto.approvalStatus ?? undefined,
        cpf: dto.cpf === undefined ? undefined : normalizeCpfDigits(dto.cpf),
        organizationId: dto.organizationId === undefined ? undefined : dto.organizationId,
        ...(names
          ? {
              firstName: names.firstName,
              lastName: names.lastName,
              displayName: names.displayName
            }
          : {}),
        ...(passwordHash ? { passwordHash, mustChangePassword: true } : {})
      },
      select: USER_SELECT
    });
    return { ...updated, cpfMasked: maskCpf(updated.cpf), cpfDigits: updated.cpf };
  }

  async updateMyProfile(
    id: string,
    dto: UpdateMyProfileDto
  ): Promise<{ id: string; email: string; firstName: string | null; lastName: string | null; displayName: string | null; profileColor: string | null; jobTitle: string | null; department: string | null; phone: string | null; role: UserRole; approvalStatus: UserApprovalStatus; mustChangePassword: boolean; createdAt: Date; updatedAt: Date }> {
    const firstName = typeof dto.firstName === "string" ? dto.firstName.trim() : "";
    const lastName = typeof dto.lastName === "string" ? dto.lastName.trim() : "";
    const displayName = [firstName, lastName].filter(Boolean).join(" ");
    const profileColor = typeof dto.profileColor === "string" ? dto.profileColor.trim().toLowerCase() : "";
    const jobTitle = typeof dto.jobTitle === "string" ? dto.jobTitle.trim() : "";
    const department = typeof dto.department === "string" ? dto.department.trim() : "";
    const phone = typeof dto.phone === "string" ? dto.phone.trim() : "";
    if (firstName.length > 40) {
      throw new BadRequestException("O nome deve ter no máximo 40 caracteres.");
    }
    if (lastName.length > 60) {
      throw new BadRequestException("O sobrenome deve ter no máximo 60 caracteres.");
    }
    if (jobTitle.length > 80) {
      throw new BadRequestException("O cargo/função deve ter no máximo 80 caracteres.");
    }
    if (department.length > 80) {
      throw new BadRequestException("O setor/unidade deve ter no máximo 80 caracteres.");
    }
    if (phone.length > 40) {
      throw new BadRequestException("O telefone/ramal deve ter no máximo 40 caracteres.");
    }
    if (profileColor && !PROFILE_COLORS.has(profileColor)) {
      throw new BadRequestException("Selecione uma cor válida da paleta.");
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        firstName: firstName || null,
        lastName: lastName || null,
        displayName: displayName || null,
        profileColor: profileColor || null,
        jobTitle: jobTitle || null,
        department: department || null,
        phone: phone || null
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        displayName: true,
        profileColor: true,
        jobTitle: true,
        department: true,
        phone: true,
        role: true,
        approvalStatus: true,
        mustChangePassword: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  private async ensureOrganization(organizationId: string): Promise<void> {
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new BadRequestException("Órgão não encontrado.");
  }
}
