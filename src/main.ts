import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Pino logger (docs/architecture/overview.md — Pino + Loki)
  app.useLogger(app.get(Logger));

  // Global API prefix
  app.setGlobalPrefix('api/v1', {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'webhook/:path*', method: RequestMethod.ALL },
      { path: 'webhooks/:path*', method: RequestMethod.ALL },
    ],
  });

  // CORS (docs/security/overview.md — only Mini App + Admin domains)
  app.enableCors({
    origin: [
      process.env.MINI_APP_URL || 'http://localhost:5173',
      process.env.ADMIN_URL || 'http://localhost:5174',
      'https://urbamstyle.shop',
    ],
    credentials: true,
  });

  // Global validation pipe (docs/backlog.md #110 — class-validator on all DTOs)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Swagger (docs/api/overview.md)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Nailio API')
      .setDescription('Nailio — Telegram Mini App SaaS platform for beauty masters')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/v1/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
}

bootstrap();
