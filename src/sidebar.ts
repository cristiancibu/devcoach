import * as path from "path";
import * as vscode from "vscode";
import { StatsManager } from "./core/statsManager";
import { SessionManager } from "./core/sessionManager";
import { formatDuration } from "./utils/time";

type PanelAction = "start" | "resume" | "stats" | "break" | "burnout" | "refresh";

export class DevCoachProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly sessionManager: SessionManager,
    private readonly statsManager: StatsManager
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, "media"))]
    };

    webviewView.webview.onDidReceiveMessage((message: { action?: PanelAction }) => {
      if (!message.action) {
        return;
      }

      void this.handleAction(message.action);
    });

    this.refresh();
  }

  refresh(): void {
    if (!this.view) {
      return;
    }

    this.view.webview.html = this.getHtml();
  }

  private async handleAction(action: PanelAction): Promise<void> {
    if (action === "refresh") {
      this.refresh();
      return;
    }

    await vscode.commands.executeCommand(`devcoach.${action}`);
    this.refresh();
  }

  private getHtml(): string {
    const nonce = getNonce();
    const snapshot = this.sessionManager.getSnapshot();
    const stats = this.statsManager.getDailyStats();
    const session = snapshot.currentSession;
    const isOnBreak = snapshot.isOnBreak;
    const isActive = Boolean(session) && !isOnBreak;
    const activeSessionMs = session?.activeMs ?? 0;
    const breakStartedAt = snapshot.breakStartedAt ?? 0;
    const breakElapsed = formatDuration(snapshot.currentBreakMs);
    const stateLabel = isOnBreak ? "On break" : isActive ? "Coding" : "Waiting";
    const heroTitle = isOnBreak ? `${breakElapsed} break` : `${stats.totalCodingTime} today`;
    const heroInsight = isOnBreak
      ? "Rest mode is active. Resume when you are ready to focus again."
      : stats.insight;
    const breakProgress = clamp(Math.round((activeSessionMs / (2 * 60 * 60 * 1000)) * 100), 0, 100);
    const burnoutProgress = clamp(Math.round((stats.totalCodingMs / (8 * 60 * 60 * 1000)) * 100), 0, 100);
    const languages = stats.languages.slice(0, 5);
    const files = stats.topFiles.slice(0, 3);
    const languageRows = languages.length
      ? languages
          .map(
            (language) => `
              <div class="bar-row">
                <div class="row-top">
                  <span>${escapeHtml(language.languageId)}</span>
                  <strong>${language.percentage}%</strong>
                </div>
                <div class="track"><div class="fill language" style="width: ${language.percentage}%"></div></div>
              </div>`
          )
          .join("")
      : `<p class="empty">Open a file or start typing to build today's language mix.</p>`;
    const fileRows = files.length
      ? files
          .map(
            (file) => `
              <li>
                <span>${escapeHtml(shortenFile(file.fileName))}</span>
                <strong>${formatDuration(file.durationMs)}</strong>
              </li>`
          )
          .join("")
      : `<li><span>No file activity yet</span><strong>0m</strong></li>`;
    const modeControls = isOnBreak
      ? `
        <button class="primary wide" data-action="resume">Resume</button>
        <button class="ghost active" disabled>On Break</button>`
      : isActive
        ? `
          <button class="ghost active" disabled>Coding</button>
          <button class="primary" data-action="break">Break</button>`
        : `
          <button class="primary" data-action="start">Start</button>
          <button class="ghost" disabled>Break</button>`;

    return `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
          <title>DevCoach</title>
          <style>
            :root {
              color-scheme: light dark;
              --panel: var(--vscode-sideBar-background);
              --panel-strong: var(--vscode-editor-background);
              --text: var(--vscode-sideBar-foreground);
              --muted: var(--vscode-descriptionForeground);
              --border: var(--vscode-sideBarSectionHeader-border);
              --accent: var(--vscode-button-background);
              --accent-text: var(--vscode-button-foreground);
              --warn: var(--vscode-notificationsWarningIcon-foreground);
              --ok: var(--vscode-testing-iconPassed);
              --break: var(--vscode-charts-yellow);
            }

            * { box-sizing: border-box; }

            body {
              margin: 0;
              padding: 12px;
              color: var(--text);
              background: var(--panel);
              font-family: var(--vscode-font-family);
              font-size: var(--vscode-font-size);
            }

            .shell {
              display: flex;
              flex-direction: column;
              gap: 10px;
              min-width: 0;
            }

            .hero {
              padding: 12px;
              border: 1px solid var(--border);
              border-radius: 8px;
              background: var(--panel-strong);
            }

            .status {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
              margin-bottom: 10px;
            }

            .pill {
              display: inline-flex;
              align-items: center;
              gap: 6px;
              min-width: 0;
              padding: 4px 8px;
              border-radius: 999px;
              color: ${isOnBreak ? "var(--break)" : isActive ? "var(--ok)" : "var(--muted)"};
              background: color-mix(in srgb, currentColor 12%, transparent);
              font-size: 11px;
              font-weight: 700;
              text-transform: uppercase;
            }

            .dot {
              width: 7px;
              height: 7px;
              flex: 0 0 auto;
              border-radius: 50%;
              background: currentColor;
            }

            .refresh {
              width: 28px;
              height: 28px;
              border: 1px solid var(--border);
              border-radius: 6px;
              color: var(--text);
              background: transparent;
              cursor: pointer;
            }

            .refresh:hover,
            button:hover {
              filter: brightness(1.08);
            }

            h1 {
              margin: 0;
              font-size: 18px;
              line-height: 1.2;
            }

            .insight {
              margin: 6px 0 0;
              color: var(--muted);
              line-height: 1.35;
            }

            .metrics {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 8px;
            }

            .metric,
            .card {
              border: 1px solid var(--border);
              border-radius: 8px;
              background: var(--panel-strong);
            }

            .metric {
              padding: 10px;
              min-width: 0;
            }

            .metric span {
              display: block;
              color: var(--muted);
              font-size: 11px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .metric strong {
              display: block;
              margin-top: 4px;
              font-size: 16px;
              line-height: 1.1;
              overflow-wrap: anywhere;
            }

            .actions {
              display: grid;
              grid-template-columns: repeat(2, minmax(0, 1fr));
              gap: 8px;
            }

            .actions.utility {
              grid-template-columns: repeat(2, minmax(0, 1fr));
              margin-top: -2px;
            }

            button {
              min-height: 34px;
              border: 0;
              border-radius: 6px;
              padding: 8px;
              color: var(--accent-text);
              background: var(--accent);
              cursor: pointer;
              font: inherit;
              font-weight: 700;
            }

            button.secondary,
            button.ghost {
              border: 1px solid var(--border);
              color: var(--text);
              background: transparent;
            }

            button.primary {
              color: var(--accent-text);
              background: var(--accent);
            }

            button.wide {
              grid-column: span 1;
            }

            button.active {
              color: var(--muted);
              background: color-mix(in srgb, var(--muted) 12%, transparent);
              cursor: default;
            }

            button:disabled {
              opacity: 0.72;
              cursor: default;
            }

            button:disabled:hover {
              filter: none;
            }

            .card {
              padding: 12px;
            }

            .card h2 {
              margin: 0 0 10px;
              font-size: 13px;
              line-height: 1.2;
            }

            .bar-row + .bar-row {
              margin-top: 10px;
            }

            .row-top,
            li {
              display: flex;
              justify-content: space-between;
              gap: 8px;
              min-width: 0;
              color: var(--muted);
              font-size: 12px;
            }

            .row-top span,
            li span {
              min-width: 0;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .row-top strong,
            li strong {
              flex: 0 0 auto;
              color: var(--text);
            }

            .track {
              height: 7px;
              margin-top: 5px;
              overflow: hidden;
              border-radius: 999px;
              background: color-mix(in srgb, var(--muted) 18%, transparent);
            }

            .fill {
              height: 100%;
              min-width: 2px;
              border-radius: inherit;
              background: var(--accent);
            }

            .fill.warn {
              background: var(--warn);
            }

            .fill.language {
              background: color-mix(in srgb, var(--accent) 76%, var(--ok));
            }

            ul {
              margin: 0;
              padding: 0;
              list-style: none;
            }

            li + li {
              margin-top: 8px;
            }

            .empty {
              margin: 0;
              color: var(--muted);
              line-height: 1.35;
            }

            .mode-note {
              margin: -2px 0 0;
              color: var(--muted);
              font-size: 12px;
              line-height: 1.35;
            }
          </style>
        </head>
        <body>
          <main class="shell">
            <section class="hero">
              <div class="status">
                <span class="pill"><span class="dot"></span>${stateLabel}</span>
                <button class="refresh" data-action="refresh" title="Refresh">↻</button>
              </div>
              <h1 data-break-start="${breakStartedAt}">${escapeHtml(heroTitle)}</h1>
              <p class="insight">${escapeHtml(heroInsight)}</p>
            </section>

            <section class="metrics">
              <div class="metric"><span>Sessions</span><strong>${stats.sessions}</strong></div>
              <div class="metric"><span>Focus</span><strong>${stats.focusRatio}%</strong></div>
              <div class="metric"><span>Idle</span><strong>${escapeHtml(stats.idleTime)}</strong></div>
              <div class="metric"><span>Current</span><strong>${formatDuration(activeSessionMs)}</strong></div>
            </section>

            <section class="actions">
              ${modeControls}
            </section>
            <p class="mode-note">${escapeHtml(buildModeNote(isActive, isOnBreak))}</p>

            <section class="actions utility">
              <button class="secondary" data-action="stats">Stats</button>
              <button class="secondary" data-action="burnout">Burnout</button>
            </section>

            <section class="card">
              <h2>Break Pace</h2>
              <div class="row-top"><span>2 hour reminder</span><strong>${breakProgress}%</strong></div>
              <div class="track"><div class="fill" style="width: ${breakProgress}%"></div></div>
            </section>

            <section class="card">
              <h2>Burnout Guard</h2>
              <div class="row-top"><span>8 hour daily limit</span><strong>${burnoutProgress}%</strong></div>
              <div class="track"><div class="fill warn" style="width: ${burnoutProgress}%"></div></div>
            </section>

            <section class="card">
              <h2>Languages</h2>
              ${languageRows}
            </section>

            <section class="card">
              <h2>Files</h2>
              <ul>${fileRows}</ul>
            </section>
          </main>

          <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            document.querySelectorAll("[data-action]").forEach((button) => {
              button.addEventListener("click", () => {
                vscode.postMessage({ action: button.dataset.action });
              });
            });

            const title = document.querySelector("[data-break-start]");
            const breakStartedAt = Number(title?.dataset.breakStart || 0);

            if (title && breakStartedAt > 0) {
              const format = (ms) => {
                const totalSeconds = Math.max(0, Math.floor(ms / 1000));
                const minutes = Math.floor(totalSeconds / 60);
                const seconds = totalSeconds % 60;
                return minutes + ":" + String(seconds).padStart(2, "0") + " break";
              };

              setInterval(() => {
                title.textContent = format(Date.now() - breakStartedAt);
              }, 1000);
            }
          </script>
        </body>
      </html>`;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function shortenFile(fileName: string): string {
  return fileName.split(/[\\/]/).slice(-2).join("/");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildModeNote(isActive: boolean, isOnBreak: boolean): string {
  if (isOnBreak) {
    return "Break timer is running. Resume continues tracking from the current file.";
  }

  if (isActive) {
    return "Coding mode is active. Start is locked so you do not accidentally restart.";
  }

  return "Start opens a coding session. Break becomes available once you are in flow.";
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}
