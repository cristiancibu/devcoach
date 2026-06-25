import { SessionManager, SessionSnapshot } from "./sessionManager";
import { formatDuration } from "../utils/time";

export interface LanguageStat {
  languageId: string;
  durationMs: number;
  percentage: number;
}

export interface DailyStats {
  totalCodingTime: string;
  totalCodingMs: number;
  idleTime: string;
  sessions: number;
  focusRatio: number;
  languages: LanguageStat[];
  topLanguage?: LanguageStat;
  topFiles: Array<{ fileName: string; durationMs: number }>;
  insight: string;
}

export class StatsManager {
  constructor(private readonly sessionManager: SessionManager) {}

  getDailyStats(): DailyStats {
    const snapshot = this.sessionManager.getSnapshot();
    const languages = this.buildLanguageStats(snapshot);
    const topLanguage = languages[0];
    const totalTrackedMs = snapshot.todayActiveMs + snapshot.todayIdleMs;
    const focusRatio = totalTrackedMs === 0 ? 0 : Math.round((snapshot.todayActiveMs / totalTrackedMs) * 100);

    return {
      totalCodingTime: formatDuration(snapshot.todayActiveMs),
      totalCodingMs: snapshot.todayActiveMs,
      idleTime: formatDuration(snapshot.todayIdleMs),
      sessions: snapshot.sessionsToday,
      focusRatio,
      languages,
      topLanguage,
      topFiles: Object.entries(snapshot.fileMs)
        .map(([fileName, durationMs]) => ({ fileName, durationMs }))
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 5),
      insight: this.buildInsight(topLanguage)
    };
  }

  getSummaryText(): string {
    const stats = this.getDailyStats();
    const languageText = stats.languages.length
      ? stats.languages.map((language) => `${language.languageId}: ${language.percentage}%`).join(", ")
      : "No language data yet";

    return [
      `Coding today: ${stats.totalCodingTime}`,
      `Sessions: ${stats.sessions}`,
      `Focus ratio: ${stats.focusRatio}%`,
      `Languages: ${languageText}`,
      stats.insight
    ].join("\n");
  }

  private buildLanguageStats(snapshot: SessionSnapshot): LanguageStat[] {
    return Object.entries(snapshot.languageMs)
      .map(([languageId, durationMs]) => ({
        languageId,
        durationMs,
        percentage: snapshot.todayActiveMs === 0 ? 0 : Math.round((durationMs / snapshot.todayActiveMs) * 100)
      }))
      .sort((a, b) => b.durationMs - a.durationMs);
  }

  private buildInsight(topLanguage?: LanguageStat): string {
    if (!topLanguage) {
      return "Start coding and DevCoach will build your daily language breakdown.";
    }

    return `You worked mostly in ${topLanguage.languageId} today (${topLanguage.percentage}%).`;
  }
}
