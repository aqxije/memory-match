'use strict';

/**
 * 事件契约与顺序（logic.md §11）：支撑 AC-09/10/12/18/36/38/39 的可观测性
 * 顺序保证：二翻 flip →（advance(0)）match/mismatch；mismatch →（advance(800)）hide；
 *          最后一对 flip→match→state→won；重开 state(若变化)→restart；换难度 state(若变化)→settings→restart。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  setup,
  snapshot,
  cards,
  backCards,
  unmatchedPairs,
  playNextPair,
} = require('./helpers/harness.js');
const { createRecorder } = require('./helpers/recorder.js');

test('事件顺序：首翻 → 仅 flip（payload 自包含）', function () {
  const { game } = setup();
  const recorder = createRecorder(game);
  game.start();
  recorder.clear();

  const card = cards(game)[0];
  game.flip(card.id);

  assert.deepStrictEqual(recorder.names(), ['flip']);
  const payload = recorder.last('flip');
  assert.equal(payload.cardId, card.id);
  assert.equal(payload.symbolId, card.symbolId);
  assert.equal(payload.flipCount, 1);
});

test('事件顺序：配对成功 → flip → flip → match（payload 字段完整）', function () {
  const { game, timer } = setup();
  const recorder = createRecorder(game);
  game.start();
  recorder.clear();

  const pair = unmatchedPairs(game)[0];
  game.flip(pair[0].id);
  game.flip(pair[1].id);
  timer.advance(0);

  assert.deepStrictEqual(recorder.names(), ['flip', 'flip', 'match']);
  const match = recorder.last('match');
  assert.deepStrictEqual(
    match.cardIds.slice().sort(function (a, b) { return a - b; }),
    [pair[0].id, pair[1].id].sort(function (a, b) { return a - b; })
  );
  assert.equal(match.pairId, pair[0].pairId);
  assert.equal(match.scoreDelta, 100);
  assert.equal(match.score, 100);
  assert.equal(match.combo, 1);
  assert.equal(match.maxCombo, 1);
  assert.equal(match.moves, 1);
  assert.equal(match.pairsFound, 1);
  assert.equal(match.pairsTotal, 6);
});

test('事件顺序：配对失败 → flip → flip → mismatch →（800ms）hide', function () {
  const { game, timer } = setup();
  const recorder = createRecorder(game);
  game.start();
  recorder.clear();

  const pairs = unmatchedPairs(game);
  const first = pairs[0][0];
  const second = pairs[1][0];
  game.flip(first.id);
  game.flip(second.id);
  timer.advance(0);

  assert.deepStrictEqual(recorder.names(), ['flip', 'flip', 'mismatch']);
  const mismatch = recorder.last('mismatch');
  assert.deepStrictEqual(
    mismatch.cardIds.slice().sort(function (a, b) { return a - b; }),
    [first.id, second.id].sort(function (a, b) { return a - b; })
  );
  assert.equal(mismatch.moves, 1);
  assert.equal(mismatch.hideAfterMs, 800);

  timer.advance(800);
  // 错配停留期间秒表仍在走，允许穿插 tick 事件（§9.4）；此处只断言业务事件顺序
  const businessNames = recorder.names().filter(function (name) { return name !== 'tick'; });
  assert.deepStrictEqual(businessNames, ['flip', 'flip', 'mismatch', 'hide']);
  const hide = recorder.last('hide');
  assert.deepStrictEqual(
    hide.cardIds.slice().sort(function (a, b) { return a - b; }),
    [first.id, second.id].sort(function (a, b) { return a - b; })
  );
});

test('事件顺序：最后一对 → flip → flip → match → state → won', function () {
  const { game, timer } = setup();
  const recorder = createRecorder(game);
  game.start();
  while (snapshot(game).pairsFound < 5) playNextPair(game, timer);
  recorder.clear();

  playNextPair(game, timer);

  assert.deepStrictEqual(recorder.names(), ['flip', 'flip', 'match', 'state', 'won']);
  assert.deepStrictEqual(recorder.of('state')[0], { from: 'playing', to: 'result' });

  const won = recorder.last('won');
  assert.equal(won.score, 1300);
  assert.equal(won.moves, 6);
  assert.equal(won.stars, 3);
  assert.equal(won.pairsTotal, 6);
  assert.equal(won.difficultyId, 'easy');
  assert.equal(won.maxCombo, 6);
  assert.equal(won.isNewRecord, true);
  assert.equal(won.rank, 1);
  assert.equal(typeof won.timeMs, 'number');
});

test('事件顺序：暂停/恢复 → state {from,to}', function () {
  const { game } = setup();
  const recorder = createRecorder(game);
  game.start();
  recorder.clear();

  game.pause();
  assert.deepStrictEqual(recorder.names(), ['state']);
  assert.deepStrictEqual(recorder.last('state'), { from: 'playing', to: 'paused' });

  recorder.clear();
  game.resume();
  assert.deepStrictEqual(recorder.names(), ['state']);
  assert.deepStrictEqual(recorder.last('state'), { from: 'paused', to: 'playing' });
});

test('事件顺序：重开（playing→playing）→ 仅 restart，不发 state', function () {
  const { game } = setup();
  const recorder = createRecorder(game);
  game.start();
  recorder.clear();

  game.restart();
  assert.equal(recorder.names().includes('restart'), true, '重开必须发 restart 事件');
  assert.equal(recorder.names().includes('state'), false, '状态未变化时不得发 state');
  assert.equal(recorder.names()[recorder.names().length - 1], 'restart');
  const payload = recorder.last('restart');
  assert.equal(payload.difficultyId, 'easy');
  assert.ok(payload.snapshot && Array.isArray(payload.snapshot.cards));
});

test('事件顺序：换难度（playing→playing）→ settings → restart', function () {
  const { game } = setup();
  const recorder = createRecorder(game);
  game.start();
  recorder.clear();

  game.switchDifficulty('hard');
  assert.deepStrictEqual(recorder.names(), ['settings', 'restart']);
  assert.equal(recorder.last('settings').difficultyId, 'hard');
  assert.equal(recorder.last('restart').difficultyId, 'hard');
});

test('事件顺序：静音切换 → settings {muted,difficultyId}', function () {
  const { game } = setup();
  const recorder = createRecorder(game);
  game.start();
  recorder.clear();

  game.toggleMute();
  assert.deepStrictEqual(recorder.names(), ['settings']);
  assert.deepStrictEqual(recorder.last('settings'), { muted: true, difficultyId: 'easy' });
});

test('订阅规则：subscribe 返回取消订阅函数；通配 * 收到全部事件；指定事件只收该事件', function () {
  const { game } = setup();
  const all = [];
  const flips = [];
  const unsubscribeAll = game.subscribe('*', function (payload, eventName) {
    all.push(eventName);
  });
  game.subscribe('flip', function (payload) {
    flips.push(payload);
  });

  game.start();
  assert.ok(all.includes('state'), '通配订阅应收到 state');
  assert.equal(flips.length, 0, '指定事件订阅不应收到其他事件');

  game.flip(cards(game)[0].id);
  assert.equal(flips.length, 1);
  assert.equal(flips[0].flipCount, 1);

  const countBefore = all.length;
  unsubscribeAll();
  game.flip(backCards(game)[0].id);
  assert.equal(all.length, countBefore, '取消订阅后不得再收到事件');
});

test('订阅者异常隔离：onError(err,eventName) 被调用、其他订阅者仍收到、逻辑继续', function () {
  const errors = [];
  const { game } = setup({
    gameOptions: {
      onError: function (error, eventName) {
        errors.push({ message: error.message, eventName: eventName });
      },
    },
  });

  let secondCalls = 0;
  game.subscribe('flip', function () {
    throw new Error('boom');
  });
  game.subscribe('flip', function () {
    secondCalls += 1;
  });

  game.start();
  game.flip(cards(game)[0].id);

  assert.equal(secondCalls, 1, '其他订阅者不得被中断');
  assert.equal(errors.length, 1, 'onError 应被调用一次');
  assert.equal(errors[0].eventName, 'flip');
  assert.equal(errors[0].message, 'boom');
  assert.equal(snapshot(game).flipCount, 1, '逻辑必须继续');
});

test("重入保护：订阅者回调内调用改状态方法 → {ok:false, reason:'busy'}", function () {
  const { game } = setup();
  let reentrant;

  game.subscribe('flip', function () {
    const target = backCards(game)[0];
    reentrant = game.flip(target.id);
  });

  game.start();
  game.flip(cards(game)[0].id);

  assert.equal(reentrant.ok, false);
  assert.equal(reentrant.reason, 'busy');
  assert.equal(snapshot(game).flipCount, 1, '重入不得改变状态');
});
