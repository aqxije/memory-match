'use strict';

/**
 * 星级评定：AC-20/21/22/23（+ 边界与无 0 星）
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { computeStars, computeMoveStars, computeTimeStars } = require('../src/core/scoring.js');
const { setup, snapshot, playAllPairs } = require('./helpers/harness.js');

test('AC-20 三星边界：D2 pairs=8、moves=12、time=80s → 3 星', function () {
  assert.equal(computeStars({ pairs: 8, moves: 12, timeMs: 80000 }), 3);
  // 恰等于阈值仍为 3 星
  assert.equal(computeMoveStars(8, 12), 3);
  assert.equal(computeTimeStars(8, 80000), 3);
});

test('AC-21 二星边界：D2 pairs=8、moves=20、time=160s → 2 星', function () {
  assert.equal(computeStars({ pairs: 8, moves: 20, timeMs: 160000 }), 2);
  assert.equal(computeMoveStars(8, 20), 2);
  assert.equal(computeTimeStars(8, 160000), 2);
});

test('AC-22 一星保底：D1 pairs=6、moves=40、time=600s → 1 星，无 0 星/失败态', function () {
  assert.equal(computeStars({ pairs: 6, moves: 40, timeMs: 600000 }), 1);
  // 极端值仍为 1 星（下限 1，不存在 0 星）
  assert.equal(computeStars({ pairs: 6, moves: 1000, timeMs: 10000000 }), 1);
  assert.equal(computeStars({ pairs: 18, moves: 9999, timeMs: 99999999 }), 1);
});

test('AC-23 取较低星：D1 moves=9（3★步数）、time=90s（2★用时）→ 2 星', function () {
  assert.equal(computeStars({ pairs: 6, moves: 9, timeMs: 90000 }), 2);
  // 对称情形：步数 2★、用时 3★ → 仍取 2 星
  assert.equal(computeStars({ pairs: 6, moves: 10, timeMs: 60000 }), 2);
});

test('AC-20/21 边界外一条即降星（严格按 SPEC §6.2 阈值）', function () {
  assert.equal(computeStars({ pairs: 8, moves: 13, timeMs: 80000 }), 2, 'moves 超 3★ 阈值');
  assert.equal(computeStars({ pairs: 8, moves: 12, timeMs: 80001 }), 2, 'time 超 3★ 阈值');
  assert.equal(computeStars({ pairs: 8, moves: 21, timeMs: 160000 }), 1, 'moves 超 2★ 阈值');
  assert.equal(computeStars({ pairs: 8, moves: 20, timeMs: 160001 }), 1, 'time 超 2★ 阈值');
});

test('AC-20~23 集成：结算 stars 与 computeStars 一致（3★/2★/1★ 三档）', function () {
  const cases = [
    { gapMs: 0, expectedStars: 3 },
    { gapMs: 13000, expectedStars: 2 },
    { gapMs: 61000, expectedStars: 1 },
  ];

  for (const testCase of cases) {
    const { game, timer } = setup();
    game.start(); // easy：pairs=6，moves=6（全连击）
    playAllPairs(game, timer, { gapMs: testCase.gapMs });

    const finalSnapshot = snapshot(game);
    assert.equal(finalSnapshot.state, 'result');
    const expected = computeStars({
      pairs: finalSnapshot.pairsTotal,
      moves: finalSnapshot.moves,
      timeMs: finalSnapshot.timeMs,
    });
    assert.equal(finalSnapshot.stars, expected, 'gapMs=' + testCase.gapMs + ' 结算星级必须与公式一致');
    assert.equal(finalSnapshot.stars, testCase.expectedStars, 'gapMs=' + testCase.gapMs + ' 预期星级');
    assert.ok([1, 2, 3].includes(finalSnapshot.stars), '星级必须 ∈ {1,2,3}');
  }
});
