import { and, desc, eq, isNull, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, files, folders, rooms, users } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined || user.openId === ENV.ownerOpenId) {
    values.role = user.role ?? "admin";
    updateSet.role = values.role;
  }
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getDashboardData(ownerId: number, search?: string) {
  const db = await getDb();
  if (!db) return { files: [], folders: [], rooms: [], stats: { totalBytes: 0, fileCount: 0, publicCount: 0, roomCount: 0 } };
  const fileWhere = search
    ? and(eq(files.ownerId, ownerId), or(like(files.name, `%${search}%`), like(files.mimeType, `%${search}%`)))
    : eq(files.ownerId, ownerId);
  const [fileRows, folderRows, roomRows, sizeRows, countRows, publicRows] = await Promise.all([
    db.select().from(files).where(fileWhere).orderBy(desc(files.createdAt)).limit(50),
    db.select().from(folders).where(eq(folders.ownerId, ownerId)).orderBy(desc(folders.createdAt)),
    db.select().from(rooms).where(eq(rooms.ownerId, ownerId)).orderBy(desc(rooms.createdAt)),
    db.select({ total: sql<number>`coalesce(sum(${files.sizeBytes}), 0)` }).from(files).where(eq(files.ownerId, ownerId)),
    db.select({ total: sql<number>`count(*)` }).from(files).where(eq(files.ownerId, ownerId)),
    db.select({ total: sql<number>`count(*)` }).from(files).where(and(eq(files.ownerId, ownerId), eq(files.visibility, "public"))),
  ]);
  return {
    files: fileRows,
    folders: folderRows,
    rooms: roomRows.map(({ secretHash: _secretHash, ...room }) => room),
    stats: { totalBytes: Number(sizeRows[0]?.total ?? 0), fileCount: Number(countRows[0]?.total ?? 0), publicCount: Number(publicRows[0]?.total ?? 0), roomCount: roomRows.length },
  };
}

export async function getAdminSnapshot() {
  const db = await getDb();
  if (!db) return { files: [], rooms: [], users: [], stats: { bytes: 0, files: 0, rooms: 0, users: 0 } };
  const [fileRows, roomRows, userRows, sizeRows] = await Promise.all([
    db.select().from(files).orderBy(desc(files.createdAt)).limit(100),
    db.select().from(rooms).orderBy(desc(rooms.createdAt)).limit(100),
    db.select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt }).from(users).orderBy(desc(users.createdAt)).limit(100),
    db.select({ total: sql<number>`coalesce(sum(${files.sizeBytes}), 0)` }).from(files),
  ]);
  return { files: fileRows, rooms: roomRows.map(({ secretHash: _secretHash, ...room }) => room), users: userRows, stats: { bytes: Number(sizeRows[0]?.total ?? 0), files: fileRows.length, rooms: roomRows.length, users: userRows.length } };
}

export async function getFileByPublicToken(publicToken: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(files).where(and(eq(files.publicToken, publicToken), eq(files.visibility, "public"))).limit(1);
  return result[0];
}

export async function getRoomByCode(roomCode: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(rooms).where(eq(rooms.roomCode, roomCode)).limit(1);
  return result[0];
}

export { files, folders, rooms, users };
