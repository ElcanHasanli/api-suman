import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pool from './config/database.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import orderRoutes from './routes/orders.js';
import customerRoutes from './routes/customers.js';
import courierRoutes from './routes/couriers.js';
import historyRoutes from './routes/history.js';
import notificationRoutes from './routes/notifications.js';
import ownerRoutes from './routes/owner.js';
import expenseRoutes from './routes/expenses.js';
import deviceRoutes from './routes/devices.js';
import warehouseRoutes from './routes/warehouse.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware — CORS əvvəl (preflight üçün)
const BUILTIN_ORIGINS = [
  'https://suman.khamsacraft.az',
  'https://admin.suman.khamsacraft.az',
  'https://courier.suman.khamsacraft.az',
  'http://localhost:3000',
  'http://localhost:5173',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
];

const corsOrigins = [
  ...new Set([
    ...BUILTIN_ORIGINS,
    ...(process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ?? []),
  ]),
];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/couriers', courierRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/warehouse', warehouseRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'API is running', timestamp: new Date() });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error Handler
app.use(errorHandler);

// Start Server
app.listen(PORT, async () => {
  try {
    // Test database connection
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Database connected:', result.rows[0]);
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log('🌐 CORS origins:', corsOrigins.join(', '));
    console.log(`📊 Swagger docs at http://localhost:${PORT}/api-docs`);
  } catch (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }
});

export default app;