import * as vscode from "vscode";
import { dayKey } from "../utils/time";

export interface LanguageSlice {
  languageId: string;
  fileName: string;
  durationMs: number;
}

export interface CodingSession {
  id: string;
  day: string;
  startedAt: number;
  endedAt?: number;
  activeMs: number;
  idleMs: number;
  slices: LanguageSlice[];
}

export interface SessionSnapshot {
  currentSession?: CodingSession;
  todayActiveMs: number;
  todayIdleMs: number;
  sessionsToday: number;
  languageMs: Record<string, number>;
  fileMs: Record<string, number>;
}

const STORAGE_KEY = "devcoach.sessions";

export class SessionManager {
  private sessions: CodingSession[];
  private current?: CodingSession;
  private lastActivityAt?: number;
  private activeFile?: { languageId: string; fileName: string };

  constructor(private readonly context: vscode.ExtensionContext) {
    this.sessions = context.globalState.get<CodingSession[]>(STORAGE_KEY, []);
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
      this.activeFile = this.describeDocument(activeEditor.document);
    }
  }

  startActivity(document?: vscode.TextDocument): CodingSession {
    const now = Date.now();

    if (!this.current || this.current.endedAt) {
      this.current = {
        id: `${now}`,
        day: dayKey(),
        startedAt: now,
        activeMs: 0,
        idleMs: 0,
        slices: []
      };
      this.sessions.push(this.current);
    }

    if (document) {
      this.activeFile = this.describeDocument(document);
    }

    this.lastActivityAt = now;
    void this.persist();
    return this.current;
  }

  switchFile(document: vscode.TextDocument): void {
    this.activeFile = this.describeDocument(document);
    this.startActivity(document);
  }

  recordActiveTime(durationMs: number): void {
    if (!this.current || this.current.endedAt || durationMs <= 0) {
      return;
    }

    this.current.activeMs += durationMs;

    if (this.activeFile) {
      this.current.slices.push({
        languageId: this.activeFile.languageId,
        fileName: this.activeFile.fileName,
        durationMs
      });
    }

    void this.persist();
  }

  recordIdleTime(durationMs: number): void {
    if (!this.current || this.current.endedAt || durationMs <= 0) {
      return;
    }

    this.current.idleMs += durationMs;
    void this.persist();
  }

  endCurrentSession(): void {
    if (!this.current || this.current.endedAt) {
      return;
    }

    this.current.endedAt = Date.now();
    this.current = undefined;
    this.lastActivityAt = undefined;
    void this.persist();
  }

  getCurrentSession(): CodingSession | undefined {
    return this.current;
  }

  getLastActivityAt(): number | undefined {
    return this.lastActivityAt;
  }

  getSnapshot(date = new Date()): SessionSnapshot {
    const today = dayKey(date);
    const sessions = this.sessions.filter((session) => session.day === today);
    const languageMs: Record<string, number> = {};
    const fileMs: Record<string, number> = {};
    let todayActiveMs = 0;
    let todayIdleMs = 0;

    for (const session of sessions) {
      todayActiveMs += session.activeMs;
      todayIdleMs += session.idleMs;

      for (const slice of session.slices) {
        languageMs[slice.languageId] = (languageMs[slice.languageId] ?? 0) + slice.durationMs;
        fileMs[slice.fileName] = (fileMs[slice.fileName] ?? 0) + slice.durationMs;
      }
    }

    return {
      currentSession: this.current,
      todayActiveMs,
      todayIdleMs,
      sessionsToday: sessions.length,
      languageMs,
      fileMs
    };
  }

  getSessions(): CodingSession[] {
    return [...this.sessions];
  }

  private describeDocument(document: vscode.TextDocument): { languageId: string; fileName: string } {
    return {
      languageId: document.languageId || "plaintext",
      fileName: document.fileName || document.uri.path
    };
  }

  private async persist(): Promise<void> {
    await this.context.globalState.update(STORAGE_KEY, this.sessions.slice(-180));
  }
}
