import * as vscode from "vscode";
import { ActivityTracker } from "./core/activityTracker";
import { Notifier } from "./core/notifier";
import { SessionManager } from "./core/sessionManager";
import { StatsManager } from "./core/statsManager";
import { DevCoachProvider } from "./sidebar";
import { formatDuration } from "./utils/time";

export function activate(context: vscode.ExtensionContext) {
  console.log("DevCoach active");

  const sessionManager = new SessionManager(context);
  const statsManager = new StatsManager(sessionManager);
  const notifier = new Notifier(statsManager);
  const provider = new DevCoachProvider(context, sessionManager, statsManager);
  const tracker = new ActivityTracker(sessionManager, notifier, () => provider.refresh());

  context.subscriptions.push(vscode.window.registerWebviewViewProvider("devcoachView", provider));
  tracker.start(context);

  context.subscriptions.push(
    vscode.commands.registerCommand("devcoach.start", () => {
      sessionManager.startActivity(vscode.window.activeTextEditor?.document);
      provider.refresh();
      vscode.window.showInformationMessage("DevCoach session started.");
    }),

    vscode.commands.registerCommand("devcoach.stats", () => {
      vscode.window.showInformationMessage(statsManager.getSummaryText(), { modal: true });
    }),

    vscode.commands.registerCommand("devcoach.break", () => {
      sessionManager.endCurrentSession();
      provider.refresh();
      vscode.window.showInformationMessage("Break started. Step away and let your brain cool down.");
    }),

    vscode.commands.registerCommand("devcoach.burnout", () => {
      const stats = statsManager.getDailyStats();
      const message =
        stats.totalCodingMs >= 8 * 60 * 60 * 1000
          ? "Burnout risk is high. Take a long break."
          : stats.totalCodingMs >= 6 * 60 * 60 * 1000
            ? "You've had a long coding day. Plan a stop point soon."
            : stats.totalCodingMs >= 4 * 60 * 60 * 1000
              ? "You're past 4 hours today. A rest checkpoint is a good idea."
              : `You're at ${formatDuration(stats.totalCodingMs)} today. Looking balanced so far.`;

      vscode.window.showWarningMessage(message);
    })
  );
}

export function deactivate() {
  // VS Code disposes extension subscriptions automatically.
}
