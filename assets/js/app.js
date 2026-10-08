/**
 * app.js — the UI layer.
 *
 * All of the thinking (filtering, ranking, schema, persistence, templates)
 * lives in assets/js/core/*.js, which is unit tested. This file is only
 * responsible for wiring that logic to the DOM:
 *
 *   state  ->  render()  ->  DOM
 *   DOM    ->  events    ->  state
 *
 * Nothing here builds HTML from strings, so user content can never be
 * interpreted as markup. (tests/release.test.js fails the build if
 * innerHTML, eval or document.write ever appear.) This file never touches
 * localStorage directly either; all persistence goes through storage.js.
 */
(function () {
  "use strict";

  const { schema, search, variables, library, storage, starterPrompts, history, backup, health, security, pwa } =
    window.PromptToolkit;

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  const store = storage.createStorage();

  const state = {
    prompts: [],
    versions: {},
    historySel: null,
    historyCompare: "current",
    pendingImport: null,
    settings: storage.DEFAULT_SETTINGS,
    filters: Object.assign({}, search.DEFAULT_FILTERS),
    selectedId: null,
    dirty: false,
    tab: "write",
    variableValues: {},
    paletteIndex: 0,
    paletteItems: [],
  };

  const AUTOSAVE_MS = 700;
  const UNDO_MS = 7000;

  /* ------------------------------------------------------------------ *
   * Element references
   * ------------------------------------------------------------------ */

  const $ = (id) => document.getElementById(id);
  const ui = {
    body: document.body,
    searchInput: $("searchInput"),
    categoryFilter: $("categoryFilter"),
    sortSelect: $("sortSelect"),
    favFilterBtn: $("favFilterBtn"),
    clearFiltersBtn: $("clearFiltersBtn"),
    tagCloud: $("tagCloud"),
    resultCount: $("resultCount"),
    activeFilterSummary: $("activeFilterSummary"),
    promptList: $("promptList"),
    listEmpty: $("listEmpty"),
    stats: $("stats"),
    storageNote: $("storageNote"),

    welcome: $("welcome"),
    editor: $("editor"),
    backBtn: $("backBtn"),
    titleInput: $("titleInput"),
    favoriteBtn: $("favoriteBtn"),
    duplicateBtn: $("duplicateBtn"),
    deleteBtn: $("deleteBtn"),
    categoryInput: $("categoryInput"),
    categoryOptions: $("categoryOptions"),
    tagsInput: $("tagsInput"),
    notesInput: $("notesInput"),
    contentInput: $("contentInput"),
    contentMeta: $("contentMeta"),
    variableBadge: $("variableBadge"),
    variableFields: $("variableFields"),
    previewOutput: $("previewOutput"),
    previewCopyBtn: $("previewCopyBtn"),
    saveState: $("saveState"),
    copyBtn: $("copyBtn"),
    saveBtn: $("saveBtn"),

    newBtn: $("newBtn"),
    themeBtn: $("themeBtn"),
    paletteBtn: $("paletteBtn"),
    dataMenu: $("dataMenu"),
    dataMenuBtn: $("dataMenuBtn"),
    dataMenuPanel: $("dataMenuPanel"),
    importFile: $("importFile"),

    toasts: $("toasts"),
    paletteDialog: $("paletteDialog"),
    paletteInput: $("paletteInput"),
    paletteResults: $("paletteResults"),
    confirmDialog: $("confirmDialog"),
    confirmBody: $("confirmBody"),
    confirmOk: $("confirmOk"),
    confirmCancel: $("confirmCancel"),
    shortcutsDialog: $("shortcutsDialog"),

    offlineBadge: $("offlineBadge"),
    recoveryBanner: $("recoveryBanner"),
    recoveryTitle: $("recoveryTitle"),
    recoveryBody: $("recoveryBody"),
    recoveryDownload: $("recoveryDownload"),
    recoveryReset: $("recoveryReset"),

    historyBadge: $("historyBadge"),
    historyHelp: $("historyHelp"),
    historyList: $("historyList"),
    historyTitle: $("historyTitle"),
    historyMeta: $("historyMeta"),
    historyCompare: $("historyCompare"),
    historyDiff: $("historyDiff"),
    historyRestoreBtn: $("historyRestoreBtn"),
    historyDuplicateBtn: $("historyDuplicateBtn"),
    historyDeleteBtn: $("historyDeleteBtn"),

    importDialog: $("importDialog"),
    importFileName: $("importFileName"),
    importErrors: $("importErrors"),
    importWarnings: $("importWarnings"),
    importSummary: $("importSummary"),
    importModes: $("importModes"),
    importSettingsRow: $("importSettingsRow"),
    importSettings: $("importSettings"),
    importOutcome: $("importOutcome"),
    importCancel: $("importCancel"),
    importConfirm: $("importConfirm"),

    settingsDialog: $("settingsDialog"),
    settingTheme: $("settingTheme"),
    settingSort: $("settingSort"),
    settingTrackUsage: $("settingTrackUsage"),
    backupStatus: $("backupStatus"),
    settingsBackupBtn: $("settingsBackupBtn"),
    settingsImportBtn: $("settingsImportBtn"),
    settingsExportJsonBtn: $("settingsExportJsonBtn"),
    settingsExportMdBtn: $("settingsExportMdBtn"),
    safetyBox: $("safetyBox"),
    safetyText: $("safetyText"),
    safetyRestoreBtn: $("safetyRestoreBtn"),
    safetyDiscardBtn: $("safetyDiscardBtn"),
    storageInfo: $("storageInfo"),
    healthBtn: $("healthBtn"),
    dropLegacyBtn: $("dropLegacyBtn"),
    quarantineBtn: $("quarantineBtn"),
    healthResults: $("healthResults"),
    settingsResetBtn: $("settingsResetBtn"),

    resetDialog: $("resetDialog"),
    resetBody: $("resetBody"),
    resetBackupBtn: $("resetBackupBtn"),
    resetInput: $("resetInput"),
    resetCancel: $("resetCancel"),
    resetConfirm: $("resetConfirm"),
  };

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */

  function icon(name, className) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon" + (className ? " " + className : ""));
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#" + name);
    svg.appendChild(use);
    return svg;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function plural(count, word) {
    return `${count} ${word}${count === 1 ? "" : "s"}`;
  }

  function relativeTime(iso) {
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return "";
    const seconds = Math.round((Date.now() - time) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function debounce(fn, wait) {
    let timer = null;
    const wrapped = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
    wrapped.cancel = () => clearTimeout(timer);
    wrapped.flush = (...args) => {
      clearTimeout(timer);
      fn(...args);
    };
    return wrapped;
  }

  function selected() {
    return library.find(state.prompts, state.selectedId);
  }

  /**
   * Writes the prompts. When the stored library is damaged or came from a newer
   * app version, saving is paused (the recovery banner explains why) instead
   * of overwriting it.
   */
  function persist() {
    if (store.isLocked()) return false;
    const ok = store.savePrompts(state.prompts);
    if (!ok) toast("Could not save — browser storage is full or blocked.", { type: "error" });
    return ok;
  }

  let trimNoticeShown = false;

  /** Writes the version history. The store may trim old entries to fit the quota. */
  function persistVersions() {
    if (store.isLocked()) return false;
    const result = store.saveVersions(state.versions);
    state.versions = result.versions;
    if (!result.ok) {
      toast("Could not save version history — browser storage is full.", { type: "error" });
    } else if (result.trimmed && !trimNoticeShown) {
      trimNoticeShown = true;
      toast("Browser storage is getting full, so the oldest saved versions were removed. Create a backup soon.", {
        duration: 6000,
      });
    }
    return result.ok;
  }

  /** Adds a history entry for `current` and keeps the prompt's version number in step. */
  function recordVersion(previous, current, options) {
    const result = history.record(state.versions, current, Object.assign({ previous }, options || {}));
    if (!result.changed) return false;
    state.versions = result.versions;
    if (result.entry && current.version !== result.entry.n) {
      state.prompts = library.patch(state.prompts, current.id, { version: result.entry.n }).prompts;
    }
    return true;
  }

  /* ------------------------------------------------------------------ *
   * Toasts
   * ------------------------------------------------------------------ */

  function toast(message, options) {
    const config = options || {};
    const node = element("div", `toast${config.type ? " toast--" + config.type : ""}`);
    node.appendChild(element("span", "toast__dot"));
    node.appendChild(element("span", "toast__text", message));

    let timer = null;
    const dismiss = () => {
      if (node.classList.contains("is-leaving")) return;
      clearTimeout(timer);
      node.classList.add("is-leaving");
      node.addEventListener("animationend", () => node.remove(), { once: true });
    };

    if (config.action) {
      const button = element("button", "toast__action", config.action.label);
      button.type = "button";
      button.addEventListener("click", () => {
        config.action.onClick();
        dismiss();
      });
      node.appendChild(button);
    }

    ui.toasts.appendChild(node);
    timer = setTimeout(dismiss, config.duration || 3200);
    return dismiss;
  }

  /* ------------------------------------------------------------------ *
   * Confirm dialog (replaces window.confirm)
   * ------------------------------------------------------------------ */

  function confirmAction(message, confirmLabel) {
    return new Promise((resolve) => {
      ui.confirmBody.textContent = message;
      ui.confirmOk.textContent = confirmLabel || "Delete";

      const finish = (result) => {
        ui.confirmOk.removeEventListener("click", onOk);
        ui.confirmCancel.removeEventListener("click", onCancel);
        ui.confirmDialog.removeEventListener("close", onCancel);
        if (ui.confirmDialog.open) ui.confirmDialog.close();
        resolve(result);
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);

      ui.confirmOk.addEventListener("click", onOk);
      ui.confirmCancel.addEventListener("click", onCancel);
      ui.confirmDialog.addEventListener("close", onCancel);
      ui.confirmDialog.showModal();
    });
  }

  /* ------------------------------------------------------------------ *
   * Rendering — sidebar
   * ------------------------------------------------------------------ */

  function renderFilterControls() {
    const categories = search.collectCategories(state.prompts);
    const current = state.filters.category;

    ui.categoryFilter.textContent = "";
    const all = element("option", null, `All categories (${state.prompts.length})`);
    all.value = "all";
    ui.categoryFilter.appendChild(all);

    for (const entry of categories) {
      const option = element("option", null, `${entry.name} (${entry.count})`);
      option.value = entry.name;
      ui.categoryFilter.appendChild(option);
    }
    ui.categoryFilter.value = categories.some((entry) => entry.name === current) ? current : "all";
    if (ui.categoryFilter.value === "all") state.filters.category = "all";

    ui.categoryOptions.textContent = "";
    for (const entry of categories) {
      const option = document.createElement("option");
      option.value = entry.name;
      ui.categoryOptions.appendChild(option);
    }

    if (!ui.sortSelect.options.length) {
      for (const sort of search.SORTS) {
        const option = element("option", null, sort.label);
        option.value = sort.value;
        ui.sortSelect.appendChild(option);
      }
    }
    ui.sortSelect.value = state.filters.sort;

    ui.favFilterBtn.setAttribute("aria-pressed", String(state.filters.favoritesOnly));

    // Tag chips, most used first.
    ui.tagCloud.textContent = "";
    for (const tag of search.collectTags(state.prompts).slice(0, 18)) {
      const active = state.filters.tags.some((value) => value.toLowerCase() === tag.name.toLowerCase());
      const chip = element("button", "chip chip--tag");
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(active));
      chip.appendChild(document.createTextNode("#" + tag.name));
      chip.appendChild(element("span", "chip__count", String(tag.count)));
      chip.addEventListener("click", () => toggleTagFilter(tag.name));
      ui.tagCloud.appendChild(chip);
    }

    const chips = search.describeFilters(state.filters);
    ui.clearFiltersBtn.hidden = chips.length === 0;
    ui.activeFilterSummary.textContent = chips.map((chip) => chip.label).join(" · ");
    ui.activeFilterSummary.title = ui.activeFilterSummary.textContent;
  }

  function renderPromptCard(prompt, tokens) {
    const item = document.createElement("li");
    const card = element("button", "prompt-card" + (prompt.id === state.selectedId ? " is-active" : ""));
    card.type = "button";
    card.dataset.id = prompt.id;

    const top = element("div", "prompt-card__top");
    const title = element("span", "prompt-card__title");
    for (const part of search.highlight(prompt.title, tokens, 90)) {
      title.appendChild(part.match ? element("mark", null, part.text) : document.createTextNode(part.text));
    }
    top.appendChild(title);

    const star = element("span", "prompt-card__star");
    star.setAttribute("role", "button");
    star.setAttribute("tabindex", "0");
    star.setAttribute("aria-pressed", String(Boolean(prompt.favorite)));
    star.setAttribute("aria-label", prompt.favorite ? "Remove from favourites" : "Add to favourites");
    star.appendChild(icon("i-star"));
    const onStar = (event) => {
      event.stopPropagation();
      event.preventDefault();
      toggleFavorite(prompt.id);
    };
    star.addEventListener("click", onStar);
    star.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") onStar(event);
    });
    top.appendChild(star);
    card.appendChild(top);

    const excerpt = element("span", "prompt-card__excerpt");
    for (const part of search.highlight(prompt.content.replace(/\s+/g, " "), tokens, 150)) {
      excerpt.appendChild(part.match ? element("mark", null, part.text) : document.createTextNode(part.text));
    }
    card.appendChild(excerpt);

    const meta = element("div", "prompt-card__meta");
    meta.appendChild(element("span", "pill", prompt.category));
    for (const tag of prompt.tags.slice(0, 2)) meta.appendChild(element("span", "pill pill--tag", "#" + tag));
    if (variables.hasVariables(prompt.content)) {
      meta.appendChild(element("span", "pill pill--var", "template"));
    }
    meta.appendChild(element("span", null, relativeTime(prompt.updatedAt)));
    card.appendChild(meta);

    card.addEventListener("click", () => selectPrompt(prompt.id));
    item.appendChild(card);
    return item;
  }

  function renderList() {
    const tokens = search.tokenize(state.filters.query);
    const results = search.queryPrompts(state.prompts, state.filters);

    ui.promptList.textContent = "";
    for (const prompt of results) ui.promptList.appendChild(renderPromptCard(prompt, tokens));

    ui.resultCount.textContent = plural(results.length, "prompt");
    ui.listEmpty.hidden = results.length > 0;
    ui.promptList.hidden = results.length === 0;

    if (!results.length) {
      ui.listEmpty.textContent = "";
      const hasFilters = search.hasActiveFilters(state.filters);
      ui.listEmpty.appendChild(
        element("strong", null, hasFilters ? "No matches" : "Your library is empty")
      );
      ui.listEmpty.appendChild(
        element(
          "span",
          null,
          hasFilters
            ? "Try a different search, or clear the filters."
            : "Create a prompt or load the starter pack to get going."
        )
      );
      const action = element("button", "btn btn--ghost btn--sm", hasFilters ? "Clear filters" : "Load starter pack");
      action.type = "button";
      action.style.marginTop = "12px";
      action.addEventListener("click", hasFilters ? clearFilters : loadStarterPack);
      ui.listEmpty.appendChild(document.createElement("br"));
      ui.listEmpty.appendChild(action);
    }
  }

  function renderStats() {
    const data = library.stats(state.prompts);
    const entries = [
      ["Prompts", data.total],
      ["Categories", data.categories],
      ["Tags", data.tags],
      ["Starred", data.favorites],
    ];

    ui.stats.textContent = "";
    for (const [label, value] of entries) {
      const group = document.createElement("div");
      group.appendChild(element("dt", null, label));
      group.appendChild(element("dd", null, String(value)));
      ui.stats.appendChild(group);
    }
  }

  /* ------------------------------------------------------------------ *
   * Rendering — editor
   * ------------------------------------------------------------------ */

  function renderEditor() {
    const prompt = selected();
    const editing = Boolean(prompt);

    ui.editor.hidden = !editing;
    ui.welcome.hidden = editing;
    ui.body.classList.toggle("is-editing", editing);
    if (!editing) return;

    // Never overwrite what someone is in the middle of typing: a re-render
    // triggered elsewhere (a star click, an import) only refreshes the parts
    // of the editor that are not bound to an input.
    if (state.dirty) {
      ui.favoriteBtn.setAttribute("aria-pressed", String(Boolean(prompt.favorite)));
      return;
    }

    ui.titleInput.value = prompt.title === "Untitled prompt" ? "" : prompt.title;
    ui.categoryInput.value = prompt.category === schema.DEFAULT_CATEGORY ? "" : prompt.category;
    ui.tagsInput.value = schema.tagsToInput(prompt.tags);
    ui.notesInput.value = prompt.notes;
    ui.contentInput.value = prompt.content;
    ui.favoriteBtn.setAttribute("aria-pressed", String(Boolean(prompt.favorite)));

    state.variableValues = Object.assign(variables.defaultValues(prompt.content), state.variableValues);
    setSaveState("saved");
    renderContentMeta();
    renderVariables();
  }

  function renderContentMeta() {
    const text = ui.contentInput.value;
    const words = text.split(/\s+/).filter(Boolean).length;
    const list = variables.extractVariables(text);
    const parts = [plural(words, "word"), `${text.length} chars`];
    if (list.length) parts.push(plural(list.length, "variable"));
    const prompt = selected();
    if (prompt && prompt.version > 1) parts.push(`version ${prompt.version}`);
    if (prompt && prompt.usageCount) parts.push(`copied ${prompt.usageCount}×`);
    ui.contentMeta.textContent = parts.join(" · ");

    ui.variableBadge.hidden = list.length === 0;
    ui.variableBadge.textContent = String(list.length);
  }

  function renderVariables() {
    const list = variables.extractVariables(ui.contentInput.value);
    ui.variableFields.textContent = "";

    if (!list.length) {
      const note = element("p", "variables__empty");
      note.appendChild(document.createTextNode("No variables yet. Wrap any reusable part of the prompt in double braces — "));
      note.appendChild(element("code", null, "{{topic}}"));
      note.appendChild(document.createTextNode(" — and an input will appear here."));
      ui.variableFields.appendChild(note);
    }

    for (const variable of list) {
      const field = element("label", "field");
      const label = element("span", "field__label", variable.label);
      if (variable.defaultValue) {
        label.appendChild(document.createTextNode(" "));
        label.appendChild(element("span", "field__hint", `default: ${variable.defaultValue}`));
      }
      const input = document.createElement("input");
      input.type = "text";
      input.value = state.variableValues[variable.key] || "";
      input.placeholder = variable.defaultValue || variable.name;
      input.autocomplete = "off";
      input.addEventListener("input", () => {
        state.variableValues[variable.key] = input.value;
        renderPreview();
      });
      field.appendChild(label);
      field.appendChild(input);
      ui.variableFields.appendChild(field);
    }

    renderPreview();
  }

  function renderPreview() {
    const segments = variables.segment(ui.contentInput.value, state.variableValues);
    ui.previewOutput.textContent = "";

    if (!ui.contentInput.value.trim()) {
      ui.previewOutput.appendChild(element("span", "var-empty", "Nothing to preview yet."));
      return;
    }

    for (const part of segments) {
      if (part.type === "text") {
        ui.previewOutput.appendChild(document.createTextNode(part.text));
      } else {
        ui.previewOutput.appendChild(
          element("span", part.filled ? "var-filled" : "var-empty", part.text)
        );
      }
    }
  }

  function setActiveTab(tab) {
    state.tab = tab;
    for (const button of document.querySelectorAll(".tab")) {
      const active = button.dataset.tab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    }
    $("panel-write").hidden = tab !== "write";
    $("panel-preview").hidden = tab !== "preview";
    $("panel-history").hidden = tab !== "history";
    if (tab === "preview") renderVariables();
    if (tab === "history") {
      autosave.flush();
      renderHistory();
    }
  }

  function setSaveState(mode) {
    state.dirty = mode !== "saved";
    ui.saveState.dataset.state = mode;
    ui.saveState.textContent =
      mode === "saved" ? "All changes saved" : mode === "saving" ? "Saving…" : "Unsaved changes";
  }

  function render() {
    renderFilterControls();
    renderList();
    renderStats();
    renderEditor();
    renderHistoryBadge();
    if (state.tab === "history") renderHistory();
  }

  /* ------------------------------------------------------------------ *
   * Actions
   * ------------------------------------------------------------------ */

  function readDraft() {
    return {
      title: ui.titleInput.value.trim(),
      category: ui.categoryInput.value.trim(),
      tags: ui.tagsInput.value,
      notes: ui.notesInput.value,
      content: ui.contentInput.value,
    };
  }

  function saveDraft(options) {
    const prompt = selected();
    if (!prompt) return;
    const draft = readDraft();
    if (!draft.title && !draft.content.trim()) {
      setSaveState("unsaved");
      return;
    }

    const explicit = Boolean(options && options.announce);
    const result = library.upsert(state.prompts, Object.assign({}, prompt, draft));
    state.prompts = result.prompts;

    // Every real change is remembered. Ctrl+S / the Save button always adds its
    // own entry; autosave folds rapid edits into one so history stays readable.
    const versionChanged = recordVersion(prompt, result.prompt, explicit ? { force: true, reason: "save" } : {});

    const saved = persist();
    if (versionChanged) persistVersions();
    setSaveState(saved ? "saved" : "unsaved");
    renderFilterControls();
    renderList();
    renderStats();
    renderContentMeta();
    renderHistoryBadge();
    if (explicit && saved) toast("Prompt saved.", { type: "success", duration: 1600 });
  }

  const autosave = debounce(() => saveDraft(), AUTOSAVE_MS);

  /**
   * A brand new prompt is kept in memory until it has a title or some text,
   * so abandoning "New prompt" never leaves an empty card behind.
   */
  function isBlankDraft(prompt) {
    return Boolean(prompt) && !prompt.content.trim() && prompt.title === "Untitled prompt";
  }

  function pruneBlankDrafts(keepId) {
    const next = state.prompts.filter((prompt) => prompt.id === keepId || !isBlankDraft(prompt));
    if (next.length !== state.prompts.length) {
      state.prompts = next;
      persist();
    }
  }

  function selectPrompt(id, options) {
    autosave.flush();
    if (state.selectedId === id && !(options && options.force)) return;
    pruneBlankDrafts(id);
    state.selectedId = id;
    state.variableValues = {};
    state.historySel = null;
    state.historyCompare = "current";
    setActiveTab("write");
    render();
    if (location.hash !== `#p=${id}`) window.history.replaceState(null, "", `#p=${id}`);
    if (!(options && options.silent)) {
      requestAnimationFrame(() => {
        const prompt = selected();
        if (prompt && !prompt.title) ui.titleInput.focus();
      });
    }
  }

  function newPrompt() {
    autosave.flush();
    pruneBlankDrafts(null);
    const draft = schema.createPrompt({ title: "", content: "", category: "" });
    state.prompts = [draft].concat(state.prompts);
    state.selectedId = draft.id;
    state.variableValues = {};
    setActiveTab("write");
    render();
    setSaveState("unsaved");
    ui.titleInput.focus();
  }

  function deletePrompt(id) {
    const target = library.find(state.prompts, id);
    if (!target) return;

    const removal = library.remove(state.prompts, id);
    state.prompts = removal.prompts;
    // Keep the prompt's history for the undo window; it is dropped from storage with the prompt.
    const removedHistory = history.get(state.versions, id);
    state.versions = history.pruneOrphans(state.versions, state.prompts).versions;
    if (state.selectedId === id) {
      state.selectedId = null;
      window.history.replaceState(null, "", location.pathname + location.search);
    }
    persist();
    persistVersions();
    render();

    toast(`Deleted “${target.title}”.`, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          state.prompts = library.restore(state.prompts, removal.removed, removal.index);
          if (removedHistory.length) state.versions = Object.assign({}, state.versions, { [id]: removedHistory });
          persist();
          persistVersions();
          selectPrompt(removal.removed.id, { force: true, silent: true });
          toast("Restored.", { type: "success", duration: 1600 });
        },
      },
    });
  }

  function duplicatePrompt(id) {
    const result = library.duplicate(state.prompts, id);
    if (!result.prompt) return;
    state.prompts = result.prompts;
    persist();
    selectPrompt(result.prompt.id, { force: true, silent: true });
    toast("Duplicated.", { type: "success", duration: 1800 });
  }

  function toggleFavorite(id) {
    if (id === state.selectedId) autosave.flush();
    const result = library.toggleFavorite(state.prompts, id);
    if (!result.prompt) return;
    state.prompts = result.prompts;
    persist();
    render();
  }

  function toggleTagFilter(tag) {
    const lower = tag.toLowerCase();
    const active = state.filters.tags.some((value) => value.toLowerCase() === lower);
    state.filters.tags = active
      ? state.filters.tags.filter((value) => value.toLowerCase() !== lower)
      : state.filters.tags.concat(tag);
    renderFilterControls();
    renderList();
  }

  function clearFilters() {
    state.filters = Object.assign({}, search.DEFAULT_FILTERS, { sort: state.filters.sort });
    ui.searchInput.value = "";
    renderFilterControls();
    renderList();
    ui.searchInput.focus();
  }

  async function copyText(text, message) {
    if (!text.trim()) {
      toast("Nothing to copy yet.", { type: "error", duration: 1800 });
      return false;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for file:// and older browsers.
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        area.remove();
      }
      toast(message || "Copied to clipboard.", { type: "success", duration: 1800 });
      return true;
    } catch (error) {
      toast("Your browser blocked the clipboard.", { type: "error" });
      return false;
    }
  }

  async function copyPrompt(filled) {
    const prompt = selected();
    if (!prompt) return;
    const raw = ui.contentInput.value;
    const text = filled ? variables.applyVariables(raw, state.variableValues) : raw;
    const unfilled = variables.countUnfilled(raw, state.variableValues);

    const copied = await copyText(
      text,
      filled && unfilled ? `Copied — ${plural(unfilled, "variable")} still empty.` : "Prompt copied."
    );
    if (!copied) return;

    if (state.settings.trackUsage !== false) {
      const result = library.markUsed(state.prompts, prompt.id);
      state.prompts = result.prompts;
      persist();
      renderList();
      renderContentMeta();
    }
  }

  /* ------------------------------------------------------------------ *
   * Version history
   * ------------------------------------------------------------------ */

  function promptHistory() {
    const prompt = selected();
    return prompt ? history.get(state.versions, prompt.id) : [];
  }

  /** The prompt as it is in the editor right now, including unsaved typing. */
  function currentFields() {
    return history.fieldsOf(Object.assign({}, selected(), readDraft()));
  }

  function renderHistoryBadge() {
    const count = promptHistory().length;
    ui.historyBadge.hidden = count === 0;
    ui.historyBadge.textContent = String(count);
  }

  function describeEntry(entry) {
    return `${history.reasonLabel(entry.reason)} · ${relativeTime(entry.savedAt)}`;
  }

  function renderDiff(diff) {
    const box = ui.historyDiff;
    box.textContent = "";

    if (!diff.changed) {
      box.appendChild(element("div", "diff__none", "These two versions are identical."));
      return;
    }

    if (diff.fields.length) {
      const fields = element("div", "diff__fields");
      const names = { title: "Title", category: "Category", notes: "Note", tags: "Tags" };
      for (const change of diff.fields) {
        fields.appendChild(
          element("div", null, `${names[change.field]}: “${change.from || "empty"}” → “${change.to || "empty"}”`)
        );
      }
      box.appendChild(fields);
    }

    if (diff.lines.added + diff.lines.removed === 0) return;
    const marks = { add: "+", del: "−", same: " " };
    const spoken = { add: "Added: ", del: "Removed: ", same: "" };

    for (const op of history.collapse(diff.lines.ops, 2)) {
      if (op.type === "skip") {
        box.appendChild(element("div", "diff__skip", `${plural(op.count, "unchanged line")} hidden`));
        continue;
      }
      const line = element("div", `diff__line diff__line--${op.type}`);
      line.appendChild(element("span", "diff__mark", marks[op.type])).setAttribute("aria-hidden", "true");
      if (spoken[op.type]) line.appendChild(element("span", "visually-hidden", spoken[op.type]));
      line.appendChild(element("span", null, op.text === "" ? " " : op.text));
      box.appendChild(line);
    }
    if (diff.lines.truncated) {
      box.appendChild(element("div", "diff__skip", "This prompt is very long, so every line is shown as changed."));
    }
  }

  function renderHistory() {
    renderHistoryBadge();
    const prompt = selected();
    const entries = promptHistory();

    ui.historyList.textContent = "";
    ui.historyCompare.textContent = "";
    ui.historyDiff.textContent = "";

    if (!prompt || !entries.length) {
      ui.historyHelp.textContent =
        "No saved versions yet. A version is added when you edit and save this prompt, so you can always come back to an earlier wording.";
      ui.historyTitle.textContent = "No versions yet";
      ui.historyMeta.textContent = "";
      for (const button of [ui.historyRestoreBtn, ui.historyDuplicateBtn, ui.historyDeleteBtn]) button.disabled = true;
      ui.historyCompare.disabled = true;
      return;
    }

    ui.historyCompare.disabled = false;
    ui.historyHelp.textContent =
      `${plural(entries.length, "saved version")}, newest first. Autosave folds quick edits into one entry; ` +
      "Save (Ctrl+S) always adds a new one. Restoring never discards your current text.";

    if (!entries.some((entry) => entry.n === state.historySel)) {
      // Open on the version before the newest, which shows "what did my last edit change?".
      state.historySel = (entries.length > 1 ? entries[entries.length - 2] : entries[entries.length - 1]).n;
    }
    const chosen = entries.find((entry) => entry.n === state.historySel);
    const latest = entries[entries.length - 1];

    for (const entry of entries.slice().reverse()) {
      const item = document.createElement("li");
      const button = element("button", "history__item");
      button.type = "button";
      button.setAttribute("aria-current", String(entry.n === chosen.n));

      const top = element("span", "history__item-top");
      top.appendChild(element("span", null, `Version ${entry.n}`));
      if (entry.n === latest.n) top.appendChild(element("span", "history__tag", "latest"));
      button.appendChild(top);
      button.appendChild(element("span", "history__item-sub", describeEntry(entry)));
      button.addEventListener("click", () => {
        state.historySel = entry.n;
        state.historyCompare = "current";
        renderHistory();
      });
      item.appendChild(button);
      ui.historyList.appendChild(item);
    }

    ui.historyTitle.textContent = `Version ${chosen.n}`;
    ui.historyMeta.textContent = `${history.reasonLabel(chosen.reason)} · ${new Date(chosen.savedAt).toLocaleString()}`;

    const current = element("option", null, "Current text in the editor");
    current.value = "current";
    ui.historyCompare.appendChild(current);
    for (const entry of entries.slice().reverse()) {
      if (entry.n === chosen.n) continue;
      const option = element("option", null, `Version ${entry.n} · ${relativeTime(entry.savedAt)}`);
      option.value = String(entry.n);
      ui.historyCompare.appendChild(option);
    }
    if (![...ui.historyCompare.options].some((option) => option.value === state.historyCompare)) {
      state.historyCompare = "current";
    }
    ui.historyCompare.value = state.historyCompare;

    const target =
      state.historyCompare === "current"
        ? currentFields()
        : entries.find((entry) => String(entry.n) === state.historyCompare) || currentFields();
    renderDiff(history.diffEntries(chosen, target));

    const identical = history.sameFields(chosen, currentFields());
    ui.historyRestoreBtn.disabled = identical;
    ui.historyRestoreBtn.title = identical ? "The editor already has this text" : "";
    ui.historyDuplicateBtn.disabled = false;
    ui.historyDeleteBtn.disabled = chosen.n === latest.n;
    ui.historyDeleteBtn.title = chosen.n === latest.n ? "The newest version cannot be deleted" : "";
  }

  function chosenVersion() {
    return promptHistory().find((entry) => entry.n === state.historySel) || null;
  }

  async function restoreVersion() {
    const entry = chosenVersion();
    const prompt = selected();
    if (!entry || !prompt) return;

    const ok = await confirmAction(
      `Restore version ${entry.n}? Your current text is saved as its own version first, so you can come back to it.`,
      "Restore"
    );
    if (!ok) return;

    autosave.flush();
    // 1. Snapshot what is there now (a no-op if it already matches the newest entry).
    recordVersion(null, selected(), { force: true, reason: "before-restore" });
    // 2. Apply the old text and record that as a new version. Nothing is overwritten.
    const applied = library.upsert(state.prompts, Object.assign({}, selected(), history.fieldsForRestore(entry)));
    state.prompts = applied.prompts;
    recordVersion(null, applied.prompt, { force: true, reason: "restore" });

    persist();
    persistVersions();
    setSaveState("saved");
    state.historySel = null;
    state.historyCompare = "current";
    render();
    renderHistory();
    toast(`Restored version ${entry.n}. The earlier text is still in History.`, { type: "success" });
  }

  function duplicateVersion() {
    const entry = chosenVersion();
    if (!entry) return;
    autosave.flush();
    const fields = history.fieldsForRestore(entry);
    const copy = schema.createPrompt(Object.assign({}, fields, { title: `${fields.title} (version ${entry.n})` }));
    state.prompts = [copy].concat(state.prompts);
    recordVersion(null, copy, { force: true, reason: "save" });
    persist();
    persistVersions();
    selectPrompt(copy.id, { force: true, silent: true });
    toast(`Created a new prompt from version ${entry.n}.`, { type: "success" });
  }

  async function deleteVersion() {
    const entry = chosenVersion();
    const prompt = selected();
    if (!entry || !prompt) return;
    const ok = await confirmAction(`Delete version ${entry.n} from this prompt's history? The prompt itself is not changed.`, "Delete version");
    if (!ok) return;

    const result = history.remove(state.versions, prompt.id, entry.n);
    if (!result.removed) {
      return toast(result.reason === "latest" ? "The newest version cannot be deleted." : "That version no longer exists.", { type: "error" });
    }
    state.versions = result.versions;
    persistVersions();
    state.historySel = null;
    renderHistory();
    toast(`Deleted version ${entry.n}.`, { duration: 2200 });
  }

  /* ------------------------------------------------------------------ *
   * Downloads, backups and exports
   * ------------------------------------------------------------------ */

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function stamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function exportJson() {
    if (!state.prompts.length) return toast("Nothing to export yet.", { type: "error" });
    download(
      `ai-prompts-${stamp()}.json`,
      JSON.stringify(schema.createExport(state.prompts), null, 2),
      "application/json"
    );
    toast(`Exported ${plural(state.prompts.length, "prompt")}.`, { type: "success" });
  }

  function exportMarkdown() {
    if (!state.prompts.length) return toast("Nothing to export yet.", { type: "error" });
    download(`ai-prompts-${stamp()}.md`, schema.toMarkdown(state.prompts), "text/markdown");
    toast("Markdown exported.", { type: "success" });
  }

  function createBackupFile() {
    if (!state.prompts.length) return toast("Nothing to back up yet.", { type: "error" });
    autosave.flush();
    const file = backup.createBackup({
      prompts: state.prompts,
      versions: state.versions,
      settings: state.settings,
    });
    download(`ai-prompt-toolkit-backup-${stamp()}.json`, JSON.stringify(file, null, 2), "application/json");
    state.settings.lastBackupAt = new Date().toISOString();
    store.saveSettings(state.settings);
    renderBackupStatus();
    toast(
      `Backup created — ${plural(file.counts.prompts, "prompt")} and ${plural(file.counts.versions, "saved version")}.`,
      { type: "success" }
    );
  }

  function renderBackupStatus() {
    const last = state.settings.lastBackupAt;
    ui.backupStatus.textContent = last
      ? `Last full backup: ${relativeTime(last)} (${new Date(last).toLocaleDateString()}).`
      : "You have not created a full backup yet.";
  }

  /* ------------------------------------------------------------------ *
   * Import: read -> preview -> choose a mode -> confirm
   * ------------------------------------------------------------------ */

  const KIND_LABELS = {
    backup: "Full backup",
    export: "Prompt export",
    safety: "Safety copy",
    "legacy list": "Old prompt list (version 1)",
  };

  function openImport(file) {
    if (!file) return;
    if (file.size > security.LIMITS.maxImportBytes) {
      const mb = Math.round(security.LIMITS.maxImportBytes / (1024 * 1024));
      return toast(`That file is too large to import (the limit is ${mb} MB).`, { type: "error", duration: 4200 });
    }
    const reader = new FileReader();
    reader.onload = () => showImportPreview(file.name, String(reader.result));
    reader.onerror = () => toast("That file could not be read.", { type: "error" });
    reader.readAsText(file);
  }

  function fillNotice(node, messages) {
    node.textContent = "";
    node.hidden = messages.length === 0;
    if (messages.length === 1) {
      node.appendChild(element("p", null, messages[0]));
    } else if (messages.length > 1) {
      const list = document.createElement("ul");
      for (const message of messages) list.appendChild(element("li", null, message));
      node.appendChild(list);
    }
  }

  function addSummaryRow(list, label, value) {
    list.appendChild(element("dt", null, label));
    const dd = element("dd", null, value);
    list.appendChild(dd);
    return dd;
  }

  function selectedImportMode() {
    const checked = ui.importModes.querySelector("input[name='importMode']:checked");
    return checked ? checked.value : "merge";
  }

  function showImportPreview(name, text) {
    const inspection = backup.inspect(text);
    state.pendingImport = { name, inspection };

    ui.importFileName.textContent = name.slice(0, 120);
    fillNotice(ui.importErrors, inspection.errors);
    fillNotice(ui.importWarnings, inspection.warnings);

    ui.importSummary.textContent = "";
    for (const old of ui.importModes.querySelectorAll(".mode")) old.remove();
    ui.importSettingsRow.hidden = true;
    ui.importSettings.checked = false;

    if (inspection.ok) {
      const info = inspection.summary;
      addSummaryRow(ui.importSummary, "File type", KIND_LABELS[info.kind] || "Prompt file");
      addSummaryRow(ui.importSummary, "Prompts", String(info.prompts));
      if (info.kind === "backup" || info.versions) addSummaryRow(ui.importSummary, "Saved versions", String(info.versions));
      addSummaryRow(
        ui.importSummary,
        "Data format",
        `version ${info.schemaVersion}${info.migratedFrom ? " — upgraded automatically" : ""}`
      );
      if (info.appVersion) addSummaryRow(ui.importSummary, "Made with", `AI Prompt Toolkit ${info.appVersion}`);
      if (info.createdAt && !Number.isNaN(Date.parse(info.createdAt))) {
        addSummaryRow(ui.importSummary, "Created", new Date(info.createdAt).toLocaleString());
      }
      if (info.integrity !== "none") {
        addSummaryRow(
          ui.importSummary,
          "Integrity",
          info.integrity === "ok" ? "Checksum matches" : "Checksum does NOT match — the file was changed or damaged"
        );
      }

      for (const [id, mode] of Object.entries(backup.MODES)) {
        const label = element("label", "mode");
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "importMode";
        radio.value = id;
        radio.checked = id === "merge";
        radio.addEventListener("change", updateImportOutcome);
        const text2 = element("span", "mode__text");
        text2.appendChild(element("span", "mode__label", mode.label));
        text2.appendChild(element("span", "mode__help", mode.help));
        label.appendChild(radio);
        label.appendChild(text2);
        ui.importModes.appendChild(label);
      }
      ui.importSettingsRow.hidden = !(inspection.settings && Object.keys(inspection.settings).length);
    }

    ui.importModes.hidden = !inspection.ok;
    updateImportOutcome();
    if (!ui.importDialog.open) ui.importDialog.showModal();
  }

  function planFor(mode) {
    const pending = state.pendingImport;
    return backup.plan(
      { prompts: state.prompts, versions: state.versions },
      { prompts: pending.inspection.prompts, versions: pending.inspection.versions },
      mode
    );
  }

  function updateImportOutcome() {
    const pending = state.pendingImport;
    if (!pending || !pending.inspection.ok) {
      ui.importOutcome.textContent = "";
      ui.importOutcome.hidden = true;
      ui.importConfirm.disabled = true;
      return;
    }
    const plan = planFor(selectedImportMode());
    const changes = plan.stats.added + plan.stats.updated + plan.stats.removed;
    ui.importOutcome.hidden = false;
    ui.importOutcome.textContent = changes
      ? `Result: ${backup.describeStats(plan.stats)}. Your library will have ${plural(plan.prompts.length, "prompt")}.` +
        (state.prompts.length ? " A safety copy of your current library is kept so you can undo this." : "")
      : "Nothing would change with this choice.";
    ui.importConfirm.disabled = changes === 0;
  }

  function closeImport() {
    state.pendingImport = null;
    if (ui.importDialog.open) ui.importDialog.close();
  }

  function applyImport() {
    const pending = state.pendingImport;
    if (!pending || !pending.inspection.ok) return;
    if (store.isLocked()) {
      return toast("Saving is paused until the problem at the top of the page is resolved.", { type: "error" });
    }

    autosave.flush();
    const mode = selectedImportMode();
    const before = { prompts: state.prompts, versions: state.versions };
    const plan = planFor(mode);

    if (state.prompts.length && !store.saveSafety(before, mode)) {
      return toast(
        "There is not enough browser storage to keep a safety copy, so nothing was imported. Create a backup file first, then try again.",
        { type: "error", duration: 7000 }
      );
    }

    state.prompts = plan.prompts;
    state.versions = plan.versions;
    if (!persist()) {
      state.prompts = before.prompts;
      state.versions = before.versions;
      render();
      return;
    }
    persistVersions();

    if (ui.importSettings.checked && pending.inspection.settings) {
      const picked = pending.inspection.settings;
      if (picked.sort) {
        state.settings.sort = picked.sort;
        state.filters.sort = picked.sort;
      }
      if (typeof picked.trackUsage === "boolean") state.settings.trackUsage = picked.trackUsage;
      if (picked.theme) applyTheme(picked.theme);
      else store.saveSettings(state.settings);
    }

    if (!library.find(state.prompts, state.selectedId)) state.selectedId = null;
    const summary = backup.describeStats(plan.stats);
    closeImport();
    render();
    toast(`Import finished — ${summary}.`, {
      type: "success",
      duration: 12000,
      action: { label: "Undo", onClick: () => restoreSafety({ skipConfirm: true }) },
    });
  }

  /* ------------------------------------------------------------------ *
   * Safety copy (undo for imports)
   * ------------------------------------------------------------------ */

  async function restoreSafety(options) {
    const safety = store.loadSafety();
    if (!safety) return toast("There is no safety copy to restore.");

    if (!(options && options.skipConfirm)) {
      const ok = await confirmAction(
        `This puts your library back to how it was ${relativeTime(safety.savedAt)} (${plural(safety.prompts.length, "prompt")}). ` +
          "Changes made since then are replaced, but your current library is kept as the new safety copy, so you can switch back.",
        "Restore"
      );
      if (!ok) return;
    }

    autosave.flush();
    const current = { prompts: state.prompts, versions: state.versions };
    state.prompts = safety.prompts;
    state.versions = safety.versions;
    if (!persist()) {
      state.prompts = current.prompts;
      state.versions = current.versions;
      return;
    }
    persistVersions();
    store.saveSafety(current, "undo");
    if (!library.find(state.prompts, state.selectedId)) state.selectedId = null;
    render();
    renderSafety();
    toast("Library restored.", { type: "success" });
  }

  function renderSafety() {
    const safety = store.loadSafety();
    ui.safetyBox.hidden = !safety;
    if (!safety) return;
    ui.safetyText.textContent =
      `A safety copy is available: ${plural(safety.prompts.length, "prompt")} as they were ${relativeTime(safety.savedAt)}, ` +
      `taken before ${safety.reason === "undo" ? "your last restore" : "an import"}.`;
  }

  /* ------------------------------------------------------------------ *
   * Recovery (damaged data, or data from a newer version)
   * ------------------------------------------------------------------ */

  function renderRecovery() {
    const problem = store.getProblem();
    ui.recoveryBanner.hidden = !problem;
    if (!problem) return;
    ui.recoveryTitle.textContent =
      problem.code === "newer" ? "This library was saved by a newer version of the app" : "Your saved library could not be read";
    ui.recoveryBody.textContent = `${problem.message} Saving is paused so the stored data is not overwritten.`;
  }

  function downloadProblemData() {
    const raw = store.readProblemRaw();
    if (!raw) return toast("There is nothing to download.");
    download(`ai-prompt-toolkit-unreadable-data-${stamp()}.txt`, raw, "text/plain");
    toast("Downloaded the stored data exactly as it was.", { type: "success" });
  }

  async function startFresh() {
    const ok = await confirmAction(
      "Start with an empty library? The stored data is kept in a hidden copy that you can download later from Settings & data.",
      "Start fresh"
    );
    if (!ok) return;
    let result = store.resolveProblem();
    if (!result.ok) {
      const force = await confirmAction(
        "There is not enough browser storage to keep a copy of the stored data. Download it first if you want to keep it. Continue and discard it?",
        "Discard and continue"
      );
      if (!force) return;
      result = store.resolveProblem({ discard: true });
    }
    state.prompts = [];
    state.versions = {};
    state.selectedId = null;
    renderRecovery();
    render();
    toast("Started with an empty library. You can restore a backup from the Library menu.", { type: "success" });
  }

  /* ------------------------------------------------------------------ *
   * Reset (requires typing DELETE)
   * ------------------------------------------------------------------ */

  function openReset() {
    const counts = history.counts(state.versions);
    ui.resetBody.textContent =
      `This permanently erases ${plural(state.prompts.length, "prompt")}, ${plural(counts.entries, "saved version")}, ` +
      "your settings and any safety copy from this browser. There is no undo. Download a backup first if you might want anything back.";
    ui.resetInput.value = "";
    ui.resetConfirm.disabled = true;
    ui.resetDialog.showModal();
    ui.resetInput.focus();
  }

  function performReset() {
    if (ui.resetInput.value !== "DELETE") return;
    autosave.cancel();
    state.dirty = false;
    store.clear();
    state.prompts = [];
    state.versions = {};
    state.selectedId = null;
    ui.resetDialog.close();
    window.history.replaceState(null, "", location.pathname + location.search);
    location.reload();
  }

  function loadStarterPack() {
    const result = schema.mergePrompts(state.prompts, schema.normalizeAll(starterPrompts));
    state.prompts = result.prompts;
    state.settings.onboarded = true;
    store.saveSettings(state.settings);
    persist();
    render();
    toast(`Added ${plural(result.added, "starter prompt")}.`, { type: "success" });
  }

  /* ------------------------------------------------------------------ *
   * Settings & data
   * ------------------------------------------------------------------ */

  function openSettings() {
    renderSettings();
    ui.settingsDialog.showModal();
  }

  function renderSettings() {
    const theme = ["system", "light", "dark"].includes(state.settings.theme) ? state.settings.theme : "system";
    ui.settingTheme.value = theme;

    if (!ui.settingSort.options.length) {
      for (const sort of search.SORTS) {
        const option = element("option", null, sort.label);
        option.value = sort.value;
        ui.settingSort.appendChild(option);
      }
    }
    ui.settingSort.value = state.settings.sort || "updated";
    ui.settingTrackUsage.checked = state.settings.trackUsage !== false;

    renderBackupStatus();
    renderSafety();
    renderStorageInfo();
    ui.healthResults.textContent = "";
  }

  function renderStorageInfo() {
    const usage = store.usage();
    const counts = history.counts(state.versions);
    const percent = Math.round((usage.total / health.ESTIMATED_QUOTA_CHARS) * 100);

    ui.storageInfo.textContent = "";
    addSummaryRow(ui.storageInfo, "Prompts", String(state.prompts.length));
    addSummaryRow(ui.storageInfo, "Saved versions", `${counts.entries} across ${plural(counts.prompts, "prompt")}`);
    addSummaryRow(
      ui.storageInfo,
      "Storage in use",
      `about ${Math.max(1, Math.round(usage.total / 1024))} KB of text (roughly ${percent}% of the usual browser limit)`
    );
    addSummaryRow(
      ui.storageInfo,
      "Storage mode",
      store.isPersistent ? "Saved in this browser" : "Temporary — private browsing, nothing is kept"
    );
    addSummaryRow(ui.storageInfo, "App version", schema.APP_VERSION);
    addSummaryRow(ui.storageInfo, "Data format", `version ${schema.SCHEMA_VERSION}`);

    const worker = addSummaryRow(ui.storageInfo, "Offline support", "Checking…");
    const cache = addSummaryRow(ui.storageInfo, "Offline cache", "Checking…");
    if (pwa.supported() && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then(
        (registration) => {
          worker.textContent =
            registration && registration.active ? "Active — the app opens without a connection" : "Not active yet — reload once";
        },
        () => {
          worker.textContent = "Unavailable";
        }
      );
      pwa.cacheNames().then((names) => {
        cache.textContent = names.length ? names.join(", ") : "Nothing cached yet";
      });
    } else {
      worker.textContent = "Not available here (it needs https:// or localhost)";
      cache.textContent = "—";
    }

    ui.dropLegacyBtn.hidden = usage.legacy === 0;
    ui.quarantineBtn.hidden = !store.readQuarantine();
  }

  function runHealthCheck() {
    const stored = store.readStored();
    const report = health.run({
      persistent: store.isPersistent,
      problem: store.getProblem(),
      rawPrompts: stored.rawPrompts,
      rawVersions: stored.rawVersions,
      usage: store.usage(),
    });
    const labels = { ok: "OK", info: "Note", warn: "Warning", error: "Problem" };

    ui.healthResults.textContent = "";
    for (const entry of report.checks) {
      const item = element("li");
      item.dataset.level = entry.level;
      item.appendChild(element("span", "health__level", labels[entry.level]));
      item.appendChild(element("span", null, entry.message));
      ui.healthResults.appendChild(item);
    }
  }

  async function removeLegacyCopies() {
    const ok = await confirmAction(
      "Remove the copies of your library that were kept in older storage formats? Your current library is not affected.",
      "Remove"
    );
    if (!ok) return;
    store.dropLegacy();
    renderStorageInfo();
    toast("Old-format copies removed.", { type: "success" });
  }

  function downloadQuarantine() {
    const kept = store.readQuarantine();
    if (!kept) return;
    download(`ai-prompt-toolkit-set-aside-data-${stamp()}.txt`, kept.raw, "text/plain");
  }

  /* ------------------------------------------------------------------ *
   * Theme
   * ------------------------------------------------------------------ */

  const lightQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

  function resolveTheme(setting) {
    if (setting === "light" || setting === "dark") return setting;
    return lightQuery && lightQuery.matches ? "light" : "dark";
  }

  /** `setting` is "system", "light" or "dark". */
  function toggleTheme() {
    applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
  }

  function applyTheme(setting) {
    const choice = ["system", "light", "dark"].includes(setting) ? setting : "system";
    const resolved = resolveTheme(choice);
    document.documentElement.dataset.theme = resolved;
    const color = resolved === "light" ? "#f4f6fc" : "#080b14";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", color);
    state.settings.theme = choice;
    store.saveSettings(state.settings);
  }

  /* ------------------------------------------------------------------ *
   * Command palette
   * ------------------------------------------------------------------ */

  const PALETTE_ACTIONS = [
    { id: "new", title: "New prompt", sub: "Create an empty prompt", icon: "i-plus", run: newPrompt },
    { id: "starter", title: "Load starter pack", sub: "Add 8 ready-made prompts", icon: "i-sparkle", run: loadStarterPack },
    { id: "backup", title: "Create full backup", sub: "Prompts, history and settings in one file", icon: "i-shield", run: createBackupFile },
    { id: "settings", title: "Settings & data", sub: "Theme, backups, storage, health check", icon: "i-settings", run: openSettings },
    { id: "export", title: "Export prompts as JSON", sub: "Prompts only, without history", icon: "i-download", run: exportJson },
    { id: "export-md", title: "Export as Markdown", sub: "Readable copy of every prompt", icon: "i-download", run: exportMarkdown },
    { id: "import", title: "Restore or import a file", sub: "Preview first, then choose how to import", icon: "i-upload", run: () => ui.importFile.click() },
    { id: "theme", title: "Switch theme", sub: "Dark and light", icon: "i-moon", run: toggleTheme },
    { id: "shortcuts", title: "Keyboard shortcuts", sub: "See every shortcut", icon: "i-keyboard", run: () => ui.shortcutsDialog.showModal() },
  ];

  function openPalette() {
    ui.paletteInput.value = "";
    renderPalette("");
    ui.paletteDialog.showModal();
    ui.paletteInput.focus();
  }

  function renderPalette(query) {
    const text = query.trim().toLowerCase();
    const prompts = search
      .queryPrompts(state.prompts, Object.assign({}, search.DEFAULT_FILTERS, { query: text }))
      .slice(0, 8);
    const actions = PALETTE_ACTIONS.filter(
      (action) => !text || action.title.toLowerCase().includes(text) || action.sub.toLowerCase().includes(text)
    );

    state.paletteItems = [];
    ui.paletteResults.textContent = "";

    const addGroup = (label) => {
      const item = document.createElement("li");
      item.appendChild(element("div", "palette__group", label));
      ui.paletteResults.appendChild(item);
    };

    const addItem = (entry) => {
      const index = state.paletteItems.length;
      state.paletteItems.push(entry);

      const item = document.createElement("li");
      const button = element("button", "palette__item");
      button.type = "button";
      button.dataset.index = String(index);
      button.appendChild(icon(entry.icon));

      const text2 = element("span", "palette__text");
      text2.appendChild(element("span", "palette__title", entry.title));
      text2.appendChild(element("span", "palette__sub", entry.sub));
      button.appendChild(text2);

      button.addEventListener("click", () => {
        ui.paletteDialog.close();
        entry.run();
      });
      button.addEventListener("mousemove", () => setPaletteIndex(index));
      item.appendChild(button);
      ui.paletteResults.appendChild(item);
    };

    if (prompts.length) {
      addGroup("Prompts");
      for (const prompt of prompts) {
        addItem({
          title: prompt.title,
          sub: `${prompt.category}${prompt.tags.length ? " · #" + prompt.tags.join(" #") : ""}`,
          icon: prompt.favorite ? "i-star" : "i-search",
          run: () => selectPrompt(prompt.id, { force: true, silent: true }),
        });
      }
    }

    if (actions.length) {
      addGroup("Actions");
      for (const action of actions) addItem(action);
    }

    if (!state.paletteItems.length) {
      const item = document.createElement("li");
      item.appendChild(element("div", "palette__empty", `No matches for “${query.trim()}”.`));
      ui.paletteResults.appendChild(item);
    }

    setPaletteIndex(0);
  }

  function setPaletteIndex(index) {
    const items = ui.paletteResults.querySelectorAll(".palette__item");
    if (!items.length) return;
    state.paletteIndex = (index + items.length) % items.length;
    items.forEach((item, position) => item.classList.toggle("is-active", position === state.paletteIndex));
    const active = items[state.paletteIndex];
    if (active && typeof active.scrollIntoView === "function") active.scrollIntoView({ block: "nearest" });
  }

  function runPaletteSelection() {
    const entry = state.paletteItems[state.paletteIndex];
    if (!entry) return;
    ui.paletteDialog.close();
    entry.run();
  }

  /* ------------------------------------------------------------------ *
   * Events
   * ------------------------------------------------------------------ */

  function bindEvents() {
    // Filters
    ui.searchInput.addEventListener(
      "input",
      debounce(() => {
        state.filters.query = ui.searchInput.value;
        renderList();
        renderFilterControls();
      }, 120)
    );
    ui.categoryFilter.addEventListener("change", () => {
      state.filters.category = ui.categoryFilter.value;
      renderFilterControls();
      renderList();
    });
    ui.sortSelect.addEventListener("change", () => {
      state.filters.sort = ui.sortSelect.value;
      state.settings.sort = ui.sortSelect.value;
      store.saveSettings(state.settings);
      renderList();
    });
    ui.favFilterBtn.addEventListener("click", () => {
      state.filters.favoritesOnly = !state.filters.favoritesOnly;
      renderFilterControls();
      renderList();
    });
    ui.clearFiltersBtn.addEventListener("click", clearFilters);

    // Editor inputs
    for (const input of [ui.titleInput, ui.categoryInput, ui.tagsInput, ui.notesInput]) {
      input.addEventListener("input", () => {
        setSaveState("unsaved");
        autosave();
      });
    }
    ui.contentInput.addEventListener("input", () => {
      setSaveState("unsaved");
      renderContentMeta();
      if (state.tab === "preview") renderVariables();
      autosave();
    });

    ui.saveBtn.addEventListener("click", () => {
      autosave.cancel();
      saveDraft({ announce: true });
    });
    ui.copyBtn.addEventListener("click", () => copyPrompt(false));
    ui.previewCopyBtn.addEventListener("click", () => copyPrompt(true));
    ui.favoriteBtn.addEventListener("click", () => state.selectedId && toggleFavorite(state.selectedId));
    ui.duplicateBtn.addEventListener("click", () => state.selectedId && duplicatePrompt(state.selectedId));
    ui.deleteBtn.addEventListener("click", async () => {
      const prompt = selected();
      if (!prompt) return;
      const ok = await confirmAction(`Delete “${prompt.title}”? You can undo this right after.`);
      if (ok) deletePrompt(prompt.id);
    });
    ui.backBtn.addEventListener("click", () => {
      autosave.flush();
      pruneBlankDrafts(null);
      state.selectedId = null;
      window.history.replaceState(null, "", location.pathname + location.search);
      render();
    });

    for (const tab of document.querySelectorAll(".tab")) {
      tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
    }
    // Arrow keys move between tabs, as in the WAI-ARIA tabs pattern.
    document.querySelector(".tabs").addEventListener("keydown", (event) => {
      const tabs = Array.from(document.querySelectorAll(".tab"));
      const index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
      if (!(event.key in moves)) return;
      event.preventDefault();
      const next = tabs[(moves[event.key] + tabs.length) % tabs.length];
      next.focus();
      setActiveTab(next.dataset.tab);
    });

    // History
    ui.historyCompare.addEventListener("change", () => {
      state.historyCompare = ui.historyCompare.value;
      renderHistory();
    });
    ui.historyRestoreBtn.addEventListener("click", restoreVersion);
    ui.historyDuplicateBtn.addEventListener("click", duplicateVersion);
    ui.historyDeleteBtn.addEventListener("click", deleteVersion);

    // Import dialog
    ui.importCancel.addEventListener("click", closeImport);
    ui.importConfirm.addEventListener("click", applyImport);
    ui.importDialog.addEventListener("close", () => {
      state.pendingImport = null;
    });

    // Settings
    ui.settingTheme.addEventListener("change", () => applyTheme(ui.settingTheme.value));
    ui.settingSort.addEventListener("change", () => {
      state.settings.sort = ui.settingSort.value;
      state.filters.sort = ui.settingSort.value;
      store.saveSettings(state.settings);
      renderFilterControls();
      renderList();
    });
    ui.settingTrackUsage.addEventListener("change", () => {
      state.settings.trackUsage = ui.settingTrackUsage.checked;
      store.saveSettings(state.settings);
    });
    ui.settingsBackupBtn.addEventListener("click", createBackupFile);
    ui.settingsImportBtn.addEventListener("click", () => ui.importFile.click());
    ui.settingsExportJsonBtn.addEventListener("click", exportJson);
    ui.settingsExportMdBtn.addEventListener("click", exportMarkdown);
    ui.safetyRestoreBtn.addEventListener("click", () => restoreSafety());
    ui.safetyDiscardBtn.addEventListener("click", () => {
      store.clearSafety();
      renderSafety();
      renderStorageInfo();
      toast("Safety copy discarded.");
    });
    ui.healthBtn.addEventListener("click", runHealthCheck);
    ui.dropLegacyBtn.addEventListener("click", removeLegacyCopies);
    ui.quarantineBtn.addEventListener("click", downloadQuarantine);
    ui.settingsResetBtn.addEventListener("click", () => {
      ui.settingsDialog.close();
      openReset();
    });

    // Reset
    ui.resetInput.addEventListener("input", () => {
      ui.resetConfirm.disabled = ui.resetInput.value !== "DELETE";
    });
    ui.resetCancel.addEventListener("click", () => ui.resetDialog.close());
    ui.resetBackupBtn.addEventListener("click", createBackupFile);
    ui.resetConfirm.addEventListener("click", performReset);

    // Recovery banner
    ui.recoveryDownload.addEventListener("click", downloadProblemData);
    ui.recoveryReset.addEventListener("click", startFresh);

    // Offline indicator
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    // Top bar
    ui.newBtn.addEventListener("click", newPrompt);
    ui.paletteBtn.addEventListener("click", openPalette);
    ui.themeBtn.addEventListener("click", toggleTheme);
    if (lightQuery && lightQuery.addEventListener) {
      lightQuery.addEventListener("change", () => {
        if (state.settings.theme === "system") applyTheme("system");
      });
    }

    ui.dataMenuBtn.addEventListener("click", () => {
      const open = ui.dataMenuPanel.hidden;
      ui.dataMenuPanel.hidden = !open;
      ui.dataMenuBtn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (event) => {
      if (!ui.dataMenu.contains(event.target)) {
        ui.dataMenuPanel.hidden = true;
        ui.dataMenuBtn.setAttribute("aria-expanded", "false");
      }
    });

    document.addEventListener("click", (event) => {
      const trigger = event.target.closest("[data-action]");
      if (!trigger) return;
      const actions = {
        "export-json": exportJson,
        "export-md": exportMarkdown,
        backup: createBackupFile,
        import: () => ui.importFile.click(),
        settings: openSettings,
        starter: loadStarterPack,
        shortcuts: () => ui.shortcutsDialog.showModal(),
        reset: openReset,
        new: newPrompt,
      };
      const run = actions[trigger.dataset.action];
      if (!run) return;
      ui.dataMenuPanel.hidden = true;
      ui.dataMenuBtn.setAttribute("aria-expanded", "false");
      run();
    });

    ui.importFile.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) openImport(file);
      event.target.value = "";
    });

    for (const button of document.querySelectorAll("[data-close-dialog]")) {
      button.addEventListener("click", () => button.closest("dialog").close());
    }

    // Palette
    ui.paletteInput.addEventListener("input", () => renderPalette(ui.paletteInput.value));
    ui.paletteInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setPaletteIndex(state.paletteIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setPaletteIndex(state.paletteIndex - 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        runPaletteSelection();
      }
    });

    // Drag & drop a backup file anywhere on the page
    window.addEventListener("dragover", (event) => event.preventDefault());
    window.addEventListener("drop", (event) => {
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (!file) return;
      event.preventDefault();
      if (!/\.json$/i.test(file.name)) return toast("Only .json backups can be imported.", { type: "error" });
      openImport(file);
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      autosave.flush();
      if (state.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    });

    document.addEventListener("keydown", onShortcut);
  }

  function updateOnlineStatus() {
    ui.offlineBadge.hidden = navigator.onLine !== false;
  }

  function onShortcut(event) {
    const target = event.target;
    const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    const mod = event.ctrlKey || event.metaKey;

    if (mod && event.key.toLowerCase() === "k") {
      event.preventDefault();
      return openPalette();
    }
    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      autosave.cancel();
      return saveDraft({ announce: true });
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === "n") {
      event.preventDefault();
      return newPrompt();
    }
    if (mod && event.shiftKey && event.key.toLowerCase() === "c") {
      event.preventDefault();
      return copyPrompt(state.tab === "preview");
    }
    if (mod && event.key.toLowerCase() === "d") {
      if (!state.selectedId) return;
      event.preventDefault();
      return toggleFavorite(state.selectedId);
    }

    if (typing) {
      if (event.key === "Escape" && target === ui.searchInput) clearFilters();
      return;
    }

    if (event.key === "/") {
      event.preventDefault();
      ui.searchInput.focus();
      ui.searchInput.select();
    } else if (event.key === "?") {
      event.preventDefault();
      ui.shortcutsDialog.showModal();
    } else if (event.key === "Escape" && search.hasActiveFilters(state.filters)) {
      clearFilters();
    }
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  function init() {
    state.settings = store.loadSettings();
    applyTheme(state.settings.theme);

    const loaded = store.loadLibrary();
    state.prompts = loaded.prompts;
    state.versions = loaded.versions;
    state.filters.sort = state.settings.sort || "updated";

    if (!store.isPersistent) {
      ui.storageNote.hidden = false;
      ui.storageNote.textContent =
        "Private browsing detected: prompts will disappear when this tab closes. Export a backup before you leave.";
    }

    bindEvents();
    setActiveTab("write");
    renderRecovery();
    updateOnlineStatus();
    render();

    if (loaded.migrated) {
      toast(`Upgraded ${plural(loaded.migrated.count, "prompt")} to the new storage format. Nothing was deleted.`, {
        type: "success",
        duration: 4500,
      });
    }
    for (const warning of loaded.warnings.slice(0, 2)) toast(warning, { duration: 7000 });

    const match = /#p=([\w-]+)/.exec(location.hash);
    if (match) {
      const prompt = library.find(state.prompts, match[1]);
      if (prompt) selectPrompt(prompt.id, { force: true, silent: true });
    }

    pwa.register({
      onUpdate: (apply) =>
        toast("A new version of AI Prompt Toolkit is ready.", {
          duration: 600000,
          action: {
            label: "Reload to update",
            onClick: () => {
              autosave.flush();
              apply();
            },
          },
        }),
      onOfflineReady: () => toast("Ready to work offline.", { type: "success", duration: 3500 }),
    });
  }

  init();
})();
