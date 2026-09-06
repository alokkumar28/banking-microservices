import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import config from './config/config.js';
import {
  initDatabase
} from './db/db.js';
import authRoutes from './routes/auth.routes.js';
const app = express();
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(
  express.urlencoded({
    extended: true
  })
);
initDatabase().catch(console.error);
app.use(
  '/auth',
  authRoutes
);

app.get('/health', (req, res) => {

  res.status(200).json({
    status: 'OK',
    service: 'auth-service',
    timestamp: new Date().toISOString()
  });

});

// Error handling middleware

app.use((err, req, res, next) => {

  console.error(
    'Unhandled error:',
    err.stack
  );

  res.status(500).json({
    error: 'Something went wrong!',
    message:
      config.nodeEnv === 'development'
        ? err.message
        : undefined
  });

});

// 404 handler

app.use((req, res) => {

  res.status(404).json({
    error: 'Route not found'
  });

});

const PORT = config.port;

app.listen(PORT, () => {

  console.log(`=================================`);
  console.log(`🔐 Auth Service Started`);
  console.log(`📍 Running on: http://localhost:${PORT}`);
  console.log(`🔧 Environment: ${config.nodeEnv}`);
  console.log(`🕐 Started at: ${new Date().toISOString()}`);
  console.log(`=================================`);

});