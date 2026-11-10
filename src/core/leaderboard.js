/* MM · 排行榜（UMD，纯逻辑；storage 注入，损坏/配额降级） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'));
  } else {
    root.MM = root.MM || {};
    root.MM.Core = root.MM.Core || {};
    root.MM.Core.Leaderboard = factory(root.MM.Core.Config);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Config) {
  'use strict';
  if (!Config) { throw new Error('[MM] Leaderboard requires MM.Core.Config'); }
  var C = Config.CONSTANTS;
  var IDS = Config.DIFFICULTY_IDS;

  function isInt(v) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v; }

  function emptyBoards() {
    var boards = {};
    IDS.forEach(function (id) { boards[id] = []; });
    return boards;
  }

  function cloneEntry(e) {
    return { score: e.score, moves: e.moves, timeMs: e.timeMs, stars: e.stars, completedAt: e.completedAt };
  }

  // 单条记录校验：非法返回 null（丢弃该条，其余保留）；completedAt 非法字符串保留（E13）
  function validateEntry(raw) {
    if (!raw || typeof raw !== 'object') { return null; }
    var score = raw.score, moves = raw.moves, timeMs = raw.timeMs, stars = raw.stars;
    if (!isInt(score) || score < 0 || score > 1000000) { return null; }
    if (!isInt(moves) || moves < 1 || moves > 1000) { return null; }
    if (typeof timeMs !== 'number' || !isFinite(timeMs) || timeMs < 0 || timeMs > 86400000) { return null; }
    if (!isInt(stars) || stars < 1 || stars > 3) { return null; }
    return {
      score: score,
      moves: moves,
      timeMs: timeMs,
      stars: stars,
      completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : ''
    };
  }

  function timeOf(iso) {
    var t = Date.parse(iso);
    return isNaN(t) ? Infinity : t;
  }

  // 排序：score↓ → moves↑ → timeMs↑ → completedAt↑（无法解析的时间戳排最后，不抛异常）
  function compareEntries(a, b) {
    if (b.score !== a.score) { return b.score - a.score; }
    if (a.moves !== b.moves) { return a.moves - b.moves; }
    if (a.timeMs !== b.timeMs) { return a.timeMs - b.timeMs; }
    var ta = timeOf(a.completedAt);
    var tb = timeOf(b.completedAt);
    if (ta === tb) { return 0; }
    return ta < tb ? -1 : 1;
  }

  function rankEntries(entries, limit) {
    return entries.slice().sort(compareEntries).slice(0, limit);
  }

  function createLeaderboard(options) {
    options = options || {};
    var storage = options.storage || null;
    var wallNow = options.wallNow || function () { return Date.now(); };
    var limit = options.limit || C.LEADERBOARD_LIMIT;
    var key = C.STORAGE_KEYS.leaderboard;
    var degraded = !storage;
    var boards = emptyBoards();

    function isValidId(id) { return IDS.indexOf(id) !== -1; }

    function load() {
      if (!storage) { return; }
      var raw;
      try { raw = storage.getItem(key); } catch (err) { degraded = true; return; }
      if (raw === null || raw === undefined) { return; }
      var data;
      try { data = JSON.parse(raw); } catch (err) { return; } // 损坏 → 回退默认空榜（AC-30）
      if (!data || data.version !== C.STORAGE_VERSION || !data.boards || typeof data.boards !== 'object') { return; }
      var next = emptyBoards();
      IDS.forEach(function (id) {
        var list = data.boards[id];
        if (!Array.isArray(list)) { return; }
        var valid = [];
        list.forEach(function (item) {
          var e = validateEntry(item);
          if (e) { valid.push(e); }
        });
        next[id] = rankEntries(valid, limit);
      });
      boards = next;
    }

    function persist() {
      if (!storage) { degraded = true; return; }
      try {
        storage.setItem(key, JSON.stringify({ version: C.STORAGE_VERSION, boards: boards }));
      } catch (err) {
        degraded = true; // 配额/隐私模式：内存态照常，不抛异常（AC-31）
      }
    }

    function list(id) {
      if (!isValidId(id)) { return []; }
      return boards[id].map(cloneEntry);
    }

    function best(id) {
      if (!isValidId(id)) { return 0; }
      return boards[id].length ? boards[id][0].score : 0;
    }

    // 文档签名（logic.md §10.2 / render.md §13.5）：add(difficultyId, entry)
    function add(difficultyId, entry) {
      var id = difficultyId;
      if (!isValidId(id)) {
        return { rank: null, isNewRecord: false, entries: [], bestScore: 0 };
      }
      var valid = validateEntry(entry);
      if (!valid) {
        return { rank: null, isNewRecord: false, entries: list(id), bestScore: best(id) };
      }
      var preBest = best(id);
      var next = rankEntries(boards[id].concat([valid]), limit);
      var index = next.indexOf(valid);
      var rank = index === -1 ? null : index + 1;
      var isNewRecord = rank !== null && valid.score > preBest;
      if (rank !== null) {
        boards[id] = next;
        persist();
      }
      return { rank: rank, isNewRecord: isNewRecord, entries: list(id), bestScore: best(id) };
    }

    function getBoards() {
      var copy = {};
      IDS.forEach(function (id) { copy[id] = list(id); });
      return copy;
    }

    function clear(id) {
      if (!isValidId(id)) { return; }
      boards[id] = [];
      persist();
    }

    function clearAll() {
      boards = emptyBoards();
      persist();
    }

    load();

    return {
      add: add,
      list: list,
      best: best,
      getBoards: getBoards,
      clear: clear,
      clearAll: clearAll,
      isDegraded: function () { return degraded; }
    };
  }

  return {
    createLeaderboard: createLeaderboard,
    compareEntries: compareEntries,
    rankEntries: rankEntries,
    validateEntry: validateEntry
  };
});
