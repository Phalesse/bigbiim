import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module';
import { MatchingModule } from '../matching/matching.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [RulesModule, MatchingModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
