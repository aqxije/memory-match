'use strict';

/**
 * 排行榜与持久化：AC-25/26/27/28/29/30/31（+ E13 非法 completedAt、清空 API）
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createLeaderboard,
  compareEntries,
  rankEntries,
  validateEntry,
} = require('../src/core/leaderboard.js');
const { createFakeStorage, STORAGE_KEYS } = require('./helpers/fake-storage.js');
const { createFakeTimer } = require('./helpers/fake-clock.js');
const { createSeededRng } = require('./helpers/seeded-rng.js');
const { setup, snapshot, playAllPairs, FIXED_ISO } = require('./helpers/harness.js');

const DIFFICULTY_IDS = ['easy', 'normal', 'hard', 'challenge'];

function entry(overrides) {
  return Object.assign(
    { score: 1000, moves: 10, timeMs: 50000, stars: 3, completedAt: FIXED_ISO },
    overrides || {}
  );
}

test('AC-25 记录写入：完成一局且记录数 <5 → 写入该难度榜单，条数 +1、字段完整', function () {
  const storage = createFakeStorage();
  const leaderboard = createLeaderboard({ storage: storage, wallNow: function () { return Date.parse(FIXED_ISO); } });

  assert.deepStrictEqual(leaderboard.list('easy'), []);

  const record = entry({ score: 1300, moves: 9, timeMs: 42000, stars: 3 });
  const result = leaderboard.add('easy', record);

  assert.equal(result.rank, 1);
  assert.equal(result.isNewRecord, true, '空榜最佳分为 0，1300 > 0 应为新纪录');
  assert.equal(result.bestScore, 1300);
  assert.equal(leaderboard.list('easy').length, 1);
  assert.deepStrictEqual(leaderboard.list('easy')[0], record);
  assert.deepStrictEqual(Object.keys(leaderboard.list('easy')[0]).sort(), [
    'completedAt',
    'moves',
    'score',
    'stars',
    'timeMs',
  ]);

  // 已持久化到 storage（SPEC §6.15 schema）
  const raw = storage.json(STORAGE_KEYS.leaderboard);
  assert.equal(raw.version, 1);
  assert.deepStrictEqual(raw.boards.easy, [record]);
  for (const difficultyId of ['normal', 'hard', 'challenge']) {
    assert.deepStrictEqual(raw.boards[difficultyId], [], difficultyId + ' 榜单应为空');
    assert.deepStrictEqual(leaderboard.list(difficultyId), []);
  }

  // 条数 +1
  leaderboard.add('easy', entry({ score: 900, moves: 12, timeMs: 60000 }));
  assert.equal(leaderboard.list('easy').length, 2);
});

test('AC-26 排序规则：score 降序 → moves 升序 → timeMs 升序 → completedAt 升序', function () {
  const leaderboard = createLeaderboard({ storage: createFakeStorage() });
  const records = [
    entry({ score: 1000, moves: 12, timeMs: 70000, completedAt: '2026-11-09T12:00:03.000Z' }),
    entry({ score: 900, moves: 10, timeMs: 40000, completedAt: '2026-11-09T12:00:02.000Z' }),
    entry({ score: 900, moves: 9, timeMs: 60000, completedAt: '2026-11-09T12:00:05.000Z' }),
    entry({ score: 900, moves: 9, timeMs: 50000, completedAt: '2026-11-09T12:00:04.000Z' }),
    entry({ score: 900, moves: 9, timeMs: 50000, completedAt: '2026-11-09T12:00:01.000Z' }),
  ];
  for (const record of records) leaderboard.add('easy', record);

  const list = leaderboard.list('easy');
  assert.deepStrictEqual(list.map(function (item) { return item.score; }), [1000, 900, 900, 900, 900]);
  assert.deepStrictEqual(list.map(function (item) { return item.moves; }), [12, 9, 9, 9, 10]);
  assert.equal(list[1].timeMs, 50000);
  assert.equal(list[2].timeMs, 50000);
  assert.equal(list[3].timeMs, 60000);
  assert.equal(list[1].completedAt, '2026-11-09T12:00:01.000Z', 'completedAt 早者在前');
  assert.equal(list[2].completedAt, '2026-11-09T12:00:04.000Z');
  assert.equal(list[3].completedAt, '2026-11-09T12:00:05.000Z');

  // 最多保留 5 条
  leaderboard.add('easy', entry({ score: 800, moves: 20, timeMs: 90000 }));
  assert.equal(leaderboard.list('easy').length, 5);
  assert.equal(leaderboard.list('easy').some(function (item) { return item.score === 800; }), false);
});

test('AC-26 compareEntries 纯函数：负数表示 a 排在 b 前', function () {
  const high = entry({ score: 1000 });
  const low = entry({ score: 900 });
  assert.ok(compareEntries(high, low) < 0, '高分应排在前面（返回负数）');
  assert.ok(compareEntries(low, high) > 0);

  const fast = entry({ score: 900, moves: 9 });
  const slow = entry({ score: 900, moves: 10 });
  assert.ok(compareEntries(fast, slow) < 0, '同分时步数少者在前');

  const quick = entry({ score: 900, moves: 9, timeMs: 1000 });
  const slower = entry({ score: 900, moves: 9, timeMs: 2000 });
  assert.ok(compareEntries(quick, slower) < 0, '同分同步时用时少者在前');

  const earlier = entry({ score: 900, moves: 9, timeMs: 1000, completedAt: '2026-11-09T12:00:00.000Z' });
  const later = entry({ score: 900, moves: 9, timeMs: 1000, completedAt: '2026-11-09T12:00:01.000Z' });
  assert.ok(compareEntries(earlier, later) < 0, '同分同步同用时，completedAt 早者在前');

  // 非法 completedAt 视为 Infinity 排最后（E13，不抛异常）
  const invalid = entry({ score: 900, moves: 9, timeMs: 1000, completedAt: 'not-a-date' });
  assert.ok(compareEntries(earlier, invalid) < 0);
  assert.doesNotThrow(function () { compareEntries(invalid, earlier); });
});

test('AC-26 rankEntries 纯函数：排序并截取前 limit 条', function () {
  const sorted = rankEntries(
    [entry({ score: 100 }), entry({ score: 300 }), entry({ score: 200 })],
    5
  );
  assert.deepStrictEqual(sorted.map(function (item) { return item.score; }), [300, 200, 100]);

  const six = [100, 200, 300, 400, 500, 600].map(function (score) { return entry({ score: score }); });
  assert.equal(rankEntries(six, 5).length, 5);
  assert.deepStrictEqual(rankEntries(six, 5).map(function (item) { return item.score; }), [600, 500, 400, 300, 200]);
});

test('AC-27 淘汰与破纪录：第 6 位不改变榜单且非新纪录；严格大于原第 1 名才更新', function () {
  const leaderboard = createLeaderboard({ storage: createFakeStorage() });
  const baseScores = [1000, 900, 800, 700, 600];
  baseScores.forEach(function (score, index) {
    leaderboard.add('easy', entry({
      score: score,
      moves: 10 + index,
      timeMs: 50000 + index,
      completedAt: new Date(Date.UTC(2026, 10, 9, 12, 0, index)).toISOString(),
    }));
  });
  const before = leaderboard.list('easy');
  assert.equal(before.length, 5);
  assert.equal(leaderboard.best('easy'), 1000);

  // 排序后位于第 6 位 → 榜单不变、rank=null、isNewRecord=false
  const rejected = leaderboard.add('easy', entry({ score: 500, moves: 20, timeMs: 90000 }));
  assert.equal(rejected.rank, null);
  assert.equal(rejected.isNewRecord, false);
  assert.equal(rejected.bestScore, 1000);
  assert.deepStrictEqual(leaderboard.list('easy'), before, '第 6 位不得改变榜单');

  // score 严格大于原第 1 名 → 更新且新纪录
  const record = leaderboard.add('easy', entry({ score: 1100, moves: 12, timeMs: 70000 }));
  assert.equal(record.isNewRecord, true);
  assert.equal(record.rank, 1);
  assert.equal(record.bestScore, 1100);
  assert.equal(leaderboard.list('easy')[0].score, 1100);
  assert.equal(leaderboard.list('easy').length, 5);

  // 等于当前第 1 名（不严格大于）→ 非新纪录
  const tie = leaderboard.add('easy', entry({ score: 1100, moves: 99, timeMs: 999999 }));
  assert.equal(tie.isNewRecord, false, '新纪录判定必须严格大于');
});

test('AC-28 最佳分展示：第 1 名 1300 → best/getBestScore 返回 1300；空榜 0', function () {
  const storage = createFakeStorage({
    initial: {
      [STORAGE_KEYS.leaderboard]: {
        version: 1,
        boards: {
          easy: [entry({ score: 1300, moves: 9, timeMs: 42000 })],
          normal: [],
          hard: [],
          challenge: [],
        },
      },
    },
  });

  const { game } = setup({ storage: storage });
  assert.equal(game.getBestScore('easy'), 1300);
  assert.equal(game.getBestScore('normal'), 0);
  assert.equal(game.getSnapshot().bestScore, 1300, '快照 bestScore 应为当前难度最佳分');

  game.selectDifficulty('normal');
  assert.equal(game.getSnapshot().bestScore, 0, '空榜最佳分为 0');

  // 模块级
  const leaderboard = createLeaderboard({ storage: storage });
  assert.equal(leaderboard.best('easy'), 1300);
  assert.equal(leaderboard.best('challenge'), 0);
});

test('AC-29 持久化：同一 storage 重建 → 榜单/最佳分/静音/难度与刷新前一致', function () {
  const storage = createFakeStorage();
  const first = setup({ storage: storage });
  first.game.selectDifficulty('hard');
  first.game.toggleMute();
  first.game.start();
  playAllPairs(first.game, first.timer);

  const before = {
    board: first.game.getLeaderboard('hard'),
    best: first.game.getBestScore('hard'),
    muted: first.game.getSettings().muted,
    difficultyId: first.game.getSettings().difficultyId,
  };
  assert.equal(before.board.length, 1, '完成一局后应写入 1 条记录');
  assert.equal(before.muted, true);

  // 用同一 storage 重新初始化（模拟刷新）
  const second = setup({ storage: storage });
  assert.deepStrictEqual(second.game.getLeaderboard('hard'), before.board);
  assert.equal(second.game.getBestScore('hard'), before.best);
  assert.equal(second.game.getSettings().muted, true);
  assert.equal(second.game.getSettings().difficultyId, 'hard');
  assert.equal(second.game.getSnapshot().muted, true);
  assert.equal(second.game.getSnapshot().difficultyId, 'hard');
  assert.equal(second.game.getSnapshot().bestScore, before.best);
});

test('AC-30 数据健壮性：非法 JSON / 结构不符 / version 不匹配 → 不抛异常、回退空榜、可正常开局', function () {
  const cases = [
    { name: '非法 JSON', storage: createFakeStorage({ corrupt: true }) },
    {
      name: '结构不符（boards 非对象）',
      storage: createFakeStorage({ initial: { [STORAGE_KEYS.leaderboard]: { version: 1, boards: 'nope' } } }),
    },
    {
      name: '结构不符（boards 缺失）',
      storage: createFakeStorage({ initial: { [STORAGE_KEYS.leaderboard]: { version: 1 } } }),
    },
    {
      name: 'version 不匹配',
      storage: createFakeStorage({
        initial: {
          [STORAGE_KEYS.leaderboard]: {
            version: 99,
            boards: { easy: [entry({ score: 999 })], normal: [], hard: [], challenge: [] },
          },
        },
      }),
    },
  ];

  for (const testCase of cases) {
    assert.doesNotThrow(function () {
      const { game } = setup({ storage: testCase.storage });
      assert.deepStrictEqual(game.getLeaderboard('easy'), [], testCase.name + '：榜单应回退为空');
      assert.equal(game.getBestScore('easy'), 0, testCase.name + '：最佳分应为 0');
      assert.equal(game.getSnapshot().state, 'menu');
      assert.equal(game.start().ok, true, testCase.name + '：应可正常开始');
    }, testCase.name + ' 不得抛异常');
  }

  // 单条记录字段非法 → 丢弃该条，其余保留
  const partial = createFakeStorage({
    initial: {
      [STORAGE_KEYS.leaderboard]: {
        version: 1,
        boards: {
          easy: [entry({ score: 1200 }), { score: 'bad', moves: 1, timeMs: 1, stars: 3 }],
          normal: [],
          hard: [],
          challenge: [],
        },
      },
    },
  });
  const leaderboard = createLeaderboard({ storage: partial });
  assert.equal(leaderboard.list('easy').length, 1, '非法记录应被丢弃');
  assert.equal(leaderboard.best('easy'), 1200);
});

test('AC-31 存储降级：setItem 抛异常 → 结算正常、榜单内存可见、无未捕获异常', function () {
  // 模块级
  const leaderboard = createLeaderboard({ storage: createFakeStorage({ throwOnSet: true }) });
  assert.doesNotThrow(function () { leaderboard.add('easy', entry({ score: 100 })); });
  assert.equal(leaderboard.list('easy').length, 1, '写入失败时榜单仍应内存可见');
  assert.equal(leaderboard.isDegraded(), true);

  // 游戏级：完成一局，结算正常、榜单可见、最佳分正确
  const storage = createFakeStorage({ throwOnSet: true });
  const { game, timer } = setup({ storage: storage });
  game.start();
  playAllPairs(game, timer);

  assert.equal(snapshot(game).state, 'result');
  assert.ok([1, 2, 3].includes(snapshot(game).stars));
  const board = game.getLeaderboard('easy');
  assert.equal(board.length, 1, '降级时榜单应内存可见');
  assert.equal(game.getBestScore('easy'), board[0].score);
  assert.equal(snapshot(game).isNewRecord, true);
  assert.equal(game.getLeaderboard('easy').length, 1, '再次读取仍应可见');
});

test('AC-31 getItem 抛异常 → 视为空数据、内存态、功能完整', function () {
  const leaderboard = createLeaderboard({ storage: createFakeStorage({ throwOnGet: true }) });
  assert.equal(leaderboard.isDegraded(), true);
  assert.deepStrictEqual(leaderboard.list('easy'), []);
  assert.doesNotThrow(function () { leaderboard.add('easy', entry({ score: 100 })); });
  assert.equal(leaderboard.list('easy').length, 1);

  // 游戏级：storage 为 null（无 storage）→ 内存态，可正常游玩与结算
  const { game, timer } = setup({ storage: null });
  assert.equal(game.getSnapshot().state, 'menu');
  assert.equal(game.getSnapshot().muted, false);
  game.start();
  playAllPairs(game, timer);
  assert.equal(snapshot(game).state, 'result');
  assert.equal(game.getLeaderboard('easy').length, 1);
});

test('AC-30 单条 completedAt 非法：保留记录、排序按 Infinity 兜底、不抛异常（E13）', function () {
  const leaderboard = createLeaderboard({ storage: createFakeStorage() });
  leaderboard.add('easy', entry({ score: 900, moves: 9, timeMs: 1000, completedAt: 'not-a-date' }));
  leaderboard.add('easy', entry({ score: 900, moves: 9, timeMs: 1000, completedAt: '2026-11-09T12:00:00.000Z' }));

  const list = leaderboard.list('easy');
  assert.equal(list.length, 2, 'completedAt 非法不得丢弃记录');
  assert.equal(list[0].completedAt, '2026-11-09T12:00:00.000Z', '合法时间应排在非法时间之前');
});

test('validateEntry 纯函数：合法记录通过，null/非对象/缺字段返回 null', function () {
  assert.ok(validateEntry(entry()));
  assert.equal(validateEntry(null), null);
  assert.equal(validateEntry(undefined), null);
  assert.equal(validateEntry('nope'), null);
  assert.equal(validateEntry({}), null);
  assert.equal(validateEntry({ score: 100 }), null);
});

test('清空 API：clear(difficultyId) 只清该难度；clearAll 清空全部；getBoards 返回副本', function () {
  const leaderboard = createLeaderboard({ storage: createFakeStorage() });
  leaderboard.add('easy', entry({ score: 100 }));
  leaderboard.add('normal', entry({ score: 200 }));

  const boards = leaderboard.getBoards();
  assert.deepStrictEqual(Object.keys(boards).sort(), DIFFICULTY_IDS.slice().sort());
  boards.easy.push(entry({ score: 999 }));
  assert.equal(leaderboard.list('easy').length, 1, 'getBoards 必须返回副本');

  leaderboard.clear('easy');
  assert.deepStrictEqual(leaderboard.list('easy'), []);
  assert.equal(leaderboard.best('easy'), 0);
  assert.equal(leaderboard.list('normal').length, 1, 'clear 不得影响其他难度');

  leaderboard.clearAll();
  for (const difficultyId of DIFFICULTY_IDS) {
    assert.deepStrictEqual(leaderboard.list(difficultyId), []);
    assert.equal(leaderboard.best(difficultyId), 0);
  }
});

test('list 返回副本：修改返回值不影响内部状态', function () {
  const leaderboard = createLeaderboard({ storage: createFakeStorage() });
  leaderboard.add('easy', entry({ score: 100 }));
  const list = leaderboard.list('easy');
  list[0].score = 9999;
  list.push(entry({ score: 8888 }));
  assert.equal(leaderboard.list('easy')[0].score, 100);
  assert.equal(leaderboard.list('easy').length, 1);
});
