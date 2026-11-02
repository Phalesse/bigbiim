import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module';
import { IdentityModule } from './modules/identity/identity.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { BuilderModule } from './modules/builder/builder.module';
import { RulesModule } from './modules/rules/rules.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { MatchingModule } from './modules/matching/matching.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { TrustModule } from './modules/trust/trust.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { FilesModule } from './modules/files/files.module';
import { AuditModule } from './modules/audit/audit.module';

@Module({
  imports: [
    CommonModule,
    IdentityModule,
    CatalogModule,
    BuilderModule,
    RulesModule,
    ProvidersModule,
    MatchingModule,
    ProjectsModule,
    ContractsModule,
    PaymentsModule,
    MessagingModule,
    TrustModule,
    NotificationsModule,
    FilesModule,
    AuditModule,
  ],
})
export class AppModule {}
