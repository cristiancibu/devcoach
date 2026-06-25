import * as vscode from "vscode";
import { HOUR, isLateNight } from "../utils/time";
import { StatsManager } from "./statsManager";

const BREAK_AFTER_MS = 2 * HOUR;
const BURNOUT_THRESHOLDS = [
  { key: "4h", ms: 4 * HOUR, message: "You've coded for 4+ hours today. A short reset would help future-you." },
  { key: "6h", ms: 6 * HOUR, message: "6+ hours of coding today. Consider stepping away before quality drops." },
  { key: "8h", ms: 8 * HOUR, message: "8+ hours today. Burnout prevention mode says: take a real break." }
];

const IDLE_MESSAGES = [
  "Tired already? You've got more in you.",
  "Your future self is waiting for this code...",
  "Tiny restart, big momentum. Pick the next small step."
];

export class Notifier {
  private lastBreakActiveMs = 0;
  private warnedBurnout = new Set<string>();
  private lastIdleMessageAt = 0;
  private lastSleepReminderDay?: string;

  constructor(private readonly statsManager: StatsManager) {}

  maybeShowBreakReminder(currentSessionActiveMs: number): void {
    if (currentSessionActiveMs - this.lastBreakActiveMs < BREAK_AFTER_MS) {
      return;
    }

    this.lastBreakActiveMs = currentSessionActiveMs;
    void vscode.window.showInformationMessage("You've been actively coding for 2 hours. Time for a gentle break?", "Start break");
  }

  maybeShowIdleMotivation(): void {
    const now = Date.now();
    if (now - this.lastIdleMessageAt < 30 * 60 * 1000) {
      return;
    }

    this.lastIdleMessageAt = now;
    const message = IDLE_MESSAGES[Math.floor(Math.random() * IDLE_MESSAGES.length)];
    void vscode.window.showInformationMessage(message);
  }

  maybeShowBurnoutWarnings(): void {
    const totalMs = this.statsManager.getDailyStats().totalCodingMs;

    for (const threshold of BURNOUT_THRESHOLDS) {
      if (totalMs >= threshold.ms && !this.warnedBurnout.has(threshold.key)) {
        this.warnedBurnout.add(threshold.key);
        void vscode.window.showWarningMessage(threshold.message);
      }
    }
  }

  maybeShowSleepReminder(now = new Date()): void {
    const day = now.toDateString();

    if (!isLateNight(now) || this.lastSleepReminderDay === day) {
      return;
    }

    this.lastSleepReminderDay = day;
    void vscode.window.showWarningMessage("It's very late. Sleep will probably debug more than one more commit.");
  }
}
