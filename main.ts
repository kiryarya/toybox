import {
  App,
  ItemView,
  Notice,
  Platform,
  Plugin,
  PluginSettingTab,
  Setting,
  ViewStateResult,
  WorkspaceLeaf,
} from "obsidian";
import type { Editor } from "obsidian";

export const VIEW_TYPE_TOYBOX_WEBVIEW = "toybox-webview";

const FALLBACK_URL = "about:blank";

interface ElectronShell {
  openExternal(url: string): Promise<void> | void;
}

interface ElectronModule {
  shell?: ElectronShell;
}

interface ElectronWindow extends Window {
  require?: (module: string) => ElectronModule;
}

interface ToyboxSettings {
  urlOpenerEnabled: boolean;
  twitterEmbedPasteEnabled: boolean;
  mermaidEnhancerEnabled: boolean;
  mermaidDefaultZoom: number;
  mermaidZoomStep: number;
}

const DEFAULT_SETTINGS: ToyboxSettings = {
  urlOpenerEnabled: true,
  twitterEmbedPasteEnabled: true,
  mermaidEnhancerEnabled: true,
  mermaidDefaultZoom: 1,
  mermaidZoomStep: 0.1,
};

type Language = "en" | "ja";

type TranslationKey =
  | "webViewName"
  | "electronShellUnavailable"
  | "zoomOut"
  | "resetZoom"
  | "zoomIn"
  | "urlOpenerName"
  | "urlOpenerDesc"
  | "twitterEmbedPasteName"
  | "twitterEmbedPasteDesc"
  | "mermaidEnhancerName"
  | "mermaidEnhancerDesc"
  | "mermaidDefaultZoomName"
  | "mermaidDefaultZoomDesc"
  | "mermaidZoomStepName"
  | "mermaidZoomStepDesc";

const TRANSLATIONS: Record<Language, Record<TranslationKey, string>> = {
  en: {
    webViewName: "Toybox Web Viewer",
    electronShellUnavailable:
      "Toybox: Electron shell is unavailable; could not open external browser.",
    zoomOut: "Zoom out",
    resetZoom: "Reset zoom",
    zoomIn: "Zoom in",
    urlOpenerName: "URL opener",
    urlOpenerDesc:
      "Left-click HTTP(S) links in Obsidian web views and middle-click them in the default browser.",
    twitterEmbedPasteName: "Twitter embed paste",
    twitterEmbedPasteDesc:
      "Convert pasted Twitter/X post links to Obsidian tweet embeds.",
    mermaidEnhancerName: "Mermaid enhancer",
    mermaidEnhancerDesc:
      "Add zoom controls and scrollable viewports to rendered Mermaid diagrams.",
    mermaidDefaultZoomName: "Default Mermaid zoom",
    mermaidDefaultZoomDesc: "Initial zoom level for enhanced Mermaid diagrams.",
    mermaidZoomStepName: "Mermaid zoom step",
    mermaidZoomStepDesc:
      "How much each zoom button or Ctrl+mouse wheel action changes the scale.",
  },
  ja: {
    webViewName: "Toybox Web ビューアー",
    electronShellUnavailable:
      "Toybox: Electron shell を利用できないため、外部ブラウザを開けませんでした。",
    zoomOut: "縮小",
    resetZoom: "ズームをリセット",
    zoomIn: "拡大",
    urlOpenerName: "URL オープナー",
    urlOpenerDesc:
      "Obsidian 内の Web ビューでは HTTP(S) リンクを左クリックで開き、中クリックで既定のブラウザに送ります。",
    twitterEmbedPasteName: "Twitter 埋め込み貼り付け",
    twitterEmbedPasteDesc:
      "貼り付けた Twitter/X の投稿リンクを Obsidian のツイート埋め込みに変換します。",
    mermaidEnhancerName: "Mermaid 拡張",
    mermaidEnhancerDesc:
      "レンダリング済み Mermaid 図にズーム操作とスクロール可能な表示領域を追加します。",
    mermaidDefaultZoomName: "Mermaid の既定ズーム",
    mermaidDefaultZoomDesc: "拡張された Mermaid 図の初期ズーム倍率です。",
    mermaidZoomStepName: "Mermaid のズーム幅",
    mermaidZoomStepDesc:
      "ズームボタンまたは Ctrl+マウスホイールで倍率を変える量です。",
  },
};

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
      return t("webViewName");
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
  settings: ToyboxSettings = DEFAULT_SETTINGS;
  private lastExternalOpen: { url: string; time: number } | null = null;

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new ToyboxSettingTab(this.app, this));
    this.registerView(VIEW_TYPE_TOYBOX_WEBVIEW, (leaf) => new WebView(leaf));
    this.registerMarkdownPostProcessor((el) => this.watchMermaidBlocks(el));
    this.registerEvent(
      this.app.workspace.on("editor-paste", (evt, editor) =>
        this.handleEditorPaste(evt, editor),
      ),
    );

    this.registerDomEvent(
      window,
      "mousedown",
      (evt: MouseEvent) => {
        if (!this.settings.urlOpenerEnabled) {
          return;
        }

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
      "auxclick",
      (evt: MouseEvent) => {
        if (!this.settings.urlOpenerEnabled) {
          return;
        }

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
      "mouseup",
      (evt: MouseEvent) => {
        if (!this.settings.urlOpenerEnabled) {
          return;
        }

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
        if (!this.settings.urlOpenerEnabled) {
          return;
        }

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

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  refreshMarkdownViews() {
    this.app.workspace.updateOptions();
  }

  private handleEditorPaste(evt: ClipboardEvent, editor: Editor) {
    if (!this.settings.twitterEmbedPasteEnabled || evt.defaultPrevented) {
      return;
    }

    const replacement = createTwitterEmbedMarkdown(
      evt.clipboardData?.getData("text/plain"),
    );
    if (!replacement) {
      return;
    }

    evt.preventDefault();
    editor.replaceSelection(replacement, "paste");
  }

  private watchMermaidBlocks(el: HTMLElement) {
    if (!this.settings.mermaidEnhancerEnabled) {
      return;
    }

    this.enhanceMermaidBlocks(el);
    window.requestAnimationFrame(() => this.enhanceMermaidBlocks(el));
    window.setTimeout(() => this.enhanceMermaidBlocks(el), 250);

    const observer = new MutationObserver(() => this.enhanceMermaidBlocks(el));
    observer.observe(el, {
      childList: true,
      subtree: true,
    });
    this.register(() => observer.disconnect());
  }

  private enhanceMermaidBlocks(el: HTMLElement) {
    el.querySelectorAll<SVGSVGElement>(".mermaid svg").forEach((svg) => {
      const mermaidEl = svg.closest<HTMLElement>(".mermaid");
      if (!mermaidEl || mermaidEl.dataset.toyboxMermaidEnhanced === "true") {
        return;
      }

      this.enhanceMermaidBlock(mermaidEl, svg);
    });
  }

  private enhanceMermaidBlock(mermaidEl: HTMLElement, svg: SVGSVGElement) {
    mermaidEl.dataset.toyboxMermaidEnhanced = "true";
    mermaidEl.addClass("toybox-mermaid");

    const toolbar = document.createElement("div");
    toolbar.addClass("toybox-mermaid-toolbar");

    const zoomOutButton = createToolbarButton("-", t("zoomOut"));
    const zoomResetButton = createToolbarButton("100%", t("resetZoom"));
    const zoomInButton = createToolbarButton("+", t("zoomIn"));

    const viewport = document.createElement("div");
    viewport.addClass("toybox-mermaid-viewport");

    const scaler = document.createElement("div");
    scaler.addClass("toybox-mermaid-scaler");

    const svgSize = getSvgSize(svg);

    mermaidEl.insertBefore(toolbar, svg);
    viewport.appendChild(scaler);
    scaler.appendChild(svg);
    mermaidEl.appendChild(viewport);

    toolbar.appendChild(zoomOutButton);
    toolbar.appendChild(zoomResetButton);
    toolbar.appendChild(zoomInButton);

    let zoom = clampZoom(this.settings.mermaidDefaultZoom);
    const updateZoom = (nextZoom: number) => {
      zoom = clampZoom(nextZoom);
      scaler.style.width = `${svgSize.width * zoom}px`;
      scaler.style.height = `${svgSize.height * zoom}px`;
      svg.style.transform = `scale(${zoom})`;
      zoomResetButton.setText(`${Math.round(zoom * 100)}%`);
    };

    this.registerDomEvent(zoomOutButton, "click", () =>
      updateZoom(zoom - this.settings.mermaidZoomStep),
    );
    this.registerDomEvent(zoomResetButton, "click", () =>
      updateZoom(this.settings.mermaidDefaultZoom),
    );
    this.registerDomEvent(zoomInButton, "click", () =>
      updateZoom(zoom + this.settings.mermaidZoomStep),
    );
    this.registerDomEvent(viewport, "wheel", (evt: WheelEvent) => {
      if (!evt.ctrlKey) {
        return;
      }

      evt.preventDefault();
      updateZoom(zoom + (evt.deltaY < 0 ? 1 : -1) * this.settings.mermaidZoomStep);
    });

    updateZoom(zoom);
  }

  private getHttpUrlFromEvent(evt: MouseEvent): string | null {
    if (evt.target instanceof Element) {
      const url =
        this.getHttpUrlFromLinkedElement(evt.target) ??
        this.getHttpUrlFromCodeMirrorLink(evt.target);
      if (url) {
        return url;
      }
    }

    for (const node of evt.composedPath()) {
      if (!(node instanceof Element)) {
        continue;
      }

      const url = this.getHttpUrlFromLinkedElement(node);
      if (url) {
        return url;
      }
    }

    return null;
  }

  private getHttpUrlFromLinkedElement(element: Element): string | null {
    const linkedElement = element.closest(
      "a[href], [href], [data-href], [data-url]",
    );
    if (linkedElement) {
      const url = normalizeHttpUrl(
        linkedElement instanceof HTMLAnchorElement
          ? linkedElement.href
          : linkedElement.getAttribute("href") ??
              linkedElement.getAttribute("data-href") ??
              linkedElement.getAttribute("data-url"),
      );
      if (url) {
        return url;
      }
    }

    const propertyLink = element.closest(
      ".metadata-link, .metadata-link-inner, .external-link",
    );
    if (propertyLink) {
      const url = normalizeHttpUrl(propertyLink.textContent?.trim());
      if (url) {
        return url;
      }
    }

    return null;
  }

  private getHttpUrlFromCodeMirrorLink(element: Element): string | null {
    const codeMirrorLink = element.closest(
      ".cm-url, .cm-hmd-external-link, .cm-formatting-link-string",
    );
    if (!codeMirrorLink) {
      return null;
    }

    return findHttpUrlInText(codeMirrorLink.textContent);
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
    const now = Date.now();
    if (
      this.lastExternalOpen &&
      this.lastExternalOpen.url === url &&
      now - this.lastExternalOpen.time < 500
    ) {
      return;
    }

    this.lastExternalOpen = { url, time: now };
    const shell = this.getElectronShell();

    if (shell) {
      await shell.openExternal(url);
      return;
    }

    if (Platform.isDesktopApp) {
      new Notice(t("electronShellUnavailable"));
      return;
    }

    window.open(url, "_blank", "noopener");
  }

  private getElectronShell(): ElectronShell | null {
    if (!Platform.isDesktopApp) {
      return null;
    }

    const loaders = [
      (window as ElectronWindow).require,
      typeof require === "function" ? require : null,
    ];

    for (const loadElectron of loaders) {
      if (!loadElectron) {
        continue;
      }

      try {
        const electron = loadElectron("electron");
        if (electron.shell?.openExternal) {
          return electron.shell;
        }
      } catch {
        continue;
      }
    }

    return null;
  }
}

class ToyboxSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: ToyboxPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Toybox" });

    new Setting(containerEl)
      .setName(t("urlOpenerName"))
      .setDesc(t("urlOpenerDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.urlOpenerEnabled).onChange(async (value) => {
          this.plugin.settings.urlOpenerEnabled = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(t("twitterEmbedPasteName"))
      .setDesc(t("twitterEmbedPasteDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.twitterEmbedPasteEnabled)
          .onChange(async (value) => {
            this.plugin.settings.twitterEmbedPasteEnabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("mermaidEnhancerName"))
      .setDesc(t("mermaidEnhancerDesc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.mermaidEnhancerEnabled)
          .onChange(async (value) => {
            this.plugin.settings.mermaidEnhancerEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.refreshMarkdownViews();
          }),
      );

    new Setting(containerEl)
      .setName(t("mermaidDefaultZoomName"))
      .setDesc(t("mermaidDefaultZoomDesc"))
      .addSlider((slider) =>
        slider
          .setLimits(0.5, 2, 0.1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.mermaidDefaultZoom)
          .onChange(async (value) => {
            this.plugin.settings.mermaidDefaultZoom = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(t("mermaidZoomStepName"))
      .setDesc(t("mermaidZoomStepDesc"))
      .addSlider((slider) =>
        slider
          .setLimits(0.05, 0.5, 0.05)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.mermaidZoomStep)
          .onChange(async (value) => {
            this.plugin.settings.mermaidZoomStep = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}

function t(key: TranslationKey): string {
  return TRANSLATIONS[getPreferredLanguage()][key];
}

function getPreferredLanguage(): Language {
  const languages = [
    document.documentElement.lang,
    ...Array.from(navigator.languages ?? []),
    navigator.language,
  ];

  return languages.some((language) => language.toLowerCase().startsWith("ja"))
    ? "ja"
    : "en";
}

function createToolbarButton(text: string, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.addClass("clickable-icon");
  button.addClass("toybox-mermaid-button");
  button.setText(text);
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  return button;
}

function clampZoom(zoom: number): number {
  return Math.min(3, Math.max(0.25, zoom));
}

function getSvgSize(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.viewBox.baseVal;
  if (viewBox.width > 0 && viewBox.height > 0) {
    return {
      width: viewBox.width,
      height: viewBox.height,
    };
  }

  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return {
      width: rect.width,
      height: rect.height,
    };
  }

  return {
    width: readSvgLength(svg.getAttribute("width")) ?? 800,
    height: readSvgLength(svg.getAttribute("height")) ?? 600,
  };
}

function readSvgLength(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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

function createTwitterEmbedMarkdown(text: string | null | undefined): string | null {
  const url = normalizeTwitterStatusUrl(text);
  return url ? `![](${url})` : null;
}

function normalizeTwitterStatusUrl(text: string | null | undefined): string | null {
  const value = text?.trim();
  if (!value || /\s/.test(value)) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (!isTwitterHost(hostname)) {
    return null;
  }

  const parts = parsedUrl.pathname.split("/").filter(Boolean);
  if (parts.length < 3 || parts[1].toLowerCase() !== "status") {
    return null;
  }

  const username = parts[0];
  const tweetId = parts[2];
  if (!username || !/^\d+$/.test(tweetId)) {
    return null;
  }

  return `https://twitter.com/${username}/status/${tweetId}`;
}

function isTwitterHost(hostname: string): boolean {
  return (
    hostname === "twitter.com" ||
    hostname === "www.twitter.com" ||
    hostname === "mobile.twitter.com" ||
    hostname === "x.com" ||
    hostname === "www.x.com"
  );
}

function findHttpUrlInText(text: string | null | undefined): string | null {
  const match = text?.match(/https?:\/\/[^\s<>"']+/);
  if (!match) {
    return null;
  }

  return normalizeHttpUrl(match[0].replace(/[),.;\]]+$/, ""));
}

function readUrlFromState(state: unknown): string | null {
  if (!state || typeof state !== "object") {
    return null;
  }

  const maybeUrl = (state as Record<string, unknown>).url;
  return typeof maybeUrl === "string" ? maybeUrl : null;
}
