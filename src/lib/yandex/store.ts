/**
 * Yandex import persistence — dual-backend data access (Turso / Prisma),
 * following the existing MQ database.ts pattern.
 *
 * SECURITY: token columns are only ever written/read as ciphertext
 * (src/lib/yandex/token-crypto.ts). This module NEVER returns plaintext
 * tokens to callers other than the internal getTokenForUser() used by
 * server-side import routes.
 */

import { isTurso, getTursoClient, tursoQuery } from "@/lib/database";
import { randomUUID } from "crypto";
import { tryDecryptSecret } from "./token-crypto";

/**
 * Execute a Turso statement through tursoQuery — the codebase's auto
 * schema-init pattern (catches "no such table" → ensureTursoSchema → retry).
 */
async function texec(
  sql: string,
  args: Array<string | number | null>
): Promise<{ rows: Array<Record<string, unknown>> }> {
  const t = getTursoClient();
  const r = await tursoQuery(() => t.execute({ sql, args }));
  return { rows: (r.rows as unknown as Array<Record<string, unknown>>) || [] };
}


function newId(): string {
  return `c${Date.now().toString(36)}${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

// ── YandexAccount ─────────────────────────────────────────────────────────────

export interface YandexAccountRow {
  id: string;
  userId: string;
  yandexUid: string | null;
  login: string | null;
  displayName: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface UpsertAccountInput {
  yandexUid: string | null;
  login: string | null;
  displayName: string | null;
  accessTokenEnc: string;
  refreshTokenEnc: string | null;
  expiresAt: string | null; // ISO
}

export async function upsertAccount(userId: string, input: UpsertAccountInput): Promise<YandexAccountRow> {
  const now = new Date().toISOString();
  if (isTurso()) {
    const existing = await texec("SELECT id FROM YandexAccount WHERE userId = ?", [userId]);
    if (existing.rows.length > 0) {
      await texec(`UPDATE YandexAccount SET yandexUid=?, login=?, displayName=?, accessTokenEnc=?, refreshTokenEnc=?, expiresAt=?, updatedAt=? WHERE userId=?`, [ input.yandexUid ?? null, input.login ?? null, input.displayName ?? null, input.accessTokenEnc, input.refreshTokenEnc ?? null, input.expiresAt ?? null, now, userId, ]);
    } else {
      await texec(`INSERT INTO YandexAccount (id, userId, yandexUid, login, displayName, accessTokenEnc, refreshTokenEnc, expiresAt, createdAt, updatedAt)
              VALUES (?,?,?,?,?,?,?,?,?,?)`, [ newId(), userId, input.yandexUid ?? null, input.login ?? null, input.displayName ?? null, input.accessTokenEnc, input.refreshTokenEnc ?? null, input.expiresAt ?? null, now, now, ]);
    }
    return (await getAccount(userId))!;
  }
  const { db } = await import("@/lib/db");
  await db.yandexAccount.upsert({
    where: { userId },
    create: {
      userId,
      yandexUid: input.yandexUid ?? null,
      login: input.login ?? null,
      displayName: input.displayName ?? null,
      accessTokenEnc: input.accessTokenEnc,
      refreshTokenEnc: input.refreshTokenEnc ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
    update: {
      yandexUid: input.yandexUid ?? null,
      login: input.login ?? null,
      displayName: input.displayName ?? null,
      accessTokenEnc: input.accessTokenEnc,
      refreshTokenEnc: input.refreshTokenEnc ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    },
  });
  return (await getAccount(userId))!;
}

export async function getAccount(userId: string): Promise<YandexAccountRow | null> {
  if (isTurso()) {
    const r = await texec("SELECT * FROM YandexAccount WHERE userId = ? LIMIT 1", [userId]);
    const row = r.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      userId: String(row.userId),
      yandexUid: row.yandexUid != null ? String(row.yandexUid) : null,
      login: row.login != null ? String(row.login) : null,
      displayName: row.displayName != null ? String(row.displayName) : null,
      expiresAt: row.expiresAt != null ? String(row.expiresAt) : null,
      createdAt: String(row.createdAt ?? ""),
    };
  }
  const { db } = await import("@/lib/db");
  const acc = await db.yandexAccount.findUnique({ where: { userId } });
  if (!acc) return null;
  return {
    id: acc.id,
    userId: acc.userId,
    yandexUid: acc.yandexUid ?? null,
    login: acc.login ?? null,
    displayName: acc.displayName ?? null,
    expiresAt: acc.expiresAt ? acc.expiresAt.toISOString() : null,
    createdAt: acc.createdAt.toISOString(),
  };
}

/** Decrypt the stored access token (server-side callers only). */
export async function getTokenForUser(userId: string): Promise<string | null> {
  let enc: string | null = null;
  if (isTurso()) {
    const r = await texec("SELECT accessTokenEnc FROM YandexAccount WHERE userId = ? LIMIT 1", [userId]);
    enc = r.rows.length ? String((r.rows[0] as Record<string, unknown>).accessTokenEnc ?? "") : null;
  } else {
    const { db } = await import("@/lib/db");
    const acc = await db.yandexAccount.findUnique({ where: { userId }, select: { accessTokenEnc: true } });
    enc = acc?.accessTokenEnc ?? null;
  }
  return tryDecryptSecret(enc);
}

export async function deleteAccount(userId: string): Promise<void> {
  if (isTurso()) {
    await texec("DELETE FROM YandexAccount WHERE userId = ?", [userId]);
    return;
  }
  const { db } = await import("@/lib/db");
  await db.yandexAccount.deleteMany({ where: { userId } });
}

// ── YandexAuthSession (device flow) ─────────────────────────────────────────

export interface AuthSessionRow {
  id: string;
  userId: string;
  deviceCodeEnc: string;
  userCode: string | null;
  verificationUrl: string | null;
  expiresAt: string | null;
}

export async function startAuthSession(
  userId: string,
  input: { deviceCodeEnc: string; userCode: string; verificationUrl: string; expiresAt: string }
): Promise<void> {
  const now = new Date().toISOString();
  if (isTurso()) {
    // Invalidate previous pending sessions for this user
    await texec("UPDATE YandexAuthSession SET used = 1 WHERE userId = ? AND used = 0", [userId]);
    await texec(`INSERT INTO YandexAuthSession (id, userId, deviceCodeEnc, userCode, verificationUrl, expiresAt, used, createdAt)
            VALUES (?,?,?,?,?,?,0,?)`, [newId(), userId, input.deviceCodeEnc, input.userCode, input.verificationUrl, input.expiresAt, now]);
    return;
  }
  const { db } = await import("@/lib/db");
  await db.yandexAuthSession.updateMany({ where: { userId, used: false }, data: { used: true } });
  await db.yandexAuthSession.create({
    data: {
      userId,
      deviceCodeEnc: input.deviceCodeEnc,
      userCode: input.userCode,
      verificationUrl: input.verificationUrl,
      expiresAt: new Date(input.expiresAt),
    },
  });
}

export async function getActiveAuthSession(userId: string): Promise<AuthSessionRow | null> {
  if (isTurso()) {
    const r = await texec("SELECT * FROM YandexAuthSession WHERE userId = ? AND used = 0 ORDER BY createdAt DESC LIMIT 1", [userId]);
    const row = r.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      userId: String(row.userId),
      deviceCodeEnc: String(row.deviceCodeEnc ?? ""),
      userCode: row.userCode != null ? String(row.userCode) : null,
      verificationUrl: row.verificationUrl != null ? String(row.verificationUrl) : null,
      expiresAt: row.expiresAt != null ? String(row.expiresAt) : null,
    };
  }
  const { db } = await import("@/lib/db");
  const s = await db.yandexAuthSession.findFirst({
    where: { userId, used: false },
    orderBy: { createdAt: "desc" },
  });
  if (!s) return null;
  return {
    id: s.id,
    userId: s.userId,
    deviceCodeEnc: s.deviceCodeEnc,
    userCode: s.userCode ?? null,
    verificationUrl: s.verificationUrl ?? null,
    expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
  };
}

export async function finishAuthSession(id: string): Promise<void> {
  if (isTurso()) {
    await texec("UPDATE YandexAuthSession SET used = 1 WHERE id = ?", [id]);
    return;
  }
  const { db } = await import("@/lib/db");
  await db.yandexAuthSession.update({ where: { id }, data: { used: true } });
}

// ── YandexImportJob ───────────────────────────────────────────────────────────

export type JobStatus =
  | "pending"
  | "fetching"
  | "matching"
  | "importing"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "cancelled";

export interface JobRow {
  id: string;
  userId: string;
  status: JobStatus;
  data: string; // JSON blob
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export async function createJob(userId: string, data: unknown): Promise<string> {
  const id = newId();
  const now = new Date().toISOString();
  if (isTurso()) {
    await texec(`INSERT INTO YandexImportJob (id, userId, status, data, createdAt, updatedAt) VALUES (?,?,?,?,?,?)`, [id, userId, "pending", JSON.stringify(data), now, now]);
    return id;
  }
  const { db } = await import("@/lib/db");
  await db.yandexImportJob.create({
    data: { id, userId, status: "pending", data: JSON.stringify(data) },
  });
  return id;
}

export async function getJob(userId: string, jobId: string): Promise<JobRow | null> {
  const row = await getJobAny(jobId);
  if (!row || row.userId !== userId) return null; // isolation: cross-user job ids read as missing
  return row;
}

async function getJobAny(jobId: string): Promise<JobRow | null> {
  if (isTurso()) {
    const r = await texec("SELECT * FROM YandexImportJob WHERE id = ? LIMIT 1", [jobId]);
    const row = r.rows[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      userId: String(row.userId),
      status: String(row.status ?? "pending") as JobStatus,
      data: String(row.data ?? "{}"),
      error: row.error != null ? String(row.error) : null,
      createdAt: String(row.createdAt ?? ""),
      updatedAt: String(row.updatedAt ?? ""),
      completedAt: row.completedAt != null ? String(row.completedAt) : null,
    };
  }
  const { db } = await import("@/lib/db");
  const j = await db.yandexImportJob.findUnique({ where: { id: jobId } });
  if (!j) return null;
  return {
    id: j.id,
    userId: j.userId,
    status: j.status as JobStatus,
    data: j.data,
    error: j.error ?? null,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
    completedAt: j.completedAt ? j.completedAt.toISOString() : null,
  };
}

export async function updateJob(
  userId: string,
  jobId: string,
  patch: { status?: JobStatus; data?: unknown; error?: string | null; completed?: boolean }
): Promise<void> {
  const now = new Date().toISOString();
  if (isTurso()) {
    const sets: string[] = ["updatedAt = ?"];
    const args: (string | null)[] = [now];
    if (patch.status !== undefined) {
      sets.push("status = ?");
      args.push(patch.status);
    }
    if (patch.data !== undefined) {
      sets.push("data = ?");
      args.push(JSON.stringify(patch.data));
    }
    if (patch.error !== undefined) {
      sets.push("error = ?");
      args.push(patch.error);
    }
    if (patch.completed) {
      sets.push("completedAt = ?");
      args.push(now);
    }
    args.push(jobId, userId);
    await texec(`UPDATE YandexImportJob SET ${sets.join(", ")} WHERE id = ? AND userId = ?`, args);
    return;
  }
  const { db } = await import("@/lib/db");
  const data: Record<string, unknown> = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.data !== undefined) data.data = JSON.stringify(patch.data);
  if (patch.error !== undefined) data.error = patch.error;
  if (patch.completed) data.completedAt = new Date();
  if (Object.keys(data).length) {
    await db.yandexImportJob.updateMany({ where: { id: jobId, userId }, data });
  }
}

/** Completed jobs that imported a given Yandex playlist (re-import detection). */
export async function findCompletedImportsForPlaylist(
  userId: string,
  sourcePlaylistKind: number
): Promise<Array<{ id: string; createdAt: string }>> {
  // The job blob keeps playlists[].kind — JSON scan (small row count per user).
  let rows: Array<{ id: string; data: string; createdAt: string }>;
  if (isTurso()) {
    const r = await texec(`SELECT id, data, createdAt FROM YandexImportJob
            WHERE userId = ? AND status IN ('completed','completed_with_errors') ORDER BY createdAt DESC LIMIT 50`, [userId]);
    rows = r.rows.map((row) => {
      const o = row as Record<string, unknown>;
      return { id: String(o.id), data: String(o.data ?? "{}"), createdAt: String(o.createdAt ?? "") };
    });
  } else {
    const { db } = await import("@/lib/db");
    const js = await db.yandexImportJob.findMany({
      where: { userId, status: { in: ["completed", "completed_with_errors"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, data: true, createdAt: true },
    });
    rows = js.map((j) => ({ id: j.id, data: j.data, createdAt: j.createdAt.toISOString() }));
  }
  const out: Array<{ id: string; createdAt: string }> = [];
  for (const row of rows) {
    try {
      const blob = JSON.parse(row.data) as { playlists?: Array<{ kind?: number }> };
      if (blob.playlists?.some((p) => Number(p.kind) === Number(sourcePlaylistKind))) {
        out.push({ id: row.id, createdAt: row.createdAt });
      }
    } catch {
      // ignore malformed legacy rows
    }
  }
  return out;
}

/** Set of Yandex playlist kinds this user has already imported (any completed job). */
export async function getCompletedImportKinds(userId: string): Promise<Set<number>> {
  let rows: Array<{ data: string }>;
  if (isTurso()) {
    const r = await texec(`SELECT data FROM YandexImportJob
            WHERE userId = ? AND status IN ('completed','completed_with_errors') ORDER BY createdAt DESC LIMIT 50`, [userId]);
    rows = r.rows.map((row) => ({ data: String((row as Record<string, unknown>).data ?? "{}") }));
  } else {
    const { db } = await import("@/lib/db");
    const js = await db.yandexImportJob.findMany({
      where: { userId, status: { in: ["completed", "completed_with_errors"] } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { data: true },
    });
    rows = js.map((j) => ({ data: j.data }));
  }
  const kinds = new Set<number>();
  for (const row of rows) {
    try {
      const blob = JSON.parse(row.data) as { playlists?: Array<{ kind?: number }> };
      for (const p of blob.playlists ?? []) {
        const k = Number(p.kind);
        if (Number.isFinite(k)) kinds.add(k);
      }
    } catch {
      // ignore malformed rows
    }
  }
  return kinds;
}
