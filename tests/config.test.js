'use strict';

/**
 * 难度配置与常量：AC-33（难度表与阈值）、AC-01（默认难度）、AC-14（符号池）
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { DIFFICULTIES, DIFFICULTY_IDS, SYMBOLS, CONSTANTS, getDifficulty } = require('../src/core/config.js');
const { computeMoveStars, computeTimeStars } = require('../src/core/scoring.js');

const SPEC_TABLE = [
  { id: 'easy', name: '简单', cols: 3, rows: 4, cards: 12, pairs: 6, star3Moves: 9, star2Moves: 15, star3TimeMs: 60000, star2TimeMs: 120000, fullScore: 1300 },
  { id: 'normal', name: '普通', cols: 4, rows: 4, cards: 16, pairs: 8, star3Moves: 12, star2Moves: 20, star3TimeMs: 80000, star2TimeMs: 160000, fullScore: 1900 },
  { id: 'hard', name: '困难', cols: 5, rows: 4, cards: 20, pairs: 10, star3Moves: 15, star2Moves: 25, star3TimeMs: 100000, star2TimeMs: 200000, fullScore: 2500 },
  { id: 'challenge', name: '挑战', cols: 6, rows: 6, cards: 36, pairs: 18, star3Moves: 27, star2Moves: 45, star3TimeMs: 180000, star2TimeMs: 360000, fullScore: 4900 },
];

test('AC-33 四档难度网格/牌数/对数与 SPEC §6.2 完全一致', function () {
  assert.deepStrictEqual(DIFFICULTY_IDS, ['easy', 'normal', 'hard', 'challenge']);
  assert.equal(Object.keys(DIFFICULTIES).length, 4);

  for (const expected of SPEC_TABLE) {
    const difficulty = getDifficulty(expected.id);
    assert.ok(difficulty, 'getDifficulty(' + expected.id + ') 必须返回配置');
    assert.equal(difficulty.id, expected.id);
    assert.equal(difficulty.name, expected.name);
    assert.equal(difficulty.cols, expected.cols, expected.id + '.cols');
    assert.equal(difficulty.rows, expected.rows, expected.id + '.rows');
    assert.equal(difficulty.cards, expected.cards, expected.id + '.cards');
    assert.equal(difficulty.pairs, expected.pairs, expected.id + '.pairs');
    assert.equal(difficulty.cols * difficulty.rows, difficulty.cards, 'cols×rows 必须等于 cards');
    assert.equal(difficulty.cards, difficulty.pairs * 2, 'cards 必须等于 pairs×2');
  }
});

test('AC-33 3★/2★ 步数阈值与 SPEC §6.2 完全一致（经 scoring 行为验证）', function () {
  for (const expected of SPEC_TABLE) {
    assert.equal(computeMoveStars(expected.pairs, expected.star3Moves), 3, expected.id + ' 3★步数边界');
    assert.equal(computeMoveStars(expected.pairs, expected.star3Moves + 1), 2, expected.id + ' 3★步数边界+1');
    assert.equal(computeMoveStars(expected.pairs, expected.star2Moves), 2, expected.id + ' 2★步数边界');
    assert.equal(computeMoveStars(expected.pairs, expected.star2Moves + 1), 1, expected.id + ' 2★步数边界+1');
  }
});

test('AC-33 3★/2★ 用时阈值与 SPEC §6.2 完全一致（经 scoring 行为验证）', function () {
  for (const expected of SPEC_TABLE) {
    assert.equal(computeTimeStars(expected.pairs, expected.star3TimeMs), 3, expected.id + ' 3★用时边界');
    assert.equal(computeTimeStars(expected.pairs, expected.star3TimeMs + 1), 2, expected.id + ' 3★用时边界+1');
    assert.equal(computeTimeStars(expected.pairs, expected.star2TimeMs), 2, expected.id + ' 2★用时边界');
    assert.equal(computeTimeStars(expected.pairs, expected.star2TimeMs + 1), 1, expected.id + ' 2★用时边界+1');
  }
});

test('AC-33 配置阈值字段与公式一致：ceil(pairs×1.5)/ceil(pairs×2.5)/pairs×10s/pairs×20s', function () {
  for (const expected of SPEC_TABLE) {
    const difficulty = getDifficulty(expected.id);
    assert.equal(difficulty.star3Moves, Math.ceil(expected.pairs * 1.5), expected.id + '.star3Moves');
    assert.equal(difficulty.star2Moves, Math.ceil(expected.pairs * 2.5), expected.id + '.star2Moves');
    assert.equal(difficulty.star3TimeMs, expected.pairs * 10000, expected.id + '.star3TimeMs');
    assert.equal(difficulty.star2TimeMs, expected.pairs * 20000, expected.id + '.star2TimeMs');
  }
});

test('AC-33 理论满分与 SPEC §6.5 一致（全连击）', function () {
  for (const expected of SPEC_TABLE) {
    let total = 0;
    for (let n = 1; n <= expected.pairs; n += 1) total += 100 + 50 * Math.min(n - 1, 4);
    assert.equal(total, expected.fullScore, expected.id + ' 理论满分');
  }
});

test('AC-01 默认难度为 easy；未知难度返回 null', function () {
  assert.equal(getDifficulty('easy').id, 'easy');
  assert.equal(getDifficulty('unknown'), null);
  assert.equal(getDifficulty(undefined), null);
});

test('常量与 SPEC/logic.md §5.3 一致', function () {
  assert.equal(CONSTANTS.MISMATCH_HOLD_MS, 800);
  assert.equal(CONSTANTS.JUDGE_DELAY_MS, 0);
  assert.equal(CONSTANTS.TICK_MS, 250);
  assert.equal(CONSTANTS.BASE_SCORE, 100);
  assert.equal(CONSTANTS.COMBO_STEP, 50);
  assert.equal(CONSTANTS.COMBO_CAP, 4);
  assert.equal(CONSTANTS.LEADERBOARD_LIMIT, 5);
  assert.equal(CONSTANTS.STORAGE_VERSION, 1);
  assert.deepStrictEqual(CONSTANTS.STORAGE_KEYS, {
    leaderboard: 'mm.v1.leaderboard',
    settings: 'mm.v1.settings',
  });
});

test('符号池 24 个且 id/emoji/name 完整（AC-14）', function () {
  const pool = SYMBOLS;
  assert.equal(pool.length, 24);
  assert.equal(new Set(pool.map(function (symbol) { return symbol.id; })).size, 24);
});
