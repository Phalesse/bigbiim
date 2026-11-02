import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestInput } from '../../common/request-input';
import { PrismaService } from '../../common/prisma.service';

/**
 * Module contracts — Modèles, génération PDF, signatures
 * Logiques métier à coder ici (document, section 3) :
 *   3.9 Contrat et signature
 */
@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /admin/contract-templates — Modèles */
  async getAdminContractTemplates(input: RequestInput): Promise<unknown> {
    const query = input.query ?? {};
    const limit = query.limit === undefined ? 50 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit doit être un entier entre 1 et 100');
    }
    const items = await this.prisma.contractTemplate.findMany({
      where: { deletedAt: null },
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
      take: limit,
      select: {
        id: true,
        name: true,
        version: true,
        locale: true,
        variablesSchema: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { items };
  }

  /** GET /projects/{id}/contract — Contrat courant */
  async getProjectsByIdContract(input: RequestInput): Promise<unknown> {
    const principal = input.principal;
    const projectId = input.params?.id;
    if (!principal) throw new UnauthorizedException('Authentification requise.');
    if (!projectId) throw new BadRequestException('Identifiant de projet requis.');
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { id: true, clientId: true },
    });
    if (!project) throw new NotFoundException('Projet introuvable.');
    let authorized = principal.roles.includes('A') || project.clientId === principal.id;
    if (!authorized && principal.roles.includes('P')) {
      const provider = await this.prisma.provider.findFirst({
        where: { userId: principal.id, deletedAt: null },
        select: { id: true },
      });
      if (provider) {
        const roles = await this.prisma.projectRole.findMany({
          where: { projectId: project.id, deletedAt: null },
          select: { id: true },
        });
        authorized = Boolean(
          await this.prisma.mission.findFirst({
            where: {
              projectRoleId: { in: roles.map(({ id }) => id) },
              providerId: provider.id,
              deletedAt: null,
            },
            select: { id: true },
          }),
        );
      }
    }
    if (!authorized) throw new NotFoundException('Projet introuvable.');
    const contract = await this.prisma.contract.findFirst({
      where: { projectId: project.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!contract) throw new NotFoundException('Aucun contrat pour ce projet.');
    const signatures = await this.prisma.signature.findMany({
      where: { contractId: contract.id },
      orderBy: { signedAt: 'asc' },
      select: { userId: true, signedAt: true },
    });
    return { ...contract, signatures };
  }

  /** POST /contracts/{id}/sign — Signature (OTP) */
  async postContractsByIdSign(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Signature indisponible : la vérification OTP et son fournisseur ne sont pas configurés; aucune signature locale ne sera créée.',
    );
  }

  /** GET /contracts/{id}/pdf — Document signé */
  async getContractsByIdPdf(input: RequestInput): Promise<unknown> {
    void input;
    throw new NotImplementedException(
      'Téléchargement PDF indisponible : aucun service de stockage/signer d’URL n’est configuré.',
    );
  }

}
