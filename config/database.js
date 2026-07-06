import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool, types } = pg;

/** DATE sütunları timezone sürüşməsi olmadan YYYY-MM-DD string qaytarır */
types.setTypeParser(1082, (value) => value);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || ''
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

export default pool;