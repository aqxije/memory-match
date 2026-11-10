# T5/T11 自动化测试运行报告（TEST-REPORT）

| 项目 | 内容 |
|---|---|
| 任务 | T5 自动化测试 + T11 测试补齐与回归（test-engineer） |
| 日期 | 2026-11-09（T5）→ 2026-11-10（T11） |
| 环境 | Node.js v26.13.0（仓库根：/home/l/文档/deepseek-harness/default-workspace） |
| 命令 | `node --test tests/`（等价 `node --test`，自动发现 tests/**/*.test.js） |
| 结果 | **tests 122 / pass 122 / fail 0 / cancelled 0 / skipped 0 / todo 0**，退出码 **0** |
| 依赖 | 零第三方依赖；仅 node:test / node:assert/strict / node:fs / node:path |
| 约束 | 无 DOM、无真实 sleep、无网络；时间用假时钟推进，随机用固定种子 |

## 1. 运行证据

```text
$ node --test tests/
ℹ tests 122
ℹ suites 0
ℹ pass 122
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
$ echo $?
0
```

- 逐文件用例数：render-model 21、state-machine 17、leaderboard 14、events 11、timer 9、cards 8、config 8、settings 8、scoring 7、stars 6、repo 7、meta-coverage 6（合计 122）。
- 二次独立验证：`node --test`（无参数自动发现）同样全绿、退出码 0。
- T10（评审修复）完成后最终回归（2026-11-10）：`node --test tests/` → 122/122、退出码 0，无回归；T10 对 index.html/src/styles 的改动已通过全仓安全扫描与全部 core 用例。
- 口径演进：首轮 93（DEF-001 修复前，91 pass / 2 fail）→ T5 完成 97 → T11 补齐 122。

## 2. AC 覆盖

- 39 条 [L] AC 全部有映射：见 [AC-COVERAGE.md](./AC-COVERAGE.md)（39 行逐条映射；元测试自动校验 AC 编号、映射文件存在、文件内出现该 AC 编号、「关键用例」列用例名真实存在、顶部统计与实际一致）。
- AC-58 指定逻辑面（AC-06/07/09/10/12/15/16/17/20/21/22/23/25/26/27/33/37/38/63）全部覆盖。
- [M] 类 AC（AC-05/24/32/35/40~55/59~62 等）不在 node:test 范围，由 T7/T8 浏览器核验；T5/T11 已覆盖其可自动化的逻辑面（如 AC-28 最佳分、AC-32 clear API、AC-24 结算数据、AC-41/42 音频抑制仅逻辑契约）。
- T11 新增纯视图模型覆盖：src/render-model.js 的 computeLayout（AC-47/48 关键布局算法）与 buildViewModel（卡片 aria/disabled、HUD 文案、overlay、muted/liveText）。

## 3. 缺陷记录

### DEF-001（blocker，已修复并回归通过）

- 现象：start()/restart() 后 `getSnapshot().cards[i].faceUp/matched` 为 `undefined`（应为 `false`）。
- 违反：AC-03（16 张牌全部背面朝上）、AC-38（重开后牌全部背面）、logic.md §12.1（字段类型 boolean）。
- 复现：`node --test tests/state-machine.test.js` → AC-03、AC-38 失败。
- 证据：快照卡片 `{ id, pairId, symbolId, faceUp: undefined, matched: undefined }`；game.js 快照直接透传未初始化的内部字段。
- 修复（implementer）：resetRound 建局时显式初始化 `faceUp:false, matched:false`，快照以 `!!` 兜底。
- 回归：2026-11-09 全量重跑 97/97 通过，AC-03/AC-38 转绿，无回归。

### T11 期间

- 无新增缺陷；render-model 单测按 T10 最终契约（boardPad=2、hud.muted、buildViewModel(snapshot, env)）编写并全绿。

## 4. 测试工具（tests/helpers/）

| 文件 | 契约 |
|---|---|
| fake-clock.js | createFakeTimer()：now/setTimeout/clearTimeout/advance/pendingCount；advance(0) 执行 0ms 任务（logic.md §4.3） |
| fake-storage.js | createFakeStorage({initial,throwOnGet,throwOnSet,throwOnRemove,corrupt})：localStorage 兼容 + 断言辅助 |
| seeded-rng.js | 复用 core createSeededRng；独立 mulberry32 参考实现 |
| recorder.js | createRecorder(game)：subscribe('*') 收集事件，names/of/last/clear |
| harness.js | setup()（假时钟+种子随机+假 storage+固定 wallNow）、牌组操作、playAllPairs、expectedFullComboScore、requireCore；无兼容垫片，直接调用 logic.md 冻结签名 |

## 5. T11 补齐记录（评审问题 → 测试侧修复）

| 评审项 | 修复 |
|---|---|
| I-06 / Q-12 | AC-COVERAGE 统计更新为 122 用例 / 12 用例文件 / 5 helpers，注明首轮 93 为 DEF-001 修复前口径；元测试新增统计一致性校验防复发 |
| I-07 | 元测试解析「关键用例」列并与真实 test() 名称比对（支持「…」前缀）；校验映射文件内确实出现该 AC 编号 |
| I-08 / Q-27 | 新增 tests/render-model.test.js（21 条）：computeLayout 多视口/难度/安全区/boardPad/边界；buildViewModel 卡片 aria/disabled、HUD、overlay、muted、liveText；formatTime/getSymbol |
| S-05 / Q-11 | tests/repo.test.js 安全扫描扩到 index.html + src/**/*.js（排除注释）匹配 eval/new Function/innerHTML/fetch/XMLHttpRequest/import(/外部URL/type=module；styles 无外部 URL |
| I-15 / Q-28 | AC-07 用例加 recorder：未推进时钟无 match/mismatch；advance(0) 后恰好一次判定事件 |
| Q-13 | 删除 harness 兼容垫片（symbolList/createDeckCompat/addEntry），直接调用 createDeck({pairs,rng})、SYMBOLS、leaderboard.add(id,entry) |

## 6. 说明与已知边界

1. **假时钟语义**：按 logic.md §4.3「先 now += ms，再执行 at ≤ now 的任务」，长跳会合并周期性 tick（tick 仅用于 HUD 刷新，elapsedMs 仍精确）；涉及 tick 计数的用例按 250ms 步进推进。
2. **tick 事件**：错配停留（800ms）与配对动画期间秒表仍在走，事件序列中允许穿插 `tick`；业务事件顺序断言已过滤 tick。
3. **不测生产代码内部实现**：用例只依赖 logic.md/render.md 的公开接口与快照契约；不 mock 内部函数。
4. **未覆盖项**：DOM/渲染/音频/粒子/响应式/键盘/aria 等 [M] 类由 T7/T8 人工核验；render-model 纯函数已纳入（见 §5），但真实 DOM 布局/像素仍由浏览器核验。
5. **测试代码范围**：仅写 tests/（write_scopes），未修改 src/、index.html、styles/、README.md。
