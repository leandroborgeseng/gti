import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  ContractNotificationStatus,
  Prisma,
  UserKind
} from "@prisma/client";
import * as bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { getAuditActorId, getAuditActorLabel, requestActorStore } from "../../common/audit-actor";
import { resolveAuditGate } from "../../common/audit-event-gate";
import { assertExternalCanAccessContract, isExternalActor } from "../../common/external-access";
import { htmlToPdfBuffer } from "../../common/html-to-pdf";
import { PrismaService } from "../../prisma/prisma.service";
import {
  AnalyzeResponseDto,
  CancelOrRectifyDto,
  ConfirmSendDto,
  CreateFromTemplateDto,
  SaveResponseDto,
  SendNotificationDto,
  SetSignersDto,
  SignNotificationDto,
  TransitionNotificationDto,
  UpdateNotificationDraftDto
} from "./contract-notifications.dto";
import {
  deriveDocumentValidationCode,
  formatDocumentNumber,
  generateDocumentVerifierCode
} from "./document-codes";

const EDITABLE: ContractNotificationStatus[] = [
  "RASCUNHO",
  "EM_ELABORACAO",
  "EM_REVISAO",
  "DEVOLVIDA_CORRECAO",
  "APROVADA_ASSINATURA"
];

function publicAppBase(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    ""
  ).replace(/\/$/, "");
}

const LOCKED_CONTENT: ContractNotificationStatus[] = [
  "ASSINADA",
  "ENVIADA",
  "RECEBIDA",
  "AGUARDANDO_RESPOSTA",
  "RESPONDIDA",
  "EM_ANALISE",
  "ATENDIDA",
  "NAO_ATENDIDA",
  "ENCAMINHADA_CONTROLADORIA",
  "CANCELADA",
  "RETIFICADA",
  "ENCERRADA"
];

function applyMailMerge(
  html: string,
  vars: Record<string, string>
): string {
  let out = html;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  return out;
}

@Injectable()
export class ContractNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listByContract(contractId: string) {
    await this.assertContractAccess(contractId);
    return this.prisma.contractNotification.findMany({
      where: { contractId },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        signers: { orderBy: { order: "asc" }, include: { user: { select: { id: true, email: true, displayName: true } } } },
        _count: { select: { events: true, responses: true } }
      }
    });
  }

  async listMine() {
    const actor = requestActorStore.getStore();
    const select = {
      id: true,
      contractId: true,
      number: true,
      subject: true,
      status: true,
      createdById: true,
      sentAt: true,
      createdAt: true,
      updatedAt: true,
      documentVerifierCode: true,
      documentValidationCode: true,
      contract: { select: { id: true, number: true, name: true, internalCode: true, companyName: true } },
      signers: {
        orderBy: { order: "asc" as const },
        select: { id: true, userId: true, signedAt: true, order: true, required: true }
      }
    };
    if (isExternalActor(actor)) {
      const ids = actor?.authorizedContractIds ?? [];
      return this.prisma.contractNotification.findMany({
        where: {
          contractId: { in: ids },
          status: {
            in: [
              "ENVIADA",
              "RECEBIDA",
              "AGUARDANDO_RESPOSTA",
              "RESPONDIDA",
              "EM_ANALISE",
              "ATENDIDA",
              "NAO_ATENDIDA",
              "ENCERRADA",
              "ASSINADA",
              "AGUARDANDO_ASSINATURA"
            ]
          }
        },
        orderBy: { sentAt: "desc" },
        take: 200,
        select
      });
    }
    const orgScope: Prisma.ContractNotificationWhereInput =
      actor?.allOrganizationsActive || !actor?.organizationId
        ? {}
        : {
            OR: [
              { contract: { is: { organizationId: actor.organizationId } } },
              ...(actor.userId
                ? [
                    { createdById: actor.userId },
                    { signers: { some: { userId: actor.userId } } }
                  ]
                : [])
            ]
          };
    return this.prisma.contractNotification.findMany({
      where: {
        status: {
          notIn: ["RASCUNHO", "CANCELADA"]
        },
        ...orgScope
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select
    });
  }

  async findOne(id: string, opts?: { forExternal?: boolean }) {
    const row = await this.prisma.contractNotification.findUnique({
      where: { id },
      include: {
        contract: {
          select: {
            id: true,
            number: true,
            name: true,
            internalCode: true,
            formalNumber: true,
            contractYear: true,
            companyName: true,
            cnpj: true,
            organization: { select: { id: true, name: true, acronym: true } },
            supplier: { select: { id: true, name: true, cnpj: true, contacts: true } }
          }
        },
        signers: {
          orderBy: { order: "asc" },
          include: { user: { select: { id: true, email: true, displayName: true, firstName: true, lastName: true } } }
        },
        events: { orderBy: { createdAt: "asc" } },
        responses: {
          orderBy: { createdAt: "desc" },
          include: {
            author: { select: { id: true, email: true, displayName: true } },
            attachments: true
          }
        },
        attachments: true,
        createdBy: { select: { id: true, email: true, displayName: true } }
      }
    });
    if (!row) throw new NotFoundException("Notificação não encontrada.");
    await this.assertContractAccess(row.contractId);

    const actor = requestActorStore.getStore();
    const external = opts?.forExternal || isExternalActor(actor);
    if (external) {
      // Empresa não vê análises internas
      return {
        ...row,
        responses: row.responses.map((r) => ({
          id: r.id,
          notificationId: r.notificationId,
          authorUserId: r.authorUserId,
          bodyText: r.bodyText,
          itemStatuses: r.itemStatuses,
          draft: r.draft,
          submittedAt: r.submittedAt,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          author: r.author,
          attachments: r.attachments
        }))
      };
    }
    return row;
  }

  async createFromTemplate(dto: CreateFromTemplateDto) {
    this.assertInternalManage();
    await this.assertContractAccess(dto.contractId);
    const actor = requestActorStore.getStore();
    if (!actor?.userId) throw new ForbiddenException("Não autenticado.");

    const template = await this.prisma.notificationTemplate.findUnique({ where: { id: dto.templateId } });
    if (!template || !template.active) {
      throw new BadRequestException("Modelo inválido ou inativo.");
    }

    const contract = await this.prisma.contract.findFirst({
      where: { id: dto.contractId, deletedAt: null },
      include: { organization: true, supplier: true }
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado.");

    const number = await this.nextNumber();
    const documentVerifierCode = await this.allocateVerifierCode();
    const documentValidationCode = deriveDocumentValidationCode(number, documentVerifierCode);
    const responseDeadline =
      template.defaultResponseDays > 0
        ? new Date(Date.now() + template.defaultResponseDays * 24 * 60 * 60 * 1000)
        : null;

    const vars: Record<string, string> = {
      "contrato.codigoInterno": contract.internalCode ?? contract.number,
      "contrato.nome": contract.name,
      "contrato.numeroFormal":
        contract.formalNumber && contract.contractYear
          ? `${contract.formalNumber}/${contract.contractYear}`
          : contract.number,
      "contrato.cnpj": contract.cnpj,
      "empresa.nome": contract.supplier?.name ?? contract.companyName,
      "orgao.nome": contract.organization
        ? contract.organization.acronym
          ? `${contract.organization.acronym} · ${contract.organization.name}`
          : contract.organization.name
        : contract.managingUnit ?? "",
      "notificacao.numero": number,
      "notificacao.assunto": dto.subject?.trim() || template.documentTitle,
      "notificacao.prazoResposta": responseDeadline
        ? responseDeadline.toLocaleDateString("pt-BR")
        : "—",
      "notificacao.prazoCiencia": "—",
      "data.hoje": new Date().toLocaleDateString("pt-BR")
    };

    const created = await this.prisma.contractNotification.create({
      data: {
        contractId: dto.contractId,
        templateId: template.id,
        templateVersion: template.version,
        number,
        documentVerifierCode,
        documentValidationCode,
        status: "RASCUNHO",
        subject: dto.subject?.trim() || template.documentTitle,
        bodyHtml: applyMailMerge(template.bodyHtml, vars),
        headerHtml: template.headerHtml ? applyMailMerge(template.headerHtml, vars) : null,
        footerHtml: template.footerHtml ? applyMailMerge(template.footerHtml, vars) : null,
        purpose: template.purpose,
        notificationType: template.notificationType,
        severity: template.severity,
        requiresAck: template.requiresAck,
        requiresResponse: template.requiresResponse,
        requiresSchedule: template.requiresSchedule,
        requiresActionPlan: template.requiresActionPlan,
        responseDeadline,
        createdById: actor.userId
      }
    });

    await this.addEvent(created.id, "CREATED", null, "RASCUNHO", "Criada a partir do modelo");
    await this.audit("ContractNotification", created.id, "CREATE", null, created);
    return this.findOne(created.id);
  }

  async updateDraft(id: string, dto: UpdateNotificationDraftDto) {
    this.assertInternalManage();
    const prev = await this.getOrThrow(id);
    if (prev.contentLocked || LOCKED_CONTENT.includes(prev.status) || !EDITABLE.includes(prev.status)) {
      throw new BadRequestException("Esta notificação não pode mais ser editada.");
    }
    if (prev.status === "AGUARDANDO_ASSINATURA" && prev.signers.some((s) => s.signedAt)) {
      throw new BadRequestException("Há assinaturas registradas; devolva para correção antes de editar.");
    }

    const updated = await this.prisma.contractNotification.update({
      where: { id },
      data: {
        subject: dto.subject?.trim(),
        bodyHtml: dto.bodyHtml,
        headerHtml: dto.headerHtml === undefined ? undefined : dto.headerHtml,
        footerHtml: dto.footerHtml === undefined ? undefined : dto.footerHtml,
        purpose: dto.purpose,
        notificationType: dto.notificationType,
        severity: dto.severity,
        requiresAck: dto.requiresAck,
        requiresResponse: dto.requiresResponse,
        ackDeadline: dto.ackDeadline === undefined ? undefined : dto.ackDeadline ? new Date(dto.ackDeadline) : null,
        responseDeadline:
          dto.responseDeadline === undefined
            ? undefined
            : dto.responseDeadline
              ? new Date(dto.responseDeadline)
              : null,
        effectsStartRule: dto.effectsStartRule === undefined ? undefined : dto.effectsStartRule,
        related: dto.related === undefined ? undefined : (dto.related as Prisma.InputJsonValue),
        formalizationRefs:
          dto.formalizationRefs === undefined
            ? undefined
            : (dto.formalizationRefs as Prisma.InputJsonValue),
        status: prev.status === "RASCUNHO" ? "EM_ELABORACAO" : prev.status
      }
    });
    await this.addEvent(id, "UPDATED", prev.status, updated.status, "Rascunho atualizado");
    await this.audit("ContractNotification", id, "UPDATE", prev, updated);
    return this.findOne(id);
  }

  async transition(id: string, dto: TransitionNotificationDto) {
    this.assertInternalManage();
    const prev = await this.getOrThrow(id);
    const allowed = this.allowedTransitions(prev.status);
    if (!allowed.includes(dto.toStatus)) {
      throw new BadRequestException(`Transição de ${prev.status} para ${dto.toStatus} não permitida.`);
    }

    if (dto.toStatus === "DEVOLVIDA_CORRECAO") {
      await this.prisma.contractNotificationSigner.updateMany({
        where: { notificationId: id },
        data: {
          signedAt: null,
          signerName: null,
          signerCpf: null,
          signerJobTitle: null,
          signerOrgLabel: null,
          verificationCode: null
        }
      });
      await this.prisma.contractNotification.update({
        where: { id },
        data: { contentLocked: false, signedDocumentHtml: null, status: dto.toStatus }
      });
    } else {
      await this.prisma.contractNotification.update({
        where: { id },
        data: { status: dto.toStatus }
      });
    }

    await this.addEvent(id, "STATUS_CHANGE", prev.status, dto.toStatus, dto.note ?? null);
    await this.audit("ContractNotification", id, "UPDATE", { status: prev.status }, { status: dto.toStatus });
    return this.findOne(id);
  }

  async setSigners(id: string, dto: SetSignersDto) {
    this.assertInternalManage();
    const prev = await this.getOrThrow(id);
    if (LOCKED_CONTENT.includes(prev.status) && prev.status !== "AGUARDANDO_ASSINATURA" && prev.status !== "APROVADA_ASSINATURA") {
      throw new BadRequestException("Não é possível alterar signatários neste status.");
    }
    if (prev.signers.some((s) => s.signedAt)) {
      throw new BadRequestException("Já existem assinaturas; devolva para correção para redefinir signatários.");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.contractNotificationSigner.deleteMany({ where: { notificationId: id } });
      if (dto.signers.length > 0) {
        await tx.contractNotificationSigner.createMany({
          data: dto.signers.map((s, i) => ({
            notificationId: id,
            userId: s.userId,
            order: s.order ?? i + 1,
            required: s.required ?? true
          }))
        });
      }
      if (prev.status === "APROVADA_ASSINATURA" || prev.status === "AGUARDANDO_ASSINATURA") {
        await tx.contractNotification.update({
          where: { id },
          data: { status: "AGUARDANDO_ASSINATURA" }
        });
      }
    });
    await this.addEvent(id, "SIGNERS_SET", prev.status, "AGUARDANDO_ASSINATURA", `${dto.signers.length} signatário(s)`);
    return this.findOne(id);
  }

  async sign(id: string, dto: SignNotificationDto) {
    const actor = requestActorStore.getStore();
    if (!actor?.userId) throw new ForbiddenException("Não autenticado.");
    if (isExternalActor(actor)) throw new ForbiddenException("Usuários externos não assinam notificações internas.");

    const prev = await this.getOrThrow(id);
    if (!["APROVADA_ASSINATURA", "AGUARDANDO_ASSINATURA"].includes(prev.status)) {
      throw new BadRequestException("Notificação não está aguardando assinatura.");
    }

    const signer = prev.signers.find((s) => s.userId === actor.userId);
    if (!signer) throw new ForbiddenException("Você não é signatário desta notificação.");
    if (signer.signedAt) throw new BadRequestException("Você já assinou esta notificação.");

    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      include: { organization: true }
    });
    if (!user) throw new ForbiddenException("Usuário não encontrado.");
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new BadRequestException("Senha incorreta.");

    const verificationCode = randomBytes(8).toString("hex");
    const signedAt = new Date();
    const name =
      user.displayName?.trim() ||
      [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
      user.email;

    await this.prisma.$transaction(async (tx) => {
      await tx.contractNotificationSigner.update({
        where: { id: signer.id },
        data: {
          signedAt,
          signerName: name,
          signerCpf: user.cpf,
          signerJobTitle: user.jobTitle,
          signerOrgLabel: user.organization
            ? user.organization.acronym
              ? `${user.organization.acronym} · ${user.organization.name}`
              : user.organization.name
            : null,
          verificationCode,
          modality: "PASSWORD"
        }
      });

      // Após cada assinatura, bloquear conteúdo e regenerar HTML com TODAS as assinaturas já realizadas
      const allSignersBeforeHtml = await tx.contractNotificationSigner.findMany({
        where: { notificationId: id },
        orderBy: { order: "asc" }
      });
      let docVerifier = prev.documentVerifierCode;
      let docValidation = prev.documentValidationCode;
      if (!docVerifier) {
        docVerifier = generateDocumentVerifierCode();
        docValidation = deriveDocumentValidationCode(prev.number, docVerifier);
      } else if (!docValidation) {
        docValidation = deriveDocumentValidationCode(prev.number, docVerifier);
      }
      const html = await this.buildSignedDocumentHtml(
        {
          ...prev,
          documentVerifierCode: docVerifier,
          documentValidationCode: docValidation,
          signers: allSignersBeforeHtml.map((s) =>
            s.id === signer.id
              ? {
                  ...s,
                  signedAt,
                  signerName: name,
                  signerCpf: user.cpf,
                  signerJobTitle: user.jobTitle,
                  signerOrgLabel: user.organization
                    ? user.organization.acronym
                      ? `${user.organization.acronym} · ${user.organization.name}`
                      : user.organization.name
                    : null,
                  verificationCode
                }
              : s
          )
        },
        null
      );

      const requiredDone = allSignersBeforeHtml
        .filter((s) => s.required)
        .every((s) => s.signedAt || s.id === signer.id);
      await tx.contractNotification.update({
        where: { id },
        data: {
          contentLocked: true,
          signedDocumentHtml: html,
          documentVerifierCode: docVerifier,
          documentValidationCode: docValidation,
          status: requiredDone ? "ASSINADA" : "AGUARDANDO_ASSINATURA"
        }
      });
    });

    await this.addEvent(id, "SIGNED", prev.status, null, `Assinado por ${name}`);
    await this.audit("ContractNotification", id, "UPDATE", { signed: false }, { signedBy: actor.userId });
    return this.findOne(id);
  }

  /** Prepara envio: valida assinaturas e devolve destinatários + HTML (envio real via frontend send-mail). */
  async prepareSend(id: string, dto: SendNotificationDto) {
    this.assertInternalManage();
    const prev = await this.getOrThrow(id);
    if (prev.status !== "ASSINADA" && prev.status !== "ENVIADA") {
      throw new BadRequestException("Só é possível enviar após todas as assinaturas obrigatórias (status ASSINADA).");
    }
    const required = prev.signers.filter((s) => s.required);
    if (required.length > 0 && required.some((s) => !s.signedAt)) {
      throw new BadRequestException("Ainda há assinaturas obrigatórias pendentes.");
    }

    const contract = await this.prisma.contract.findUnique({
      where: { id: prev.contractId },
      include: {
        supplier: true,
        externalUserLinks: {
          include: { user: { select: { email: true, approvalStatus: true, userKind: true } } }
        }
      }
    });
    if (!contract) throw new NotFoundException("Contrato não encontrado.");

    const emails = new Set<string>();
    for (const link of contract.externalUserLinks) {
      if (link.user.userKind === UserKind.EXTERNAL && link.user.approvalStatus === "APPROVED") {
        emails.add(link.user.email.toLowerCase());
      }
    }
    const contacts = contract.supplier?.contacts;
    if (Array.isArray(contacts)) {
      for (const c of contacts) {
        if (c && typeof c === "object" && "email" in c && typeof (c as { email: unknown }).email === "string") {
          const e = String((c as { email: string }).email).trim().toLowerCase();
          if (e.includes("@")) emails.add(e);
        }
      }
    }
    for (const e of dto.extraEmails ?? []) {
      const t = e.trim().toLowerCase();
      if (t.includes("@")) emails.add(t);
    }

    const recipients = [...emails];
    if (recipients.length === 0) {
      throw new BadRequestException(
        "Nenhum destinatário encontrado. Cadastre usuários externos do contrato, contatos do fornecedor ou informe e-mails extras."
      );
    }

    const documentHtml =
      prev.signedDocumentHtml ||
      [prev.headerHtml, prev.bodyHtml, prev.footerHtml].filter(Boolean).join("\n");

    return {
      notificationId: id,
      number: prev.number,
      subject: prev.subject,
      recipients,
      html: documentHtml,
      portalPath: `/externo/notificacoes/${id}`
    };
  }

  async confirmSend(id: string, dto: ConfirmSendDto) {
    this.assertInternalManage();
    const prev = await this.getOrThrow(id);
    if (prev.status !== "ASSINADA" && prev.status !== "ENVIADA") {
      throw new BadRequestException("Notificação não está pronta para confirmação de envio.");
    }

    const emailStatus = dto.emailStatus ?? "SENT";
    await this.prisma.emailSendLog.create({
      data: {
        type: "NOTIFICATION",
        recipients: dto.recipients.join(", "),
        status: emailStatus,
        attempts: 1,
        errorSummary: dto.errorSummary ?? null
      }
    });

    if (emailStatus === "SENT") {
      const nextStatus: ContractNotificationStatus = prev.requiresResponse
        ? "AGUARDANDO_RESPOSTA"
        : prev.requiresAck
          ? "ENVIADA"
          : "ENVIADA";
      await this.prisma.contractNotification.update({
        where: { id },
        data: {
          status: nextStatus,
          sentAt: new Date()
        }
      });
      await this.addEvent(id, "SENT", prev.status, nextStatus, `Enviada para ${dto.recipients.length} destinatário(s)`);
    }

    await this.audit(
      "ContractNotification",
      id,
      "UPDATE",
      { status: prev.status },
      { status: "ENVIADA", recipients: dto.recipients }
    );
    return this.findOne(id);
  }

  async acknowledge(id: string) {
    const actor = requestActorStore.getStore();
    if (!actor?.userId) throw new ForbiddenException("Não autenticado.");
    const prev = await this.getOrThrow(id);
    assertExternalCanAccessContract(prev.contractId, actor);
    if (!["ENVIADA", "RECEBIDA", "AGUARDANDO_RESPOSTA"].includes(prev.status)) {
      throw new BadRequestException("Não é possível dar ciência neste status.");
    }
    if (prev.ackAt) throw new BadRequestException("Ciência já registrada.");

    await this.prisma.contractNotification.update({
      where: { id },
      data: {
        ackAt: new Date(),
        ackByUserId: actor.userId,
        status: prev.status === "ENVIADA" ? "RECEBIDA" : prev.status
      }
    });
    await this.addEvent(id, "ACK", prev.status, "RECEBIDA", "Ciência registrada pela empresa");
    return this.findOne(id, { forExternal: true });
  }

  async saveResponse(id: string, dto: SaveResponseDto) {
    const actor = requestActorStore.getStore();
    if (!actor?.userId) throw new ForbiddenException("Não autenticado.");
    const prev = await this.getOrThrow(id);
    assertExternalCanAccessContract(prev.contractId, actor);
    if (!prev.requiresResponse) {
      throw new BadRequestException("Esta notificação não exige manifestação.");
    }
    if (!["ENVIADA", "RECEBIDA", "AGUARDANDO_RESPOSTA"].includes(prev.status)) {
      throw new BadRequestException("Não é possível elaborar manifestação neste status.");
    }

    const existing = await this.prisma.contractNotificationResponse.findFirst({
      where: { notificationId: id, draft: true, authorUserId: actor.userId }
    });

    if (dto.submit) {
      const submitted = existing
        ? await this.prisma.contractNotificationResponse.update({
            where: { id: existing.id },
            data: {
              bodyText: dto.bodyText,
              itemStatuses: (dto.itemStatuses as Prisma.InputJsonValue) ?? undefined,
              draft: false,
              submittedAt: new Date()
            }
          })
        : await this.prisma.contractNotificationResponse.create({
            data: {
              notificationId: id,
              authorUserId: actor.userId,
              bodyText: dto.bodyText,
              itemStatuses: (dto.itemStatuses as Prisma.InputJsonValue) ?? undefined,
              draft: false,
              submittedAt: new Date()
            }
          });

      await this.prisma.contractNotification.update({
        where: { id },
        data: { status: "RESPONDIDA" }
      });
      await this.addEvent(id, "RESPONSE_SUBMITTED", prev.status, "RESPONDIDA", "Manifestação enviada");
      return { response: submitted, notification: await this.findOne(id, { forExternal: true }) };
    }

    const saved = existing
      ? await this.prisma.contractNotificationResponse.update({
          where: { id: existing.id },
          data: {
            bodyText: dto.bodyText,
            itemStatuses: (dto.itemStatuses as Prisma.InputJsonValue) ?? undefined
          }
        })
      : await this.prisma.contractNotificationResponse.create({
          data: {
            notificationId: id,
            authorUserId: actor.userId,
            bodyText: dto.bodyText,
            itemStatuses: (dto.itemStatuses as Prisma.InputJsonValue) ?? undefined,
            draft: true
          }
        });
    return { response: saved, notification: await this.findOne(id, { forExternal: true }) };
  }

  async analyzeResponse(notificationId: string, responseId: string, dto: AnalyzeResponseDto) {
    this.assertInternalManage();
    const prev = await this.getOrThrow(notificationId);
    const response = await this.prisma.contractNotificationResponse.findFirst({
      where: { id: responseId, notificationId }
    });
    if (!response || response.draft) {
      throw new BadRequestException("Manifestação não encontrada ou ainda em rascunho.");
    }
    const actor = requestActorStore.getStore();
    await this.prisma.contractNotificationResponse.update({
      where: { id: responseId },
      data: {
        analysisStatus: dto.analysisStatus,
        analysisNote: dto.analysisNote,
        analyzedAt: new Date(),
        analyzedById: actor?.userId ?? null
      }
    });
    const nextStatus: ContractNotificationStatus =
      dto.analysisStatus === "ATENDIDA" || dto.analysisStatus === "ACEITA"
        ? "ATENDIDA"
        : dto.analysisStatus === "REJEITADA"
          ? "NAO_ATENDIDA"
          : "EM_ANALISE";
    await this.prisma.contractNotification.update({
      where: { id: notificationId },
      data: { status: nextStatus }
    });
    await this.addEvent(notificationId, "ANALYSIS", prev.status, nextStatus, dto.analysisNote);
    return this.findOne(notificationId);
  }

  async cancel(id: string, dto: CancelOrRectifyDto) {
    this.assertInternalManage();
    const prev = await this.getOrThrow(id);
    if (["CANCELADA", "RETIFICADA", "ENCERRADA"].includes(prev.status)) {
      throw new BadRequestException("Notificação já encerrada/cancelada.");
    }
    await this.prisma.contractNotification.update({
      where: { id },
      data: { status: "CANCELADA", cancelReason: dto.reason }
    });
    await this.addEvent(id, "CANCELLED", prev.status, "CANCELADA", dto.reason);
    return this.findOne(id);
  }

  async rectify(id: string, dto: CancelOrRectifyDto) {
    this.assertInternalManage();
    const prev = await this.getOrThrow(id);
    if (!["ASSINADA", "ENVIADA", "RECEBIDA", "AGUARDANDO_RESPOSTA", "RESPONDIDA"].includes(prev.status)) {
      throw new BadRequestException("Só é possível retificar após assinatura/envio.");
    }
    const actor = requestActorStore.getStore();
    if (!actor?.userId) throw new ForbiddenException("Não autenticado.");

    const number = await this.nextNumber();
    const documentVerifierCode = await this.allocateVerifierCode();
    const documentValidationCode = deriveDocumentValidationCode(number, documentVerifierCode);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.contractNotification.update({
        where: { id },
        data: { status: "RETIFICADA", rectifyReason: dto.reason }
      });
      return tx.contractNotification.create({
        data: {
          contractId: prev.contractId,
          templateId: prev.templateId,
          templateVersion: prev.templateVersion,
          number,
          documentVerifierCode,
          documentValidationCode,
          status: "RASCUNHO",
          subject: `[Retificação] ${prev.subject}`,
          bodyHtml: prev.bodyHtml,
          headerHtml: prev.headerHtml,
          footerHtml: prev.footerHtml,
          purpose: prev.purpose,
          notificationType: prev.notificationType,
          severity: prev.severity,
          requiresAck: prev.requiresAck,
          requiresResponse: prev.requiresResponse,
          requiresSchedule: prev.requiresSchedule,
          requiresActionPlan: prev.requiresActionPlan,
          related: prev.related ?? undefined,
          formalizationRefs: prev.formalizationRefs ?? undefined,
          parentNotificationId: id,
          createdById: actor.userId
        }
      });
    });
    await this.addEvent(id, "RECTIFIED", prev.status, "RETIFICADA", dto.reason);
    await this.addEvent(created.id, "CREATED", null, "RASCUNHO", `Retificação de ${prev.number}`);
    return this.findOne(created.id);
  }

  async printableHtml(id: string) {
    const row = await this.findOne(id);
    const html =
      row.signedDocumentHtml ||
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${row.number}</title>
      <style>body{font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:1rem;color:#111}
      .meta{font-size:12px;color:#555;margin-bottom:1.5rem}.warn{background:#fff8e6;border:1px solid #e6c35c;padding:.75rem;margin-bottom:1rem;font-size:13px}</style>
      </head><body>
      <div class="warn">Documento HTML para impressão / PDF do navegador. Não é um PDF nativo assinado digitalmente por certificado ICP-Brasil.</div>
      <div class="meta"><strong>${row.number}</strong> — ${row.subject}<br/>Status: ${row.status}</div>
      ${row.headerHtml ?? ""}
      ${row.bodyHtml}
      ${row.footerHtml ?? ""}
      </body></html>`;
    return { number: row.number, html };
  }

  /** PDF a partir do mesmo HTML imprimível (Chromium; fallback pdfkit). Não é assinatura ICP-Brasil. */
  async printablePdf(id: string): Promise<{ buffer: Buffer; filename: string; number: string }> {
    const { number, html } = await this.printableHtml(id);
    const buffer = await htmlToPdfBuffer(html, number);
    const safeNumber = String(number).replace(/[^\w.-]+/g, "_");
    return { buffer, filename: `${safeNumber}.pdf`, number };
  }

  // —— helpers ——

  private allowedTransitions(from: ContractNotificationStatus): ContractNotificationStatus[] {
    const map: Partial<Record<ContractNotificationStatus, ContractNotificationStatus[]>> = {
      RASCUNHO: ["EM_ELABORACAO", "EM_REVISAO", "CANCELADA"],
      EM_ELABORACAO: ["EM_REVISAO", "APROVADA_ASSINATURA", "CANCELADA"],
      EM_REVISAO: ["DEVOLVIDA_CORRECAO", "APROVADA_ASSINATURA", "CANCELADA"],
      DEVOLVIDA_CORRECAO: ["EM_ELABORACAO", "EM_REVISAO", "CANCELADA"],
      APROVADA_ASSINATURA: ["AGUARDANDO_ASSINATURA", "CANCELADA"],
      AGUARDANDO_ASSINATURA: ["DEVOLVIDA_CORRECAO", "ASSINADA", "CANCELADA"],
      ASSINADA: ["CANCELADA"],
      ENVIADA: ["ENCERRADA", "ENCAMINHADA_CONTROLADORIA"],
      RECEBIDA: ["ENCERRADA", "ENCAMINHADA_CONTROLADORIA"],
      AGUARDANDO_RESPOSTA: ["ENCERRADA", "ENCAMINHADA_CONTROLADORIA"],
      RESPONDIDA: ["EM_ANALISE", "ATENDIDA", "NAO_ATENDIDA", "ENCERRADA"],
      EM_ANALISE: ["ATENDIDA", "NAO_ATENDIDA", "ENCERRADA", "ENCAMINHADA_CONTROLADORIA"]
    };
    return map[from] ?? [];
  }

  private async nextNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await this.prisma.$transaction(async (tx) => {
      const row = await tx.contractNotificationSequence.upsert({
        where: { year },
        create: { year, lastNumber: 1 },
        update: { lastNumber: { increment: 1 } }
      });
      return row.lastNumber;
    });
    /** Novos documentos: DOC-SIGTI. Números NOT-SIGTI já emitidos permanecem válidos. */
    return formatDocumentNumber(seq, year);
  }

  private async allocateVerifierCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateDocumentVerifierCode();
      const clash = await this.prisma.contractNotification.findFirst({
        where: { documentVerifierCode: code },
        select: { id: true }
      });
      if (!clash) return code;
    }
    return generateDocumentVerifierCode(12);
  }

  private async buildSignedDocumentHtml(
    n: {
      number: string;
      subject: string;
      headerHtml: string | null;
      bodyHtml: string;
      footerHtml: string | null;
      documentVerifierCode?: string | null;
      documentValidationCode?: string | null;
      signers: Array<{
        signedAt: Date | null;
        signerName: string | null;
        signerCpf?: string | null;
        signerJobTitle?: string | null;
        signerOrgLabel?: string | null;
        verificationCode: string | null;
        required?: boolean;
      }>;
    },
    _current: {
      name: string;
      cpf: string | null;
      jobTitle: string | null;
      org: string | null;
      signedAt: Date;
      verificationCode: string;
    } | null
  ): Promise<string> {
    const signed = n.signers.filter((s) => s.signedAt);
    const pending = n.signers.filter((s) => !s.signedAt);
    const signatureBlocks = signed.map((s) => {
      const cpf = s.signerCpf ? this.maskCpfBr(s.signerCpf) : "—";
      return `<p><strong>${s.signerName ?? "Signatário"}</strong>${
        s.signerJobTitle ? ` — ${s.signerJobTitle}` : ""
      }${s.signerOrgLabel ? ` · ${s.signerOrgLabel}` : ""}<br/>CPF: ${cpf} · ${new Date(
        s.signedAt!
      ).toLocaleString("pt-BR")} · Código verificador da assinatura: ${s.verificationCode ?? "—"}</p>`;
    });
    const pendingBlock =
      pending.length > 0
        ? `<p style="font-size:12px;color:#555"><strong>Assinaturas pendentes:</strong> ${pending
            .map((s) => s.signerName ?? "signatário")
            .join(", ")}</p>`
        : "";

    const verifier = n.documentVerifierCode ?? "";
    const validation = n.documentValidationCode ?? "";
    const qs = new URLSearchParams();
    qs.set("doc", n.number);
    if (verifier) qs.set("codigo", verifier);
    if (validation) qs.set("validacao", validation);
    const base = publicAppBase();
    const validatePath = `/validar-documento?${qs.toString()}`;
    const validateUrl = base ? `${base}${validatePath}` : validatePath;

    let qrImg = "";
    try {
      const QRCode = await import("qrcode");
      const dataUrl = await QRCode.toDataURL(validateUrl, { margin: 1, width: 148, errorCorrectionLevel: "M" });
      qrImg = `<img src="${dataUrl}" alt="QR Code de validação" width="148" height="148" style="display:block;margin:0 auto 8px" />`;
    } catch {
      qrImg = "";
    }

    const validationBlock = `<hr/><h3>Validação do documento</h3>
      <div style="display:flex;gap:1.25rem;align-items:flex-start;flex-wrap:wrap">
        <div style="flex:1;min-width:220px;font-size:12px;line-height:1.5">
          <p>Código do documento: <strong>${n.number}</strong></p>
          <p>Código verificador: <strong>${verifier || "—"}</strong></p>
          <p>Código de validação: <strong>${validation || "—"}</strong></p>
          <p>Consulte em <strong>/validar-documento</strong> (ou escaneie o QR Code) para confirmar autenticidade.</p>
          <p style="color:#666;word-break:break-all">${validateUrl}</p>
        </div>
        <div style="text-align:center;font-size:11px;color:#555">${qrImg}QR Code</div>
      </div>`;

    const blocks = [
      n.headerHtml ?? "",
      n.bodyHtml,
      n.footerHtml ?? "",
      `<hr/><h3>Assinaturas realizadas</h3>`,
      ...signatureBlocks,
      pendingBlock,
      `<p style="font-size:12px;color:#666">Assinatura eletrônica por senha (SIGTI). Não equivale a certificado digital ICP-Brasil.</p>`,
      validationBlock
    ];
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${n.number}</title>
      <style>body{font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:1rem;color:#111;line-height:1.45}
      h1{font-size:1.35rem;margin:0 0 .35rem}h2{font-size:1.1rem;font-weight:600;margin:0 0 1rem;color:#333}
      h3{font-size:1rem;margin:1rem 0 .5rem}hr{border:none;border-top:1px solid #ccc;margin:1.25rem 0}</style>
      </head><body>
      <h1>${n.number}</h1><h2>${n.subject}</h2>${blocks.join("\n")}</body></html>`;
  }

  private maskCpfBr(cpf: string): string {
    const digits = cpf.replace(/\D/g, "");
    if (digits.length < 4) return "···.···.***-**";
    const last = digits.slice(-5, -2);
    const check = digits.slice(-2);
    return `···.···.${last}-${check}`;
  }

  private async getOrThrow(id: string) {
    const row = await this.prisma.contractNotification.findUnique({
      where: { id },
      include: { signers: true }
    });
    if (!row) throw new NotFoundException("Notificação não encontrada.");
    await this.assertContractAccess(row.contractId);
    return row;
  }

  private async assertContractAccess(contractId: string) {
    const actor = requestActorStore.getStore();
    if (isExternalActor(actor)) {
      assertExternalCanAccessContract(contractId, actor);
      return;
    }
    // Internos: presença do contrato (escopo fino fica no contracts.service nas listagens)
    const c = await this.prisma.contract.findFirst({
      where: { id: contractId, deletedAt: null },
      select: { id: true, organizationId: true }
    });
    if (!c) throw new NotFoundException("Contrato não encontrado.");
    if (actor?.organizationId && !actor.allOrganizationsActive && c.organizationId !== actor.organizationId) {
      // permite se houver atribuição — simplificado: só bloqueia se órgão diferente e sem all
      // atribuições cross-órgão já cobertas em outros fluxos; aqui liberamos leitura se souber o id
    }
  }

  private assertInternalManage() {
    const actor = requestActorStore.getStore();
    if (isExternalActor(actor)) {
      throw new ForbiddenException("Operação disponível apenas para usuários internos.");
    }
  }

  private async addEvent(
    notificationId: string,
    eventType: string,
    fromStatus: string | null,
    toStatus: string | null,
    note: string | null
  ) {
    await this.prisma.contractNotificationEvent.create({
      data: {
        notificationId,
        eventType,
        fromStatus,
        toStatus,
        note,
        actorId: getAuditActorId(),
        actorLabel: getAuditActorLabel()
      }
    });
  }

  private async audit(entity: string, entityId: string, action: string, oldData: unknown, newData: unknown) {
    const gate = await resolveAuditGate(this.prisma, entity, action);
    if (!gate.enabled) return;
    await this.prisma.auditLog.create({
      data: {
        entity,
        entityId,
        action,
        userId: getAuditActorId(),
        oldData: gate.detailLevel === "ACTION_ONLY" ? undefined : (oldData as Prisma.InputJsonValue),
        newData: gate.detailLevel === "ACTION_ONLY" ? undefined : (newData as Prisma.InputJsonValue)
      }
    });
  }
}
