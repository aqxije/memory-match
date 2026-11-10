'use strict';

/**
 * 计时器抽象与时间语义：AC-37（+ 假时钟契约、judgeDelayMs/tick/泄漏断言）
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createTimer } = require('../src/core/timer.js');
const { createFakeTimer } = require('./helpers/fake-clock.js');
const {
  setup,
  snapshot,
  cards,
  backCards,
  unmatchedPairs,
  playNextPair,
  playMismatch,
  playAllPairs,
} = require('./helpers/harness.js');
const { createRecorder } = require('./helpers/recorder.js');

test('假时钟契约（logic.md §4.3）：advance 按 at 升序执行、advance(0) 执行 0ms 任务、clearTimeout 生效', function () {
  const timer = createFakeTimer();
  const order = [];

  assert.equal(timer.now(), 0);
  timer.setTimeout(function () { order.push('late'); }, 100);
  timer.setTimeout(function () { order.push('early'); }, 10);
  timer.setTimeout(function () { order.push('zero'); }, 0);

  assert.equal(timer.pendingCount(), 3);
  timer.advance(0);
  assert.deepStrictEqual(order, ['zero'], 'advance(0) 必须执行 at<=now 的 0ms 任务');
  assert.equal(timer.pendingCount(), 2);

  timer.advance(10);
  assert.deepStrictEqual(order, ['zero', 'early']);
  timer.advance(90);
  assert.deepStrictEqual(order, ['zero', 'early', 'late']);
  assert.equal(timer.pendingCount(), 0);

  const cancelled = timer.setTimeout(function () { order.push('cancelled'); }, 5);
  timer.clearTimeout(cancelled);
  timer.advance(10);
  assert.deepStrictEqual(order, ['zero', 'early', 'late']);
  assert.equal(timer.pendingCount(), 0);

  // 回调内再调度同刻任务也会被执行
  timer.setTimeout(function () {
    order.push('outer');
    timer.setTimeout(function () { order.push('inner'); }, 0);
  }, 0);
  timer.advance(0);
  assert.deepStrictEqual(order, ['zero', 'early', 'late', 'outer', 'inner']);
});

test('timer.js createTimer：注入 now/setTimeout/clearTimeout 后完全可控', function () {
  const fake = createFakeTimer();
  const timer = createTimer({ now: fake.now, setTimeout: fake.setTimeout, clearTimeout: fake.clearTimeout });

  assert.equal(timer.now(), 0);
  let fired = 0;
  timer.setTimeout(function () { fired += 1; }, 100);
  fake.advance(99);
  assert.equal(fired, 0);
  fake.advance(1);
  assert.equal(fired, 1);
  assert.equal(timer.pendingCount(), 0);

  const id = timer.setTimeout(function () { fired += 1; }, 50);
  timer.clearTimeout(id);
  fake.advance(100);
  assert.equal(fired, 1, 'clearTimeout 后不得触发');
  assert.equal(timer.pendingCount(), 0);
});

test('AC-37 暂停不计时：暂停 10 秒后恢复，用时不含这 10 秒（误差 ≤100ms）', function () {
  const { game, timer } = setup();
  game.start();
  game.flip(cards(game)[0].id);
  timer.advance(1000);

  const before = snapshot(game).elapsedMs;
  assert.ok(Math.abs(before - 1000) <= 100);

  assert.equal(game.pause().ok, true);
  timer.advance(10000); // 暂停 10 秒
  assert.equal(snapshot(game).elapsedMs, before, '暂停期间用时必须冻结');

  assert.equal(game.resume().ok, true);
  timer.advance(1000);
  const after = snapshot(game).elapsedMs;
  assert.ok(Math.abs(after - (before + 1000)) <= 100, '恢复后应继续累计，误差 ≤100ms');
  assert.ok(after < before + 10000, '暂停的 10 秒不得计入用时');
});

test('AC-37 多次暂停/恢复累计正确', function () {
  const { game, timer } = setup();
  game.start();
  game.flip(cards(game)[0].id);

  timer.advance(500);
  game.pause();
  timer.advance(5000);
  game.resume();
  timer.advance(500);
  game.pause();
  timer.advance(5000);
  game.resume();
  timer.advance(500);

  assert.ok(Math.abs(snapshot(game).elapsedMs - 1500) <= 100, '三次 500ms 有效用时，暂停不计');
});

test('judgeDelayMs 可配置：二翻后按延迟调度判定（100ms 时 99ms 未判定、100ms 判定）', function () {
  const { game, timer } = setup({ gameOptions: { judgeDelayMs: 100 } });
  game.start();
  const pair = unmatchedPairs(game)[0];

  game.flip(pair[0].id);
  game.flip(pair[1].id);
  assert.equal(snapshot(game).phase, 'locked');
  assert.equal(snapshot(game).flipCount, 2);

  timer.advance(99);
  assert.equal(snapshot(game).phase, 'locked', '未到判定延迟不得判定');
  assert.equal(snapshot(game).flipCount, 2);

  timer.advance(1);
  assert.equal(snapshot(game).flipCount, 0, '到达判定延迟后判定执行');
  assert.equal(snapshot(game).phase, 'idle');
  assert.equal(snapshot(game).score, 100);
});

test('tick 事件：仅 playing 且计时中每 250ms 发一次，payload.elapsedMs 正确', function () {
  const { game, timer } = setup();
  const recorder = createRecorder(game);
  game.start();
  assert.equal(recorder.of('tick').length, 0, '未翻牌（计时未启动）不得 tick');

  game.flip(cards(game)[0].id);
  timer.advance(250);
  assert.equal(recorder.of('tick').length, 1);
  assert.equal(recorder.last('tick').elapsedMs, 250);

  // 逐 250ms 推进（假时钟按契约先 now+=ms 再执行到期任务，长跳会合并 tick）
  timer.advance(250);
  timer.advance(250);
  timer.advance(250);
  assert.equal(recorder.of('tick').length, 4);
  assert.equal(recorder.last('tick').elapsedMs, 1000);
});

test('tick 在暂停时取消、恢复后重启（渲染层零定时器约束）', function () {
  const { game, timer } = setup();
  const recorder = createRecorder(game);
  game.start();
  game.flip(cards(game)[0].id);
  timer.advance(250);
  const countBeforePause = recorder.of('tick').length;

  game.pause();
  timer.advance(1000);
  assert.equal(recorder.of('tick').length, countBeforePause, '暂停期间不得 tick');

  game.resume();
  timer.advance(250);
  assert.equal(recorder.of('tick').length, countBeforePause + 1, '恢复后 tick 重启');
});

test('定时器无泄漏：重开/换难度/回菜单/通关后 pendingCount===0（AC-38/61 逻辑面）', function () {
  const { game, timer } = setup();
  game.start();
  game.flip(cards(game)[0].id);
  timer.advance(100);
  assert.ok(timer.pendingCount() > 0, 'playing 中应有 tick 定时器');

  game.pause();
  assert.equal(timer.pendingCount(), 0, '暂停后不得有挂起定时器');
  game.resume();
  assert.ok(timer.pendingCount() > 0);

  game.restart();
  assert.equal(timer.pendingCount(), 0, '重开后不得有挂起定时器');

  game.flip(cards(game)[0].id);
  timer.advance(100);
  game.switchDifficulty('hard');
  assert.equal(timer.pendingCount(), 0, '换难度后不得有挂起定时器');

  game.flip(cards(game)[0].id);
  timer.advance(100);
  game.goToMenu();
  assert.equal(timer.pendingCount(), 0, '回菜单后不得有挂起定时器');

  game.start();
  playAllPairs(game, timer);
  assert.equal(snapshot(game).state, 'result');
  assert.equal(timer.pendingCount(), 0, '通关后不得有挂起定时器');
});

test('活跃逻辑定时器 ≤3（logic.md §13.3 不变量 8）', function () {
  const { game, timer } = setup();
  game.start();
  assert.equal(timer.pendingCount(), 0);

  game.flip(cards(game)[0].id);
  assert.ok(timer.pendingCount() <= 3);

  game.flip(backCards(game)[0].id);
  assert.ok(timer.pendingCount() <= 3, '二翻后 judge+tick 最多 2 个');

  timer.advance(0); // 判定
  timer.advance(800); // 错配翻回
  assert.ok(timer.pendingCount() <= 3);
});
