import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      passwordHash VARCHAR(255) NOT NULL,
      role ENUM('ADMIN','MANAGER','DEV','SUPPORT','USER') NOT NULL DEFAULT 'USER'
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      tokenHash CHAR(64) PRIMARY KEY,
      userId INT NOT NULL,
      expiresAt BIGINT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )`);
}

  // Keeps the role list up to date on existing databases (safe to run every start).
  await pool.query(
    "ALTER TABLE users MODIFY role ENUM('ADMIN','DEV','USER') NOT NULL DEFAULT 'USER'"
  );