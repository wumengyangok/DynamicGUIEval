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
  packageDirectoryHandle: null,
  packageDirectoryPackageName: null,
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

- 对四张图一起评测：主卡缩略图、主卡详情图、副卡缩略图、副卡详情图。
- 将 A 卡视为主任务卡，B 卡视为联动辅助卡。
- 判断 B 卡是否是在当前上下文下由 A 卡自然引出的依赖或辅助动作。
- 判断当前时间点是否适合这组卡片出现。
- 先提取城市、车站、影院、晚餐、时间窗口等关键实体，再给出结论。
- 输出简洁的 Markdown 报告，包含前面的推理分析和json格式的最终判断。

## Output Template / 输出模板

\`\`\`md
# Evaluation Report / 评估报告
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

## Final Results

{
\t'relevance_level': 主App与用户上下文的相关性（分为：1. 非常相关；2. 中等相关；3. 仅有某些信息相关；4. 完全不相关）。
\t'relevance_level_between_card': 主/副App相关性（分为：1. 非常相关；2. 中等相关；3. 仅有某些信息相关；4. 完全不相关）。
\t'accuracy_of_main_card_content': 生成的主App的缩略图是否正确且符合逻辑地提取了主App详情图中的信息（分为：0. 错误；1. 正确））。
\t'accuracy_of_sub_card_content': 生成的副App的缩略图是否正确且符合逻辑地提取了副App详情图中的信息（分为：0. 错误；1. 正确））。
}
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
  temperatureInput: document.getElementById("temperatureInput"),
  apiKeyInput: document.getElementById("apiKeyInput"),
  systemIntroEditor: document.getElementById("systemIntroEditor"),
  contextScopeSelect: document.getElementById("contextScopeSelect"),
  includeSkillSelect: document.getElementById("includeSkillSelect"),
  skillEditor: document.getElementById("skillEditor"),
  loadSkillInput: document.getElementById("loadSkillInput"),
  saveSkillBtn: document.getElementById("saveSkillBtn"),
  generateBtn: document.getElementById("generateBtn"),
  generateAllBtn: document.getElementById("generateAllBtn"),
  copyReportBtn: document.getElementById("copyReportBtn"),
  saveReportBtn: document.getElementById("saveReportBtn"),
  batchProgressBar: document.getElementById("batchProgressBar"),
  batchProgressText: document.getElementById("batchProgressText"),
  storySummary: document.getElementById("storySummary"),
  reportOutput: document.getElementById("reportOutput"),
  judgmentAccuracy: document.getElementById("judgmentAccuracy"),
  requestDebugOutput: document.getElementById("requestDebugOutput"),
  statusBar: document.getElementById("statusBar"),
};

function setStatus(text) {
  el.statusBar.textContent = text;
}

function getReportFilename(stepId, packageName = state.packageName || "package") {
  return `${packageName}_${stepId}_evaluation_report.md`;
}

function updateBatchProgress(current, total, label = "") {
  const safeTotal = Math.max(total, 1);
  el.batchProgressBar.max = safeTotal;
  el.batchProgressBar.value = Math.min(current, safeTotal);
  el.batchProgressText.textContent = label || `${current}/${safeTotal}`;
}

function refreshCurrentPackageFileEntries() {
  if (!state.currentPackage) {
    return;
  }
  state.currentPackage.fileEntries = Array.from(state.currentPackage.fileMap.keys()).sort();
  if (state.currentPackage.manifest) {
    state.currentPackage.manifest.files = state.currentPackage.fileEntries;
  }
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

async function loadSkillFromHandle(fileHandle) {
  const file = await fileHandle.getFile();
  const text = await file.text();
  state.skillFileHandle = fileHandle;
  state.globalSkillText = text;
  el.skillEditor.value = text;
  return text;
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
  state.packageDirectoryHandle = null;
  state.packageDirectoryPackageName = null;

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

const PRELOADED_SAMPLE06_INPUT = `Role: 你是一位资深的手机产品经理和用户体验（UX）专家，擅长设计基于情境感知的智能推荐系统。

Task: 请根据我提供的“场景模版”和“目标场景”，生成一套完整的用户行为路径数据。你需要模拟用户在特定场景下，手机系统如何根据时间、环境和用户习惯动态推送App卡片。

Input Modules:
Module 1: 场景模版（参考用）
场景：从上海到北京听演唱会。
流程：Step1(用户画像) -> Step2(起飞前一天) -> Step3(航班信息注入) -> Step4(起飞前2.5h) -> Step5(到达北京) -> Step6(演唱会结束)。
Module 2: 目标场景（需执行）
场景：用户正在休假，需要去买菜并自己做饭。
流程：请你根据这一核心意图，合理拆解出2-8个关键时间节点（Step）。其中，Step1放用户画像信息，即用户平时的习惯。

Requirements:
数据结构: 输出必须严格为 .json 格式（数组形式 [{{step1}, {step2}, ...}]）。
字段定义: 每个Step包含以下键值（Step1只需要有step_id和context_injection的内容，其他都设置为null）： 
step_id: 步骤编号。
context_injection: 注入的环境信息（此类环境信息要求能够从手机的各项应用中收集，例如时间、手机定位、用户使用日常App的各项操作等）。
main_app: 推送的主App名称。
sub_app: 推送的副App名称。
relevance_level: 主App与用户上下文的相关性（分为：1. 非常相关；2. 中等相关；3. 仅有某些信息相关；4. 完全不相关），并简述理由。
relevance_level_between_card: 主/副App相关性（分为：1. 非常相关；2. 中等相关；3. 仅有某些信息相关；4. 完全不相关），并简述理由。
accuracy_of_main_card_content: 生成的主App的缩略图是否正确且符合逻辑地提取了主App详情图中的信息（分为：0. 错误；1. 正确），并简述理由（输出格式例如：“0. 错误。理由：xxx”）。
accuracy_of_sub_card_content: 生成的副App的缩略图是否正确且符合逻辑地提取了副App详情图中的信息（分为：0. 错误；1. 正确），并简述理由（输出格式例如：“0. 错误。理由：xxx”）。
main_card_thumb_url: "item_<step_num>_main_app_thumb_prompt.png" (<step_num>为该步骤编号，例如：1、2、3...)
main_card_detail_url: "item_<step_num>_main_app_detail_prompt.png" (<step_num>为该步骤编号，例如：1、2、3...)
sub_card_thumb_url: "item_<step_num>_sub_app_thumb_prompt.png" (<step_num>为该步骤编号，例如：1、2、3...)
sub_card_detail_url: "item_<step_num>_sub_app_detail_prompt.png" (<step_num>为该步骤编号，例如：1、2、3...)
main_app_detail_prompt: 用于文生图模型生成主App详情图的中文提示词 。
sub_app_detail_prompt: 用于文生图模型生成副App详情图的中文提示词。
main_app_thumb_prompt:用于文生图模型生成主App缩略图的中文提示词 。
sub_app_thumb_prompt:用于文生图模型生成副App缩略图的中文提示词。

生成逻辑: 
1) 动态推送: 随着Step推进，主/副App应根据用户意图动态调整，主/副App应用不包括微信、QQ等高频使用的聊天社交软件。
2) 随机推送App以生成正负样本: 生成主App时，根据其与用户上下文的相关性以非常相关：中等相关：仅某些信息相关：完全不相关 = 2:2:1:5的比例随机生成。生成副App时，根据其与主App的相关性以同样的比例随机生成，从而产生正负样本。
3) 随机生成主/副App缩略图以生成正负样本: 生成主/副App缩略图时，以30%的概率随机生成与对应的详情图里的信息相悖的内容，例如内容、数据逻辑等与详情图不一致。在构建错误的缩略图时，要求错误的信息不过于明显，例如只有某个数值不一致，最好能以假乱真。
4) Prompt设计: 提示词需包含“手机App UI设计风格”、“详情图/缩略图以外的区域以白底作为背景”、“高清晰度文本”等描述，并要求图片生成模型生成四张图，即相关的主/副app详情图 （**实际手机app GUI截图, 内容较为详细**） 和主/副app缩略图 （一个正方形/长宽相等的无规则手机app简约风格的卡片，该卡片内浓缩了详情图中需要展示的重要信息和相关控件，要求每个缩略图包含至少5个以上的重要控件/信息且各信息排版美观，并且生成该prompt时，以30%左右的比例要求其缩略图中不包含文字，仅用简约的图案表示信息），且要求**详情图和缩略图里面的文本为中文，文本高度清晰，逻辑正确且可读**。同时，确保每个step中main_app_detail_prompt、 sub_app_detail_prompt、 main_app_thumb_prompt和sub_app_thumb_prompt生成逻辑符合多轮对话逻辑，以main_app_detail_prompt作为第一轮，并确保后续图片在UI风格上具有连贯性，每个prompt要求里面体现精确的数字、地点等内容，从而精确控制缩略图与详情图的一致性。`;

const PRELOADED_SAMPLE06_DATA = [
  {
    step_id: 1,
    context_injection:
      "用户画像：30岁白领，平时工作繁忙重度依赖外卖。当前状态为年假第一天，心情放松。具有烹饪兴趣爱好，偶尔闲暇时喜欢自己做饭，手机内安装有下厨房等菜谱App。平时出门习惯自驾。由于近期劳累缺觉，今天早上睡到自然醒。核心意图：今天有充足的时间，需要去附近的实体商超买新鲜食材，并回家亲自做一顿丰盛的午餐来犒劳自己。",
    main_app: null,
    sub_app: null,
    relevance_level: null,
    relevance_level_between_card: null,
    accuracy_of_main_card_content: null,
    accuracy_of_sub_card_content: null,
    main_card_thumb_url: null,
    main_card_detail_url: null,
    sub_card_thumb_url: null,
    sub_card_detail_url: null,
    main_app_detail_prompt: null,
    sub_app_detail_prompt: null,
    main_app_thumb_prompt: null,
    sub_app_thumb_prompt: null,
  },
  {
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
  },
  {
    step_id: 3,
    context_injection:
      "环境信息：当前时间10:30，定位跨出小区电子围栏，正前往2公里外的综合大卖场；传感器数据：GPS显示移动速度15km/h左右，手机与用户的TWS蓝牙耳机已建立连接，处于通勤出行状态。",
    main_app: "网易云音乐",
    sub_app: "小宇宙",
    relevance_level:
      "2. 中等相关。理由：前往大卖场的通勤路上，连接耳机后大概率涉及音频娱乐以打发路上无聊时间，但其与购买食材、做饭的最终目的只有间接上下文衍生关系，并非直接驱动核意图的应用。",
    relevance_level_between_card:
      "2. 中等相关。理由：音乐类与播客类同属音频娱乐消费品，它们面向同一个通勤听觉场景并且在此情境中互为替代或可切换选项，它们相关度处于中等且竞争的段位。",
    accuracy_of_main_card_content:
      "1. 正确。理由：主App缩略图采用了无文字设计，仅凭抽象黑胶唱片Icon和播放器控制按键等视觉图案准确还原了详情图中的放歌状态，信息连贯一致。",
    accuracy_of_sub_card_content:
      "0. 错误。理由：详情图里展示播客目前的播放时间轴为15分20秒（15:20），但生成的缩略图里在进度UI文字上却错误提取为“03:00（3分钟）”，构成数据逻辑冲突的负样本。",
    main_card_thumb_url: "item_3_main_app_thumb_prompt.png",
    main_card_detail_url: "item_3_main_app_detail_prompt.png",
    sub_card_thumb_url: "item_3_sub_app_thumb_prompt.png",
    sub_card_detail_url: "item_3_sub_app_detail_prompt.png",
    main_app_detail_prompt:
      "继承第一轮中手机App UI设计风格的设定，周边白底背景。展示“网易云音乐”的播放详情图。屏幕中央是一个醒目的黑色黑胶唱片UI加上一张蓝色系专辑封面实拍缩略图。下方有高清晰度中文文本歌曲名“悠闲假日”和歌手名。底部界面呈现歌曲播放进度条，显示当前进度为“01:45 / 04:30”，以及播放、暂停、上一首、下一首等常用控制UI按钮。",
    sub_app_detail_prompt:
      "继承第一轮极简UI风格，周边白底背景。展示“小宇宙”播客App的单集播放界面详情图。顶部有一张橙色风格的播客节目播客封面。下方有粗体高清晰中文标题“EP.24 菜市场的人间烟火”。界面核心部位放置一个醒目的时间进度条，其上方清晰显示目前的播放时间节点为中文和数字组合“15:20”，右侧总时长为“45:00”，并配有快进15秒、倍速播放等功能Icon。",
    main_app_thumb_prompt:
      "继承第一轮风格，生成网易云音乐应用的正方形（长宽相等）极简缩略卡片，白底背景。请注意：在生成此缩略图中，不需要包含任何文本，仅用简约的图案和Icon表示各项信息。必须含有至少5个控件：中央是一个带有蓝色专辑图像的微缩黑胶唱片图形，下方依次均匀排开四个极简图形化按钮（播放键、上一首、下一首图标，以及一个心形的收藏Icon）。构图需充满设计美感并且无任何文字出现。",
    sub_app_thumb_prompt:
      "继承第一轮风格，生成“小宇宙”的正方形（长宽相等）卡片缩略图，白底背景。需包含至少5个控件：橙色播客封面微缩图，高清晰中文文本标题“对应EP.24播客”。注意：必须生成一个以假乱真的逻辑错误，在底部的播放进度微缩条和伴随的高清时间文本标注上，将其写为带有明显差异的“进度 03:00”（而不要用15:20），此错误要符合一般UI组件排版习惯。并配上两个功能小图标（播放/暂停及快进）。",
  },
  {
    step_id: 4,
    context_injection:
      "环境信息：当前时间11:00，定位信息显示已到达大润发生鲜超市内部并连入公共Wi-Fi；行为记录：用户步行步频极慢，频繁锁屏/亮屏，目前正在水产区和蔬菜区反复游走挑选。",
    main_app: "同花顺",
    sub_app: "王者荣耀",
    relevance_level:
      "4. 完全不相关。理由：处于超市线下密集采购生鲜的流程中，随时需要查看购物清单及移动支付，此时推送重度财经股票类软件与当前买菜的情景和意图南辕北辙。",
    relevance_level_between_card:
      "4. 完全不相关。理由：同花顺是强目的性的股市理财行情看盘工具，王者荣耀是重度MOBA竞技游戏，二者的应用属性、应用场景以及用户交互模式无论在哪个维度都完全割裂，没有任何重合关系。",
    accuracy_of_main_card_content:
      "0. 错误。理由：主App详情图里清晰显示上证指数今日处于上涨状态（+1.20%），然而在对应的缩略图中这部分数据错误提取，显示为下跌的（-0.50%），形成了明显的不一致。",
    accuracy_of_sub_card_content:
      "1. 正确。理由：副App缩略图精准复现了详情图中关于当前游戏段位（钻石）以及近期胜率（65%）的信息，即便是纯图且无文字的展现形式亦没有任何违背现实。",
    main_card_thumb_url: "item_4_main_app_thumb_prompt.png",
    main_card_detail_url: "item_4_main_app_detail_prompt.png",
    sub_card_thumb_url: "item_4_sub_app_thumb_prompt.png",
    sub_card_detail_url: "item_4_sub_app_detail_prompt.png",
    main_app_detail_prompt:
      "继承之前手机App极简UI设计风格的设定，周边区域为白底背景。展示“同花顺”股票软件的大盘行情详情图界面。屏幕顶部通过高清晰中文字体醒目标注“上证指数”。下方跟随着红色的数字高清晰文本“3050.23”以及处于上涨状态的红色文本“+1.20%”。中间占据主体的是一个红色为主的K线图和分时走势图。底部导航栏有“首页”、“行情”、“资讯”、“交易”等常用模块Icon组件。",
    sub_app_detail_prompt:
      "继承之前手机App设计风格，周边区域为白底背景。展示“王者荣耀”助手类的游戏战绩详情图。背景是深色系电竞风。页面高清晰中文字体显示玩家昵称“峡谷厨神”，在其下方有一颗显眼的“璀璨钻石”图标及带有高清晰中文字体的中文描述段位“钻石 II”。界面的中间有一个环形图表，上方叠加红色的高清晰度中文“胜率 65%”。下方列出三位主力英雄（如亚瑟、后羿）的精美小头像皮肤战绩。",
    main_app_thumb_prompt:
      "继承UI连贯风格，生成同花顺的正方形（长宽均等）桌面微应用卡片缩略图，白底背景。卡片要求至少5个控件：高清晰的中文字体“上证大盘”，微型折线走势图，刷新Icon，加上指数点位文本“3050.23”。注意：必须生成一个内容逻辑错误！将涨幅数据错误地标为绿色的高清晰中文字体“-0.50%”（这与详情页的+1.20%产生矛盾），同时还需配有一个与下跌有关的下箭头Icon，要求整体排版严丝合缝可以真实到以假乱真。",
    sub_app_thumb_prompt:
      "继承前轮UI画风，生成王者荣耀助手的正方形卡片缩略图。白底背景。请注意：在此缩略图中，不需要包含任何文本（0文字内容），仅用简约图形和极简视觉符号来表示。包含至少5个关键控件：卡片中央醒目摆放那颗详情图中出现过的“璀璨钻石”徽章Icon（保持细节一致），环绕该徽章绘制一个进度到达65%的图形化圆形胜率进度条，底部均匀排布三个极小但清晰的英雄头像方块图标。没有任何汉字及数字拼写。",
  },
  {
    step_id: 5,
    context_injection:
      "环境信息：当前时间11:45；地点追踪：正离开超市地下停车场，朝着回家的路径行驶；环境感应：系统读取到了后备箱的开启及关闭记录，NFC模块刚刚发生过大额结算记录，设备当前已蓝牙静默接入车载媒体。",
    main_app: "Keep",
    sub_app: "爱奇艺",
    relevance_level:
      "4. 完全不相关。理由：用户此刻任务是驱车将新鲜采购的生鲜立刻运回家放入冰箱，完全没有在此时间节点展开燃烧卡路里的运动或健身活动的背景诉求，此系统推送有违常识。",
    relevance_level_between_card:
      "4. 完全不相关。理由：Keep承载着用户高专注度的身体锻炼与运动健康职能，而爱奇艺承载着长时间久坐不动进行沉浸式长篇影视观看职能，两者无论是用户物理状态还是心智场景均无信息交集，极其割裂。",
    accuracy_of_main_card_content:
      "1. 正确。理由：主App卡片上的卡路里消耗数字完美切合详情图内提供的数据（250千卡），且步行步数环的比例逻辑完全一致无偏差。",
    accuracy_of_sub_card_content:
      "1. 正确。理由：副App卡片准确描绘了详情页内最新一期影视播放源的封面和相匹配的剧情集数，内容传递极度严谨。",
    main_card_thumb_url: "item_5_main_app_thumb_prompt.png",
    main_card_detail_url: "item_5_main_app_detail_prompt.png",
    sub_card_thumb_url: "item_5_sub_app_thumb_prompt.png",
    sub_card_detail_url: "item_5_sub_app_detail_prompt.png",
    main_app_detail_prompt:
      "继承第一轮中手机App极简UI设计风格，周边区域以白底为背景。生成“Keep”运动App的数据记录详情页截图。页面主视觉为一个动感强烈的运动数据仪表盘，高频且高清晰的中文文本：“今日消耗”、“250千卡”。图表下方是圆环状的今日步数统计模块，清晰标有中文文本“步数达成率：60%”。底部包含几个卡片如“饮食记录”、“体重趋势”，并包含对应的UI微缩图表组件。",
    sub_app_detail_prompt:
      "继承第一轮中手机App的极简UI设计风格，图片外部区域为白底背景。展示“爱奇艺”App正在横屏或者半屏状态播放长剧集过程中的UI详情界面图。屏幕上半区是高清的影视剧截图画面（一部古装剧的剧照）。下方区域包含高清晰度的中文字体标题：“庆余年 第二季”。主标题之下附带一排集数选择卡片列表，其中高亮选中的卡片包含高清晰中文字体“第12集”。带有缓存、分享、赞等基础播放层Icon。",
    main_app_thumb_prompt:
      "继承设计规则，生成Keep应用的等宽等高正方形微缩App卡片。除了卡片自身外周边区域填补为纯白。这个部件浓缩当日运动精髓。要求至少涵盖5个独立控件元素：左上角是奔跑小人的Icon，右侧提供高清晰中文短语“消耗完成”；核心位置放置粗体高辨识度的中文文本“250千卡”字样作为数字卡片；卡片下方放置一个对应进度约为60%的线装弧形进度进度圈，右下角带有打卡完成的小勋章Icon。排版极度美观舒适。",
    sub_app_thumb_prompt:
      "继承此前UI美学指导，刻画正方形“爱奇艺”长宽相等App桌面缩略卡片，边缘外留白底色。提炼上次观影信息点。必须要有超过5个独立的细节控件相互协同排布：占据上半部分的“庆余年”古装人物海报微缩缩略图；在海报内部右下角悬浮播放按键Icon。下半部分要求保留高清晰中文文本主标题区“庆余年 第二季”。并提供一行小而精细的高清中文文本“继续播放：第12集”，左边辅以一个小小的时钟回忆控件符号。",
  },
  {
    step_id: 6,
    context_injection:
      "环境信息：当前时间12:15；地点验证：定位点长时间固定在家中并且已连接Home-WiFi；声学环境感测：智能手机平放于厨房工作台上，系统麦克风拾音识别到高频连贯的流水冲洗声以及剁剥切菜特有的声学频率特征。",
    main_app: "时钟",
    sub_app: "米家",
    relevance_level:
      "3. 仅有某些信息相关。理由：时钟的计时功能在炖煮菜肴（比如菜谱中的炖红烧肉需要45分钟）可以发挥辅助作用，虽然相关信息可以串联，但这只是手机中非常泛用的通用内置工具，并不是完全专精下厨场景的应用。",
    relevance_level_between_card:
      "3. 仅有某些信息相关。理由：时钟提供基于烹饪时长的倒数辅助，而米家应用用于连接包括厨房抽油烟机在内的环境小家电。它们虽然共享极少的下厨房物理硬件场景关联线索，但作为不同的独立应用形态并无数据深度耦合。",
    accuracy_of_main_card_content:
      "1. 正确。理由：虽然不包含语言文字，仅凭视觉控件与表盘走势，主App缩略图完美忠实地复刻了前沿详情页内设定的定格时间位置。",
    accuracy_of_sub_card_content:
      "0. 错误。理由：设备详情页里的抽油烟机风力档位明确记载为“强力模式”，而生成的智慧辅助卡片中相应的状态指示器却离谱地停留在“已关机（Off）”的状态中，属于逻辑矛盾型负样本提取现象。",
    main_card_thumb_url: "item_6_main_app_thumb_prompt.png",
    main_card_detail_url: "item_6_main_app_detail_prompt.png",
    sub_card_thumb_url: "item_6_sub_app_thumb_prompt.png",
    sub_card_detail_url: "item_6_sub_app_detail_prompt.png",
    main_app_detail_prompt:
      "继承手机App极简UI设计基本风格，底限使用纯白色。表现原生“时钟/倒计时”详情界面的全屏美感。中心绘制一个极为夸张和显著的环形高精度计时表盘图样，其高清晰度中文主导文本位于中心：“45:00”，该文字下方有细小的高清晰中文字体提示：“剩余时间”。在最下端的控制区放置两个显眼的大圆形按钮阵列：左边是灰度填充的“取消”，右边高亮的橙色中文按键标明“暂停”或“开始”。风格充满原生感和简约美学。",
    sub_app_detail_prompt:
      "继承一致性的简约现代App设计调性，画布边缘空余保留白底。展示“米家”智能家居详情页内厨房“智能抽油烟机”的详细操作管理面板。页面上方有着设备实体的白色家电侧视图，带有高清晰的中文标题“米家智能油烟机”。正下方中央显眼区域展现其当前运转参数，一个高亮的高清中文文本气泡：“当前环境：强力模式”。页面最底部配备滑动光标控件（可滑动调节风量），并布置“关机”、“静音”、“爆炒”四组辅助模式Icon。",
    main_app_thumb_prompt:
      "应用这套极简化手机UI范式风格，呈现“时钟”应用的等边距正方桌面的缩略图卡点插件。只在正方形内作画，画面之外全设为白底。注意：在此缩略图中，绝对不要掺杂任何字体以及文本数字（不含任何文本）。你需要至少生成5个组件构成极简图像表达：最外围是一个有着刻度的微缩粗边框圆盘，圆盘内部的高亮涂彩进度停留在家度角展示出类似45分钟占比大图饼状态的色块进度，内圈有沙漏Icon，底座悬停两个起停控制的圆形小盲按键图形。",
    sub_app_thumb_prompt:
      "应用同套极简化规范进行生成米家的正方桌面等比小卡片微件，除元件范围外皆填充真白背景色调处理。展示智能油烟机联动快控台。需涵盖>5个信息控件单元：角落设有微小的油烟机家电Icon图形；旁边带有极高质量清晰度中文行文本“米家智能油烟机”；另配有照明小灯Logo。注意：故意植入一处卡片映射致命错误：要求用一个巨大的灰色电源休眠Icon覆盖版面核心，并且匹配一条极度清晰的中文说明“状态：已关机”，以此完全且严重违背详情界面的运行模式描述。",
  },
];

const PRELOADED_SAMPLE06_REPORTS = {
  "sample06_2_evaluation_report.md": `# Evaluation Report / 评估报告
# Evaluation Report

## Step Summary
- step_id: 2
- user_goal: 在家中查看家常菜做法，可能准备做饭，并顺带整理所需食材采购清单。

## 1. Main-Sub Card Causal Relevance
- verdict: 中等相关
- evidence:
  - 主卡 A 明确是“秘制红烧肉”菜谱，和用户刚搜索“红烧肉的正宗做法”高度吻合。
  - 副卡 B 是“采购单”，其内容包含五花肉、冰糖、葱姜蒜，能作为做菜前的辅助动作，逻辑上可由菜谱自然引出。
  - 但副卡额外加入“鲈鱼/新鲜鲈鱼1条”，混入另一道菜“清蒸鲈鱼”的食材，导致其并非对主卡 A 的纯粹依赖，更多像把两次搜索混合进一个采购单。

## 2. Thumbnail-Detail Relevance
- verdict: 主卡正确，副卡基本正确但有混杂
- evidence:
  - 主卡缩略图与详情图一致：菜名、评分、时长、食材（五花肉500g、冰糖20g、葱姜蒜若干）均能对应。
  - 副卡缩略图与详情图一致：均为采购单/今日采购单，条目包括五花肉、冰糖、葱姜蒜、鲈鱼。
  - 但副卡内容相对主卡存在跨菜品混合，不影响“缩略-详情一致性”，但影响联动纯度。

## 3. Timing Correctness
- verdict: 正确
- evidence:
  - 当前时间 10:00、地点在家、刚解锁屏幕，且近十分钟搜索了具体菜谱关键词，此时推荐菜谱非常合适。
  - 采购单作为下一步辅助动作也合理，尤其适用于临近午餐准备食材的场景。
  - 若系统意图支持“做饭前准备”，此时出现时机自然。

## 4. Content Correctness And Completeness
- verdict: 部分正确，完整性一般
- evidence:
  - 主卡内容完整度较好：有成品图、评分、烹饪时长、食材清单、制作步骤及开始按钮。
  - 副卡形式完整，能支持勾选采购。
  - 但副卡把红烧肉和清蒸鲈鱼的食材合并展示，缺少分菜品归属说明，容易造成理解偏差。
  - 若副卡是主卡 A 的联动辅助卡，则“鲈鱼”不应直接混入；若是基于整体搜索历史生成，则应明确是“今日菜单采购单”而非仅服务主卡。

## Risks
- 将两道菜的食材合并到一个副卡，可能削弱主副卡因果链条。
- 用户可能误以为“鲈鱼”是红烧肉所需食材，产生理解错误。
- 副卡标题较泛，未说明是单菜谱采购还是多菜品合并采购。

## Final Results

\`\`\`json
{
  "relevance_level": "1. 非常相关",
  "relevance_level_between_card": "2. 中等相关",
  "accuracy_of_main_card_content": 1,
  "accuracy_of_sub_card_content": 1
}
\`\`\``,
  "sample06_3_evaluation_report.md": `# Evaluation Report / 评估报告
# Evaluation Report

## Step Summary
- step_id: 3
- user_goal: 通勤前往2公里外综合大卖场途中，已连接TWS耳机，适合收听音频内容以陪伴出行。

## 1. Main-Sub Card Causal Relevance
- verdict: 中等相关
- evidence: A卡为音乐播放卡，B卡为播客播放卡，二者同属“音频收听”场景，和耳机连接、通勤移动状态匹配。但B卡并不是由A卡自然引出的明显辅助动作，更像同类替代内容，而非主从依赖关系。

## 2. Thumbnail-Detail Relevance
- verdict: 基本正确
- evidence:  
  - A卡缩略图与详情图都围绕“音乐播放”主题，提取方向正确。  
  - B卡缩略图与详情图同属播客播放卡，但标题提炼不够准确，存在轻微信息失真。

## 3. Timing Correctness
- verdict: 正确
- evidence: 当前10:30、用户正在移动且佩戴TWS耳机，音频类卡片在此时出现合理；相较需要视觉停留的内容，音乐/播客更符合通勤中低干扰使用需求。

## 4. Content Correctness And Completeness
- verdict: 较完整，但双卡策略一般
- evidence:  
  - A卡内容完整表达了音乐播放状态与基础控制。  
  - B卡内容完整表达了播客收听状态与快进/倍速等相关功能。  
  - 问题在于双卡并列提供两种音频内容，缺少清晰主辅分工。

## Risks
- 主副卡关系偏弱，可能让用户感知为重复推荐而非联动辅助。
- B卡缩略图标题与详情内容不完全一致，影响摘要准确性。
- A、B同时争夺“播放入口”，可能增加决策负担。

## Final Results

\`\`\`json
{
  "relevance_level": 1,
  "relevance_level_between_card": 2,
  "accuracy_of_main_card_content": 1,
  "accuracy_of_sub_card_content": 1
}
\`\`\``,
  "sample06_4_evaluation_report.md": `# Evaluation Report / 评估报告
# Evaluation Report

## Step Summary
- step_id: 4
- user_goal: 在生鲜超市内挑选水产和蔬菜，处于购物决策中

## 1. Main-Sub Card Causal Relevance
- verdict: 不相关
- evidence: 主卡内容是“上证大盘/上证指数”行情，副卡内容是游戏段位/胜率提示。二者之间不存在自然的任务依赖或辅助关系，也都与当前“超市内买菜挑选”的场景无明显因果关联。

## 2. Thumbnail-Detail Relevance
- verdict: 部分一致，但副卡缩略信息抽取不完整
- evidence: 主卡涨跌方向前后不一致；副卡方向基本一致，但未清晰表达核心文字信息。

## 3. Timing Correctness
- verdict: 不合适
- evidence: 当前更适合出现购物辅助、清单、优惠、比价、支付或菜谱类信息。股票行情和游戏战绩提示都会打断当前线下采购流程。

## 4. Content Correctness And Completeness
- verdict: 主卡内容存在错误，副卡内容基本合理但不完整
- evidence:
  - 主卡涨跌幅方向相反，存在明显逻辑冲突。
  - 副卡能反映段位/胜率/英雄元素，但缺少明确文字标签。

## Risks
- 在高专注购物场景推送金融/游戏卡片，干扰用户当前任务。
- 主卡涨跌信息前后矛盾，可能误导用户。
- 主副卡组合缺乏联动逻辑，降低系统可信度。

## Final Results

\`\`\`json
{
  "relevance_level": 4,
  "relevance_level_between_card": 4,
  "accuracy_of_main_card_content": 0,
  "accuracy_of_sub_card_content": 1
}
\`\`\``,
  "sample06_5_evaluation_report.md": `# Evaluation Report / 评估报告
# Evaluation Report

## Step Summary
- step_id: 5
- user_goal: 刚完成超市采购并驾车回家，当前更可能关注购物后状态、行车安全或与本次消费相关的信息，而不是健身复盘或视频续播。

## 1. Main-Sub Card Causal Relevance
- verdict: 弱相关/基本不成立
- evidence:
  - A卡展示“今日运动摘要/消耗250千卡”，B卡展示“剧集继续播放：第12集”。
  - 两者之间缺少自然因果链路；当前上下文更自然的联动应是导航、购物小票/账单、车载音频，而非“运动 + 视频”。

## 2. Thumbnail-Detail Relevance
- verdict: 正确
- evidence:
  - A卡缩略图“消耗完成 250千卡”与详情页“今日消耗250千卡”一致。
  - B卡缩略图“庆余年第二季 继续播放：第12集”与详情页中第12集播放页一致。

## 3. Timing Correctness
- verdict: 不合适
- evidence:
  - 时间为11:45，用户正在驾车回家，且设备已静默接入车载媒体。
  - 车载场景下推送视频继续播放不符合安全与场景习惯。
  - 运动消耗统计在这一刻也不具备明显触发合理性。

## 4. Content Correctness And Completeness
- verdict: 内容本身正确，但对当前情境不完整且不对焦
- evidence:
  - A卡和B卡各自内容完整、可读、缩略与详情一致。
  - 但整组卡片没有覆盖当前最关键实体：超市购物完成、支付结果、驾车回家、车载接入。

## Risks
- 驾车中出现视频续播卡片，存在安全风险。
- 与刚完成购物的真实需求错位，易造成打扰。
- 主副卡组合主题分裂，降低系统可信度。

## Final Results

\`\`\`json
{
  "relevance_level": 4,
  "relevance_level_between_card": 4,
  "accuracy_of_main_card_content": 1,
  "accuracy_of_sub_card_content": 1
}
\`\`\``,
  "sample06_6_evaluation_report.md": `# Evaluation Report / 评估报告
# Evaluation Report

## Step Summary
- step_id: 6
- user_goal: 在家中厨房备菜/做饭，可能需要厨房相关辅助控制或计时

## 1. Main-Sub Card Causal Relevance
- verdict: 相关性较弱
- evidence:
  - A卡主内容是倒计时器，适合烹饪场景中的“定时”需求。
  - B卡是厨房油烟机控制，和“在厨房做饭”上下文高度相关。
  - 但按要求将 A 视为主卡、B 视为辅助卡时，二者更像并列的厨房工具，而非明显主从因果链。

## 2. Thumbnail-Detail Relevance
- verdict: 基本正确
- evidence:
  - A卡缩略图与A详情图语义一致。
  - B卡设备一致，但缩略图显示“已关机”，详情图却显示“强力模式”，存在状态不一致。

## 3. Timing Correctness
- verdict: 部分正确
- evidence:
  - 当前厨房场景明确，油烟机控制卡非常合适。
  - 计时器卡也有一定合理性，但 45 分钟倒计时并未从当前“洗菜切菜”阶段得到强支撑。

## 4. Content Correctness And Completeness
- verdict: 不完全正确
- evidence:
  - B卡内容与厨房上下文高度匹配，功能也完整。
  - 关键问题是 B 缩略图与 B 详情图状态冲突。
  - A详情图顶部系统时间显示 7:11 AM，与上下文 12:15 不一致，削弱时点可信度。

## Risks
- 主副卡角色可能放反：油烟机更像主任务卡，计时器更像辅助卡。
- B卡状态不一致，容易误导用户当前设备实际状态。
- A卡时长与当前备菜阶段可能不匹配，存在“过早弹出”风险。

## Final Results

\`\`\`json
{
  "relevance_level": 2,
  "relevance_level_between_card": 3,
  "accuracy_of_main_card_content": 1,
  "accuracy_of_sub_card_content": 0
}
\`\`\``,
};

async function initializePreloadedSample06() {
  cleanupObjectUrls();
  state.packages = new Map();
  state.packageOrder = [];
  state.globalSkillText = state.globalSkillText || DEFAULT_GLOBAL_SKILL;
  state.packageDirectoryHandle = null;
  state.packageDirectoryPackageName = null;

  const packageName = "sample06";
  const fileMap = new Map([
    ["input.txt", PRELOADED_SAMPLE06_INPUT],
    ["output.json", JSON.stringify(PRELOADED_SAMPLE06_DATA, null, 2)],
    ...Object.entries(PRELOADED_SAMPLE06_REPORTS),
  ]);
  for (const step of PRELOADED_SAMPLE06_DATA) {
    for (const path of [
      step.main_card_thumb_url,
      step.main_card_detail_url,
      step.sub_card_thumb_url,
      step.sub_card_detail_url,
    ]) {
      const key = normalizeRelativePath(path);
      if (key && !fileMap.has(key)) {
        fileMap.set(key, `./demo_packages/sample06/${key}`);
      }
    }
  }

  const manifest = {
    package_name: packageName,
    display_name_zh: "SAMPLE06",
    description_zh: "Preloaded real sample06 package with all local reports.",
    story_id: "sample06",
    difficulty: "sample",
    files: Array.from(fileMap.keys()).sort(),
    steps: PRELOADED_SAMPLE06_DATA.map((step) => ({
      step_id: step.step_id,
      title_zh: step.context_injection || step.step_id,
    })),
    default_step_id: 2,
  };

  const pkg = {
    packageName,
    fileMap,
    fileEntries: manifest.files,
    manifest,
    dataSpec: PRELOADED_SAMPLE06_DATA.map((step, index) => enrichSetStep(step, index + 1, fileMap)),
    kind: "preloaded-sample",
  };

  state.packages.set(packageName, pkg);
  state.packageOrder.push(packageName);
  await switchPackage(packageName);
  state.selectedFilePath = "sample06_2_evaluation_report.md";
  renderFileList();
  await renderFilePreview(state.selectedFilePath);
  el.reportOutput.value = PRELOADED_SAMPLE06_REPORTS["sample06_2_evaluation_report.md"];
  renderJudgmentAccuracy();
  await renderStorySummary();
  setStatus("Loaded prebuilt sample06 package.");
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

async function buildPackageFromDirectoryHandle(directoryHandle) {
  const fileMap = new Map();
  for await (const [name, entry] of directoryHandle.entries()) {
    if (entry.kind !== "file") {
      continue;
    }
    fileMap.set(name, await entry.getFile());
  }

  const packageName = directoryHandle.name || "local_package";
  if (fileMap.has("package_manifest.json")) {
    return buildManifestPackage(packageName, fileMap);
  }
  if (fileMap.has("output.json")) {
    return buildSetPackage(packageName, fileMap);
  }
  throw new Error("Selected directory is missing output.json or package_manifest.json.");
}

async function loadPackageFromDirectoryHandle(directoryHandle) {
  cleanupObjectUrls();
  state.packages = new Map();
  state.packageOrder = [];
  state.globalSkillText = state.globalSkillText || DEFAULT_GLOBAL_SKILL;
  state.packageDirectoryHandle = directoryHandle;
  state.packageDirectoryPackageName = directoryHandle.name || null;

  const pkg = await buildPackageFromDirectoryHandle(directoryHandle);
  state.packages.set(pkg.packageName, pkg);
  state.packageOrder.push(pkg.packageName);
  await switchPackage(pkg.packageName);
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
  await renderStorySummary();
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

function getComparableSteps(pkg = state.currentPackage) {
  if (!pkg) {
    return [];
  }
  return pkg.dataSpec.filter((step) => Number(step.step_id) >= 2);
}

async function getExistingReportText(step, pkg = state.currentPackage) {
  if (!pkg || !step) {
    return null;
  }
  const reportPath = getReportFilename(step.step_id, pkg.packageName);
  const entry = pkg.fileMap.get(reportPath);
  if (!entry) {
    return null;
  }
  if (typeof entry === "string") {
    return entry;
  }
  const text = await entry.text();
  pkg.fileMap.set(reportPath, text);
  refreshCurrentPackageFileEntries();
  return text;
}

async function saveReportIntoCurrentPackage(step, reportText) {
  if (!state.currentPackage || !step) {
    return false;
  }
  const reportFilename = getReportFilename(step.step_id, state.currentPackage.packageName);
  state.currentPackage.fileMap.set(reportFilename, reportText);
  refreshCurrentPackageFileEntries();

  if (state.packageDirectoryHandle && state.packageDirectoryPackageName === state.packageName) {
    const fileHandle = await state.packageDirectoryHandle.getFileHandle(reportFilename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(reportText);
    await writable.close();
  }
  return true;
}

async function ensurePackageDirectoryHandle() {
  if (state.packageDirectoryHandle && state.packageDirectoryPackageName === state.packageName) {
    return state.packageDirectoryHandle;
  }
  if (!window.showDirectoryPicker) {
    return null;
  }
  const handle = await window.showDirectoryPicker({
    id: `eval-demo-${state.packageName || "package"}`,
    mode: "readwrite",
  });
  state.packageDirectoryHandle = handle;
  state.packageDirectoryPackageName = state.packageName;
  return handle;
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
  const existingReport = await getExistingReportText(step);
  el.reportOutput.value = existingReport || "";
  if (!existingReport) {
    el.requestDebugOutput.value = "# Yunwu request body debug output";
  }
  renderJudgmentAccuracy();
}

function getCurrentStep() {
  if (!state.currentPackage) {
    return null;
  }
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

function extractLeadingDigit(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const match = String(value).trim().match(/^(\d+)/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function mapRelevanceToBinary(value) {
  const level = extractLeadingDigit(value);
  if (level === null) {
    return null;
  }
  return level >= 1 && level <= 3 ? 1 : level === 4 ? 0 : null;
}

function mapAccuracyToBinary(value) {
  const score = extractLeadingDigit(value);
  return score === 0 || score === 1 ? score : null;
}

function normalizeJsonLikeText(text) {
  return text
    .replace(/^\s*json\s*/i, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/([{,]\s*)'([^']+?)'\s*:/g, '$1"$2":')
    .replace(/:\s*'([^']*?)'/g, ': "$1"')
    .replace(/,\s*([}\]])/g, "$1");
}

function findCandidateJsonText(reportText) {
  const fencedBlocks = Array.from(reportText.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
  for (let index = fencedBlocks.length - 1; index >= 0; index -= 1) {
    const candidate = fencedBlocks[index][1]?.trim();
    if (candidate && candidate.includes("{")) {
      return candidate;
    }
  }

  const start = reportText.lastIndexOf("{");
  const end = reportText.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return reportText.slice(start, end + 1);
  }
  return null;
}

function extractJudgmentJson(reportText) {
  const candidate = findCandidateJsonText(reportText);
  if (!candidate) {
    return { parsed: null, error: "No final JSON object found in report." };
  }

  try {
    return { parsed: JSON.parse(normalizeJsonLikeText(candidate)), error: null };
  } catch (error) {
    return { parsed: null, error: `Final JSON parse failed: ${error.message}` };
  }
}

function buildComparisonRows(step, parsed) {
  return [
    {
      label: "Main vs Context Relevance",
      predictedRaw: parsed.relevance_level,
      groundTruthRaw: step.relevance_level,
      predictedValue: mapRelevanceToBinary(parsed.relevance_level),
      groundTruthValue: mapRelevanceToBinary(step.relevance_level),
      formatter: (value) => (value === 1 ? "related" : value === 0 ? "not_related" : "unknown"),
    },
    {
      label: "Main-Sub Relevance",
      predictedRaw: parsed.relevance_level_between_card,
      groundTruthRaw: step.relevance_level_between_card,
      predictedValue: mapRelevanceToBinary(parsed.relevance_level_between_card),
      groundTruthValue: mapRelevanceToBinary(step.relevance_level_between_card),
      formatter: (value) => (value === 1 ? "related" : value === 0 ? "not_related" : "unknown"),
    },
    {
      label: "Main Card Accuracy",
      predictedRaw: parsed.accuracy_of_main_card_content,
      groundTruthRaw: step.accuracy_of_main_card_content,
      predictedValue: mapAccuracyToBinary(parsed.accuracy_of_main_card_content),
      groundTruthValue: mapAccuracyToBinary(step.accuracy_of_main_card_content),
      formatter: (value) => (value === 1 ? "1" : value === 0 ? "0" : "unknown"),
    },
    {
      label: "Sub Card Accuracy",
      predictedRaw: parsed.accuracy_of_sub_card_content,
      groundTruthRaw: step.accuracy_of_sub_card_content,
      predictedValue: mapAccuracyToBinary(parsed.accuracy_of_sub_card_content),
      groundTruthValue: mapAccuracyToBinary(step.accuracy_of_sub_card_content),
      formatter: (value) => (value === 1 ? "1" : value === 0 ? "0" : "unknown"),
    },
  ];
}

function renderJudgmentAccuracy() {
  const step = getCurrentStep();
  if (!step) {
    el.judgmentAccuracy.textContent = "No step selected.";
    return;
  }

  const reportText = el.reportOutput.value || "";
  if (!reportText.trim()) {
    el.judgmentAccuracy.textContent = "No report available.";
    return;
  }

  const { parsed, error } = extractJudgmentJson(reportText);
  if (!parsed) {
    el.judgmentAccuracy.textContent = error;
    return;
  }

  const rows = buildComparisonRows(step, parsed);

  const validRows = rows.filter(
    (row) => row.predictedValue !== null && row.groundTruthValue !== null,
  );
  const matchedRows = validRows.filter((row) => row.predictedValue === row.groundTruthValue);

  const summary = `<div class="accuracy-summary"><strong>Matched ${matchedRows.length}/${validRows.length}</strong> comparable judgments.</div>`;
  const header = `
    <div class="accuracy-grid">
      <div class="accuracy-head">Metric</div>
      <div class="accuracy-head">Predicted</div>
      <div class="accuracy-head">Ground Truth</div>
      <div class="accuracy-head">Match</div>
  `;
  const body = rows
    .map((row) => {
      const comparable = row.predictedValue !== null && row.groundTruthValue !== null;
      const isMatch = comparable && row.predictedValue === row.groundTruthValue;
      const predictedText = comparable
        ? row.formatter(row.predictedValue)
        : `unparsed (${String(row.predictedRaw ?? "")})`;
      const groundTruthText = row.groundTruthValue !== null
        ? row.formatter(row.groundTruthValue)
        : `unparsed (${String(row.groundTruthRaw ?? "")})`;
      const matchClass = comparable ? (isMatch ? "accuracy-match" : "accuracy-mismatch") : "";
      const matchText = comparable ? (isMatch ? "match" : "mismatch") : "N/A";
      return `
        <div>${sanitizeHtml(row.label)}</div>
        <div>${sanitizeHtml(predictedText)}</div>
        <div>${sanitizeHtml(groundTruthText)}</div>
        <div class="${matchClass}">${matchText}</div>
      `;
    })
    .join("");

  el.judgmentAccuracy.innerHTML = `${summary}${header}${body}</div>`;
}

async function summarizePackageReports(pkg = state.currentPackage) {
  const steps = getComparableSteps(pkg);
  const metrics = {
    relevance_level: { matched: 0, total: 0, label: "Main vs Context Relevance" },
    relevance_level_between_card: { matched: 0, total: 0, label: "Main-Sub Relevance" },
    accuracy_of_main_card_content: { matched: 0, total: 0, label: "Main Card Accuracy" },
    accuracy_of_sub_card_content: { matched: 0, total: 0, label: "Sub Card Accuracy" },
  };
  let reportCount = 0;

  for (const step of steps) {
    const reportText = await getExistingReportText(step, pkg);
    if (!reportText) {
      continue;
    }
    reportCount += 1;
    const { parsed } = extractJudgmentJson(reportText);
    if (!parsed) {
      continue;
    }
    const rows = buildComparisonRows(step, parsed);
    const keys = Object.keys(metrics);
    rows.forEach((row, index) => {
      const metric = metrics[keys[index]];
      if (row.predictedValue !== null && row.groundTruthValue !== null) {
        metric.total += 1;
        if (row.predictedValue === row.groundTruthValue) {
          metric.matched += 1;
        }
      }
    });
  }

  return {
    stepCount: steps.length,
    reportCount,
    metrics,
  };
}

async function renderStorySummary() {
  if (!state.currentPackage) {
    el.storySummary.textContent = "No package summary yet.";
    return;
  }
  const summary = await summarizePackageReports();
  const metrics = Object.values(summary.metrics);
  const totalMatched = metrics.reduce((acc, item) => acc + item.matched, 0);
  const totalComparable = metrics.reduce((acc, item) => acc + item.total, 0);
  const overallRate = totalComparable ? `${Math.round((totalMatched / totalComparable) * 100)}%` : "N/A";
  const rows = metrics
    .map((item) => {
      const rate = item.total ? `${Math.round((item.matched / item.total) * 100)}%` : "N/A";
      return `<div>${sanitizeHtml(item.label)}</div><div>${sanitizeHtml(`${item.matched}/${item.total}`)}</div><div>${sanitizeHtml(rate)}</div>`;
    })
    .join("");

  el.storySummary.innerHTML = `
    <div class="accuracy-summary">
      <strong>Reports:</strong> ${summary.reportCount}/${summary.stepCount} loaded or generated from step2 onward.<br />
      <strong>Overall Accuracy:</strong> ${sanitizeHtml(`${totalMatched}/${totalComparable}`)} (${sanitizeHtml(overallRate)})
    </div>
    <div class="accuracy-grid" style="grid-template-columns: 1.3fr 0.8fr 0.7fr;">
      <div class="accuracy-head">Metric</div>
      <div class="accuracy-head">Matched</div>
      <div class="accuracy-head">Rate</div>
      ${rows}
    </div>
  `;
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

async function buildRequestBodyForStep(step) {
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

  let temperature = Number.parseFloat(el.temperatureInput?.value ?? "0.1");
  if (!Number.isFinite(temperature)) {
    temperature = 0.1;
  }
  temperature = Math.max(0, Math.min(2, temperature));

  return {
    model: el.modelInput.value.trim() || "gpt-5.4",
    temperature,
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(),
      },
      {
        role: "user",
        content: [{ type: "text", text: buildUserPrompt(step, el.skillEditor.value) }, ...imageContent],
      },
    ],
  };
}

async function requestReportForStep(step, { updateDebug = true } = {}) {
  const baseUrlRaw = el.baseUrlInput?.value?.trim() || "";
  if (!baseUrlRaw) {
    throw new Error("Base URL is required.");
  }
  const apiKey = el.apiKeyInput.value.trim();
  if (!apiKey) {
    throw new Error("Yunwu API key is required.");
  }

  const requestBody = await buildRequestBodyForStep(step);
  if (updateDebug) {
    el.requestDebugOutput.value = JSON.stringify(buildDebugRequestBody(requestBody), null, 2);
  }

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
  return payload.choices?.[0]?.message?.content || "No report returned.";
}

async function generateReport() {
  const step = getCurrentStep();
  if (!step) {
    setStatus("No step selected.");
    return;
  }

  try {
    await syncSkillFileBeforeRun();
    setStatus("Generating evaluation report with Yunwu...");
    el.generateBtn.disabled = true;
    const text = await requestReportForStep(step, { updateDebug: true });
    el.reportOutput.value = text;
    await saveReportIntoCurrentPackage(step, text);
    renderFileList();
    await renderStorySummary();
    renderJudgmentAccuracy();
    setStatus("Evaluation report generated.");
  } catch (error) {
    console.error(error);
    setStatus(`Generation failed: ${error.message}`);
  } finally {
    el.generateBtn.disabled = false;
  }
}

async function generateAllReports() {
  if (!state.currentPackage) {
    setStatus("No package selected.");
    return;
  }
  const steps = getComparableSteps();
  if (!steps.length) {
    setStatus("No comparable steps from step2 onward.");
    return;
  }

  try {
    await syncSkillFileBeforeRun();
    if (window.showDirectoryPicker && state.currentPackage.kind !== "embedded-demo") {
      try {
        await ensurePackageDirectoryHandle();
      } catch (error) {
        if (error?.name !== "AbortError") {
          throw error;
        }
      }
    }

    el.generateBtn.disabled = true;
    el.generateAllBtn.disabled = true;
    updateBatchProgress(0, steps.length, `0/${steps.length} completed`);
    setStatus(`Batch generating reports for ${steps.length} steps...`);

    let completed = 0;
    for (const step of steps) {
      const existingReport = await getExistingReportText(step);
      if (existingReport) {
        completed += 1;
        updateBatchProgress(completed, steps.length, `Reused existing report for step ${step.step_id}`);
        continue;
      }

      updateBatchProgress(completed, steps.length, `Generating step ${step.step_id}...`);
      const reportText = await requestReportForStep(step, {
        updateDebug: String(step.step_id) === String(state.selectedStepId),
      });
      await saveReportIntoCurrentPackage(step, reportText);
      completed += 1;
      updateBatchProgress(completed, steps.length, `Generated step ${step.step_id}`);
    }

    refreshCurrentPackageFileEntries();
    renderFileList();
    await renderSelectedStep();
    await renderStorySummary();
    setStatus(`Batch completed for ${steps.length} steps.`);
  } catch (error) {
    console.error(error);
    setStatus(`Batch generation failed: ${error.message}`);
  } finally {
    el.generateBtn.disabled = false;
    el.generateAllBtn.disabled = false;
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
el.generateAllBtn.addEventListener("click", generateAllReports);
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
el.reportOutput.addEventListener("input", renderJudgmentAccuracy);

state.globalSkillText = DEFAULT_GLOBAL_SKILL;
state.systemIntroText = DEFAULT_SYSTEM_INTRO;
el.systemIntroEditor.value = DEFAULT_SYSTEM_INTRO;
el.skillEditor.value = DEFAULT_GLOBAL_SKILL;
updateSystemPromptPreview();
el.reportOutput.value = "";
el.requestDebugOutput.value = "# Yunwu request body debug output";
updateBatchProgress(0, 1, "No batch run yet.");
renderJudgmentAccuracy();
setStatus("Load a story package folder and optional skill file to begin.");
