/* MM · 难度表 / 符号池 / 常量（UMD，纯数据，无 DOM） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MM = root.MM || {};
    root.MM.Core = root.MM.Core || {};
    root.MM.Core.Config = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CONSTANTS = {
    MISMATCH_HOLD_MS: 800,
    JUDGE_DELAY_MS: 0,
    TICK_MS: 250,
    BASE_SCORE: 100,
    COMBO_STEP: 50,
    COMBO_CAP: 4,
    LEADERBOARD_LIMIT: 5,
    STORAGE_VERSION: 1,
    STORAGE_KEYS: { leaderboard: 'mm.v1.leaderboard', settings: 'mm.v1.settings' }
  };

  // 24 个儿童易识别符号；id 为唯一来源，emoji/中文名只在此维护（logic.md §5.2）
  var SYMBOLS = [
    { id: 'apple', emoji: '🍎', name: '苹果' },
    { id: 'banana', emoji: '🍌', name: '香蕉' },
    { id: 'grape', emoji: '🍇', name: '葡萄' },
    { id: 'strawberry', emoji: '🍓', name: '草莓' },
    { id: 'orange', emoji: '🍊', name: '橘子' },
    { id: 'watermelon', emoji: '🍉', name: '西瓜' },
    { id: 'carrot', emoji: '🥕', name: '胡萝卜' },
    { id: 'corn', emoji: '🌽', name: '玉米' },
    { id: 'dog', emoji: '🐶', name: '小狗' },
    { id: 'cat', emoji: '🐱', name: '小猫' },
    { id: 'rabbit', emoji: '🐰', name: '小兔' },
    { id: 'panda', emoji: '🐼', name: '熊猫' },
    { id: 'fox', emoji: '🦊', name: '狐狸' },
    { id: 'frog', emoji: '🐸', name: '青蛙' },
    { id: 'monkey', emoji: '🐵', name: '猴子' },
    { id: 'lion', emoji: '🦁', name: '狮子' },
    { id: 'star', emoji: '⭐', name: '星星' },
    { id: 'moon', emoji: '🌙', name: '月亮' },
    { id: 'sun', emoji: '☀️', name: '太阳' },
    { id: 'rainbow', emoji: '🌈', name: '彩虹' },
    { id: 'balloon', emoji: '🎈', name: '气球' },
    { id: 'gift', emoji: '🎁', name: '礼物' },
    { id: 'car', emoji: '🚗', name: '汽车' },
    { id: 'fish', emoji: '🐟', name: '小鱼' }
  ];

  // SPEC §6.2 权威网格；阈值由公式推导（ceil(pairs*1.5) / ceil(pairs*2.5) / pairs*10s / pairs*20s）
  var LAYOUTS = [
    { id: 'easy', name: '简单', cols: 3, rows: 4 },
    { id: 'normal', name: '普通', cols: 4, rows: 4 },
    { id: 'hard', name: '困难', cols: 5, rows: 4 },
    { id: 'challenge', name: '挑战', cols: 6, rows: 6 }
  ];

  var DIFFICULTIES = {};
  var DIFFICULTY_IDS = [];
  LAYOUTS.forEach(function (d) {
    var cards = d.cols * d.rows;
    var pairs = Math.floor(cards / 2);
    DIFFICULTIES[d.id] = {
      id: d.id,
      name: d.name,
      cols: d.cols,
      rows: d.rows,
      cards: cards,
      pairs: pairs,
      star3Moves: Math.ceil(pairs * 1.5),
      star2Moves: Math.ceil(pairs * 2.5),
      star3TimeMs: pairs * 10000,
      star2TimeMs: pairs * 20000
    };
    DIFFICULTY_IDS.push(d.id);
  });

  function getDifficulty(id) {
    return Object.prototype.hasOwnProperty.call(DIFFICULTIES, id) ? DIFFICULTIES[id] : null;
  }

  return {
    CONSTANTS: CONSTANTS,
    SYMBOLS: SYMBOLS,
    DIFFICULTIES: DIFFICULTIES,
    DIFFICULTY_IDS: DIFFICULTY_IDS,
    getDifficulty: getDifficulty
  };
});
