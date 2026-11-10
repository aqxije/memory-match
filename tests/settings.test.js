'use strict';

/**
 * 设置与默认值：AC-01/02/04/39（+ settings 健壮性）
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { createSettings } = require('../src/core/settings.js');
const { createFakeStorage, STORAGE_KEYS } = require('./helpers/fake-storage.js');
const { setup, snapshot } = require('./helpers/harness.js');

const DIFFICULTY_IDS = ['easy', 'normal', 'hard', 'challenge'];

test('AC-01 默认配置：无持久化数据 → 难度 easy、静音关、各难度最佳分 0、状态 MENU', function () {
  const { game } = setup();
  const state = snapshot(game);

  assert.equal(state.state, 'menu');
  assert.equal(state.difficultyId, 'easy');
  assert.equal(state.muted, false);
  assert.equal(state.phase, 'idle');
  assert.equal(state.bestScore, 0);
  for (const difficultyId of DIFFICULTY_IDS) {
    assert.equal(game.getBestScore(difficultyId), 0, difficultyId + ' 最佳分应为 0');
  }
  assert.equal(game.getSettings().muted, false);
  assert.equal(game.getSettings().difficultyId, 'easy');

  // 模块级默认值
  const settings = createSettings({ storage: createFakeStorage() });
  assert.equal(settings.get().muted, false);
  assert.equal(settings.get().difficultyId, 'easy');
  assert.equal(settings.isDegraded(), false);
});

test('AC-02 难度选择：MENU 选 D3 → 当前难度 hard、状态仍 MENU（不自动开局）、选中项唯一', function () {
  const { game } = setup();

  assert.equal(game.selectDifficulty('hard').ok, true);
  let state = snapshot(game);
  assert.equal(state.difficultyId, 'hard');
  assert.equal(state.state, 'menu', '选择难度不得自动开局');
  assert.equal(game.getSettings().difficultyId, 'hard');

  // 选中项唯一：再选 normal 后只有 normal 生效
  assert.equal(game.selectDifficulty('normal').ok, true);
  assert.equal(snapshot(game).difficultyId, 'normal');
  assert.equal(game.getSettings().difficultyId, 'normal');

  // 非法难度 id → 返回 invalid-difficulty，状态不变
  assert.deepStrictEqual(game.selectDifficulty('nope'), { ok: false, reason: 'invalid-difficulty' });
  assert.equal(snapshot(game).difficultyId, 'normal');
  assert.equal(snapshot(game).state, 'menu');
});

test('AC-04 难度记忆：上次选择 D3 并已开局 → 重新初始化后默认难度 = D3', function () {
  const storage = createFakeStorage();
  const first = setup({ storage: storage });
  assert.equal(first.game.selectDifficulty('hard').ok, true);
  assert.equal(first.game.start().ok, true);
  assert.equal(snapshot(first.game).difficultyId, 'hard');

  // 同一 storage 重新初始化（模拟刷新/重开页面）
  const second = setup({ storage: storage });
  assert.equal(second.game.getSnapshot().difficultyId, 'hard');
  assert.equal(second.game.getSettings().difficultyId, 'hard');
  assert.equal(second.game.getSnapshot().state, 'menu');
});

test('AC-39 静音持久化：点击静音 → 重建后仍静音；再切换回未静音也持久化', function () {
  const storage = createFakeStorage();
  const first = setup({ storage: storage });
  assert.equal(first.game.getSnapshot().muted, false);

  assert.equal(first.game.toggleMute().ok, true);
  assert.equal(first.game.getSnapshot().muted, true);
  assert.equal(first.game.getSettings().muted, true);

  // 已持久化到 mm.v1.settings
  const raw = storage.json(STORAGE_KEYS.settings);
  assert.equal(raw.version, 1);
  assert.equal(raw.muted, true);

  // 重建
  const second = setup({ storage: storage });
  assert.equal(second.game.getSnapshot().muted, true, '重建后静音状态必须保持');
  assert.equal(second.game.getSettings().muted, true);

  // 再切换回未静音并持久化
  second.game.toggleMute();
  assert.equal(second.game.getSnapshot().muted, false);
  const third = setup({ storage: storage });
  assert.equal(third.game.getSnapshot().muted, false);
});

test('AC-39 静音开关在任意状态可用（menu/playing/paused/result/leaderboard）', function () {
  const { game, timer } = setup();
  assert.equal(game.toggleMute().ok, true); // menu
  game.start();
  assert.equal(game.toggleMute().ok, true); // playing
  game.pause();
  assert.equal(game.toggleMute().ok, true); // paused
  game.resume();
  game.goToMenu();
  game.openLeaderboard();
  assert.equal(game.toggleMute().ok, true); // leaderboard
});

test('settings 健壮性：非法 JSON / version 不匹配 → 回退默认值，不抛异常', function () {
  const cases = [
    { name: '非法 JSON', storage: createFakeStorage({ corrupt: true }) },
    {
      name: 'version 不匹配',
      storage: createFakeStorage({
        initial: { [STORAGE_KEYS.settings]: { version: 99, muted: true, difficulty: 'challenge' } },
      }),
    },
    {
      name: '字段类型非法',
      storage: createFakeStorage({
        initial: { [STORAGE_KEYS.settings]: { version: 1, muted: 'yes', difficulty: 42 } },
      }),
    },
  ];

  for (const testCase of cases) {
    assert.doesNotThrow(function () {
      const { game } = setup({ storage: testCase.storage });
      assert.equal(game.getSnapshot().muted, false, testCase.name + '：静音应回退默认 false');
      assert.equal(game.getSnapshot().difficultyId, 'easy', testCase.name + '：难度应回退默认 easy');
    }, testCase.name + ' 不得抛异常');
  }
});

test('settings 降级：setItem 抛异常 → 内存态生效、isDegraded=true、不抛异常', function () {
  const settings = createSettings({ storage: createFakeStorage({ throwOnSet: true }) });
  assert.doesNotThrow(function () { settings.setMuted(true); });
  assert.equal(settings.get().muted, true, '写入失败时内存态仍应生效');
  assert.equal(settings.isDegraded(), true);

  const { game } = setup({ storage: createFakeStorage({ throwOnSet: true }) });
  assert.doesNotThrow(function () { game.toggleMute(); });
  assert.equal(game.getSnapshot().muted, true);
  assert.doesNotThrow(function () { game.selectDifficulty('hard'); });
  assert.equal(game.getSnapshot().difficultyId, 'hard');
});

test('settings 模块级 API：setMuted / setDifficulty / get', function () {
  const storage = createFakeStorage();
  const settings = createSettings({ storage: storage });
  settings.setMuted(true);
  settings.setDifficulty('challenge');
  assert.deepStrictEqual(settings.get(), { muted: true, difficultyId: 'challenge' });

  // 持久化后重建
  const reloaded = createSettings({ storage: storage });
  assert.equal(reloaded.get().muted, true);
  assert.equal(reloaded.get().difficultyId, 'challenge');
});
