'use strict';

/**
 * 牌组生成与洗牌：AC-13（洗牌公平性/可复现）、AC-14（符号唯一性）
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const deckModule = require('../src/core/deck.js');
const { createSeededRng } = require('../src/core/rng.js');
const { SYMBOLS } = require('../src/core/config.js');


const ALL_PAIRS = [6, 8, 10, 18];

test('AC-13 同一种子两次生成牌组完全一致（可复现）', function () {
  for (const pairs of ALL_PAIRS) {
    const first = deckModule.createDeck({ pairs: pairs, rng: createSeededRng(42) });
    const second = deckModule.createDeck({ pairs: pairs, rng: createSeededRng(42) });
    assert.deepStrictEqual(first, second, 'pairs=' + pairs + ' 同 seed 两次结果必须完全一致');
  }
});

test('AC-13 牌数 = 2×pairs，每个符号恰好出现 2 次', function () {
  for (const pairs of ALL_PAIRS) {
    const cards = deckModule.createDeck({ pairs: pairs, rng: createSeededRng(7) });
    assert.equal(cards.length, pairs * 2, 'pairs=' + pairs + ' 牌数必须为 2×pairs');
    const counts = new Map();
    for (const card of cards) {
      counts.set(card.symbolId, (counts.get(card.symbolId) || 0) + 1);
    }
    assert.equal(counts.size, pairs, 'pairs=' + pairs + ' 应使用 ' + pairs + ' 个互不相同的符号');
    for (const [symbolId, count] of counts) {
      assert.equal(count, 2, '符号 ' + symbolId + ' 必须恰好出现 2 次');
    }
  }
});

test('AC-13 牌结构完整：id 唯一且为 0..2n-1，pairId 成对且为 0..n-1', function () {
  for (const pairs of ALL_PAIRS) {
    const cards = deckModule.createDeck({ pairs: pairs, rng: createSeededRng(99) });
    assert.deepStrictEqual(
      cards.map(function (card) { return card.id; }).sort(function (a, b) { return a - b; }),
      Array.from({ length: pairs * 2 }, function (_, index) { return index; }),
      'id 必须是 0..2n-1 的排列（= 棋盘顺序/数组下标）'
    );
    const pairSizes = new Map();
    for (const card of cards) pairSizes.set(card.pairId, (pairSizes.get(card.pairId) || 0) + 1);
    assert.equal(pairSizes.size, pairs, 'pairId 数量应等于 pairs');
    for (const [pairId, size] of pairSizes) {
      assert.equal(size, 2, 'pairId=' + pairId + ' 必须恰好 2 张');
    }
    // 同一 pair 的两张牌符号相同；不同 pair 的符号不同
    const symbolByPair = new Map();
    for (const card of cards) {
      if (symbolByPair.has(card.pairId)) {
        assert.equal(symbolByPair.get(card.pairId), card.symbolId, '同一 pair 的两张牌符号必须相同');
      } else {
        symbolByPair.set(card.pairId, card.symbolId);
      }
    }
    assert.equal(new Set(symbolByPair.values()).size, pairs, '不同 pair 的符号必须互不相同');
  }
});

test('AC-13 不同种子产生不同牌序（随机源确实生效）', function () {
  const first = deckModule.createDeck({ pairs: 8, rng: createSeededRng(1) });
  const second = deckModule.createDeck({ pairs: 8, rng: createSeededRng(2) });
  assert.notDeepStrictEqual(first, second, '不同 seed 不应产生完全相同的牌序');
});

test('AC-13 洗牌覆盖全部位置（多副牌不总是同一顺序）', function () {
  const orders = new Set();
  for (let seed = 1; seed <= 20; seed += 1) {
    const cards = deckModule.createDeck({ pairs: 6, rng: createSeededRng(seed) });
    orders.add(cards.map(function (card) { return card.pairId; }).join(','));
  }
  assert.ok(orders.size > 1, '20 个不同 seed 应产生多种牌序');
});

test('AC-14 D4（18 对）使用 18 个互不相同的符号，符号池容量 ≥18', function () {
  const cards = deckModule.createDeck({ pairs: 18, rng: createSeededRng(2026) });
  const usedSymbols = new Set(cards.map(function (card) { return card.symbolId; }));
  assert.equal(usedSymbols.size, 18, 'D4 必须使用 18 个互不相同的符号');

  const pool = SYMBOLS;
  assert.ok(pool.length >= 18, '符号池容量必须 ≥18，实际 ' + pool.length);
  const poolIds = new Set(pool.map(function (symbol) { return symbol.id; }));
  for (const symbolId of usedSymbols) {
    assert.ok(poolIds.has(symbolId), '牌组符号 ' + symbolId + ' 必须存在于 SYMBOLS 表中（渲染层查表用）');
  }
});

test('AC-14 符号池为 24 个且 id 唯一（SPEC §6.3）', function () {
  const pool = SYMBOLS;
  assert.equal(pool.length, 24, '符号池必须为 24 个');
  assert.equal(new Set(pool.map(function (symbol) { return symbol.id; })).size, 24, '符号 id 必须唯一');
  for (const symbol of pool) {
    assert.equal(typeof symbol.id, 'string');
    assert.ok(symbol.id.length > 0);
    assert.ok(typeof symbol.emoji === 'string' && symbol.emoji.length > 0, symbol.id + ' 缺少 emoji');
    assert.ok(typeof symbol.name === 'string' && symbol.name.length > 0, symbol.id + ' 缺少中文名');
  }
});

test('边界：pairs > 符号池容量抛 RangeError（logic.md §5.4）', function () {
  const pool = SYMBOLS;
  assert.throws(function () {
    deckModule.createDeck({ pairs: pool.length + 1, rng: createSeededRng(1) });
  }, RangeError);
});
