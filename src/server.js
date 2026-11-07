import 'dotenv/config';
import { createApp } from './app.js';
import { initializeDatabase } from './db/init.js';
const PORT = Number(process.env.PORT || 3000);
const app = createApp();
async function start() {
  if (process.env.DATABASE_URL) {
    try {
      await initializeDatabase();
    }
    catch (error) {
      console.error('Falha ao inicializar o banco:', error.message);
      if (process.env.NODE_ENV === 'production')
        process.exit(1);
    }
  }
  else
    console.warn('DATABASE_URL ausente: APIs de dados não estarão disponíveis. Configure o .env.');
  app.listen(PORT, () => console.log(`Açaí da Roça disponível na porta ${PORT}`));
}
start();
