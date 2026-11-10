'use strict';

/**
 * 计分与连击：AC-15/16/17/18/19
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { computeMatchScore } = require('../src/core/scoring.js');
const {
  setup,
  snapshot,
  playNextPair,
  playMismatch,
  playAllPairs,
  expectedFullComboScore,
} = require('./helpers/harness.js');
const { createRecorder } = require('./helpers/recorder.js');

test('AC-15 基础分：连击 0 时配对成功 → 分数 +100、连击 = 1', function () {
  const { game, timer } = setup();
  game.start();
  assert.equal(snapshot(game).score, 0);
  assert.equal(snapshot(game).combo, 0);

  playNextPair(game, timer);

  const after = snapshot(game);
  assert.equal(after.score, 100, '首次配对得分必须为 100');
  assert.equal(after.combo, 1, '首次配对后连击必须为 1');
  assert.equal(after.moves, 1);
});

test('AC-16 连击加成：第 n 次连续成功 = 100 + 50×min(n−1,4)', function () {
  const expected = { 1: 100, 2: 150, 3: 200, 4: 250, 5: 300, 6: 300, 10: 300 };
  for (const [combo, score] of Object.entries(expected)) {
    assert.equal(computeMatchScore(Number(combo)), score, 'computeMatchScore(' + combo + ')');
  }
});

test('AC-16 连续 6 次配对：单次得分依次 100/150/200/250/300/300', function () {
  const { game, timer } = setup();
  game.start();
  const expectedDeltas = [100, 150, 200, 250, 300, 300];
  const expectedTotals = [100, 250, 450, 700, 1000, 1300];

  for (let index = 0; index < expectedDeltas.length; index += 1) {
    const before = snapshot(game).score;
    playNextPair(game, timer);
    const after = snapshot(game);
    assert.equal(after.score - before, expectedDeltas[index], '第 ' + (index + 1) + ' 次配对得分');
    assert.equal(after.score, expectedTotals[index], '第 ' + (index + 1) + ' 次配对后总分');
    assert.equal(after.combo, index + 1);
  }
});

test('AC-17 连击中断：连击 3 时错配 → 连击 0、分数不变；下次成功按 n=1 计', function () {
  const { game, timer } = setup();
  game.start();

  playNextPair(game, timer);
  playNextPair(game, timer);
  playNextPair(game, timer);
  assert.equal(snapshot(game).combo, 3);
  assert.equal(snapshot(game).score, 450);

  playMismatch(game, timer);
  const afterMismatch = snapshot(game);
  assert.equal(afterMismatch.combo, 0, '错配后连击必须归 0');
  assert.equal(afterMismatch.score, 450, '错配不得扣分');
  assert.equal(afterMismatch.moves, 4, '错配也计 1 步');

  timer.advance(800); // 错配翻回
  playNextPair(game, timer);
  const afterSuccess = snapshot(game);
  assert.equal(afterSuccess.combo, 1, '中断后下一次成功按 n=1 计');
  assert.equal(afterSuccess.score, 550, '中断后下一次成功 +100');
});

test('AC-18 暂停不打断连击：连击 2 → 暂停/恢复 → 继续成功配对 → 连击 3', function () {
  const { game, timer } = setup();
  game.start();

  playNextPair(game, timer);
  playNextPair(game, timer);
  assert.equal(snapshot(game).combo, 2);

  assert.equal(game.pause().ok, true);
  timer.advance(10000);
  assert.equal(game.resume().ok, true);

  const before = snapshot(game).score;
  playNextPair(game, timer);
  const after = snapshot(game);
  assert.equal(after.combo, 3, '暂停不得打断连击');
  assert.equal(after.score - before, 200, '第 3 次连击得分应为 200');
});

test('AC-19 总分一致：总分 = 各次成功配对得分之和，且与结算一致', function () {
  const { game, timer } = setup();
  const recorder = createRecorder(game);
  game.start();

  const pairsTotal = snapshot(game).pairsTotal;
  playAllPairs(game, timer);

  const finalSnapshot = snapshot(game);
  assert.equal(finalSnapshot.state, 'result');

  const matchEvents = recorder.of('match');
  assert.equal(matchEvents.length, pairsTotal, '应产生 pairsTotal 次 match 事件');
  const sumOfDeltas = matchEvents.reduce(function (sum, payload) {
    return sum + payload.scoreDelta;
  }, 0);

  assert.equal(sumOfDeltas, finalSnapshot.score, '总分必须等于各次 scoreDelta 之和');
  assert.equal(finalSnapshot.score, expectedFullComboScore(pairsTotal), '全连击总分应等于理论满分');
  assert.equal(finalSnapshot.score, 1300, 'easy 理论满分为 1300（SPEC §6.5）');

  // 结算数据与局内状态一致（AC-12 的计分面）
  const won = recorder.last('won');
  assert.equal(won.score, finalSnapshot.score);
  assert.equal(won.moves, finalSnapshot.moves);
  assert.equal(won.timeMs, finalSnapshot.timeMs);
  assert.equal(won.stars, finalSnapshot.stars);
});

test('AC-17 错配后续连击从 1 重新累计（两次错配不累积）', function () {
  const { game, timer } = setup();
  game.start();

  playNextPair(game, timer); // combo 1
  playMismatch(game, timer);
  timer.advance(800);
  assert.equal(snapshot(game).combo, 0);

  playNextPair(game, timer); // combo 1
  playMismatch(game, timer);
  timer.advance(800);
  assert.equal(snapshot(game).combo, 0);
  assert.equal(snapshot(game).score, 200, '两次成功各 +100，错配不扣分');
});
