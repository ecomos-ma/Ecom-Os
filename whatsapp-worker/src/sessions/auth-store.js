import { access, mkdir, readdir, rm, rename } from "node:fs/promises";
import { constants } from "node:fs";
import { join, relative, resolve } from "node:path";
import { useMultiFileAuthState } from "@whiskeysockets/baileys";
import { requireWorkspaceId } from "../utils/phone.js";

export class WorkspaceAuthStore {
  constructor(rootPath) {
    this.rootPath = resolve(rootPath);
    this.backupRoot = resolve(rootPath, "invalid-backups");
  }

  pathFor(workspaceId) {
    const target = resolve(join(this.rootPath, requireWorkspaceId(workspaceId)));
    const rel = relative(this.rootPath, target);
    if (!rel || rel.startsWith("..") || rel.includes(":")) throw new Error("Unsafe session storage target");
    return target;
  }

  async load(workspaceId) {
    const path = this.pathFor(workspaceId);
    await mkdir(path, { recursive: true });
    const auth = await useMultiFileAuthState(path);
    return { ...auth, path };
  }

  async hasCredentials(workspaceId) {
    try {
      await access(join(this.pathFor(workspaceId), "creds.json"), constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async listWorkspaceIds() {
    await mkdir(this.rootPath, { recursive: true });
    const entries = await readdir(this.rootPath, { withFileTypes: true });
    const ids = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const id = requireWorkspaceId(entry.name);
        if (await this.hasCredentials(id)) ids.push(id);
      } catch {
        // Backups and legacy folders are deliberately ignored.
      }
    }
    return ids;
  }

  async clear(workspaceId) {
    await rm(this.pathFor(workspaceId), { recursive: true, force: true, maxRetries: 3 });
  }

  async resetAuth(workspaceId, { backup = true, reason = "unknown" } = {}) {
    const authPath = this.pathFor(workspaceId);
    const workspaceIdSafe = requireWorkspaceId(workspaceId);

    if (backup) {
      try {
        await mkdir(this.backupRoot, { recursive: true });
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupPath = resolve(this.backupRoot, `${workspaceIdSafe}-${timestamp}`);
        await rename(authPath, backupPath);
        return { backupPath, reason };
      } catch (error) {
        if (error.code === "ENOENT") {
          await mkdir(authPath, { recursive: true });
          return { backupPath: null, reason: "no-existing-auth" };
        }

        if (error.code === "EPERM" || error.code === "EACCES") {
          await rm(authPath, { recursive: true, force: true, maxRetries: 3 });
          await mkdir(authPath, { recursive: true });
          return { backupPath: null, reason: `${reason}:rename-blocked` };
        }

        throw error;
      }
    } else {
      await rm(authPath, { recursive: true, force: true, maxRetries: 3 });
      await mkdir(authPath, { recursive: true });
      return { backupPath: null, reason };
    }
  }
}
