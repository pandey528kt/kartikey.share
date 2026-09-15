import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { and, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import { z } from "zod";
import { files, folders, rooms } from "../drizzle/schema";
import { getAdminSnapshot, getDashboardData, getDb, getFileByPublicToken, getRoomByCode } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import { systemRouter } from "./_core/systemRouter";

const roomSecretHash = (secret: string) => createHash("sha256").update(secret.trim()).digest("hex");
const cleanName = (value: string) => value.trim().replace(/[\\/]/g, "-").slice(0, 255) || "Untitled";

async function roomHasAccess(roomId: number, secret: string) {
  const db = await getDb();
  if (!db) return false;
  const room = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  return room.length > 0 && roomSecretHash(secret) === room[0].secretHash;
}

const fileInput = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(160),
  sizeBytes: z.number().int().nonnegative().max(250_000_000),
  dataBase64: z.string().min(1),
  visibility: z.enum(["public", "private"]),
  roomId: z.number().int().positive().optional(),
  folderId: z.number().int().positive().optional(),
  roomSecret: z.string().max(80).optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    overview: protectedProcedure.input(z.object({ search: z.string().max(120).optional() }).optional()).query(({ ctx, input }) => getDashboardData(ctx.user.id, input?.search)),
    createFolder: protectedProcedure.input(z.object({ name: z.string().min(1).max(120), roomId: z.number().int().positive().optional(), parentId: z.number().int().positive().optional(), roomSecret: z.string().max(80).optional() })).mutation(async ({ ctx, input }) => {
      if (input.roomId && !(await roomHasAccess(input.roomId, input.roomSecret ?? ""))) throw new Error("Invalid room secret");
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const [created] = await db.insert(folders).values({ ownerId: ctx.user.id, name: cleanName(input.name), roomId: input.roomId, parentId: input.parentId }).$returningId();
      return { id: created.id };
    }),
    renameFolder: protectedProcedure.input(z.object({ id: z.number().int().positive(), name: z.string().min(1).max(120) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      await db.update(folders).set({ name: cleanName(input.name) }).where(and(eq(folders.id, input.id), eq(folders.ownerId, ctx.user.id)));
      return { success: true };
    }),
    deleteFolder: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const children = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.parentId, input.id), eq(folders.ownerId, ctx.user.id))).limit(1);
      if (children.length) throw new Error("Move or delete nested folders first");
      await db.update(files).set({ folderId: null }).where(and(eq(files.folderId, input.id), eq(files.ownerId, ctx.user.id)));
      await db.delete(folders).where(and(eq(folders.id, input.id), eq(folders.ownerId, ctx.user.id)));
      return { success: true };
    }),
    moveFile: protectedProcedure.input(z.object({ fileId: z.number().int().positive(), folderId: z.number().int().positive().nullable() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      if (input.folderId) {
        const folder = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.id, input.folderId), eq(folders.ownerId, ctx.user.id))).limit(1);
        if (!folder.length) throw new Error("Folder not found");
      }
      await db.update(files).set({ folderId: input.folderId }).where(and(eq(files.id, input.fileId), eq(files.ownerId, ctx.user.id)));
      return { success: true };
    }),
  }),
  rooms: router({
    create: protectedProcedure.input(z.object({ name: z.string().min(2).max(120) })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const secret = randomBytes(3).toString("hex").toUpperCase();
      const roomCode = `RV-${nanoid(7).toUpperCase()}`;
      await db.insert(rooms).values({ ownerId: ctx.user.id, name: cleanName(input.name), roomCode, secretHash: roomSecretHash(secret) });
      return { roomCode, secret };
    }),
    access: publicProcedure.input(z.object({ roomCode: z.string().min(3).max(32), secret: z.string().min(1).max(80) })).query(async ({ input }) => {
      const room = await getRoomByCode(input.roomCode.trim().toUpperCase());
      if (!room || roomSecretHash(input.secret) !== room.secretHash) throw new Error("That room code or secret is not valid");
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const [roomFiles, roomFolders] = await Promise.all([
        db.select().from(files).where(eq(files.roomId, room.id)).orderBy(files.createdAt),
        db.select().from(folders).where(eq(folders.roomId, room.id)).orderBy(folders.createdAt),
      ]);
      return { room: { id: room.id, roomCode: room.roomCode, name: room.name }, files: roomFiles.map((file) => ({ id: file.id, name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes, visibility: file.visibility, downloads: file.downloads, createdAt: file.createdAt, folderId: file.folderId })), folders: roomFolders.map((folder) => ({ id: folder.id, name: folder.name, parentId: folder.parentId, createdAt: folder.createdAt })) };
    }),
    upload: publicProcedure.input(z.object({ roomCode: z.string().min(3).max(32), roomSecret: z.string().min(1).max(80), name: z.string().min(1).max(255), mimeType: z.string().min(1).max(160), sizeBytes: z.number().int().nonnegative().max(250_000_000), dataBase64: z.string().min(1), folderId: z.number().int().positive().optional() })).mutation(async ({ input }) => {
      const room = await getRoomByCode(input.roomCode.trim().toUpperCase());
      if (!room || !(await roomHasAccess(room.id, input.roomSecret ?? ""))) throw new Error("Invalid private room credentials");
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      if (input.folderId) {
        const folder = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.id, input.folderId), eq(folders.roomId, room.id))).limit(1);
        if (!folder.length) throw new Error("Folder not found in this room");
      }
      const buffer = Buffer.from(input.dataBase64, "base64");
      if (buffer.length > 250_000_000) throw new Error("File is too large");
      const stored = await storagePut(`${room.ownerId}/rooms/${room.id}/${Date.now()}-${cleanName(input.name)}`, buffer, input.mimeType);
      await db.insert(files).values({ ownerId: room.ownerId, roomId: room.id, folderId: input.folderId, name: cleanName(input.name), originalName: cleanName(input.name), fileKey: stored.key, url: stored.url, mimeType: input.mimeType, sizeBytes: buffer.length, visibility: "private", publicToken: null });
      return { success: true };
    }),
    createFolder: publicProcedure.input(z.object({ roomCode: z.string().min(3).max(32), secret: z.string().min(1).max(80), name: z.string().min(1).max(120), parentId: z.number().int().positive().optional() })).mutation(async ({ input }) => {
      const room = await getRoomByCode(input.roomCode.trim().toUpperCase());
      if (!room || !(await roomHasAccess(room.id, input.secret))) throw new Error("Invalid private room credentials");
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      await db.insert(folders).values({ ownerId: room.ownerId, roomId: room.id, parentId: input.parentId, name: cleanName(input.name) });
      return { success: true };
    }),
    fileAccess: publicProcedure.input(z.object({ roomCode: z.string().min(3).max(32), secret: z.string().min(1).max(80), fileId: z.number().int().positive() })).query(async ({ input }) => {
      const room = await getRoomByCode(input.roomCode.trim().toUpperCase());
      if (!room || !(await roomHasAccess(room.id, input.secret))) throw new Error("Invalid private room credentials");
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const result = await db.select().from(files).where(and(eq(files.id, input.fileId), eq(files.roomId, room.id))).limit(1);
      const file = result[0]; if (!file) throw new Error("File not found");
      await db.update(files).set({ downloads: file.downloads + 1 }).where(eq(files.id, file.id));
      return { url: await storageGetSignedUrl(file.fileKey), file: { id: file.id, name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes, downloads: file.downloads + 1, createdAt: file.createdAt } };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      await db.delete(rooms).where(and(eq(rooms.id, input.id), eq(rooms.ownerId, ctx.user.id)));
      await db.update(files).set({ roomId: null }).where(and(eq(files.roomId, input.id), eq(files.ownerId, ctx.user.id)));
      await db.update(folders).set({ roomId: null }).where(and(eq(folders.roomId, input.id), eq(folders.ownerId, ctx.user.id)));
      return { success: true };
    }),
  }),
  files: router({
    upload: protectedProcedure.input(fileInput).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      if (input.roomId) {
        const room = await db.select({ ownerId: rooms.ownerId }).from(rooms).where(eq(rooms.id, input.roomId)).limit(1);
        if (!room.length || !(await roomHasAccess(input.roomId, input.roomSecret ?? ""))) throw new Error("Invalid private room credentials");
      }
      if (input.folderId) {
        const folder = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.id, input.folderId), eq(folders.ownerId, ctx.user.id))).limit(1);
        if (!folder.length) throw new Error("Folder not found");
      }
      const buffer = Buffer.from(input.dataBase64, "base64");
      if (buffer.length > 250_000_000) throw new Error("File is too large");
      const path = `${ctx.user.id}/files/${Date.now()}-${cleanName(input.name)}`;
      const stored = await storagePut(path, buffer, input.mimeType);
      const publicToken = input.visibility === "public" && !input.roomId ? nanoid(18) : null;
      await db.insert(files).values({ ownerId: ctx.user.id, roomId: input.roomId, folderId: input.folderId, name: cleanName(input.name), originalName: cleanName(input.name), fileKey: stored.key, url: stored.url, mimeType: input.mimeType, sizeBytes: buffer.length, visibility: input.roomId ? "private" : input.visibility, publicToken });
      return { success: true, publicToken };
    }),
    access: protectedProcedure.input(z.object({ id: z.number().int().positive(), roomSecret: z.string().max(80).optional() })).query(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const row = await db.select().from(files).where(eq(files.id, input.id)).limit(1);
      const file = row[0];
      if (!file) throw new Error("File not found");
      const owner = file.ownerId === ctx.user.id;
      const roomAccess = file.roomId ? await roomHasAccess(file.roomId, input.roomSecret ?? "") : false;
      if (!owner && !roomAccess) throw new Error("You do not have access to this file");
      await db.update(files).set({ downloads: file.downloads + 1 }).where(eq(files.id, file.id));
      return { url: await storageGetSignedUrl(file.fileKey), file };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      await db.delete(files).where(and(eq(files.id, input.id), eq(files.ownerId, ctx.user.id)));
      return { success: true };
    }),
    publicByToken: publicProcedure.input(z.object({ token: z.string().min(10).max(32) })).query(async ({ input }) => {
      const file = await getFileByPublicToken(input.token);
      if (!file) throw new Error("This public link is no longer available");
      return { file: { id: file.id, name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes, downloads: file.downloads, createdAt: file.createdAt }, url: await storageGetSignedUrl(file.fileKey) };
    }),
  }),
  admin: router({
    snapshot: adminProcedure.query(() => getAdminSnapshot()),
    deleteFile: adminProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      await db.delete(files).where(eq(files.id, input.id));
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
