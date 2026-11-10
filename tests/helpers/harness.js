'use strict';

/**
 * 测试装配与牌组操作辅助（按 logic.md §14.1 的 setup 写法扩展）
 */
const { createGame } = require('../../src/core/game.js');
const { createSeededRng } = require('../../src/core/rng.js');
const { createFakeTimer } = require('./fake-clock.js');
const { createFakeStorage } = require('./fake-storage.js');

const DEFAULT_SEED = 42;
const FIXED_WALL_NOW = Date.parse('2026-11-09T12:00:00.000Z');
const FIXED_ISO = '2026-11-09T12:00:00.000Z';

/**
 * 构造被测 game：假时钟 + 种子随机 + 假 storage + 固定 wallNow。
 * options: { storage, rng, seed, wallNow, timer, gameOptions }
 * - storage 传 null 表示"无 storage"（内存降级）
 * - gameOptions 覆盖 createGame 其余选项（judgeDelayMs/mismatchHoldMs/tickMs/config/onError）
 */
function setup(options) {
  const opts = options || {};
  const timer = opts.timer || createFakeTimer();
  const storage = opts.storage === undefined ? createFakeStorage() : opts.storage;
  const rng = opts.rng || createSeededRng(opts.seed == null ? DEFAULT_SEED : opts.seed);
  const game = createGame(
    Object.assign(
      {
        timer,
        rng,
        storage,
        wallNow: opts.wallNow || function () {
          return FIXED_WALL_NOW;
        },
      },
      opts.gameOptions || {}
    )
  );
  return { game, timer, storage, rng };
}

function snapshot(game) {
  return game.getSnapshot();
}

function cards(game) {
  return game.getSnapshot().cards;
}

function cardById(game, id) {
  return cards(game).find(function (card) {
    return card.id === id;
  });
}

function groupByPair(cardList) {
  const groups = new Map();
  for (const card of cardList) {
    if (!groups.has(card.pairId)) groups.set(card.pairId, []);
    groups.get(card.pairId).push(card);
  }
  return Array.from(groups.values());
}

/** 尚未配对的成对牌组（每项长度 2） */
function unmatchedPairs(game) {
  return groupByPair(
    cards(game).filter(function (card) {
      return !card.matched;
    })
  ).filter(function (group) {
    return group.length === 2;
  });
}

/** 当前可翻的背面牌 */
function backCards(game) {
  return cards(game).filter(function (card) {
    return !card.faceUp && !card.matched;
  });
}

/** 取两张不同对的背面牌（用于构造错配） */
function findMismatch(game) {
  const pairs = unmatchedPairs(game);
  if (pairs.length < 2) throw new Error('findMismatch: 至少需要 2 个未配对组');
  return [pairs[0][0], pairs[1][0]];
}

/** 翻开一对并触发判定（advance(0) 执行 judgeDelayMs=0 的 judge） */
function flipPair(game, timer, pair) {
  const first = game.flip(pair[0].id);
  const second = game.flip(pair[1].id);
  timer.advance(0);
  return { first: first, second: second, cards: pair };
}

/** 翻开下一对未配对牌并触发判定 */
function playNextPair(game, timer) {
  const pairs = unmatchedPairs(game);
  if (!pairs.length) throw new Error('playNextPair: 没有可配对的牌');
  return flipPair(game, timer, pairs[0]);
}

/** 构造一次错配并触发判定（判定后 phase 仍 locked，需再 advance(mismatchHoldMs) 翻回） */
function playMismatch(game, timer) {
  const pair = findMismatch(game);
  const first = game.flip(pair[0].id);
  const second = game.flip(pair[1].id);
  timer.advance(0);
  return { first: first, second: second, cards: pair };
}

/** 连续配对直到通关（假定无错配）；gapMs 为每次配对之间的时间推进 */
function playAllPairs(game, timer, options) {
  const opts = options || {};
  const gapMs = opts.gapMs || 0;
  let guard = 0;
  while (game.getSnapshot().state === 'playing') {
    const pairs = unmatchedPairs(game);
    if (!pairs.length) break;
    flipPair(game, timer, pairs[0]);
    if (gapMs) timer.advance(gapMs);
    guard += 1;
    if (guard > 200) throw new Error('playAllPairs: 循环失控');
  }
}

/** 理论满分（全连击）：sum(computeMatchScore(n), n=1..pairs) */
function expectedFullComboScore(pairs) {
  let total = 0;
  for (let n = 1; n <= pairs; n += 1) total += 100 + 50 * Math.min(n - 1, 4);
  return total;
}

/** 一次性 require 全部 core 模块（AC-57 用） */
function requireCore() {
  return {
    rng: require('../../src/core/rng.js'),
    config: require('../../src/core/config.js'),
    deck: require('../../src/core/deck.js'),
    scoring: require('../../src/core/scoring.js'),
    timer: require('../../src/core/timer.js'),
    leaderboard: require('../../src/core/leaderboard.js'),
    settings: require('../../src/core/settings.js'),
    game: require('../../src/core/game.js'),
  };
}

module.exports = {
  DEFAULT_SEED: DEFAULT_SEED,
  FIXED_WALL_NOW: FIXED_WALL_NOW,
  FIXED_ISO: FIXED_ISO,
  setup: setup,
  snapshot: snapshot,
  cards: cards,
  cardById: cardById,
  groupByPair: groupByPair,
  unmatchedPairs: unmatchedPairs,
  backCards: backCards,
  findMismatch: findMismatch,
  flipPair: flipPair,
  playNextPair: playNextPair,
  playMismatch: playMismatch,
  playAllPairs: playAllPairs,
  expectedFullComboScore: expectedFullComboScore,
  requireCore: requireCore,
};
