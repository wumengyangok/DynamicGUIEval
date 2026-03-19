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
  skillFileHandle: null,
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

const EMBEDDED_SAMPLE06_STEP2 = {
  step_id: 2,
  context_injection:
    "环境信息：当前时间10:00，定位在家中，连接着Home-WiFi；设备交互：屏幕刚刚解锁，系统检测到用户最近十分钟内在使用浏览器搜索“红烧肉的正宗做法”、“清蒸鲈鱼”等关键词。",
  main_app: "下厨房",
  sub_app: "备忘录",
  relevance_level:
    "1. 非常相关。理由：用户当前刚搜过菜系，处于规划午餐菜品和食材清单的核心意图中，推送专业的菜品制作和食材清单App能够直接满足用户当前的备餐需求。",
  relevance_level_between_card:
    "1. 非常相关。理由：用户在浏览复杂菜谱时，往往面临记忆配料的痛点，菜谱App与备忘录购物清单形成了极致的任务互补与协同组合，且相关度极高。",
  accuracy_of_main_card_content:
    "1. 正确。理由：主App缩略图精准复刻并提取了详情图中红烧肉的菜品图、评分数字以及预计烹饪时间，两者逻辑完全自洽。",
  accuracy_of_sub_card_content:
    "1. 正确。理由：副App缩略图提取的五花肉、鲈鱼等条目信息及相应的待勾选状态与详情应用中的内容完全一致。",
  main_card_thumb_url: "item_2_main_app_thumb_prompt.png",
  main_card_detail_url: "item_2_main_app_detail_prompt.png",
  sub_card_thumb_url: "item_2_sub_app_thumb_prompt.png",
  sub_card_detail_url: "item_2_sub_app_detail_prompt.png",
  main_app_detail_prompt:
    "手机App UI设计风格，详情图以外的区域以白底作为背景，作为第一轮基准风格设定。该图展示“下厨房”App的菜谱详情页，要求页面排版现代且极简。顶部是一张色香味俱全的红烧肉高清实拍图。下方包含高清晰度中文文本，主标题为“秘制红烧肉”。副文本显示“评分：9.6分”、“烹饪时间：45分钟”。中间区域清晰展示食材清单的中文文本：“五花肉500g”、“冰糖20g”、“葱姜蒜若干”。",
  sub_app_detail_prompt:
    "继承第一轮中手机App UI设计风格的设定，要求背景区域白底。该图展示“备忘录”App的购物清单界面。界面顶端是高清晰度中文文本大标题“今日采购单”。下方是一个带有勾选框的待办列表，分别包含高清晰度中文字段：未勾选的“五花肉 500g”、未勾选的“冰糖 20g”、未勾选的“葱姜蒜若干”、未勾选的“新鲜鲈鱼 1条”。设计风格干净清爽，逻辑清晰。",
  main_app_thumb_prompt:
    "继承前述UI风格，生成一个正方形（长宽相等）无规则手机App简约风格卡片作为主App缩略图，除了缩略图卡片外周围背景应用纯白底。卡片内高度浓缩红烧肉界面关键信息。必须包含至少5个重要控件：一张红烧肉的小方形图、高清晰度中文标题“秘制红烧肉”、带有星号icon的“9.6分”、带钟表icon的“45分钟”，以及底部的一个带有“开始”文字的操作按钮。整体排版美观紧凑。",
  sub_app_thumb_prompt:
    "继承前述UI风格，生成“备忘录”App正方形（长宽相等）简约卡片缩略图，外部背景使用白底。高度浓缩购物单信息。必须包含至少5个重要控件：顶部极简的高清晰中文标题“采购单”，下方对应四行非常简化的待办项，带有清晰中文本“五花肉”、“冰糖”、“葱姜蒜”、“鲈鱼”，且每一项左侧均带有一个圆形的未勾选对应的复选框icon。整个界面极简、高清晰且严谨匹配详情界面的文本数据。",
  user_goal_zh: "在家中查看午餐菜谱，并为稍后去实体商超采购食材做准备",
};

const EMBEDDED_SAMPLE06_INPUT = `Role: 你是一位资深的手机产品经理和用户体验（UX）专家，擅长设计基于情境感知的智能推荐系统。

Task: 请根据我提供的“场景模版”和“目标场景”，生成一套完整的用户行为路径数据。你需要模拟用户在特定场景下，手机系统如何根据时间、环境和用户习惯动态推送App卡片。`;

const EMBEDDED_SAMPLE06_REPORT = `# Evaluation Report

## Step Summary
- step_id: 2
- user_goal: 在家中查看午餐菜谱，并为稍后去实体商超采购食材做准备
- key_entities:
  - time window: 10:00，刚解锁屏幕
  - location: 家中，Home-WiFi
  - search intent: “红烧肉的正宗做法”“清蒸鲈鱼”
  - Card A topic: 秘制红烧肉菜谱
  - Card B topic: 今日采购单（五花肉、冰糖、葱姜蒜、鲈鱼）

## 1. Main-Sub Card Causal Relevance
- verdict: 基本相关
- evidence:
  - A 卡直接命中用户刚搜索的“红烧肉”做法，符合当前做饭兴趣和午餐准备场景。
  - B 卡作为采购单，能自然承接 A 卡的食材准备需求。
  - B 卡中额外加入“新鲜鲈鱼1条”，与当前另一搜索词“清蒸鲈鱼”也有关，因此可解释为多道菜联动采购。
  - 但 A 卡是单一道菜，B 卡混入另一道菜食材，主从依赖关系不够纯粹，存在轻微跳跃。

## 2. Thumbnail-Detail Relevance
- verdict: 相关性较好
- evidence:
  - A 卡缩略图与详情图一致，均为“秘制红烧肉”，评分、时长、食材和步骤信息前后统一。
  - B 卡缩略图与详情图一致，均为采购清单，主要条目一致且详情图补充了规格（500g、20g、1条）。
  - A 卡食材与 B 卡前三项高度对应，联动关系清晰。

## 3. Timing Correctness
- verdict: 合适
- evidence:
  - 当前 10:00，用户刚在家搜索菜谱，正处于“决定做什么、列采购清单”的最佳时机。
  - 此时展示菜谱 + 采购单，有助于用户马上确定菜单并准备出门采购。
  - 相比购物中或做饭中，这个时间点更符合前置决策阶段。

## 4. Content Correctness And Completeness
- verdict: 部分完整，存在混搭风险
- evidence:
  - A 卡内容完整：菜名、评分、耗时、食材清单、制作步骤均具备。
  - B 卡内容也基本完整：采购条目清晰，并补充了部分数量规格。
  - 问题在于 A 卡只覆盖红烧肉，而 B 卡加入鲈鱼，说明它实际是“组合菜单采购单”而非 A 卡的严格附属清单。
  - 若系统意图支持“一荤一鱼”的丰盛午餐，应在主卡或副卡中明确这是双菜方案，否则容易让用户误解鲈鱼来源。

## Risks
- 主副卡关系略混杂：B 卡不只是 A 卡的食材依赖，还引入了另一道菜。
- 若用户当前只想先看红烧肉做法，鲈鱼条目可能造成认知负担。
- 缺少对“双菜组合”或“基于最近搜索生成采购单”的显式说明。

## Final Verdict
- overall: 可接受，推荐价值较高，但主副卡因果关系不够完全严谨
- confidence: 0.85`;

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
  temperatureInput: document.getElementById("temperatureInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  systemIntroEditor: document.getElementById("systemIntroEditor"),
  contextScopeSelect: document.getElementById("contextScopeSelect"),
  includeSkillSelect: document.getElementById("includeSkillSelect"),
  skillEditor: document.getElementById("skillEditor"),
  loadSkillInput: document.getElementById("loadSkillInput"),
  saveSkillBtn: document.getElementById("saveSkillBtn"),
  generateBtn: document.getElementById("generateBtn"),
  copyReportBtn: document.getElementById("copyReportBtn"),
  saveReportBtn: document.getElementById("saveReportBtn"),
  reportOutput: document.getElementById("reportOutput"),
  requestDebugOutput: document.getElementById("requestDebugOutput"),
  statusBar: document.getElementById("statusBar"),
};

function setStatus(text) {
  el.statusBar.textContent = text;
}

async function pickSkillSaveHandle() {
  if (!window.showSaveFilePicker) {
    setStatus("Browser does not support direct local file sync for skill.md.");
    return null;
  }
  const handle = await window.showSaveFilePicker({
    suggestedName: "eval_skill.md",
    types: [
      {
        description: "Markdown",
        accept: {
          "text/markdown": [".md"],
          "text/plain": [".md"],
        },
      },
    ],
  });
  state.skillFileHandle = handle;
  await writeSkillToBoundFile();
  return handle;
}

async function writeSkillToBoundFile() {
  if (!state.skillFileHandle) {
    return false;
  }
  const writable = await state.skillFileHandle.createWritable();
  await writable.write(el.skillEditor.value);
  await writable.close();
  return true;
}

async function syncSkillFileBeforeRun() {
  try {
    if (state.skillFileHandle) {
      await writeSkillToBoundFile();
      return;
    }
    if (window.showSaveFilePicker) {
      setStatus("Select eval_skill.md once so future runs can sync automatically.");
      await pickSkillSaveHandle();
      return;
    }
    setStatus("Auto-sync unavailable in this browser. Skill still uses latest editor content.");
  } catch (error) {
    if (error && error.name === "AbortError") {
      setStatus("Skill file sync skipped. Current run still uses latest editor content.");
      return;
    }
    throw error;
  }
}

function sanitizeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeRelativePath(rawPath) {
  if (typeof rawPath !== "string") {
    return "";
  }
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

async function initializeEmbeddedDemo() {
  cleanupObjectUrls();
  state.packages = new Map();
  state.packageOrder = [];
  state.globalSkillText = state.globalSkillText || DEFAULT_GLOBAL_SKILL;

  const packageName = "sample06_demo";
  const outputJson = JSON.stringify([EMBEDDED_SAMPLE06_STEP2], null, 2);
  const fileMap = new Map([
    ["input.txt", EMBEDDED_SAMPLE06_INPUT],
    ["output.json", outputJson],
    ["sample06_2_evaluation_report.md", EMBEDDED_SAMPLE06_REPORT],
    [
      "item_2_main_app_thumb_prompt.png",
      "./demo_packages/sample06/item_2_main_app_thumb_prompt.png",
    ],
    [
      "item_2_main_app_detail_prompt.png",
      "./demo_packages/sample06/item_2_main_app_detail_prompt.png",
    ],
    [
      "item_2_sub_app_thumb_prompt.png",
      "./demo_packages/sample06/item_2_sub_app_thumb_prompt.png",
    ],
    [
      "item_2_sub_app_detail_prompt.png",
      "./demo_packages/sample06/item_2_sub_app_detail_prompt.png",
    ],
  ]);

  const manifest = {
    package_name: packageName,
    display_name_zh: "Sample06 Step2 Demo",
    description_zh: "Preloaded demo point with four images and a saved evaluation report.",
    story_id: "sample06",
    difficulty: "demo",
    files: Array.from(fileMap.keys()).sort(),
    steps: [{ step_id: EMBEDDED_SAMPLE06_STEP2.step_id, title_zh: "预加载 Demo Step" }],
    default_step_id: EMBEDDED_SAMPLE06_STEP2.step_id,
  };

  const pkg = {
    packageName,
    fileMap,
    fileEntries: manifest.files,
    manifest,
    dataSpec: [EMBEDDED_SAMPLE06_STEP2],
    kind: "embedded-demo",
  };

  state.packages.set(packageName, pkg);
  state.packageOrder.push(packageName);
  await switchPackage(packageName);
  state.selectedFilePath = "sample06_2_evaluation_report.md";
  renderFileList();
  await renderFilePreview(state.selectedFilePath);
  el.reportOutput.value = EMBEDDED_SAMPLE06_REPORT;
  setStatus("Loaded prebuilt demo: sample06 step2.");
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

function buildSystemPrompt() {
  return el.systemIntroEditor.value.trim() || DEFAULT_SYSTEM_INTRO;
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

function buildUserPrompt(step, skillText) {
  const contextBlock =
    el.contextScopeSelect.value === "all_steps" && state.currentPackage
      ? [
          "Story Context:",
          ...state.currentPackage.dataSpec.map((item) => `${item.step_id}: ${item.context_injection || ""}`),
        ].join("\n")
      : ["Current Step Context:", `${step.step_id}: ${step.context_injection || ""}`].join("\n");

  const missingImages = [
    ["main_card_thumb_url", step.main_card_thumb_url],
    ["main_card_detail_url", step.main_card_detail_url],
    ["sub_card_thumb_url", step.sub_card_thumb_url],
    ["sub_card_detail_url", step.sub_card_detail_url],
  ]
    .filter(([, value]) => !value || !state.currentPackage.fileMap.has(normalizeRelativePath(value)))
    .map(([key]) => key);

  const targetStepLines = [
    `- step_id: ${step.step_id}`,
    `- context_injection: ${step.context_injection || ""}`,
    step.user_goal_zh ? `- user_goal: ${step.user_goal_zh}` : null,
    step.task_prompt?.zh ? `- task_prompt: ${step.task_prompt.zh}` : null,
  ].filter(Boolean);

  return [
    "Please evaluate the current step and output a Markdown report.",
    "",
    contextBlock,
    "",
    "Current target step:",
    ...targetStepLines,
    "",
    "Image inputs:",
    "- main thumb image",
    "- main detail image",
    "- sub thumb image",
    "- sub detail image",
    "",
    "Important constraints:",
    "- Treat Card A as the primary task card and Card B as the supporting linked card.",
    "- Use only the chosen step context scope and the four images.",
    "- Do not rely on app name fields, relevance labels, or prompt-generation metadata.",
    "- Do not infer from hidden file names, placeholder field names, or package-level summaries.",
    "- Keep the report concise but decision-oriented.",
    missingImages.length ? `- Missing image fields: ${missingImages.join(", ")}` : "- All four image fields are available.",
    el.includeSkillSelect.value === "yes" ? ["", "Skill rubric:", skillText].join("\n") : null,
  ]
    .filter((item) => item !== null)
    .join("\n");
}

function buildDebugRequestBody(requestBody) {
  return {
    ...requestBody,
    messages: requestBody.messages.map((message) => {
      if (!Array.isArray(message.content)) {
        return message;
      }
      let imageIndex = 0;
      return {
        ...message,
        content: message.content.map((item) => {
          if (item.type !== "image_url") {
            return item;
          }
          imageIndex += 1;
          return {
            type: "image_url",
            image_url: {
              url: `[redacted_data_url_image_${imageIndex}]`,
            },
          };
        }),
      };
    }),
  };
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

  let temperature = Number.parseFloat(el.temperatureInput?.value ?? "0.1");
  if (!Number.isFinite(temperature)) {
    temperature = 0.1;
  }
  temperature = Math.max(0, Math.min(2, temperature));

  try {
    await syncSkillFileBeforeRun();
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

    const requestBody = {
      model: el.modelInput.value.trim() || "gpt-5.4",
      temperature,
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(),
        },
        {
          role: "user",
          content: [
            { type: "text", text: buildUserPrompt(step, el.skillEditor.value) },
            ...imageContent,
          ],
        },
      ],
    };

    el.requestDebugOutput.value = JSON.stringify(buildDebugRequestBody(requestBody), null, 2);

    const response = await fetch(`${baseUrlRaw.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
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
el.saveSkillBtn.addEventListener("click", async () => {
  try {
    if (!state.skillFileHandle) {
      await pickSkillSaveHandle();
    } else {
      await writeSkillToBoundFile();
    }
    setStatus("Skill saved to local eval_skill.md.");
  } catch (error) {
    if (error && error.name === "AbortError") {
      setStatus("Save skill cancelled.");
      return;
    }
    console.error(error);
    setStatus(`Save skill failed: ${error.message}`);
  }
});
el.loadSkillInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    el.skillEditor.value = text;
    state.globalSkillText = text;
    updateSystemPromptPreview();
    setStatus(`Loaded skill from ${file.name}.`);
  } catch (error) {
    console.error(error);
    setStatus(`Load skill failed: ${error.message}`);
  }
});
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

state.globalSkillText = DEFAULT_GLOBAL_SKILL;
state.systemIntroText = DEFAULT_SYSTEM_INTRO;
el.systemIntroEditor.value = DEFAULT_SYSTEM_INTRO;
el.skillEditor.value = DEFAULT_GLOBAL_SKILL;
updateSystemPromptPreview();
el.reportOutput.value = EMBEDDED_SAMPLE06_REPORT;
el.requestDebugOutput.value = "# Yunwu request body debug output";
initializeEmbeddedDemo().catch((error) => {
  console.error(error);
  setStatus(`Preload demo failed: ${error.message}`);
});
