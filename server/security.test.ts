import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFileByPublicToken: vi.fn(),
  storageGetSignedUrl: vi.fn(),
  getRoomByCode: vi.fn(),
  getAdminSnapshot: vi.fn(),
}));

vi.mock("./db", () => ({
  getFileByPublicToken: mocks.getFileByPublicToken,
  getRoomByCode: mocks.getRoomByCode,
  getAdminSnapshot: mocks.getAdminSnapshot,
  getDashboardData: vi.fn(),
  getDb: vi.fn(),
}));
vi.mock("./storage", () => ({
  storageGetSignedUrl: mocks.storageGetSignedUrl,
  storagePut: vi.fn(),
}));

import { appRouter } from "./routers";

describe("RedVault access controls", () => {
  it("returns only safe public metadata for a public link", async () => {
    mocks.getFileByPublicToken.mockResolvedValueOnce({
      id: 7,
      name: "launch.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1200,
      downloads: 3,
      createdAt: new Date("2026-09-15T00:00:00Z"),
      fileKey: "private/secret-key",
      url: "/manus-storage/private/secret-key",
      ownerId: 44,
      visibility: "public",
    });
    mocks.storageGetSignedUrl.mockResolvedValueOnce("https://signed.example/launch.pdf");

    const result = await appRouter.createCaller({ user: null, req: {} as any, res: {} as any }).files.publicByToken({ token: "public-token-123" });

    expect(result).toEqual({
      file: expect.objectContaining({ id: 7, name: "launch.pdf", mimeType: "application/pdf" }),
      url: "https://signed.example/launch.pdf",
    });
    expect(result.file).not.toHaveProperty("fileKey");
    expect(result.file).not.toHaveProperty("ownerId");
  });

  it("rejects an invalid private room secret before exposing room contents", async () => {
    mocks.getRoomByCode.mockResolvedValueOnce({ id: 5, roomCode: "RV-ROOM123", name: "Private room", secretHash: "not-the-right-hash" });

    await expect(appRouter.createCaller({ user: null, req: {} as any, res: {} as any }).rooms.access({ roomCode: "RV-ROOM123", secret: "wrong" })).rejects.toThrow("not valid");
  });

  it("blocks admin data from regular users", async () => {
    const caller = appRouter.createCaller({ user: { id: 1, role: "user" } as any, req: {} as any, res: {} as any });
    await expect(caller.admin.snapshot()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getAdminSnapshot).not.toHaveBeenCalled();
  });
});
