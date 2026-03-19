const state = {
  packageName: "",
  packages: new Map(),
  packageOrder: [],
  currentPackage: null,
  globalSkillText: "",
  systemIntroText: "",
  objectUrlMap: new Map(),
  selectedStepId: null,
  selectedFilePath: null,
};

const DEFAULT_SYSTEM_INTRO = `You are evaluating dynamic GUI card pairs for a demo platform.
Your job is to judge card relevance, timing, causal linkage, and content correctness under mobile contextual intelligence scenarios.
Return a concise but rigorous Markdown evaluation report.`;

const DEFAULT_GLOBAL_SKILL = `# Dynamic GUI Eval Skill / 动态 GUI 评测 Skill

## Scope / 评测范围

1. 卡片内容与用户上下文相关性判定
1.1 主副卡片内容因果关系推理
1.2 双层卡片间相关性推理机制

2. 卡片内容与用户上下文相关性判定 - 对齐用户体验
2.1 卡片弹出与消失时间正确性判定
2.2 卡片内容正确性与完整性判定

## Working Rule / 工作规则

- Evaluate four images together: main thumb, main detail, sub thumb, sub detail.
- Treat Card A as the main task card and Card B as the linked supporting card.
- Judge whether Card B is a natural consequence or dependency of Card A under the current step context.
- Judge whether the current timing is appropriate for the card pair to appear.
- Extract key entities such as city, station, cinema, dinner, and time window before giving a conclusion.
- Output a concise Markdown report with evidence, risks, and a final verdict.

- 对四张图一起评测：主卡缩略图、主卡详情图、副卡缩略图、副卡详情图。
- 将 A 卡视为主任务卡，B 卡视为联动辅助卡。
- 判断 B 卡是否是在当前上下文下由 A 卡自然引出的依赖或辅助动作。
- 判断当前时间点是否适合这组卡片出现。
- 先提取城市、车站、影院、晚餐、时间窗口等关键实体，再给出结论。
- 输出简洁的 Markdown 报告，包含证据、风险和最终判断。

## Output Template / 输出模板

\`\`\`md
# Evaluation Report

## Step Summary
- step_id:
- user_goal:
- relevance_level:

## 1. Main-Sub Card Causal Relevance
- verdict:
- evidence:

## 2. Thumbnail-Detail Relevance
- verdict:
- evidence:

## 3. Timing Correctness
- verdict:
- evidence:

## 4. Content Correctness And Completeness
- verdict:
- evidence:

## Risks
- ...

## Final Verdict
- overall:
- confidence:
\`\`\``;

const el = {
  folderInput: document.getElementById("folderInput"),
  packageBadge: document.getElementById("packageBadge"),
  packageTabs: document.getElementById("packageTabs"),
  packageSummary: document.getElementById("packageSummary"),
  fileList: document.getElementById("fileList"),
  filePreview: document.getElementById("filePreview"),
  stepTabs: document.getElementById("stepTabs"),
  stepTitle: document.getElementById("stepTitle"),
  stepMeta: document.getElementById("stepMeta"),
  stepSummary: document.getElementById("stepSummary"),
  mainThumbImage: document.getElementById("mainThumbImage"),
  mainDetailImage: document.getElementById("mainDetailImage"),
  subThumbImage: document.getElementById("subThumbImage"),
  subDetailImage: document.getElementById("subDetailImage"),
  mainThumbCaption: document.getElementById("mainThumbCaption"),
  mainDetailCaption: document.getElementById("mainDetailCaption"),
  subThumbCaption: document.getElementById("subThumbCaption"),
  subDetailCaption: document.getElementById("subDetailCaption"),
  baseUrlInput: document.getElementById("baseUrlInput"),
  modelInput: document.getElementById("modelInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  systemIntroEditor: document.getElementById("systemIntroEditor"),
  contextScopeSelect: document.getElementById("contextScopeSelect"),
  includeSkillSelect: document.getElementById("includeSkillSelect"),
  includePackageSummarySelect: document.getElementById("includePackageSummarySelect"),
  skillEditor: document.getElementById("skillEditor"),
  generateBtn: document.getElementById("generateBtn"),
  copyReportBtn: document.getElementById("copyReportBtn"),
  saveReportBtn: document.getElementById("saveReportBtn"),
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
  const grouped = new Map();
  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    const parts = relativePath.split("/").filter(Boolean);
    const packageIndex =
      parts.length >= 3 && (parts[1].startsWith("set") || parts[1].includes("_eval_demo")) ? 1 : 0;
    const packageName = parts[packageIndex] || "folder_package";
    const innerPath = normalizeRelativePath(parts.slice(packageIndex + 1).join("/"));
    if (!grouped.has(packageName)) {
      grouped.set(packageName, new Map());
    }
    grouped.get(packageName).set(innerPath, file);
  }

  return initializePackages(grouped);
}

async function initializePackages(groupedMaps) {
  cleanupObjectUrls();
  state.packages = new Map();
  state.packageOrder = [];
  state.globalSkillText = state.globalSkillText || DEFAULT_GLOBAL_SKILL;

  for (const [packageName, fileMap] of groupedMaps.entries()) {
    let pkg = null;
    if (fileMap.has("package_manifest.json")) {
      pkg = await buildManifestPackage(packageName, fileMap);
    } else if (fileMap.has("output.json")) {
      pkg = await buildSetPackage(packageName, fileMap);
    }
    if (pkg) {
      state.packages.set(packageName, pkg);
      state.packageOrder.push(packageName);
    }
  }

  if (!state.packageOrder.length) {
    throw new Error("No supported package found. Expected package_manifest.json or output.json.");
  }

  state.packageOrder.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  await switchPackage(state.packageOrder[0]);
}

async function buildManifestPackage(packageName, fileMap) {
  const manifest = JSON.parse(await readTextFromMap(fileMap, "package_manifest.json"));
  const dataSpec = JSON.parse(await readTextFromMap(fileMap, manifest.entry_data_file));
  return {
    packageName,
    fileMap,
    fileEntries: Array.from(fileMap.keys()).sort(),
    manifest,
    dataSpec,
    kind: "manifest",
  };
}

async function buildSetPackage(packageName, fileMap) {
  const rawDataSpec = JSON.parse(await readTextFromMap(fileMap, "output.json"));
  const dataSpec = rawDataSpec.map((step, index) => enrichSetStep(step, index + 1, fileMap));
  const manifest = {
    package_name: packageName,
    display_name_zh: packageName.toUpperCase(),
    description_zh: "Set-style evaluation package with four-image inputs per step.",
    story_id: packageName,
    difficulty: "set-demo",
    files: Array.from(fileMap.keys()).sort(),
    steps: dataSpec.map((step) => ({ step_id: step.step_id, title_zh: step.context_injection || step.step_id })),
    default_step_id: dataSpec.find((item) => item.main_card_thumb_url)?.step_id || dataSpec[0]?.step_id || null,
  };
  return {
    packageName,
    fileMap,
    fileEntries: Array.from(fileMap.keys()).sort(),
    manifest,
    dataSpec,
    kind: "set",
  };
}

function enrichSetStep(step, index, fileMap) {
  if (index === 1) {
    return step;
  }
  const itemIndex = index;
  const mapped = { ...step };
  const candidates = {
    main_card_thumb_url: `item_${itemIndex}_main_app_thumb_prompt.png`,
    main_card_detail_url: `item_${itemIndex}_main_app_detail_prompt.png`,
    sub_card_thumb_url: `item_${itemIndex}_sub_app_thumb_prompt.png`,
    sub_card_detail_url: `item_${itemIndex}_sub_app_detail_prompt.png`,
  };
  Object.entries(candidates).forEach(([field, filename]) => {
    if (fileMap.has(filename)) {
      mapped[field] = filename;
    }
  });
  return mapped;
}

async function switchPackage(packageName) {
  const pkg = state.packages.get(packageName);
  if (!pkg) {
    return;
  }
  state.currentPackage = pkg;
  state.packageName = packageName;
  state.selectedStepId = pkg.manifest.default_step_id || pkg.dataSpec[0]?.step_id || null;
  state.selectedFilePath = pkg.fileEntries[0] || null;
  el.skillEditor.value = state.globalSkillText || DEFAULT_GLOBAL_SKILL;
  renderPackageTabs();
  renderPackageSummary();
  renderFileList();
  await renderFilePreview(state.selectedFilePath);
  renderStepTabs();
  await renderSelectedStep();
  updateSystemPromptPreview();
}

async function readTextFromMap(fileMap, path) {
  const key = normalizeRelativePath(path);
  const entry = fileMap.get(key);
  if (!entry) {
    throw new Error(`Missing file: ${key}`);
  }
  if (typeof entry === "string") {
    return entry;
  }
  return entry.text();
}

async function readText(path) {
  return readTextFromMap(state.currentPackage.fileMap, path);
}

async function readJson(path) {
  const text = await readText(path);
  return JSON.parse(text);
}

function resolveImageUrl(path) {
  const key = normalizeRelativePath(path);
  const entry = state.currentPackage.fileMap.get(key);
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
  const { manifest, kind } = state.currentPackage;
  el.packageBadge.textContent = manifest.package_name;
  el.packageSummary.innerHTML = `
    <strong>${sanitizeHtml(manifest.display_name_zh)}</strong><br />
    ${sanitizeHtml(manifest.description_zh)}<br /><br />
    <strong>Story:</strong> ${sanitizeHtml(manifest.story_id)}<br />
    <strong>Difficulty:</strong> ${sanitizeHtml(manifest.difficulty)}<br />
    <strong>Format:</strong> ${sanitizeHtml(kind)}<br />
    <strong>Files:</strong> ${manifest.files.length}<br />
    <strong>Steps:</strong> ${manifest.steps.length}
  `;
}

function renderPackageTabs() {
  if (!state.packageOrder.length) {
    el.packageTabs.textContent = "No packages loaded.";
    return;
  }
  el.packageTabs.innerHTML = "";
  state.packageOrder.forEach((packageName) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "step-tab" + (state.packageName === packageName ? " active" : "");
    button.textContent = packageName;
    button.addEventListener("click", async () => {
      await switchPackage(packageName);
      setStatus(`Switched to ${packageName}.`);
    });
    el.packageTabs.appendChild(button);
  });
}

function renderFileList() {
  if (!state.currentPackage.fileEntries.length) {
    el.fileList.textContent = "No files loaded.";
    return;
  }
  el.fileList.innerHTML = "";
  state.currentPackage.fileEntries.forEach((path) => {
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
  const entry = state.currentPackage.fileMap.get(path);
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
  const steps = state.currentPackage.dataSpec;
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
      updateSystemPromptPreview();
    });
    el.stepTabs.appendChild(button);
  });
}

async function renderSelectedStep() {
  const step = state.currentPackage.dataSpec.find((item) => item.step_id === state.selectedStepId);
  if (!step) {
    return;
  }
  const manifestStep = state.currentPackage.manifest.steps.find((item) => item.step_id === step.step_id);
  el.stepTitle.textContent = `${step.step_id} · ${manifestStep?.title_zh || ""}`;
  el.stepMeta.textContent = `${step.context_window?.time_state || ""} · relevance=${step.relevance_level}`;
  el.stepSummary.innerHTML = `
    <strong>Context Injection</strong><br />
    ${sanitizeHtml(step.context_injection)}<br /><br />
    <strong>Main / Sub App</strong><br />
    ${sanitizeHtml(step.main_app || "-")} / ${sanitizeHtml(step.sub_app || "-")}<br /><br />
    <strong>User Goal</strong><br />
    ${sanitizeHtml(step.user_goal_zh || "")}<br /><br />
    <strong>Task Prompt</strong><br />
    ${sanitizeHtml(step.task_prompt?.zh || "")}
  `;

  el.mainThumbImage.src = resolveImageUrl(step.main_card_thumb_url);
  el.mainDetailImage.src = resolveImageUrl(step.main_card_detail_url);
  el.subThumbImage.src = resolveImageUrl(step.sub_card_thumb_url);
  el.subDetailImage.src = resolveImageUrl(step.sub_card_detail_url);
  el.mainThumbCaption.textContent = `${step.main_app || "Main"} · ${step.main_app_thumb_prompt || "No thumb prompt"}`;
  el.mainDetailCaption.textContent = `${step.main_app || "Main"} · ${step.main_app_detail_prompt || "No detail prompt"}`;
  el.subThumbCaption.textContent = `${step.sub_app || "Sub"} · ${step.sub_app_thumb_prompt || "No thumb prompt"}`;
  el.subDetailCaption.textContent = `${step.sub_app || "Sub"} · ${step.sub_app_detail_prompt || "No detail prompt"}`;
}

function getCurrentStep() {
  return state.currentPackage.dataSpec.find((item) => item.step_id === state.selectedStepId);
}

async function toDataUrl(path) {
  const key = normalizeRelativePath(path);
  if (!key) {
    return null;
  }
  const entry = state.currentPackage.fileMap.get(key);
  if (!entry) {
    return null;
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
  const sections = [el.systemIntroEditor.value.trim() || DEFAULT_SYSTEM_INTRO];
  if (el.includePackageSummarySelect.value === "yes" && state.currentPackage) {
    const manifest = state.currentPackage.manifest;
    sections.push(
      [
        "Package Summary:",
        `- package_name: ${manifest.package_name}`,
        `- story_id: ${manifest.story_id}`,
        `- difficulty: ${manifest.difficulty}`,
        `- step_count: ${manifest.steps.length}`,
      ].join("\n")
    );
  }
  if (el.contextScopeSelect.value === "all_steps" && state.currentPackage) {
    const allStepsSummary = state.currentPackage.dataSpec
      .map((step) => {
        const goal = step.user_goal_zh || step.context_injection || "";
        return `- ${step.step_id}: ${goal}`;
      })
      .join("\n");
    sections.push(`Full Story Context:\n${allStepsSummary}`);
  } else if (state.currentPackage) {
    const step = getCurrentStep();
    if (step) {
      sections.push(
        [
          "Current Step Context:",
          `- step_id: ${step.step_id}`,
          `- context_injection: ${step.context_injection || ""}`,
          `- user_goal: ${step.user_goal_zh || ""}`,
        ].join("\n")
      );
    }
  }
  if (el.includeSkillSelect.value === "yes") {
    sections.push(["Use the following skill as your rubric and output contract:", skillText].join("\n\n"));
  }
  return sections.filter(Boolean).join("\n\n");
}

function updateSystemPromptPreview() {
  return;
}

function saveReportToFile() {
  const content = el.reportOutput.value;
  if (!content.trim()) {
    setStatus("No report to save.");
    return;
  }
  const stepId = state.selectedStepId || "report";
  const packageName = state.packageName || "package";
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${packageName}_${stepId}_evaluation_report.md`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus("Report saved to local md.");
}

function buildUserPrompt(step) {
  const missingImages = [
    ["main_card_thumb_url", step.main_card_thumb_url],
    ["main_card_detail_url", step.main_card_detail_url],
    ["sub_card_thumb_url", step.sub_card_thumb_url],
    ["sub_card_detail_url", step.sub_card_detail_url],
  ]
    .filter(([, value]) => !value || !state.currentPackage.fileMap.has(normalizeRelativePath(value)))
    .map(([key]) => key);

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
    "- You must consider both thumbnail and detail images for both main and sub cards.",
    "- Use evidence from city, station, cinema, dinner, time window, and current user goal.",
    "- Keep the report concise but decision-oriented.",
    missingImages.length ? `- Missing image fields: ${missingImages.join(", ")}` : "- All four image fields are available.",
  ].join("\n");
}

async function generateReport() {
  const step = getCurrentStep();
  if (!step) {
    setStatus("No step selected.");
    return;
  }
  const baseUrlRaw = el.baseUrlInput?.value?.trim() || "";
  if (!baseUrlRaw) {
    setStatus("Base URL is required.");
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

    const [mainThumbDataUrl, mainDetailDataUrl, subThumbDataUrl, subDetailDataUrl] = await Promise.all([
      toDataUrl(step.main_card_thumb_url),
      toDataUrl(step.main_card_detail_url),
      toDataUrl(step.sub_card_thumb_url),
      toDataUrl(step.sub_card_detail_url),
    ]);
    const imageContent = [
      mainThumbDataUrl ? { type: "image_url", image_url: { url: mainThumbDataUrl } } : null,
      mainDetailDataUrl ? { type: "image_url", image_url: { url: mainDetailDataUrl } } : null,
      subThumbDataUrl ? { type: "image_url", image_url: { url: subThumbDataUrl } } : null,
      subDetailDataUrl ? { type: "image_url", image_url: { url: subDetailDataUrl } } : null,
    ].filter(Boolean);

    const response = await fetch(`${baseUrlRaw.replace(/\/$/, "")}/chat/completions`, {
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
              ...imageContent,
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
el.saveReportBtn.addEventListener("click", saveReportToFile);
el.skillEditor.addEventListener("input", () => {
  state.globalSkillText = el.skillEditor.value;
  updateSystemPromptPreview();
});
el.systemIntroEditor.addEventListener("input", () => {
  state.systemIntroText = el.systemIntroEditor.value;
  updateSystemPromptPreview();
});
el.contextScopeSelect.addEventListener("change", updateSystemPromptPreview);
el.includeSkillSelect.addEventListener("change", updateSystemPromptPreview);
el.includePackageSummarySelect.addEventListener("change", updateSystemPromptPreview);

state.globalSkillText = DEFAULT_GLOBAL_SKILL;
state.systemIntroText = DEFAULT_SYSTEM_INTRO;
el.systemIntroEditor.value = DEFAULT_SYSTEM_INTRO;
el.skillEditor.value = DEFAULT_GLOBAL_SKILL;
updateSystemPromptPreview();
el.reportOutput.value = "# Evaluation report output";
