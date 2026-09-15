import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const rooms = mysqlTable("rooms", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  roomCode: varchar("roomCode", { length: 32 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  secretHash: varchar("secretHash", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const folders = mysqlTable("folders", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  roomId: int("roomId"),
  parentId: int("parentId"),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const files = mysqlTable("files", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  roomId: int("roomId"),
  folderId: int("folderId"),
  name: varchar("name", { length: 255 }).notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  fileKey: varchar("fileKey", { length: 512 }).notNull(),
  url: varchar("url", { length: 700 }).notNull(),
  mimeType: varchar("mimeType", { length: 160 }).notNull(),
  sizeBytes: int("sizeBytes").notNull(),
  visibility: mysqlEnum("visibility", ["public", "private"]).default("private").notNull(),
  publicToken: varchar("publicToken", { length: 32 }).unique(),
  downloads: int("downloads").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Room = typeof rooms.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type File = typeof files.$inferSelect;
