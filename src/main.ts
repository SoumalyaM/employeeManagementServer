import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);
    app.enableCors({
      origin: 'http://localhost:5173',
      credentials: true,
    });
    
    console.log('🚀 Backend server starting on port 3001...');
    await app.listen(3001);
    console.log('✅ Backend server is running on http://localhost:3001');
  } catch (error) {
    console.error('❌ Failed to start backend server:', error);
    process.exit(1);
  }
}
bootstrap();
