# Dynamic GUI Eval Skill / 动态 GUI 评测 Skill

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

```md
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
```
