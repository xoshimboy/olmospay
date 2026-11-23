import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { bigint, boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const olmosOrders = pgTable('olmos_orders', {
  ref: text('ref').primaryKey(),
  tgUserId: text('tg_user_id'),
  orderData: jsonb('order_data').notNull(),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
});

export const olmosAppState = pgTable('olmos_app_state', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull(),
});

export const olmosRateLimits = pgTable('olmos_rate_limits', {
  rateKey: text('rate_key').primaryKey(),
  windowStartedAt: bigint('window_started_at', { mode: 'number' }).notNull(),
  hits: integer('hits').notNull(),
});

export const olmosPromoCodes = pgTable('olmos_promo_codes', {
  code: text('code').primaryKey(),
  discountPercent: integer('discount_percent').notNull().default(2),
  maxUses: integer('max_uses').notNull(),
  usedCount: integer('used_count').notNull().default(0),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: bigint('created_at', { mode: 'number' }).notNull(),
});

let pool;
let database;
let configuredUrl = '';

export function getDatabase() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (!connectionString) {
    if (process.env.VERCEL_ENV === 'production') {
      throw new Error('DATABASE_URL is required in production');
    }
    return null;
  }

  if (connectionString !== configuredUrl) {
    if (pool) void pool.end().catch(() => {});
    pool = new Pool({
      connectionString,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
    database = drizzle(pool);
    configuredUrl = connectionString;
  }

  return database;
}
