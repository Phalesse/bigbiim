import { Module } from '@nestjs/common';
import { RulesModule } from '../rules/rules.module';
import { BuilderController } from './builder.controller';
import { BuilderService } from './builder.service';

@Module({
  imports: [RulesModule],
  controllers: [BuilderController],
  providers: [BuilderService],
  exports: [BuilderService],
})
export class BuilderModule {}
