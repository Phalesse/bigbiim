import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // API versionnée /api/v1 ; les sondes Kubernetes restent à /health/live et /health/ready
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
  app.useWebSocketAdapter(new WsAdapter(app));
  app.enableShutdownHooks(); // arrêt gracieux : les requêtes en cours se terminent avant l'arrêt
  await app.listen(Number(process.env.PORT ?? 4000), '0.0.0.0');
}

bootstrap();
