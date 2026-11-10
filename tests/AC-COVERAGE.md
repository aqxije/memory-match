# T5/T11 自动化测试 · [L] AC 覆盖映射（AC-COVERAGE）

> 交付：tests/（Node 内置 node:test，零第三方依赖，无 DOM）
> 权威：docs/spec/SPEC.md v1.0 §8（AC-01~AC-63）、docs/arch/logic.md v1.2（接口唯一权威，§14 测试缝、§15 AC 映射）
> 运行命令：`node --test tests/`（仓库根执行，退出码 0 即全绿）
> 假 timer 口径：SPEC §13.1 I-01 / logic.md §7.2 —— 二翻后不推进时钟 → flipCount=2/LOCKED；advance(0) → 判定执行；AC-10 再 advance(800) → 翻回。

## 1. 覆盖总览

| 项目 | 值 |
|---|---|
| [L] AC 总数 | 39（AC-01~04、06~23、25~31、33/34、36~39、56~58、63） |
| 测试文件 | 12 个用例文件 + 5 个 helpers |
| 用例数 | 122（T11 补齐后：+render-model 单测 21、+全仓安全扫描 2、+元测试增强 2；首轮 93 为 DEF-001 修复前口径，T5 完成时 97） |
| 断言方式 | 全部在 Node 无 DOM 环境；时间用假时钟推进，不依赖真实 sleep；随机用固定种子 |

## 2. 逐条映射

| AC | 判定口径摘要 | 测试文件 | 关键用例 |
|---|---|---|---|
| AC-01 | 默认 easy / 静音关 / 各难度 best=0 / state=menu | tests/settings.test.js、tests/config.test.js | 「AC-01 默认配置…」「AC-01 默认难度为 easy…」 |
| AC-02 | MENU 选 hard → difficultyId=hard、仍 MENU、选中唯一 | tests/settings.test.js | 「AC-02 难度选择…」 |
| AC-03 | start() → playing、16 张全背面、计数归零、计时未启动 | tests/state-machine.test.js | 「AC-03 开局状态…」 |
| AC-04 | 选 hard 并开局 → 同 storage 重建 → 默认 hard | tests/settings.test.js | 「AC-04 难度记忆…」 |
| AC-06 | 首翻 faceUp=true、flipCount=1、moves=0、计时启动 | tests/state-machine.test.js | 「AC-06 翻牌…」 |
| AC-07 | 二翻 flipCount=2/LOCKED、第三张返回 locked、计数保持 2；未推进时钟无 match/mismatch 事件（I-15/Q-28） | tests/state-machine.test.js | 「AC-07 同时最多两张…」 |
| AC-08 | 重复点击同张 → card-face-up、moves/flipCount/combo 不变、计时不重置 | tests/state-machine.test.js | 「AC-08 重复点击同一张…」「AC-08 重复点击不打断连击…」 |
| AC-09 | 配对成功 → matched×2、moves=1、combo=1、score=100、flipCount=0、回 idle | tests/state-machine.test.js | 「AC-09 配对成功…」 |
| AC-10 | 错配 → moves=1、combo=0、score 不变、flipCount=0、locked；800ms 后翻回 | tests/state-machine.test.js | 「AC-10 配对失败…」「AC-10 mismatchHoldMs 可配置…」 |
| AC-11 | 点已配对牌 → card-matched、无状态变化 | tests/state-machine.test.js | 「AC-11 已配对牌不可点…」 |
| AC-12 | 最后一对 → result、计时停止、stars/score/moves/timeMs 一致 | tests/state-machine.test.js | 「AC-12 完成判定…」 |
| AC-13 | 同 seed 两次 deepEqual；每符号恰 2 张；长度=2×pairs；id 0..2n-1 | tests/cards.test.js | 「AC-13 同一种子两次生成牌组完全一致…」等 5 条 |
| AC-14 | D4 用 18 个互不相同符号；符号池 24≥18 | tests/cards.test.js、tests/config.test.js | 「AC-14 D4（18 对）…」「AC-14 符号池为 24 个…」 |
| AC-15 | combo 0 → 配对 → score+100、combo=1 | tests/scoring.test.js | 「AC-15 基础分…」 |
| AC-16 | n=2→150、3→200、4→250、5→300、≥6→300 | tests/scoring.test.js | 「AC-16 连击加成…」「AC-16 连续 6 次配对…」 |
| AC-17 | combo=3 → 错配 → combo=0、score 不变；下次成功 +100 | tests/scoring.test.js | 「AC-17 连击中断…」「AC-17 错配后续连击…」 |
| AC-18 | combo=2 → 暂停/恢复 → 成功 → combo=3 | tests/scoring.test.js | 「AC-18 暂停不打断连击…」 |
| AC-19 | Σ scoreDelta === 最终 score，且与 won 一致 | tests/scoring.test.js | 「AC-19 总分一致…」 |
| AC-20 | pairs=8、moves=12、time=80s → 3★ | tests/stars.test.js | 「AC-20 三星边界…」「AC-20/21 边界外…」「AC-20~23 集成…」 |
| AC-21 | pairs=8、moves=20、time=160s → 2★ | tests/stars.test.js | 「AC-21 二星边界…」 |
| AC-22 | pairs=6、moves=40、time=600s → 1★，无 0 星 | tests/stars.test.js | 「AC-22 一星保底…」 |
| AC-23 | pairs=6、moves=9、time=90s → 2★（取较低星） | tests/stars.test.js | 「AC-23 取较低星…」 |
| AC-25 | 空榜写入 → 条数 +1、字段完整、持久化 schema 正确 | tests/leaderboard.test.js | 「AC-25 记录写入…」 |
| AC-26 | score↓ → moves↑ → timeMs↑ → completedAt↑；Top 5；compareEntries/rankEntries | tests/leaderboard.test.js | 「AC-26 排序规则…」「AC-26 compareEntries…」「AC-26 rankEntries…」 |
| AC-27 | 第 6 位 → 榜单不变、rank=null、非新纪录；score>preBest → 更新且 true | tests/leaderboard.test.js | 「AC-27 淘汰与破纪录…」 |
| AC-28 | 第 1 名 1300 → best/getBestScore=1300；空榜 0 | tests/leaderboard.test.js | 「AC-28 最佳分展示…」 |
| AC-29 | 同 storage 重建 → 榜单/最佳分/muted/difficulty 一致 | tests/leaderboard.test.js | 「AC-29 持久化…」 |
| AC-30 | 非法 JSON/结构不符/version 不匹配 → 不抛、空榜、best=0、可 start | tests/leaderboard.test.js | 「AC-30 数据健壮性…」「AC-30 单条 completedAt 非法…」 |
| AC-31 | setItem/getItem 抛异常 → 不抛、榜单内存可见、degraded=true、结算正常 | tests/leaderboard.test.js | 「AC-31 存储降级…」「AC-31 getItem 抛异常…」 |
| AC-33 | 4 档 cols/rows/cards/pairs/阈值与 SPEC §6.2 完全一致 | tests/config.test.js | 「AC-33 四档难度…」「AC-33 3★/2★ 步数阈值…」「AC-33 3★/2★ 用时阈值…」等 5 条 |
| AC-34 | playing D2 已配对 3 对 → 切 hard：新局归零、不写榜 | tests/state-machine.test.js | 「AC-34 难度切换重开…」 |
| AC-36 | pause → paused、计时冻结、flip 返回 paused | tests/state-machine.test.js | 「AC-36 暂停…」 |
| AC-37 | 暂停 10s 不计入用时（误差 ≤100ms）；多次暂停累计正确 | tests/timer.test.js | 「AC-37 暂停不计时…」「AC-37 多次暂停/恢复…」 |
| AC-38 | restart → 同难度新局、全背面、计数归零、榜单/best 不变、pendingCount=0 | tests/state-machine.test.js | 「AC-38 重开…」 |
| AC-39 | toggleMute → muted=true 持久化；重建仍静音；任意状态可切换 | tests/settings.test.js | 「AC-39 静音持久化…」「AC-39 静音开关在任意状态…」 |
| AC-56 | 无 node_modules、无构建配置、package.json dependencies 为空、core 仅相对 require | tests/repo.test.js | 「AC-56 零依赖…」「AC-56 core 只 require 相对路径…」 |
| AC-57 | Node 无 DOM require 全部 core；导出完整；core 无 DOM 全局；冒烟全链路 | tests/repo.test.js | 「AC-57 Node 无 DOM 可加载…」「AC-57 core 源码不含 DOM…」「AC-57 冒烟…」 |
| AC-58 | 单条命令全绿 + 覆盖映射完整（本文件被元测试校验：AC 编号/文件/用例名/统计一致性） | tests/meta-coverage.test.js + 全量运行 | 「AC-58 覆盖映射完整…」「AC-58 映射的测试文件存在…」「AC-58 覆盖表关键用例名与真实 test() 名称一致…」「AC-58 AC-COVERAGE 顶部统计与实际一致…」 |
| AC-63 | playing + hidden → paused、计时冻结；visible 不自动继续 | tests/state-machine.test.js | 「AC-63 切后台自动暂停…」「AC-63 非 PLAYING 时切后台…」 |

## 3. 辅助测试（非 AC 直接映射，支撑契约与回归）

| 主题 | 文件 | 说明 |
|---|---|---|
| 假时钟契约（§4.3） | tests/timer.test.js | advance(0) 执行 0ms 任务、按 at 升序、clearTimeout、回调内再调度 |
| timer.js createTimer 注入 | tests/timer.test.js | 注入 now/setTimeout/clearTimeout 后完全可控 |
| judgeDelayMs/tick/定时器泄漏 | tests/timer.test.js | 判定延迟可配、tick 250ms、重开/换难度/回菜单/通关 pendingCount=0 |
| 事件顺序（§11.2） | tests/events.test.js | flip→match/mismatch→hide；最后一对 flip→match→state→won；重开/换难度/静音 |
| 订阅规则（§11.3） | tests/events.test.js | 取消订阅、通配 *、异常隔离 onError、重入 busy |
| 状态迁移矩阵（§6.4） | tests/state-machine.test.js | 非法调用 invalid-state / not-playing |
| 边界 E1–E5（SPEC §10） | tests/state-machine.test.js | LOCKED 连点、双击同张、点已配对、暂停点牌、结算点棋盘 |
| 排行榜清空/副本 | tests/leaderboard.test.js | clear/clearAll/getBoards/list 返回副本 |
| 全仓安全约束（S-05/Q-11） | tests/repo.test.js | index.html + src/**/*.js 排除注释后无 eval/new Function/innerHTML/fetch/XMLHttpRequest/import(/外部URL/type=module；styles 无外部 URL |
| 纯视图模型（I-08/Q-27） | tests/render-model.test.js | computeLayout 多视口/难度/安全区/boardPad/边界；buildViewModel 卡片 aria/disabled、HUD 文案、overlay、muted、liveText；formatTime/getSymbol |
| AC-07 事件面（I-15/Q-28） | tests/state-machine.test.js | 未推进时钟时 recorder 无 match/mismatch；advance(0) 后恰好一次判定事件 |
| 元测试增强（I-07） | tests/meta-coverage.test.js | 「关键用例」列用例名与真实 test() 名称比对（支持「…」前缀）；统计行与实际文件/用例数比对 |

## 4. helpers（tests/helpers/）

| 文件 | 契约 |
|---|---|
| fake-clock.js | createFakeTimer()：now/setTimeout/clearTimeout/advance/pendingCount（logic.md §4.3） |
| fake-storage.js | createFakeStorage({initial,throwOnGet,throwOnSet,throwOnRemove,corrupt})：localStorage 兼容 + 断言辅助 |
| seeded-rng.js | 复用 core createSeededRng；另给独立 mulberry32 参考实现 |
| recorder.js | createRecorder(game)：subscribe('*') 收集事件，names/of/last/clear |
| harness.js | setup()（假时钟+种子随机+假 storage+固定 wallNow）、牌组操作、playAllPairs、expectedFullComboScore、requireCore（无兼容垫片，直接调用 logic.md 冻结签名） |

## 5. T11 补齐记录（评审问题 → 测试侧修复）

| 评审项 | 问题 | 修复 |
|---|---|---|
| I-06 / Q-12 | AC-COVERAGE 统计陈旧（93/10+6） | 更新为 122 用例 / 12 用例文件 / 5 helpers，并注明首轮 93 为 DEF-001 修复前口径；元测试新增统计一致性校验防复发 |
| I-07 | 元测试只校验 AC 编号与文件名 | 新增「关键用例」列用例名与真实 test() 名称比对（支持「…」前缀）+ 映射文件内确实出现该 AC 编号 |
| I-08 / Q-27 | render-model 纯函数无单测 | 新增 tests/render-model.test.js（21 条）：computeLayout 360×640/320×568/1280×800/横屏/安全区/boardPad/边界；buildViewModel 卡片 aria/disabled、HUD、overlay、muted、liveText |
| S-05 / Q-11 | 安全扫描只覆盖 src/core | tests/repo.test.js 扩到 index.html + src/**/*.js（排除注释）匹配 eval/new Function/innerHTML/fetch/XMLHttpRequest/import(/外部URL/type=module；styles 无外部 URL |
| I-15 / Q-28 | AC-07 缺事件面断言 | AC-07 用例加 recorder：未推进时钟无 match/mismatch；advance(0) 后恰好一次判定事件 |
| Q-13 | harness 兼容垫片掩盖实现漂移 | 删除 symbolList/createDeckCompat/addEntry；直接调用 createDeck({pairs,rng})、SYMBOLS、leaderboard.add(id,entry) |
