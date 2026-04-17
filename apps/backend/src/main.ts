import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  /** Necessário para o Next (browser) chamar a API em `NEXT_PUBLIC_BACKEND_URL` em desenvolvimento. */
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  );
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 4000);
}

void bootstrap();
