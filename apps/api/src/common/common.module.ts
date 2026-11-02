import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { FeatureFlagsService } from './feature-flags.service';
import { HealthController } from './health.controller';
import { OutboxService } from './events/outbox.service';
import { PrismaService } from './prisma.service';
import { ProblemDetailsFilter } from './problem-details.filter';
import { RolesGuard } from './roles.guard';
import { OidcTokenService } from './oidc-token.service';

@Global()
@Module({
  controllers: [HealthController],
  providers: [
    PrismaService,
    OutboxService,
    FeatureFlagsService,
    OidcTokenService,
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [PrismaService, OutboxService, FeatureFlagsService, OidcTokenService],
})
export class CommonModule {}
