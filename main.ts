import {
  ItemView,
  Platform,
  Plugin,
  ViewStateResult,
  WorkspaceLeaf,
} from "obsidian";

export const VIEW_TYPE_TOYBOX_WEBVIEW = "toybox-webview";

const FALLBACK_URL = "about:blank";

interface ElectronShell {
  openExternal(url: string): Promise<void>;
}

export class WebView extends ItemView {
  private url = FALLBACK_URL;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_TOYBOX_WEBVIEW;
  }

  getDisplayText() {
    try {
      return new URL(this.url).hostname;
    } catch {
      return "Toybox Web Viewer";
    }
  }

  getState(): Record<string, unknown> {
    return { url: this.url };
  }

  async setState(state: unknown, result: ViewStateResult) {
    this.url = normalizeHttpUrl(readUrlFromState(state)) ?? FALLBACK_URL;
    result.history = false;
    this.render();
  }

  async onOpen() {
    this.render();
  }

  async onClose() {
    this.contentEl.empty();
  }

  private render() {
    this.contentEl.empty();

    const iframe = this.contentEl.createEl("iframe");
    iframe.src = this.url;
    iframe.setAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-forms allow-popups",
    );
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
  }
}

export default class ToyboxPlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE_TOYBOX_WEBVIEW, (leaf) => new WebView(leaf));

    this.registerDomEvent(
      window,
      "mousedown",
      (evt: MouseEvent) => {
        if (evt.button !== 1) {
          return;
        }

        if (!this.getHttpUrlFromEvent(evt)) {
          return;
        }

        evt.preventDefault();
        evt.stopImmediatePropagation();
      },
      { capture: true },
    );

    this.registerDomEvent(
      window,
      "auxclick",
      (evt: MouseEvent) => {
        if (evt.button !== 1) {
          return;
        }

        const url = this.getHttpUrlFromEvent(evt);
        if (!url) {
          return;
        }

        evt.preventDefault();
        evt.stopImmediatePropagation();
        void this.openInDefaultBrowser(url);
      },
      { capture: true },
    );

    this.registerDomEvent(
      window,
      "click",
      (evt: MouseEvent) => {
        if (evt.button !== 0) {
          return;
        }

        if (evt.ctrlKey || evt.metaKey || evt.altKey || evt.shiftKey) {
          return;
        }

        const url = this.getHttpUrlFromEvent(evt);
        if (!url) {
          return;
        }

        evt.preventDefault();
        evt.stopImmediatePropagation();
        void this.openInObsidian(url);
      },
      { capture: true },
    );
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_TOYBOX_WEBVIEW);
  }

  private getHttpUrlFromEvent(evt: MouseEvent): string | null {
    const anchor = this.findAnchor(evt);
    return normalizeHttpUrl(anchor?.href ?? anchor?.getAttribute("href"));
  }

  private findAnchor(evt: MouseEvent): HTMLAnchorElement | null {
    if (evt.target instanceof Element) {
      const anchor = evt.target.closest("a[href]");
      if (anchor instanceof HTMLAnchorElement) {
        return anchor;
      }
    }

    for (const node of evt.composedPath()) {
      if (node instanceof HTMLAnchorElement && node.href) {
        return node;
      }

      if (node instanceof Element) {
        const anchor = node.closest("a[href]");
        if (anchor instanceof HTMLAnchorElement) {
          return anchor;
        }
      }
    }

    return null;
  }

  private async openInObsidian(url: string) {
    const leaf = this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: VIEW_TYPE_TOYBOX_WEBVIEW,
      active: true,
      state: { url },
    });
    await this.app.workspace.revealLeaf(leaf);
  }

  private async openInDefaultBrowser(url: string) {
    const shell = this.getElectronShell();

    if (shell) {
      await shell.openExternal(url);
      return;
    }

    window.open(url, "_blank", "noopener");
  }

  private getElectronShell(): ElectronShell | null {
    if (!Platform.isDesktopApp) {
      return null;
    }

    try {
      const electron = require("electron") as { shell?: ElectronShell };
      return electron.shell ?? null;
    } catch {
      return null;
    }
  }
}

function normalizeHttpUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}

function readUrlFromState(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const maybeUrl = (state as Record<string, unknown>).url;
  return typeof maybeUrl === "string" ? maybeUrl : null;
}
