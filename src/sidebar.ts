import * as path from "path";
import * as vscode from "vscode";
import { StatsManager } from "./core/statsManager";
import { SessionManager } from "./core/sessionManager";
import { formatDuration } from "./utils/time";

type PanelAction = "start" | "stats" | "break" | "burnout" | "refresh";

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
    const isActive = Boolean(session);
    const activeSessionMs = session?.activeMs ?? 0;
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
              color: ${isActive ? "var(--ok)" : "var(--muted)"};
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

            button.secondary {
              border: 1px solid var(--border);
              color: var(--text);
              background: transparent;
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
          </style>
        </head>
        <body>
          <main class="shell">
            <section class="hero">
              <div class="status">
                <span class="pill"><span class="dot"></span>${isActive ? "Active session" : "Waiting"}</span>
                <button class="refresh" data-action="refresh" title="Refresh">↻</button>
              </div>
              <h1>${escapeHtml(stats.totalCodingTime)} today</h1>
              <p class="insight">${escapeHtml(stats.insight)}</p>
            </section>

            <section class="metrics">
              <div class="metric"><span>Sessions</span><strong>${stats.sessions}</strong></div>
              <div class="metric"><span>Focus</span><strong>${stats.focusRatio}%</strong></div>
              <div class="metric"><span>Idle</span><strong>${escapeHtml(stats.idleTime)}</strong></div>
              <div class="metric"><span>Current</span><strong>${formatDuration(activeSessionMs)}</strong></div>
            </section>

            <section class="actions">
              <button data-action="start">Start</button>
              <button class="secondary" data-action="break">Break</button>
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

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}
