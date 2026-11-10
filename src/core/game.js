/* MM · 游戏状态机 / 翻牌流程 / 事件 / 快照（UMD，纯逻辑，无 DOM） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./rng.js'), require('./config.js'), require('./deck.js'), require('./scoring.js'),
      require('./timer.js'), require('./leaderboard.js'), require('./settings.js')
    );
  } else {
    root.MM = root.MM || {};
    root.MM.Core = root.MM.Core || {};
    root.MM.Core.Game = factory(
      root.MM.Core.Rng, root.MM.Core.Config, root.MM.Core.Deck, root.MM.Core.Scoring,
      root.MM.Core.Timer, root.MM.Core.Leaderboard, root.MM.Core.Settings
    );
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Rng, Config, Deck, Scoring, Timer, Leaderboard, Settings) {
  'use strict';
  if (!Rng) { throw new Error('[MM] Game requires MM.Core.Rng'); }
  if (!Config) { throw new Error('[MM] Game requires MM.Core.Config'); }
  if (!Deck) { throw new Error('[MM] Game requires MM.Core.Deck'); }
  if (!Scoring) { throw new Error('[MM] Game requires MM.Core.Scoring'); }
  if (!Timer) { throw new Error('[MM] Game requires MM.Core.Timer'); }
  if (!Leaderboard) { throw new Error('[MM] Game requires MM.Core.Leaderboard'); }
  if (!Settings) { throw new Error('[MM] Game requires MM.Core.Settings'); }
  var C = Config.CONSTANTS;

  function createGame(options) {
    options = options || {};

    // ---- 依赖注入（logic.md §4.1） ----
    var storage = options.storage !== undefined ? options.storage : null;
    var config = options.config || Config.DIFFICULTIES;
    var judgeDelayMs = options.judgeDelayMs != null ? options.judgeDelayMs : C.JUDGE_DELAY_MS;
    var mismatchHoldMs = options.mismatchHoldMs != null ? options.mismatchHoldMs : C.MISMATCH_HOLD_MS;
    var tickMs = options.tickMs != null ? options.tickMs : C.TICK_MS;
    var wallNow = options.wallNow || function () { return Date.now(); };
    var onError = typeof options.onError === 'function' ? options.onError : function () {};
    var timer = options.timer || Timer.createTimer();
    var seed = options.seed != null ? options.seed : null;
    var rng = options.rng || (seed != null ? Rng.createSeededRng(seed) : Math.random);

    var settings = Settings.createSettings({ storage: storage });
    var leaderboard = Leaderboard.createLeaderboard({ storage: storage, wallNow: wallNow });
    var stopwatch = Timer.createStopwatch(timer);

    // ---- 私有状态 ----
    var state = 'menu';
    var phase = 'idle';
    var difficultyId = settings.get().difficultyId;
    var muted = settings.get().muted;
    var cards = [];
    var flippedIds = [];
    var flipCount = 0;
    var score = 0;
    var combo = 0;
    var maxCombo = 0;
    var moves = 0;
    var pairsFound = 0;
    var stars = null;
    var timeMs = null;
    var isNewRecord = false;
    var lastRank = null;
    var returnState = 'menu';
    var dispatching = false;
    var timers = { judge: null, hide: null, tick: null };
    var listeners = Object.create(null);

    // ---- 工具 ----
    function diffOf(id) {
      return (config && Object.prototype.hasOwnProperty.call(config, id)) ? config[id] : null;
    }
    function pairsTotal() {
      var d = diffOf(difficultyId);
      return d ? d.pairs : 0;
    }
    function findCard(cardId) {
      for (var i = 0; i < cards.length; i += 1) {
        if (cards[i].id === cardId) { return cards[i]; }
      }
      return null;
    }
    function elapsedMs() { return stopwatch.elapsed(); }
    function guard() { return dispatching ? { ok: false, reason: 'busy' } : null; }

    // ---- 定时器（可冻结/恢复，暂停不丢剩余时间） ----
    function schedule(kind, fn, ms) {
      cancel(kind);
      var t = { id: null, dueAt: timer.now() + ms, remainingMs: ms, fn: fn };
      timers[kind] = t;
      t.id = timer.setTimeout(function () {
        if (timers[kind] !== t) { return; }
        timers[kind] = null;
        fn();
      }, ms);
    }
    function cancel(kind) {
      var t = timers[kind];
      if (!t) { return; }
      if (t.id != null) { timer.clearTimeout(t.id); }
      timers[kind] = null;
    }
    function freeze(kind) {
      var t = timers[kind];
      if (!t) { return; }
      t.remainingMs = Math.max(0, t.dueAt - timer.now());
      if (t.id != null) { timer.clearTimeout(t.id); }
      t.id = null;
    }
    function thaw(kind) {
      var t = timers[kind];
      if (!t || t.id != null) { return; }
      t.dueAt = timer.now() + t.remainingMs;
      t.id = timer.setTimeout(function () {
        if (timers[kind] !== t) { return; }
        timers[kind] = null;
        t.fn();
      }, t.remainingMs);
    }
    function cancelAll() { cancel('judge'); cancel('hide'); cancel('tick'); }

    // ---- 事件总线（逐订阅者 try/catch；派发期间禁止改状态） ----
    function subscribe(event, handler) {
      if (typeof handler !== 'function') { throw new TypeError('[MM] subscribe requires a function'); }
      var list = listeners[event] || (listeners[event] = []);
      list.push(handler);
      var active = true;
      return function unsubscribe() {
        if (!active) { return; }
        active = false;
        var i = list.indexOf(handler);
        if (i !== -1) { list.splice(i, 1); }
      };
    }
    function emit(event, payload) {
      var direct = listeners[event] ? listeners[event].slice() : [];
      var wild = listeners['*'] ? listeners['*'].slice() : [];
      dispatching = true;
      try {
        var i;
        for (i = 0; i < direct.length; i += 1) {
          try { direct[i](payload, event); } catch (err) { onError(err, event); }
        }
        for (i = 0; i < wild.length; i += 1) {
          try { wild[i](payload, event); } catch (err) { onError(err, event); }
        }
      } finally {
        dispatching = false;
      }
    }

    // ---- 局内重置（AC-38 / logic.md §6.5 清单） ----
    function resetRound(diff) {
      cancelAll();
      cards = Deck.createDeck({ pairs: diff.pairs, rng: rng, symbols: Config.SYMBOLS });
      // 牌面布尔字段在建局时显式初始化（AC-03/AC-38：faceUp/matched 恒为布尔）
      cards.forEach(function (card) { card.faceUp = false; card.matched = false; });
      flippedIds = [];
      flipCount = 0;
      score = 0;
      combo = 0;
      maxCombo = 0;
      moves = 0;
      pairsFound = 0;
      stars = null;
      timeMs = null;
      isNewRecord = false;
      lastRank = null;
      phase = 'idle';
      stopwatch.reset();
    }

    function startTick() {
      if (timers.tick) { return; }
      schedule('tick', onTick, tickMs);
    }
    function onTick() {
      if (state !== 'playing') { return; }
      emit('tick', { elapsedMs: elapsedMs() });
      if (state === 'playing' && stopwatch.isRunning()) { schedule('tick', onTick, tickMs); }
    }

    // ---- 玩法 ----
    function start() {
      var busy = guard(); if (busy) { return busy; }
      if (state !== 'menu') { return { ok: false, reason: 'invalid-state' }; }
      var diff = diffOf(difficultyId);
      if (!diff) { return { ok: false, reason: 'invalid-difficulty' }; }
      resetRound(diff);
      var from = state;
      state = 'playing';
      phase = 'idle';
      emit('state', { from: from, to: state });
      return { ok: true, state: state, difficultyId: difficultyId, cards: cards.length };
    }

    function flip(cardId) {
      var busy = guard(); if (busy) { return busy; }
      if (state === 'paused') { return { ok: false, reason: 'paused', cardId: cardId }; }
      if (state !== 'playing') { return { ok: false, reason: 'not-playing', cardId: cardId }; }
      if (phase === 'locked') { return { ok: false, reason: 'locked', cardId: cardId }; }
      var card = findCard(cardId);
      if (!card) { return { ok: false, reason: 'invalid-card', cardId: cardId }; }
      if (card.matched) { return { ok: false, reason: 'card-matched', cardId: cardId }; }
      if (card.faceUp) { return { ok: false, reason: 'card-face-up', cardId: cardId }; }

      card.faceUp = true;
      flippedIds.push(card.id);
      flipCount = flippedIds.length;

      if (flipCount === 1) {
        phase = 'one-flipped';
        if (!stopwatch.isStarted()) {
          stopwatch.start();
          startTick();
        }
        emit('flip', { cardId: card.id, symbolId: card.symbolId, flipCount: 1 });
        return { ok: true, cardId: card.id, symbolId: card.symbolId };
      }

      phase = 'locked';
      moves += 1;
      emit('flip', { cardId: card.id, symbolId: card.symbolId, flipCount: 2 });
      schedule('judge', judge, judgeDelayMs);
      return { ok: true, cardId: card.id, symbolId: card.symbolId };
    }

    function judge() {
      if (state !== 'playing' || phase !== 'locked') { return; }
      var a = findCard(flippedIds[0]);
      var b = findCard(flippedIds[1]);
      flipCount = 0;
      if (!a || !b) {
        flippedIds = [];
        phase = 'idle';
        return;
      }
      if (a.pairId === b.pairId) {
        a.matched = true;
        b.matched = true;
        combo += 1;
        maxCombo = Math.max(maxCombo, combo);
        var delta = Scoring.computeMatchScore(combo);
        score += delta;
        pairsFound += 1;
        phase = 'idle';
        flippedIds = [];
        emit('match', {
          cardIds: [a.id, b.id], pairId: a.pairId, scoreDelta: delta, score: score, combo: combo,
          maxCombo: maxCombo, moves: moves, pairsFound: pairsFound, pairsTotal: pairsTotal()
        });
        if (pairsFound === pairsTotal()) { finish(); }
      } else {
        combo = 0;
        phase = 'locked';
        emit('mismatch', { cardIds: [a.id, b.id], moves: moves, hideAfterMs: mismatchHoldMs });
        schedule('hide', hide, mismatchHoldMs);
      }
    }

    function hide() {
      if (state !== 'playing') { return; }
      var ids = flippedIds.slice();
      var i;
      for (i = 0; i < ids.length; i += 1) {
        var card = findCard(ids[i]);
        if (card) { card.faceUp = false; }
      }
      flippedIds = [];
      flipCount = 0;
      phase = 'idle';
      emit('hide', { cardIds: ids });
    }

    function finish() {
      cancelAll();
      timeMs = Math.round(stopwatch.stop());
      var diff = diffOf(difficultyId);
      stars = Scoring.computeStars({ pairs: diff.pairs, moves: moves, timeMs: timeMs });
      var completedAt;
      try {
        var wall = wallNow();
        completedAt = new Date(isFinite(wall) ? wall : 0).toISOString();
      } catch (err) {
        completedAt = new Date(0).toISOString();
      }
      var entry = { score: score, moves: moves, timeMs: timeMs, stars: stars, completedAt: completedAt };
      var result = { rank: null, isNewRecord: false, bestScore: 0 };
      try {
        result = leaderboard.add(difficultyId, entry) || result;
      } catch (err) {
        onError(err, 'leaderboard');
      }
      isNewRecord = !!result.isNewRecord;
      lastRank = result.rank;
      var from = state;
      state = 'result';
      phase = 'idle';
      emit('state', { from: from, to: 'result' });
      emit('won', {
        score: score, moves: moves, timeMs: timeMs, stars: stars, pairsTotal: pairsTotal(),
        difficultyId: difficultyId, maxCombo: maxCombo, isNewRecord: isNewRecord, rank: lastRank
      });
    }

    function pause() {
      var busy = guard(); if (busy) { return busy; }
      if (state !== 'playing') { return { ok: false, reason: 'invalid-state' }; }
      freeze('judge');
      freeze('hide');
      cancel('tick');
      stopwatch.pause();
      var from = state;
      state = 'paused';
      emit('state', { from: from, to: 'paused' });
      return { ok: true, state: state };
    }

    function resume() {
      var busy = guard(); if (busy) { return busy; }
      if (state !== 'paused') { return { ok: false, reason: 'invalid-state' }; }
      var from = state;
      state = 'playing';
      stopwatch.resume();
      startTick();
      thaw('judge');
      thaw('hide');
      emit('state', { from: from, to: 'playing' });
      return { ok: true, state: state };
    }

    function restart() {
      var busy = guard(); if (busy) { return busy; }
      if (state !== 'playing' && state !== 'paused' && state !== 'result') {
        return { ok: false, reason: 'invalid-state' };
      }
      var diff = diffOf(difficultyId);
      if (!diff) { return { ok: false, reason: 'invalid-difficulty' }; }
      var from = state;
      resetRound(diff);
      state = 'playing';
      if (from !== state) { emit('state', { from: from, to: state }); }
      emit('restart', { difficultyId: difficultyId, snapshot: getSnapshot() });
      return { ok: true, state: state, difficultyId: difficultyId };
    }

    function switchDifficulty(id) {
      var busy = guard(); if (busy) { return busy; }
      if (state !== 'playing' && state !== 'paused') { return { ok: false, reason: 'invalid-state' }; }
      var diff = diffOf(id);
      if (!diff) { return { ok: false, reason: 'invalid-difficulty' }; }
      var from = state;
      settings.setDifficulty(id);
      difficultyId = id;
      resetRound(diff);
      state = 'playing';
      if (from !== state) { emit('state', { from: from, to: state }); }
      emit('settings', { muted: muted, difficultyId: difficultyId });
      emit('restart', { difficultyId: difficultyId, snapshot: getSnapshot() });
      return { ok: true, state: state, difficultyId: difficultyId };
    }

    function selectDifficulty(id) {
      var busy = guard(); if (busy) { return busy; }
      if (state !== 'menu') { return { ok: false, reason: 'invalid-state' }; }
      if (!diffOf(id)) { return { ok: false, reason: 'invalid-difficulty' }; }
      difficultyId = id;
      settings.setDifficulty(id);
      emit('settings', { muted: muted, difficultyId: difficultyId });
      return { ok: true, difficultyId: difficultyId, state: state };
    }

    function goToMenu() {
      var busy = guard(); if (busy) { return busy; }
      if (state === 'menu') { return { ok: true, state: state }; }
      cancelAll();
      stopwatch.reset();
      cards = [];
      flippedIds = [];
      flipCount = 0;
      score = 0;
      combo = 0;
      maxCombo = 0;
      moves = 0;
      pairsFound = 0;
      stars = null;
      timeMs = null;
      isNewRecord = false;
      lastRank = null;
      phase = 'idle';
      var from = state;
      state = 'menu';
      emit('state', { from: from, to: state });
      return { ok: true, state: state };
    }

    function openLeaderboard() {
      var busy = guard(); if (busy) { return busy; }
      if (state !== 'menu' && state !== 'result') { return { ok: false, reason: 'invalid-state' }; }
      returnState = state;
      var from = state;
      state = 'leaderboard';
      emit('state', { from: from, to: state });
      return { ok: true, state: state };
    }

    function closeLeaderboard() {
      var busy = guard(); if (busy) { return busy; }
      if (state !== 'leaderboard') { return { ok: false, reason: 'invalid-state' }; }
      var from = state;
      state = returnState === 'result' ? 'result' : 'menu';
      emit('state', { from: from, to: state });
      return { ok: true, state: state };
    }

    function toggleMute() {
      var busy = guard(); if (busy) { return busy; }
      muted = !muted;
      settings.setMuted(muted);
      emit('settings', { muted: muted, difficultyId: difficultyId });
      return { ok: true, muted: muted };
    }

    function handleVisibilityChange(hidden) {
      var busy = guard(); if (busy) { return busy; }
      if (hidden && state === 'playing') { return pause(); }
      return { ok: true, state: state };
    }

    function clearLeaderboard(id) {
      var busy = guard(); if (busy) { return busy; }
      var target = id || difficultyId;
      if (!diffOf(target)) { return { ok: false, reason: 'invalid-difficulty' }; }
      leaderboard.clear(target);
      return { ok: true, difficultyId: target, entries: leaderboard.list(target) };
    }

    function clearAllLeaderboards() {
      var busy = guard(); if (busy) { return busy; }
      leaderboard.clearAll();
      return { ok: true };
    }

    // ---- 只读查询 ----
    function getSnapshot() {
      var frozenCards = cards.map(function (c) {
        return Object.freeze({ id: c.id, pairId: c.pairId, symbolId: c.symbolId, faceUp: !!c.faceUp, matched: !!c.matched });
      });
      var isResult = state === 'result';
      var snap = {
        state: state,
        phase: (state === 'playing' || state === 'paused') ? phase : 'idle',
        difficultyId: difficultyId,
        pairsTotal: pairsTotal(),
        cards: Object.freeze(frozenCards),
        flipCount: flipCount,
        score: score,
        combo: combo,
        maxCombo: maxCombo,
        moves: moves,
        pairsFound: pairsFound,
        elapsedMs: isResult && timeMs != null ? timeMs : elapsedMs(),
        muted: muted,
        bestScore: leaderboard.best(difficultyId),
        stars: isResult ? stars : null,
        timeMs: isResult ? timeMs : null,
        isNewRecord: isResult ? isNewRecord : false,
        seed: seed
      };
      return Object.freeze(snap);
    }

    function getLeaderboard(id) { return leaderboard.list(id || difficultyId); }
    function getBestScore(id) { return leaderboard.best(id || difficultyId); }
    function getSettings() { return settings.get(); }

    return {
      start: start,
      pause: pause,
      resume: resume,
      restart: restart,
      switchDifficulty: switchDifficulty,
      selectDifficulty: selectDifficulty,
      goToMenu: goToMenu,
      openLeaderboard: openLeaderboard,
      closeLeaderboard: closeLeaderboard,
      toggleMute: toggleMute,
      handleVisibilityChange: handleVisibilityChange,
      flip: flip,
      clearLeaderboard: clearLeaderboard,
      clearAllLeaderboards: clearAllLeaderboards,
      getSnapshot: getSnapshot,
      getLeaderboard: getLeaderboard,
      getBestScore: getBestScore,
      getSettings: getSettings,
      subscribe: subscribe
    };
  }

  return { createGame: createGame };
});
