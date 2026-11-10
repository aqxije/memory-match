'use strict';

/**
 * 纯视图模型单测（I-08/Q-27）：src/render-model.js
 * 契约来源：render.md §4.2 computeLayout（含 T10 新增 limits.boardPad=2）、§13.6 buildViewModel
 * 说明：本文件不依赖 DOM；buildViewModel(snapshot, env)，config 由模块内部读取。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const RM = require('../src/render-model.js');
const Config = require('../src/core/config.js');
const { setup, snapshot, cards, playNextPair, playAllPairs, unmatchedPairs } = require('./helpers/harness.js');

const DEFAULT_CHROME = { hudH: 76, footerH: 56, pagePadY: 6 };

function layoutFor(viewport, grid, extra) {
  return RM.computeLayout(
    Object.assign(
      {
        viewport: viewport,
        safeInsets: { top: 0, right: 0, bottom: 0, left: 0 },
        chrome: DEFAULT_CHROME,
        grid: grid,
      },
      extra || {}
    )
  );
}

function approx(actual, expected, epsilon, label) {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    (label || '') + ' 期望 ≈' + expected + '，实际 ' + actual
  );
}

// ---------------------------------------------------------------------------
// computeLayout（AC-47/48 关键算法）
// ---------------------------------------------------------------------------

test('computeLayout 360×640 D4(6×6)：cardSize≥44、boardW≤348、fitsViewport=true（AC-47）', function () {
  const layout = layoutFor({ w: 360, h: 640 }, { cols: 6, rows: 6 });

  assert.equal(layout.cols, 6);
  assert.equal(layout.rows, 6);
  approx(layout.padX, 6, 0.001, 'padX');
  approx(layout.gap, 5.22, 0.001, 'gap');
  approx(layout.cardSize, 52.983, 0.01, 'cardSize');
  assert.ok(layout.cardSize >= 44, '360×640 D4 卡片必须 ≥44px（AC-47）');
  assert.ok(layout.cardSize <= 96, 'cardSize 不得超过 maxCard');
  approx(layout.boardW, 348, 0.01, 'boardW');
  approx(layout.boardH, 348, 0.01, 'boardH');
  assert.ok(layout.boardW <= 348, 'boardW 不得超过 availW=348（无横向滚动）');
  assert.equal(layout.fitsViewport, true, '360×640 D4 必须 fitsViewport');
  assert.equal(layout.needsScroll, false);
});

test('computeLayout 320×568 D4：cardSize≥44、boardW≤308、fitsViewport=true', function () {
  const layout = layoutFor({ w: 320, h: 568 }, { cols: 6, rows: 6 });

  approx(layout.cardSize, 46.8167, 0.01, 'cardSize');
  assert.ok(layout.cardSize >= 44, '320×568 D4 卡片必须 ≥44px');
  approx(layout.boardW, 308, 0.01, 'boardW');
  assert.ok(layout.boardW <= 308);
  assert.equal(layout.fitsViewport, true);
  assert.equal(layout.needsScroll, false);
});

test('computeLayout 360×640 D1(3×4)：cardSize 封顶 96、fitsViewport=true', function () {
  const layout = layoutFor({ w: 360, h: 640 }, { cols: 3, rows: 4 });

  assert.equal(layout.cardSize, 96, 'D1 在 360 宽下应封顶 96px');
  approx(layout.boardW, 302.44, 0.01, 'boardW');
  assert.ok(layout.boardW <= 348);
  assert.equal(layout.fitsViewport, true);
});

test('computeLayout 1280×800 D4：cardSize≤96、boardW≤720、fitsViewport=true（AC-48）', function () {
  const layout = RM.computeLayout({
    viewport: { w: 1280, h: 800 },
    safeInsets: { top: 0, right: 0, bottom: 0, left: 0 },
    chrome: { hudH: 76, footerH: 56, pagePadY: 12 },
    grid: { cols: 6, rows: 6 },
  });

  assert.equal(layout.cardSize, 96, '桌面 D4 卡片应封顶 96px（AC-48）');
  assert.ok(layout.cardSize <= 96);
  approx(layout.boardW, 628.3, 0.05, 'boardW');
  assert.ok(layout.boardW <= 720, 'boardW 必须 ≤720px（AC-48）');
  assert.equal(layout.fitsViewport, true);
});

test('computeLayout 1920×1080 D4：boardW 受 boardMaxW=720 约束、居中不溢出', function () {
  const layout = layoutFor({ w: 1920, h: 1080 }, { cols: 6, rows: 6 });
  assert.equal(layout.cardSize, 96);
  assert.ok(layout.boardW <= 720, 'boardW 必须 ≤720px');
  assert.equal(layout.fitsViewport, true);
});

test('computeLayout 640×360 横屏 D4：cardSize 保底 44、needsScroll=true（允许纵向滚动）', function () {
  const layout = layoutFor({ w: 640, h: 360 }, { cols: 6, rows: 6 });

  assert.equal(layout.cardSize, 44, '横屏高度不足时卡片保底 44px，不压到 44 以下');
  assert.equal(layout.fitsViewport, false);
  assert.equal(layout.needsScroll, true);
  assert.ok(layout.boardW <= 640, '不得产生横向溢出');
});

test('computeLayout 极窄 280×500 D4：cardSize 保底 44、needsScroll=true、不抛异常', function () {
  const layout = layoutFor({ w: 280, h: 500 }, { cols: 6, rows: 6 });
  assert.equal(layout.cardSize, 44);
  assert.equal(layout.needsScroll, true);
});

test('computeLayout 安全区参与可用宽高：safeInsets top/bottom 后仍 ≥44 且 fitsViewport', function () {
  const layout = RM.computeLayout({
    viewport: { w: 360, h: 640 },
    safeInsets: { top: 44, right: 0, bottom: 34, left: 0 },
    chrome: DEFAULT_CHROME,
    grid: { cols: 6, rows: 6 },
  });
  assert.ok(layout.cardSize >= 44, '安全区占用后卡片仍须 ≥44px');
  assert.equal(layout.fitsViewport, true);
});

test('computeLayout 空输入使用默认值（360×640 / 4×4）且数值有限', function () {
  const layout = RM.computeLayout();
  assert.equal(layout.cols, 4);
  assert.equal(layout.rows, 4);
  for (const field of ['padX', 'gap', 'cardSize', 'boardW', 'boardH']) {
    assert.equal(Number.isFinite(layout[field]), true, field + ' 必须为有限数');
  }
  assert.ok(layout.cardSize >= 44 && layout.cardSize <= 96);
  assert.equal(typeof layout.fitsViewport, 'boolean');
  assert.equal(typeof layout.needsScroll, 'boolean');
});

test('computeLayout 可用宽高为负时 cardSize 仍保底 44、不抛异常', function () {
  const layout = RM.computeLayout({
    viewport: { w: 100, h: 100 },
    chrome: DEFAULT_CHROME,
    grid: { cols: 6, rows: 6 },
  });
  assert.equal(layout.cardSize, 44);
  assert.equal(layout.needsScroll, true);
});

test('computeLayout limits.boardPad 默认 2，且显式传 0 会改变卡片尺寸（Q-05 修复口径）', function () {
  const withDefault = layoutFor({ w: 360, h: 640 }, { cols: 6, rows: 6 });
  const explicitTwo = layoutFor({ w: 360, h: 640 }, { cols: 6, rows: 6 }, { limits: { boardPad: 2 } });
  const zeroPad = layoutFor({ w: 360, h: 640 }, { cols: 6, rows: 6 }, { limits: { boardPad: 0 } });

  approx(explicitTwo.cardSize, withDefault.cardSize, 1e-9, '默认 boardPad 应为 2');
  assert.ok(zeroPad.cardSize > withDefault.cardSize, 'boardPad=0 时卡片应更大（2px padding 不再计入）');
  approx(zeroPad.cardSize, 53.65, 0.01, 'boardPad=0 cardSize');
  assert.ok(withDefault.boardW <= 348, '默认 boardPad=2 时 boardW 不得溢出 availW');
});

test('computeLayout 自定义 limits（minCard/maxCard/boardMaxW）生效', function () {
  const layout = layoutFor({ w: 360, h: 640 }, { cols: 3, rows: 4 }, {
    limits: { minCard: 40, maxCard: 80, boardMaxW: 200 },
  });
  assert.ok(layout.cardSize <= 80, 'maxCard 应生效');
  assert.ok(layout.boardW <= 200, 'boardMaxW 应生效');
});

// ---------------------------------------------------------------------------
// buildViewModel（卡片 aria/disabled/HUD 文案）
// ---------------------------------------------------------------------------

function buildVM(game, env) {
  return RM.buildViewModel(snapshot(game), env || {});
}

function symbolOf(symbolId) {
  return Config.SYMBOLS.find(function (symbol) { return symbol.id === symbolId; });
}

test('buildViewModel 初始 playing：screen/layout/HUD 文案/cards 字段完整', function () {
  const { game } = setup();
  game.start();
  const vm = buildVM(game, { viewport: { w: 360, h: 640 } });

  assert.equal(vm.screen, 'playing');
  assert.equal(vm.layout.cols, 3);
  assert.equal(vm.layout.rows, 4);
  assert.equal(vm.hud.difficultyLabel, '简单');
  assert.equal(vm.hud.score, 0);
  assert.equal(vm.hud.combo, 0);
  assert.equal(vm.hud.moves, 0);
  assert.equal(vm.hud.timeText, '0:00');
  assert.equal(vm.hud.bestText, '最佳 0 分');
  assert.equal(vm.hud.progressText, '进度 0/6');
  assert.equal(vm.hud.muted, false, 'hud.muted 必须存在（T10 新增）');
  assert.equal(vm.overlay, null);
  assert.equal(vm.liveText, '');

  assert.equal(vm.cards.length, 12);
  vm.cards.forEach(function (viewCard, index) {
    const sourceCard = snapshot(game).cards[index];
    assert.equal(viewCard.id, sourceCard.id);
    assert.equal(viewCard.index, index);
    assert.equal(viewCard.faceUp, false);
    assert.equal(viewCard.matched, false);
    assert.equal(viewCard.disabled, false);
    assert.equal(viewCard.symbolId, sourceCard.symbolId);
    const symbol = symbolOf(sourceCard.symbolId);
    assert.equal(viewCard.emoji, symbol.emoji);
    assert.equal(viewCard.name, symbol.name);
    assert.equal(viewCard.ariaLabel, '未翻开的卡片');
    assert.equal(viewCard.ariaPressed, false);
    assert.equal(viewCard.tabIndex, 0);
    assert.equal(viewCard.labeled, vm.layout.cardSize >= 64, 'labeled 由 cardSize≥64 决定');
  });
});

test('buildViewModel 卡片 aria/disabled：翻开、已配对、LOCKED 三态', function () {
  const { game, timer } = setup();

  // 翻开 1 张
  game.start();
  const pair = unmatchedPairs(game)[0];
  game.flip(pair[0].id);
  let vm = buildVM(game, { viewport: { w: 360, h: 640 } });
  const flipped = vm.cards.find(function (card) { return card.id === pair[0].id; });
  assert.equal(flipped.faceUp, true);
  assert.equal(flipped.ariaPressed, true);
  assert.equal(flipped.disabled, false);
  assert.equal(flipped.ariaLabel, '已翻开，' + symbolOf(flipped.symbolId).name);

  // 二翻后 LOCKED：所有卡片 disabled=true（判定锁输入屏蔽）
  game.flip(pair[1].id);
  vm = buildVM(game, { viewport: { w: 360, h: 640 } });
  assert.equal(vm.cards.every(function (card) { return card.disabled === true; }), true, 'LOCKED 时所有卡片 disabled');

  // 判定成功后：已配对卡片 ariaLabel/disabled
  timer.advance(0);
  vm = buildVM(game, { viewport: { w: 360, h: 640 } });
  const matched = vm.cards.find(function (card) { return card.id === pair[0].id; });
  assert.equal(matched.matched, true);
  assert.equal(matched.disabled, true);
  assert.equal(matched.ariaLabel, '已配对，' + symbolOf(matched.symbolId).name);
});

test('buildViewModel HUD 随局内状态更新：score/combo/moves/timeText/bestText/progressText', function () {
  const { game, timer } = setup();
  game.start();
  playNextPair(game, timer);
  timer.advance(1000);
  const vm = buildVM(game, { viewport: { w: 360, h: 640 } });

  assert.equal(vm.hud.score, 100);
  assert.equal(vm.hud.combo, 1);
  assert.equal(vm.hud.moves, 1);
  assert.equal(vm.hud.timeText, '0:01');
  assert.equal(vm.hud.progressText, '进度 1/6');
  assert.equal(vm.hud.bestText, '最佳 0 分');
});

test('buildViewModel 最佳分文案来自快照 bestScore', function () {
  const { createLeaderboard } = require('../src/core/leaderboard.js');
  const { createFakeStorage } = require('./helpers/fake-storage.js');
  const fakeStorage = createFakeStorage();
  const leaderboard = createLeaderboard({ storage: fakeStorage });
  leaderboard.add('easy', {
    score: 1300, moves: 9, timeMs: 42000, stars: 3, completedAt: '2026-11-09T12:00:00.000Z',
  });

  const { game } = setup({ storage: fakeStorage });
  const vm = buildVM(game, { viewport: { w: 360, h: 640 } });
  assert.equal(vm.hud.bestText, '最佳 1300 分');
});

test('buildViewModel overlay 映射：playing→null、paused→pause、result→result、leaderboard→leaderboard', function () {
  const { game, timer } = setup();
  assert.equal(buildVM(game).overlay, null, 'menu 无覆盖层');

  game.start();
  assert.equal(buildVM(game).overlay, null, 'playing 无覆盖层');

  game.pause();
  assert.equal(buildVM(game).overlay, 'pause');
  game.resume();

  playAllPairs(game, timer);
  assert.equal(buildVM(game).screen, 'result');
  assert.equal(buildVM(game).overlay, 'result');

  const second = setup();
  second.game.openLeaderboard();
  assert.equal(buildVM(second.game).screen, 'leaderboard');
  assert.equal(buildVM(second.game).overlay, 'leaderboard');
});

test('buildViewModel muted 反映静音状态，liveText 透传 env.liveText', function () {
  const { game } = setup();
  game.start();
  game.toggleMute();
  const vm = buildVM(game, { viewport: { w: 360, h: 640 }, liveText: '已配对' });
  assert.equal(vm.hud.muted, true);
  assert.equal(vm.liveText, '已配对');
});

test('buildViewModel 桌面视口：layout 卡片 ≤96、boardW ≤720（AC-48 视图模型面）', function () {
  const { game } = setup();
  game.start();
  const vm = buildVM(game, { viewport: { w: 1280, h: 800 }, chrome: { hudH: 76, footerH: 56, pagePadY: 12 } });
  assert.ok(vm.layout.cardSize <= 96);
  assert.ok(vm.layout.boardW <= 720);
  assert.equal(vm.layout.fitsViewport, true);
});

// ---------------------------------------------------------------------------
// formatTime / getSymbol
// ---------------------------------------------------------------------------

test('formatTime：mm:ss（分钟不补零、秒补零）', function () {
  const cases = [
    [0, '0:00'],
    [999, '0:00'],
    [1000, '0:01'],
    [42000, '0:42'],
    [59000, '0:59'],
    [60000, '1:00'],
    [61000, '1:01'],
    [3599000, '59:59'],
    [3600000, '60:00'],
    [-1000, '0:00'],
    [undefined, '0:00'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(RM.formatTime(input), expected, 'formatTime(' + input + ')');
  }
});

test('getSymbol：已知 id 查表，未知 id 兜底不抛异常（E8）', function () {
  const dog = RM.getSymbol('dog');
  assert.equal(dog.id, 'dog');
  assert.equal(dog.emoji, '🐶');
  assert.equal(dog.name, '小狗');

  const unknown = RM.getSymbol('no-such-symbol');
  assert.equal(unknown.id, 'no-such-symbol');
  assert.equal(typeof unknown.emoji, 'string');
  assert.equal(unknown.emoji.length > 0, true, '未知符号必须有兜底 emoji（不出现空白卡片）');
  assert.equal(typeof unknown.name, 'string');
});
