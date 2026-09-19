const STORAGE_KEY = "aiPromptToolkit.prompts.v1";
let prompts = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
let selectedId = null;

const $ = id => document.getElementById(id);
const saveAll = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(prompts));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function renderCategories() {
  const categories = [...new Set(prompts.map(p => p.category).filter(Boolean))].sort();
  const current = $("categoryFilter").value;
  $("categoryFilter").innerHTML =
    '<option value="all">All categories</option>' +
    categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (categories.includes(current)) $("categoryFilter").value = current;
}

function renderList() {
  renderCategories();
  const search = $("searchInput").value.toLowerCase().trim();
  const category = $("categoryFilter").value;
  const filtered = prompts.filter(p => {
    const haystack = `${p.title} ${p.content} ${p.tags}`.toLowerCase();
    return (!search || haystack.includes(search)) &&
      (category === "all" || p.category === category);
  });

  $("promptList").innerHTML = filtered.length ? filtered.map(p => `
    <div class="prompt-item ${p.id === selectedId ? "active" : ""}" data-id="${p.id}">
      <strong>${escapeHtml(p.title)}</strong>
      <small>${escapeHtml(p.category || "Uncategorized")}</small>
    </div>
  `).join("") : '<p class="muted">No prompts found.</p>';

  document.querySelectorAll(".prompt-item").forEach(el =>
    el.addEventListener("click", () => openPrompt(el.dataset.id))
  );
}

function openPrompt(id) {
  const p = prompts.find(x => x.id === id);
  if (!p) return;
  selectedId = id;
  $("emptyState").hidden = true;
  $("promptForm").hidden = false;
  $("formTitle").textContent = "Edit Prompt";
  $("title").value = p.title;
  $("category").value = p.category;
  $("tags").value = p.tags;
  $("content").value = p.content;
  renderList();
}

function newPrompt() {
  selectedId = null;
  $("emptyState").hidden = true;
  $("promptForm").hidden = false;
  $("formTitle").textContent = "New Prompt";
  $("promptForm").reset();
  $("title").focus();
  renderList();
}

$("promptForm").addEventListener("submit", e => {
  e.preventDefault();
  const data = {
    id: selectedId || crypto.randomUUID(),
    title: $("title").value.trim(),
    category: $("category").value.trim() || "Uncategorized",
    tags: $("tags").value.trim(),
    content: $("content").value.trim(),
    updatedAt: new Date().toISOString()
  };
  if (selectedId) prompts = prompts.map(p => p.id === selectedId ? data : p);
  else { prompts.unshift(data); selectedId = data.id; }
  saveAll();
  renderList();
  openPrompt(selectedId);
});

$("deleteBtn").addEventListener("click", () => {
  if (!selectedId || !confirm("Delete this prompt?")) return;
  prompts = prompts.filter(p => p.id !== selectedId);
  saveAll();
  selectedId = null;
  $("promptForm").hidden = true;
  $("emptyState").hidden = false;
  renderList();
});

$("copyBtn").addEventListener("click", async () => {
  await navigator.clipboard.writeText($("content").value);
  $("copyBtn").textContent = "Copied!";
  setTimeout(() => $("copyBtn").textContent = "Copy Prompt", 1200);
});

$("newBtn").addEventListener("click", newPrompt);
$("emptyNewBtn").addEventListener("click", newPrompt);
$("searchInput").addEventListener("input", renderList);
$("categoryFilter").addEventListener("change", renderList);

$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(prompts, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "ai-prompts.json"; a.click();
  URL.revokeObjectURL(url);
});

$("importFile").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error();
      prompts = [...imported, ...prompts].map(p => ({
        id: p.id || crypto.randomUUID(),
        title: p.title || "Untitled Prompt",
        category: p.category || "Uncategorized",
        tags: p.tags || "",
        content: p.content || "",
        updatedAt: p.updatedAt || new Date().toISOString()
      }));
      const seen = new Set();
      prompts = prompts.filter(p => !seen.has(p.id) && seen.add(p.id));
      saveAll(); renderList();
      alert("Prompts imported successfully.");
    } catch { alert("That file is not a valid prompt export."); }
  };
  reader.readAsText(file);
  e.target.value = "";
});

renderList();
