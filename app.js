const state = {
  packageName: "",
  manifest: null,
  dataSpec: [],
  skillText: "",
  fileEntries: [],
  fileMap: new Map(),
  objectUrlMap: new Map(),
  selectedStepId: null,
  selectedFilePath: null,
};

const el = {
  folderInput: document.getElementById("folderInput"),
  packageBadge: document.getElementById("packageBadge"),
  packageSummary: document.getElementById("packageSummary"),
  fileList: document.getElementById("fileList"),
  filePreview: document.getElementById("filePreview"),
  stepTabs: document.getElementById("stepTabs"),
  stepTitle: document.getElementById("stepTitle"),
  stepMeta: document.getElementById("stepMeta"),
  stepSummary: document.getElementById("stepSummary"),
  cardAImage: document.getElementById("cardAImage"),
  cardBImage: document.getElementById("cardBImage"),
  cardACaption: document.getElementById("cardACaption"),
  cardBCaption: document.getElementById("cardBCaption"),
  baseUrlInput: document.getElementById("baseUrlInput"),
  modelInput: document.getElementById("modelInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  skillEditor: document.getElementById("skillEditor"),
  generateBtn: document.getElementById("generateBtn"),
  copyReportBtn: document.getElementById("copyReportBtn"),
  reportOutput: document.getElementById("reportOutput"),
  statusBar: document.getElementById("statusBar"),
};

function setStatus(text) {
  el.statusBar.textContent = text;
}

function sanitizeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeRelativePath(rawPath) {
  return rawPath.replace(/^\.?\/*/, "");
}

async function initializePackageFromFiles(files) {
  const fileMap = new Map();
  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    fileMap.set(normalizeRelativePath(relativePath.split("/").slice(1).join("/")), file);
  }

  return initializePackageFromMap(fileMap, files[0]?.webkitRelativePath?.split("/")[0] || "folder_package");
}

async function initializePackageFromMap(fileMap, packageName) {
  cleanupObjectUrls();

  state.packageName = packageName;
  state.fileMap = fileMap;
  state.fileEntries = Array.from(fileMap.keys()).sort();

  const manifest = await readJson("package_manifest.json");
  const dataSpec = await readJson(manifest.entry_data_file);
  const skillText = await readText(manifest.skill_file);

  state.manifest = manifest;
  state.dataSpec = dataSpec;
  state.skillText = skillText;
  state.selectedStepId = manifest.default_step_id || dataSpec[0]?.step_id || null;
  state.selectedFilePath = "package_manifest.json";

  el.skillEditor.value = skillText;
  renderPackageSummary();
  renderFileList();
  await renderFilePreview(state.selectedFilePath);
  renderStepTabs();
  await renderSelectedStep();
}

async function readText(path) {
  const key = normalizeRelativePath(path);
  const entry = state.fileMap.get(key);
  if (!entry) {
    throw new Error(`Missing file: ${key}`);
  }
  if (typeof entry === "string") {
    return entry;
  }
  return entry.text();
}

async function readJson(path) {
  const text = await readText(path);
  return JSON.parse(text);
}

function resolveImageUrl(path) {
  const key = normalizeRelativePath(path);
  const entry = state.fileMap.get(key);
  if (!entry) {
    return "";
  }
  if (typeof entry === "string") {
    return entry;
  }
  if (!state.objectUrlMap.has(key)) {
    state.objectUrlMap.set(key, URL.createObjectURL(entry));
  }
  return state.objectUrlMap.get(key);
}

function cleanupObjectUrls() {
  for (const value of state.objectUrlMap.values()) {
    URL.revokeObjectURL(value);
  }
  state.objectUrlMap.clear();
}

function renderPackageSummary() {
  const { manifest } = state;
  el.packageBadge.textContent = manifest.package_name;
  el.packageSummary.innerHTML = `
    <strong>${sanitizeHtml(manifest.display_name_zh)}</strong><br />
    ${sanitizeHtml(manifest.description_zh)}<br /><br />
    <strong>Story:</strong> ${sanitizeHtml(manifest.story_id)}<br />
    <strong>Difficulty:</strong> ${sanitizeHtml(manifest.difficulty)}<br />
    <strong>Files:</strong> ${manifest.files.length}<br />
    <strong>Steps:</strong> ${manifest.steps.length}
  `;
}

function renderFileList() {
  if (!state.fileEntries.length) {
    el.fileList.textContent = "No files loaded.";
    return;
  }
  el.fileList.innerHTML = "";
  state.fileEntries.forEach((path) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "file-item" + (state.selectedFilePath === path ? " active" : "");
    button.textContent = path;
    button.addEventListener("click", async () => {
      state.selectedFilePath = path;
      renderFileList();
      await renderFilePreview(path);
    });
    el.fileList.appendChild(button);
  });
}

async function renderFilePreview(path) {
  if (!path) {
    el.filePreview.textContent = "Select a file to inspect.";
    return;
  }
  const entry = state.fileMap.get(path);
  if (!entry) {
    el.filePreview.textContent = `Missing file: ${path}`;
    return;
  }
  if (/\.(png|jpg|jpeg|webp)$/i.test(path)) {
    const src = resolveImageUrl(path);
    el.filePreview.innerHTML = `<img src="${src}" alt="${sanitizeHtml(path)}" style="max-width:100%; border-radius:12px;" />`;
    return;
  }
  const text = typeof entry === "string" ? entry : await entry.text();
  el.filePreview.textContent = text;
}

function renderStepTabs() {
  const steps = state.dataSpec;
  el.stepTabs.innerHTML = "";
  steps.forEach((step) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "step-tab" + (state.selectedStepId === step.step_id ? " active" : "");
    button.textContent = `${step.step_id}`;
    button.addEventListener("click", async () => {
      state.selectedStepId = step.step_id;
      renderStepTabs();
      await renderSelectedStep();
    });
    el.stepTabs.appendChild(button);
  });
}

async function renderSelectedStep() {
  const step = state.dataSpec.find((item) => item.step_id === state.selectedStepId);
  if (!step) {
    return;
  }
  const manifestStep = state.manifest.steps.find((item) => item.step_id === step.step_id);
  el.stepTitle.textContent = `${step.step_id} · ${manifestStep?.title_zh || ""}`;
  el.stepMeta.textContent = `${step.context_window?.time_state || ""} · relevance=${step.relevance_level}`;
  el.stepSummary.innerHTML = `
    <strong>Context Injection</strong><br />
    ${sanitizeHtml(step.context_injection)}<br /><br />
    <strong>User Goal</strong><br />
    ${sanitizeHtml(step.user_goal_zh || "")}<br /><br />
    <strong>Task Prompt</strong><br />
    ${sanitizeHtml(step.task_prompt?.zh || "")}
  `;

  el.cardAImage.src = resolveImageUrl(step.main_card_thumb_url);
  el.cardBImage.src = resolveImageUrl(step.sub_card_thumb_url);
  el.cardACaption.textContent = `${step.main_app} · ${step.main_app_thumb_prompt}`;
  el.cardBCaption.textContent = `${step.sub_app} · ${step.sub_app_thumb_prompt}`;
}

function getCurrentStep() {
  return state.dataSpec.find((item) => item.step_id === state.selectedStepId);
}

async function toDataUrl(path) {
  const key = normalizeRelativePath(path);
  const entry = state.fileMap.get(key);
  if (!entry) {
    throw new Error(`Missing image: ${key}`);
  }
  if (typeof entry === "string") {
    const response = await fetch(entry);
    const blob = await response.blob();
    return blobToDataUrl(blob);
  }
  return blobToDataUrl(entry);
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function buildSystemPrompt(skillText) {
  return [
    "You are evaluating dynamic GUI card pairs for a demo platform.",
    "Use the following skill as your rubric and output contract.",
    "",
    skillText,
  ].join("\n");
}

function buildUserPrompt(step) {
  return [
    "Please evaluate the current step and output a Markdown report.",
    "",
    "Evaluation requirement:",
    "1. Judge main-sub card causal relevance.",
    "2. Judge thumbnail-detail relevance.",
    "3. Judge whether the timing of card appearance/disappearance is correct.",
    "4. Judge whether card content is correct and complete under the step context.",
    "",
    "Current step structured data:",
    JSON.stringify(step, null, 2),
    "",
    "Important constraints:",
    "- Treat Card A as the primary task card.",
    "- Treat Card B as the supporting linked card.",
    "- Use evidence from city, station, cinema, dinner, time window, and current user goal.",
    "- Keep the report concise but decision-oriented.",
  ].join("\n");
}

async function generateReport() {
  const step = getCurrentStep();
  if (!step) {
    setStatus("No step selected.");
    return;
  }
  const apiKey = el.apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus("Yunwu API key is required.");
    return;
  }

  try {
    setStatus("Generating evaluation report with Yunwu...");
    el.generateBtn.disabled = true;

    const [cardADataUrl, cardBDataUrl] = await Promise.all([
      toDataUrl(step.main_card_thumb_url),
      toDataUrl(step.sub_card_thumb_url),
    ]);

    const response = await fetch(`${el.baseUrlInput.value.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: el.modelInput.value.trim() || "gpt-5.4",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: buildSystemPrompt(el.skillEditor.value),
          },
          {
            role: "user",
            content: [
              { type: "text", text: buildUserPrompt(step) },
              { type: "image_url", image_url: { url: cardADataUrl } },
              { type: "image_url", image_url: { url: cardBDataUrl } },
            ],
          },
        ],
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message || `HTTP ${response.status}`);
    }
    const text = payload.choices?.[0]?.message?.content || "No report returned.";
    el.reportOutput.value = text;
    setStatus("Evaluation report generated.");
  } catch (error) {
    console.error(error);
    setStatus(`Generation failed: ${error.message}`);
  } finally {
    el.generateBtn.disabled = false;
  }
}

async function copyReport() {
  if (!el.reportOutput.value) {
    setStatus("No report to copy.");
    return;
  }
  await navigator.clipboard.writeText(el.reportOutput.value);
  setStatus("Report copied.");
}

el.folderInput.addEventListener("change", async (event) => {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }
  try {
    setStatus("Loading selected story package...");
    await initializePackageFromFiles(files);
    setStatus("Story package loaded.");
  } catch (error) {
    console.error(error);
    setStatus(`Load failed: ${error.message}`);
  }
});

el.generateBtn.addEventListener("click", generateReport);
el.copyReportBtn.addEventListener("click", copyReport);

el.skillEditor.value = "# Evaluation skill will appear here after loading a package.";
el.reportOutput.value = "# Evaluation report output";
