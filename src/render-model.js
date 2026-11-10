/* MM · 视图模型（UMD，纯函数，无 DOM；Node 可测） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core/config.js'));
  } else {
    root.MM = root.MM || {};
    root.MM.Core = root.MM.Core || {};
    root.MM.Core.RenderModel = factory(root.MM.Core.Config);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Config) {
  'use strict';
  if (!Config) { throw new Error('[MM] RenderModel requires MM.Core.Config'); }

  var SYMBOL_MAP = {};
  Config.SYMBOLS.forEach(function (s) { SYMBOL_MAP[s.id] = s; });

  function getSymbol(symbolId) {
    return SYMBOL_MAP[symbolId] || { id: symbolId, emoji: '?', name: '未知' };
  }

  function clamp(min, value, max) {
    return Math.max(min, Math.min(max, value));
  }

  // SPEC §6.8：mm:ss（分钟不补零、秒补零）
  function formatTime(ms) {
    var total = Math.max(0, Math.floor((ms || 0) / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ISO 时间戳 → YYYY-MM-DD；非法值返回 '—'（排行榜日期列）
  function formatDate(iso) {
    var t = Date.parse(iso);
    if (isNaN(t)) { return '—'; }
    var d = new Date(t);
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }

  // render.md §4.2 布局算法（纯函数）：只算卡片边长，网格形状由 SPEC 固定
  function computeLayout(input) {
    input = input || {};
    var viewport = input.viewport || { w: 360, h: 640 };
    var safe = input.safeInsets || { top: 0, right: 0, bottom: 0, left: 0 };
    var chrome = input.chrome || { hudH: 76, footerH: 56, pagePadY: 6 };
    var grid = input.grid || { cols: 4, rows: 4 };
    var limits = input.limits || {};
    var minCard = limits.minCard != null ? limits.minCard : 44;
    var maxCard = limits.maxCard != null ? limits.maxCard : 96;
    var boardMaxW = limits.boardMaxW != null ? limits.boardMaxW : 720;
    var boardPad = limits.boardPad != null ? limits.boardPad : 2; // .board 的 padding（Q-05）

    var w = Math.max(0, viewport.w || 0);
    var h = Math.max(0, viewport.h || 0);
    var vmin = Math.min(w, h);

    var padX = clamp(6, 0.015 * vmin, 16);
    var availW = w - 2 * padX - (safe.left || 0) - (safe.right || 0);
    var availH = h - chrome.hudH - chrome.footerH - 2 * chrome.pagePadY - (safe.top || 0) - (safe.bottom || 0);
    var gap = clamp(4, 0.015 * Math.min(availW, availH), 12);
    var cardW = (availW - 2 * boardPad - gap * (grid.cols - 1)) / grid.cols;
    var cardH = (availH - 2 * boardPad - gap * (grid.rows - 1)) / grid.rows;
    var raw = Math.min(cardW, cardH);
    var cardSize = Math.min(maxCard, Math.max(minCard, raw));
    var boardW = Math.min(grid.cols * cardSize + gap * (grid.cols - 1) + 2 * boardPad, boardMaxW);
    var boardH = grid.rows * cardSize + gap * (grid.rows - 1) + 2 * boardPad;
    var fitsViewport = boardW <= availW && boardH <= availH;

    return {
      cols: grid.cols,
      rows: grid.rows,
      padX: padX,
      gap: gap,
      cardSize: cardSize,
      boardW: boardW,
      boardH: boardH,
      fitsViewport: fitsViewport,
      needsScroll: !fitsViewport
    };
  }

  // 快照 + env → 视图模型（render.md §13.6）
  function buildViewModel(snapshot, env) {
    env = env || {};
    var diff = Config.getDifficulty(snapshot.difficultyId) || Config.DIFFICULTIES.easy;
    var layout = computeLayout({
      viewport: env.viewport,
      safeInsets: env.safeInsets,
      chrome: env.chrome,
      grid: { cols: diff.cols, rows: diff.rows },
      limits: env.limits
    });

    var cards = snapshot.cards.map(function (card, index) {
      var sym = getSymbol(card.symbolId);
      var ariaLabel;
      if (card.matched) { ariaLabel = '已配对，' + sym.name; }
      else if (card.faceUp) { ariaLabel = '已翻开，' + sym.name; }
      else { ariaLabel = '未翻开的卡片'; }
      return {
        id: card.id,
        index: index,
        faceUp: card.faceUp,
        matched: card.matched,
        disabled: card.matched || snapshot.phase === 'locked',
        symbolId: card.symbolId,
        emoji: sym.emoji,
        name: sym.name,
        ariaLabel: ariaLabel,
        ariaPressed: card.faceUp,
        tabIndex: 0,
        labeled: layout.cardSize >= 64
      };
    });

    var overlay = null;
    if (snapshot.state === 'paused') { overlay = 'pause'; }
    else if (snapshot.state === 'result') { overlay = 'result'; }
    else if (snapshot.state === 'leaderboard') { overlay = 'leaderboard'; }

    return {
      screen: snapshot.state,
      layout: layout,
      hud: {
        difficultyLabel: diff.name,
        score: snapshot.score,
        combo: snapshot.combo,
        moves: snapshot.moves,
        timeText: formatTime(snapshot.elapsedMs),
        bestText: '最佳 ' + snapshot.bestScore + ' 分',
        progressText: '进度 ' + snapshot.pairsFound + '/' + snapshot.pairsTotal,
        muted: snapshot.muted
      },
      cards: cards,
      overlay: overlay,
      liveText: env.liveText || ''
    };
  }

  return {
    computeLayout: computeLayout,
    buildViewModel: buildViewModel,
    formatTime: formatTime,
    formatDate: formatDate,
    getSymbol: getSymbol
  };
});
