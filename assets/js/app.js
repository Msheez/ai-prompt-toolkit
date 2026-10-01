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
 * interpreted as markup.
 */
(function () {
  "use strict";

  const { schema, search, variables, library, storage, starterPrompts } = window.PromptToolkit;

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */

  const store = storage.createStorage();

  const state = {
    prompts: [],
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

  function persist() {
    const ok = store.savePrompts(state.prompts);
    if (!ok) toast("Could not save — browser storage is full or blocked.", { type: "error" });
    return ok;
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
    }
    $("panel-write").hidden = tab !== "write";
    $("panel-preview").hidden = tab !== "preview";
    if (tab === "preview") renderVariables();
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

    const result = library.upsert(state.prompts, Object.assign({}, prompt, draft));
    state.prompts = result.prompts;
    persist();
    setSaveState("saved");
    renderFilterControls();
    renderList();
    renderStats();
    renderContentMeta();
    if (options && options.announce) toast("Prompt saved.", { type: "success", duration: 1600 });
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
    setActiveTab("write");
    render();
    if (location.hash !== `#p=${id}`) history.replaceState(null, "", `#p=${id}`);
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
    if (state.selectedId === id) {
      state.selectedId = null;
      history.replaceState(null, "", location.pathname + location.search);
    }
    persist();
    render();

    toast(`Deleted “${target.title}”.`, {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          state.prompts = library.restore(state.prompts, removal.removed, removal.index);
          persist();
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

    const result = library.markUsed(state.prompts, prompt.id);
    state.prompts = result.prompts;
    persist();
    renderList();
    renderContentMeta();
  }

  /* ------------------------------------------------------------------ *
   * Import / export
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

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const incoming = schema.parseExport(String(reader.result));
        const result = schema.mergePrompts(state.prompts, incoming);
        state.prompts = result.prompts;
        persist();
        render();
        const details = [
          result.added ? `${result.added} added` : "",
          result.updated ? `${result.updated} updated` : "",
          result.skipped ? `${result.skipped} already up to date` : "",
        ].filter(Boolean);
        toast(`Import finished — ${details.join(", ") || "nothing changed"}.`, { type: "success" });
      } catch (error) {
        toast(error.message || "That file could not be imported.", { type: "error", duration: 4200 });
      }
    };
    reader.onerror = () => toast("That file could not be read.", { type: "error" });
    reader.readAsText(file);
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

  async function clearEverything() {
    if (!state.prompts.length) return toast("Your library is already empty.");
    const ok = await confirmAction(
      `This permanently deletes all ${plural(state.prompts.length, "prompt")} from this browser. Export a backup first if you are not sure.`,
      "Delete everything"
    );
    if (!ok) return;
    state.prompts = [];
    state.selectedId = null;
    persist();
    render();
    toast("Library cleared.", { type: "success" });
  }

  /* ------------------------------------------------------------------ *
   * Theme
   * ------------------------------------------------------------------ */

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const color = theme === "light" ? "#f4f6fc" : "#080b14";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", color);
    state.settings.theme = theme;
    store.saveSettings(state.settings);
  }

  /* ------------------------------------------------------------------ *
   * Command palette
   * ------------------------------------------------------------------ */

  const PALETTE_ACTIONS = [
    { id: "new", title: "New prompt", sub: "Create an empty prompt", icon: "i-plus", run: newPrompt },
    { id: "starter", title: "Load starter pack", sub: "Add 8 ready-made prompts", icon: "i-sparkle", run: loadStarterPack },
    { id: "export", title: "Export as JSON", sub: "Download a backup", icon: "i-download", run: exportJson },
    { id: "export-md", title: "Export as Markdown", sub: "Readable copy of every prompt", icon: "i-download", run: exportMarkdown },
    { id: "import", title: "Import JSON", sub: "Merge a backup into this library", icon: "i-upload", run: () => ui.importFile.click() },
    { id: "theme", title: "Switch theme", sub: "Dark and light", icon: "i-moon", run: () => applyTheme(state.settings.theme === "light" ? "dark" : "light") },
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
      history.replaceState(null, "", location.pathname + location.search);
      render();
    });

    for (const tab of document.querySelectorAll(".tab")) {
      tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
    }

    // Top bar
    ui.newBtn.addEventListener("click", newPrompt);
    ui.paletteBtn.addEventListener("click", openPalette);
    ui.themeBtn.addEventListener("click", () =>
      applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light")
    );

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
        import: () => ui.importFile.click(),
        starter: loadStarterPack,
        shortcuts: () => ui.shortcutsDialog.showModal(),
        "clear-all": clearEverything,
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
      if (file) importJson(file);
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
      importJson(file);
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
    if (!store.hasSettings() && window.matchMedia) {
      // First visit: follow the operating system preference.
      state.settings.theme = window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    applyTheme(state.settings.theme === "light" ? "light" : "dark");

    const loaded = store.loadPrompts();
    state.prompts = loaded.prompts;
    state.filters.sort = state.settings.sort || "updated";

    if (!store.isPersistent) {
      ui.storageNote.hidden = false;
      ui.storageNote.textContent =
        "Private browsing detected: prompts will disappear when this tab closes. Export a backup before you leave.";
    }

    bindEvents();
    render();

    if (loaded.migrated) {
      toast(`Upgraded ${plural(state.prompts.length, "prompt")} from version 1.`, { type: "success", duration: 4000 });
    }

    const match = /#p=([\w-]+)/.exec(location.hash);
    if (match) {
      const prompt = library.find(state.prompts, match[1]);
      if (prompt) selectPrompt(prompt.id, { force: true, silent: true });
    }
  }

  init();
})();
