import {sqliteTable,integer,text,index,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const stallBookings=sqliteTable('stall_bookings',{
 stall:integer('stall').primaryKey(),booked:integer('booked').notNull(),status:integer('status').notNull().default(0),revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull()
},t=>[check('valid_stall',sql`${t.stall} BETWEEN 1 AND 193`),check('valid_booked',sql`${t.booked} IN (0, 1)`),check('valid_revision',sql`${t.revision} > 0`),check('valid_status',sql`${t.status} IN (0, 1, 2)`)]);
export const adminSessions=sqliteTable('admin_sessions',{
 tokenHash:text('token_hash').primaryKey().notNull(),expiresAt:integer('expires_at').notNull(),generation:text('generation').notNull()
},t=>[index('admin_sessions_expiry').on(t.expiresAt)]);
export const adminLoginLimits=sqliteTable('admin_login_limits',{
 clientKey:text('client_key').primaryKey().notNull(),windowStart:integer('window_start').notNull(),attempts:integer('attempts').notNull()
});
