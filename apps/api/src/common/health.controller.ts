import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { Roles } from './roles.decorator';

/** Sondes Kubernetes : /health/live et /health/ready (hors préfixe /api/v1). */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @Roles('public')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @Roles('public')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Base de données indisponible');
    }
  }
}
