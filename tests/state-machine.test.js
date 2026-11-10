'use strict';

/**
 * 状态机与核心玩法：AC-03/06/07/08/09/10/11/12/34/36/38/63
 * 假 timer 口径见 logic.md §4.3/§7.2 与 SPEC §13.1 I-01：
 *   二翻后不推进时钟 → flipCount=2 / phase=locked；advance(0) → 判定执行；AC-10 再 advance(800) → 翻回。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { computeStars } = require('../src/core/scoring.js');
const {
  setup,
  snapshot,
  cards,
  backCards,
  unmatchedPairs,
  findMismatch,
  playNextPair,
  playAllPairs,
} = require('./helpers/harness.js');
const { createRecorder } = require('./helpers/recorder.js');

test('AC-03 开局状态：D2 → playing、16 张全背面、分数/连击/步数/用时归零、计时未启动', function () {
  const { game, timer } = setup();
  assert.equal(snapshot(game).state, 'menu');
  assert.equal(game.selectDifficulty('normal').ok, true);
  assert.equal(game.start().ok, true);

  const state = snapshot(game);
  assert.equal(state.state, 'playing');
  assert.equal(state.difficultyId, 'normal');
  assert.equal(state.pairsTotal, 8);
  assert.equal(state.cards.length, 16);
  assert.equal(
    state.cards.every(function (card) { return card.faceUp === false && card.matched === false; }),
    true,
    '开局所有牌必须背面朝上且未配对'
  );
  assert.equal(state.score, 0);
  assert.equal(state.combo, 0);
  assert.equal(state.moves, 0);
  assert.equal(state.elapsedMs, 0);
  assert.equal(state.pairsFound, 0);
  assert.equal(state.flipCount, 0);
  assert.equal(state.phase, 'idle');
  assert.equal(state.stars, null);
  assert.equal(state.timeMs, null);

  // 计时未启动：推进假时钟不增加用时，也不应有挂起定时器
  timer.advance(1000);
  assert.equal(snapshot(game).elapsedMs, 0, '开局未翻牌前计时应未启动');
  assert.equal(timer.pendingCount(), 0);
});

test('AC-06 翻牌：翻开一张背面牌 → faceUp=true、flipCount=1、步数仍 0、计时启动', function () {
  const { game, timer } = setup();
  game.start();
  const card = cards(game)[0];

  const result = game.flip(card.id);
  assert.equal(result.ok, true);
  assert.equal(result.cardId, card.id);
  assert.equal(result.symbolId, card.symbolId);

  const state = snapshot(game);
  assert.equal(state.cards.find(function (item) { return item.id === card.id; }).faceUp, true);
  assert.equal(state.flipCount, 1);
  assert.equal(state.moves, 0, '翻开第 1 张不增加步数');
  assert.equal(state.phase, 'one-flipped');

  timer.advance(1000);
  assert.ok(Math.abs(snapshot(game).elapsedMs - 1000) <= 100, '首翻后计时应开始累计');
});

test('AC-07 同时最多两张：二翻立即 LOCKED，LOCKED 期间点击无任何状态变化', function () {
  const { game, timer } = setup();
  const recorder = createRecorder(game);
  game.start();
  recorder.clear();
  const ids = cards(game).map(function (card) { return card.id; });

  assert.equal(game.flip(ids[0]).ok, true);
  assert.equal(game.flip(ids[1]).ok, true);

  let state = snapshot(game);
  assert.equal(state.flipCount, 2);
  assert.equal(state.phase, 'locked');
  assert.equal(state.moves, 1, '翻开第二张立即 +1 步');

  // 事件面断言（I-15/Q-28）：未推进时钟 → judge 未执行，不得发出 match/mismatch
  assert.equal(recorder.of('match').length, 0, '未推进时钟不得发 match');
  assert.equal(recorder.of('mismatch').length, 0, '未推进时钟不得发 mismatch');

  // 不推进时钟 → 判定未执行（SPEC §13.1 I-01）
  const third = ids.find(function (id) {
    return !state.cards.find(function (card) { return card.id === id; }).faceUp;
  });
  assert.deepStrictEqual(game.flip(third), { ok: false, reason: 'locked', cardId: third });

  state = snapshot(game);
  assert.equal(state.flipCount, 2, 'LOCKED 期间点击不得改变翻开计数');
  assert.equal(state.phase, 'locked');
  assert.equal(state.moves, 1);

  // 点击已翻开的牌也返回 locked（reason 优先级 §7.3）
  assert.equal(game.flip(ids[0]).reason, 'locked');

  // advance(0) 触发 judge：恰好出现 match 或 mismatch 之一（不会两者都发/都不发）
  timer.advance(0);
  const settled = recorder.of('match').length + recorder.of('mismatch').length;
  assert.equal(settled, 1, 'advance(0) 后应恰好产生一次判定事件');
});

test('AC-08 重复点击同一张：状态不变（步数不变、计时不重置、连击不断）', function () {
  const { game, timer } = setup();
  game.start();
  const card = cards(game)[0];

  game.flip(card.id);
  timer.advance(500);
  const before = snapshot(game);

  const again = game.flip(card.id);
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'card-face-up');
  assert.equal(again.cardId, card.id);

  const after = snapshot(game);
  assert.equal(after.moves, before.moves);
  assert.equal(after.flipCount, before.flipCount);
  assert.equal(after.phase, 'one-flipped');
  assert.equal(after.combo, before.combo);

  timer.advance(500);
  assert.ok(Math.abs(snapshot(game).elapsedMs - 1000) <= 100, '重复点击不得重置计时');
});

test('AC-08 重复点击不打断连击（已配对 1 次后）', function () {
  const { game, timer } = setup();
  game.start();
  playNextPair(game, timer);
  assert.equal(snapshot(game).combo, 1);

  const back = backCards(game)[0];
  game.flip(back.id);
  const beforeCombo = snapshot(game).combo;
  const beforeMoves = snapshot(game).moves;

  assert.equal(game.flip(back.id).reason, 'card-face-up');
  assert.equal(snapshot(game).combo, beforeCombo, '重复点击不得打断连击');
  assert.equal(snapshot(game).moves, beforeMoves);
});

test('AC-09 配对成功：两牌 matched、步数+1、连击+1、分数+100、flipCount=0、回 IDLE；此后点击无变化', function () {
  const { game, timer } = setup();
  game.start();
  const pair = unmatchedPairs(game)[0];

  assert.equal(game.flip(pair[0].id).ok, true);
  assert.equal(game.flip(pair[1].id).ok, true);
  assert.equal(snapshot(game).phase, 'locked');
  timer.advance(0);

  const state = snapshot(game);
  assert.equal(state.cards.find(function (card) { return card.id === pair[0].id; }).matched, true);
  assert.equal(state.cards.find(function (card) { return card.id === pair[1].id; }).matched, true);
  assert.equal(state.moves, 1);
  assert.equal(state.combo, 1);
  assert.equal(state.score, 100);
  assert.equal(state.flipCount, 0);
  assert.equal(state.phase, 'idle');
  assert.equal(state.pairsFound, 1);
  assert.equal(state.state, 'playing');

  const clickMatched = game.flip(pair[0].id);
  assert.equal(clickMatched.ok, false);
  assert.equal(clickMatched.reason, 'card-matched');
  assert.equal(snapshot(game).moves, 1);
  assert.equal(snapshot(game).score, 100);
  assert.equal(snapshot(game).combo, 1);
});

test('AC-10 配对失败：步数+1、连击归 0、分数不变、flipCount=0；800ms 后翻回；期间点击被忽略', function () {
  const { game, timer } = setup();
  game.start();
  const pair = findMismatch(game);

  assert.equal(game.flip(pair[0].id).ok, true);
  assert.equal(game.flip(pair[1].id).ok, true);
  assert.equal(snapshot(game).flipCount, 2, '判定前 flipCount 应为 2');

  timer.advance(0); // judge 执行（judgeDelayMs=0）

  let state = snapshot(game);
  assert.equal(state.moves, 1);
  assert.equal(state.combo, 0);
  assert.equal(state.score, 0, '错配不得扣分');
  assert.equal(state.flipCount, 0, '判定后翻开计数归 0');
  assert.equal(state.phase, 'locked', '错配停留期间保持 locked');
  assert.equal(state.cards.find(function (card) { return card.id === pair[0].id; }).faceUp, true);
  assert.equal(state.cards.find(function (card) { return card.id === pair[1].id; }).faceUp, true);

  // 停留期间点击被忽略
  const back = backCards(game)[0];
  assert.equal(game.flip(back.id).reason, 'locked');
  assert.equal(snapshot(game).flipCount, 0);

  // 799ms 仍可见；800ms 翻回
  timer.advance(799);
  state = snapshot(game);
  assert.equal(state.phase, 'locked');
  assert.equal(state.cards.find(function (card) { return card.id === pair[0].id; }).faceUp, true);

  timer.advance(1);
  state = snapshot(game);
  assert.equal(state.phase, 'idle');
  assert.equal(state.cards.find(function (card) { return card.id === pair[0].id; }).faceUp, false);
  assert.equal(state.cards.find(function (card) { return card.id === pair[1].id; }).faceUp, false);
  assert.equal(state.flipCount, 0);
});

test('AC-10 mismatchHoldMs 可配置（500ms 时 499ms 仍可见、500ms 翻回）', function () {
  const { game, timer } = setup({ gameOptions: { mismatchHoldMs: 500 } });
  game.start();
  const pair = findMismatch(game);
  game.flip(pair[0].id);
  game.flip(pair[1].id);
  timer.advance(0);
  assert.equal(snapshot(game).phase, 'locked');

  timer.advance(499);
  assert.equal(snapshot(game).cards.find(function (card) { return card.id === pair[0].id; }).faceUp, true);
  timer.advance(1);
  assert.equal(snapshot(game).phase, 'idle');
  assert.equal(snapshot(game).cards.find(function (card) { return card.id === pair[0].id; }).faceUp, false);
});

test('AC-11 已配对牌不可点：点击 matched=true 的牌无任何状态变化', function () {
  const { game, timer } = setup();
  game.start();
  playNextPair(game, timer);
  const matchedCard = cards(game).find(function (card) { return card.matched; });
  const before = snapshot(game);

  const result = game.flip(matchedCard.id);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'card-matched');
  assert.equal(result.cardId, matchedCard.id);

  const after = snapshot(game);
  assert.equal(after.moves, before.moves);
  assert.equal(after.score, before.score);
  assert.equal(after.combo, before.combo);
  assert.equal(after.flipCount, before.flipCount);
});

test('AC-12 完成判定：最后一对配对成功 → RESULT、计时停止、结算数据与局内一致', function () {
  const { game, timer } = setup();
  game.start();
  playAllPairs(game, timer, { gapMs: 1000 });

  const state = snapshot(game);
  assert.equal(state.state, 'result');
  assert.equal(state.pairsFound, state.pairsTotal);
  assert.equal(state.moves, 6, 'easy 全配对步数应等于对数');
  assert.equal(state.score, 1300, '全连击 easy 满分 1300');
  assert.ok([1, 2, 3].includes(state.stars), '结算星级必须 ∈ {1,2,3}');
  assert.equal(typeof state.timeMs, 'number');
  assert.equal(state.timeMs, state.elapsedMs, 'timeMs 应等于停止时的 elapsedMs');
  assert.equal(state.flipCount, 0);
  assert.equal(state.phase, 'idle');
  assert.equal(state.stars, computeStars({ pairs: 6, moves: 6, timeMs: state.timeMs }), '结算星级必须与公式一致');

  const frozenTime = state.timeMs;
  timer.advance(10000);
  assert.equal(snapshot(game).elapsedMs, frozenTime, 'RESULT 后计时必须停止');
  assert.equal(snapshot(game).timeMs, frozenTime);
  assert.equal(timer.pendingCount(), 0, '通关后不得遗留逻辑定时器');
});

test('AC-36 暂停：state=paused、计时冻结、翻牌输入被忽略（仅继续/重开/返回可用）', function () {
  const { game, timer } = setup();
  game.start();
  game.flip(cards(game)[0].id);
  timer.advance(1000);
  const before = snapshot(game).elapsedMs;

  assert.equal(game.pause().ok, true);
  assert.equal(snapshot(game).state, 'paused');
  assert.equal(timer.pendingCount(), 0, '暂停应取消 tick/judge/hide');

  timer.advance(10000);
  assert.equal(snapshot(game).elapsedMs, before, '暂停期间用时必须冻结');

  const back = backCards(game)[0];
  assert.equal(game.flip(back.id).reason, 'paused');

  assert.equal(game.resume().ok, true);
  assert.equal(snapshot(game).state, 'playing');
  timer.advance(1000);
  assert.ok(Math.abs(snapshot(game).elapsedMs - (before + 1000)) <= 100, '恢复后继续累计');
});

test('AC-38 重开：同难度新局，牌全背面、计数归零、榜单与最佳分不变、无遗留定时器', function () {
  const { game, timer } = setup();
  game.start();
  playNextPair(game, timer);
  playNextPair(game, timer);
  game.flip(backCards(game)[0].id); // phase=one-flipped
  timer.advance(3000);

  const bestBefore = game.getBestScore('easy');
  const boardBefore = game.getLeaderboard('easy');

  assert.equal(game.restart().ok, true);
  const state = snapshot(game);
  assert.equal(state.state, 'playing');
  assert.equal(state.difficultyId, 'easy');
  assert.equal(state.cards.length, 12);
  assert.equal(
    state.cards.every(function (card) { return card.faceUp === false && card.matched === false; }),
    true,
    '重开后所有牌必须背面朝上'
  );
  assert.equal(state.score, 0);
  assert.equal(state.combo, 0);
  assert.equal(state.moves, 0);
  assert.equal(state.pairsFound, 0);
  assert.equal(state.flipCount, 0);
  assert.equal(state.phase, 'idle');
  assert.equal(state.elapsedMs, 0);
  assert.equal(state.stars, null);
  assert.equal(state.timeMs, null);
  assert.equal(state.isNewRecord, false);
  assert.equal(timer.pendingCount(), 0, '重开后不得遗留逻辑定时器');
  assert.equal(game.getBestScore('easy'), bestBefore, '重开不得改变最佳分');
  assert.deepStrictEqual(game.getLeaderboard('easy'), boardBefore, '重开不得改变榜单');

  // 从 PAUSED 也可重开
  game.pause();
  assert.equal(game.restart().ok, true);
  assert.equal(snapshot(game).state, 'playing');
});

test('AC-63 切后台自动暂停：hidden → PAUSED 且计时冻结；visible 不自动继续', function () {
  const { game, timer } = setup();
  game.start();
  game.flip(cards(game)[0].id);
  timer.advance(1000);
  const before = snapshot(game).elapsedMs;

  game.handleVisibilityChange(true);
  assert.equal(snapshot(game).state, 'paused');
  timer.advance(10000);
  assert.equal(snapshot(game).elapsedMs, before, '切后台期间计时必须冻结');

  game.handleVisibilityChange(false);
  assert.equal(snapshot(game).state, 'paused', '恢复可见后不得自动继续');
  assert.equal(game.flip(backCards(game)[0].id).reason, 'paused');

  assert.equal(game.resume().ok, true);
  assert.equal(snapshot(game).state, 'playing');
});

test('AC-63 非 PLAYING 时切后台不改变状态（menu/result）', function () {
  const menuCase = setup();
  menuCase.game.handleVisibilityChange(true);
  assert.equal(snapshot(menuCase.game).state, 'menu');

  const resultCase = setup();
  resultCase.game.start();
  playAllPairs(resultCase.game, resultCase.timer);
  assert.equal(snapshot(resultCase.game).state, 'result');
  resultCase.game.handleVisibilityChange(true);
  assert.equal(snapshot(resultCase.game).state, 'result');
});

test('AC-34 难度切换重开：PLAYING D2 已配对 3 对 → 切 D3 放弃当前局（不写榜）并开新局', function () {
  const { game, timer } = setup();
  game.selectDifficulty('normal');
  game.start();
  playNextPair(game, timer);
  playNextPair(game, timer);
  playNextPair(game, timer);
  assert.equal(snapshot(game).pairsFound, 3);

  const normalBoardBefore = game.getLeaderboard('normal');
  const hardBoardBefore = game.getLeaderboard('hard');

  assert.equal(game.switchDifficulty('hard').ok, true);
  const state = snapshot(game);
  assert.equal(state.state, 'playing');
  assert.equal(state.difficultyId, 'hard');
  assert.equal(state.cards.length, 20);
  assert.equal(state.pairsTotal, 10);
  assert.equal(state.score, 0);
  assert.equal(state.combo, 0);
  assert.equal(state.moves, 0);
  assert.equal(state.pairsFound, 0);
  assert.equal(state.elapsedMs, 0);
  assert.equal(state.flipCount, 0);
  assert.equal(state.phase, 'idle');
  assert.deepStrictEqual(game.getLeaderboard('normal'), normalBoardBefore, '放弃的当前局不得写榜');
  assert.deepStrictEqual(game.getLeaderboard('hard'), hardBoardBefore);
  assert.equal(game.getBestScore('hard'), 0);

  // 非法难度 id
  assert.deepStrictEqual(game.switchDifficulty('nope'), { ok: false, reason: 'invalid-difficulty' });
  assert.equal(snapshot(game).difficultyId, 'hard');
});

test('状态迁移矩阵（logic.md §6.4）：非法调用返回 invalid-state，不抛异常', function () {
  const { game } = setup();

  // MENU：pause/resume/restart/closeLeaderboard/flip 均非法
  assert.deepStrictEqual(game.pause(), { ok: false, reason: 'invalid-state' });
  assert.deepStrictEqual(game.resume(), { ok: false, reason: 'invalid-state' });
  assert.deepStrictEqual(game.restart(), { ok: false, reason: 'invalid-state' });
  assert.deepStrictEqual(game.closeLeaderboard(), { ok: false, reason: 'invalid-state' });
  assert.equal(game.flip(0).ok, false);
  assert.equal(game.flip(0).reason, 'not-playing');

  // MENU：start 合法
  assert.equal(game.start().ok, true);
  assert.deepStrictEqual(game.start(), { ok: false, reason: 'invalid-state' });
  assert.deepStrictEqual(game.resume(), { ok: false, reason: 'invalid-state' });
  assert.deepStrictEqual(game.selectDifficulty('hard'), { ok: false, reason: 'invalid-state' });
  assert.deepStrictEqual(game.openLeaderboard(), { ok: false, reason: 'invalid-state' });

  // PLAYING：pause 合法，重复 pause 非法
  assert.equal(game.pause().ok, true);
  assert.deepStrictEqual(game.pause(), { ok: false, reason: 'invalid-state' });
  assert.equal(game.resume().ok, true);

  // PLAYING → MENU（放弃当前局），MENU ⇄ LEADERBOARD
  assert.equal(game.goToMenu().ok, true);
  assert.equal(snapshot(game).state, 'menu');
  assert.equal(game.openLeaderboard().ok, true);
  assert.equal(snapshot(game).state, 'leaderboard');
  assert.equal(game.openLeaderboard().ok, false);
  assert.equal(game.closeLeaderboard().ok, true);
  assert.equal(snapshot(game).state, 'menu');
});

test('边界 E1–E5：LOCKED 连点/双击同张/点已配对/暂停中点牌/结算点棋盘', function () {
  const { game, timer } = setup();
  game.start();
  const ids = cards(game).map(function (card) { return card.id; });

  // E1 LOCKED 连点：全部忽略、不排队
  game.flip(ids[0]);
  game.flip(ids[1]);
  for (let index = 2; index < 5; index += 1) {
    assert.equal(game.flip(ids[index]).reason, 'locked');
  }
  assert.equal(snapshot(game).flipCount, 2);

  // E2 双击同一张：幂等
  timer.advance(0); // 判定执行
  timer.advance(800);
  const back = backCards(game)[0];
  assert.equal(game.flip(back.id).ok, true);
  assert.equal(game.flip(back.id).reason, 'card-face-up');

  // E4 暂停中点牌
  game.pause();
  const anotherBack = backCards(game)[0];
  assert.equal(game.flip(anotherBack.id).reason, 'paused');
  game.resume();

  // E5 结算点棋盘
  const resultCase = setup();
  resultCase.game.start();
  playAllPairs(resultCase.game, resultCase.timer);
  assert.equal(snapshot(resultCase.game).state, 'result');
  assert.equal(resultCase.game.flip(0).reason, 'not-playing');
});
