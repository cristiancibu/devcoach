import * as vscode from "vscode";
import { MINUTE } from "../utils/time";
import { Notifier } from "./notifier";
import { SessionManager } from "./sessionManager";

const ACTIVE_TICK_MS = MINUTE;
const IDLE_AFTER_MS = 5 * MINUTE;
const END_AFTER_MS = 30 * MINUTE;

export class ActivityTracker {
  private interval?: NodeJS.Timeout;
  private lastTickAt = Date.now();
  private idleNotifiedForSession = false;

  constructor(
    private readonly sessionManager: SessionManager,
    private readonly notifier: Notifier,
    private readonly onActivityChanged: () => void
  ) {}

  start(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => this.markActivity(event.document)),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.sessionManager.switchFile(editor.document);
          this.idleNotifiedForSession = false;
          this.onActivityChanged();
        }
      })
    );

    if (vscode.window.activeTextEditor) {
      this.sessionManager.switchFile(vscode.window.activeTextEditor.document);
    }

    this.interval = setInterval(() => this.tick(), ACTIVE_TICK_MS);
    context.subscriptions.push({ dispose: () => this.dispose() });
  }

  markActivity(document?: vscode.TextDocument): void {
    this.sessionManager.startActivity(document);
    this.idleNotifiedForSession = false;
    this.onActivityChanged();
  }

  dispose(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private tick(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastTickAt;
    this.lastTickAt = now;

    if (this.sessionManager.isOnBreak()) {
      this.notifier.maybeShowSleepReminder();
      this.onActivityChanged();
      return;
    }

    const session = this.sessionManager.getCurrentSession();
    const lastActivityAt = this.sessionManager.getLastActivityAt();

    if (!session || !lastActivityAt) {
      this.notifier.maybeShowSleepReminder();
      return;
    }

    const idleForMs = now - lastActivityAt;

    if (idleForMs >= END_AFTER_MS) {
      this.sessionManager.endCurrentSession();
      this.onActivityChanged();
      return;
    }

    if (idleForMs >= IDLE_AFTER_MS) {
      this.sessionManager.recordIdleTime(elapsedMs);

      if (!this.idleNotifiedForSession) {
        this.notifier.maybeShowIdleMotivation();
        this.idleNotifiedForSession = true;
      }
    } else {
      this.sessionManager.recordActiveTime(elapsedMs);
      this.notifier.maybeShowBreakReminder(session.activeMs);
      this.notifier.maybeShowBurnoutWarnings();
    }

    this.notifier.maybeShowSleepReminder();
    this.onActivityChanged();
  }
}
