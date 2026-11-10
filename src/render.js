/* MM · DOM 渲染（IIFE，浏览器；快照 → 视图模型 → 增量更新；事件委托不重绑） */
(function (root) {
  'use strict';
  root.MM = root.MM || {};
  root.MM.Platform = root.MM.Platform || {};
  var ANNOUNCE_GAP_MS = 300; // aria-live 合并窗口（render.md §8.4）
  var HINT_MS = 2000;        // 鼓励提示条停留（Q-16）
  var HINT_FADE_MS = 220;
  function createRenderer(options) {
    options = options || {};
    var doc = options.doc || root.document;
    var game = options.game;
    var fx = options.fx || null;
    var RM = root.MM.Core.RenderModel;
    var Config = root.MM.Core.Config;
    if (!RM) { throw new Error('[MM] Render requires MM.Core.RenderModel'); }
    if (!Config) { throw new Error('[MM] Render requires MM.Core.Config'); }
    if (!game) { throw new Error('[MM] Render requires game'); }
    function byId(id) { return doc.getElementById(id); }
    function mk(tag, cls, text) {
      var node = doc.createElement(tag);
      if (cls) { node.className = cls; }
      if (text != null) { node.textContent = text; }
      return node;
    }
    function px(value) { var n = parseFloat(value); return isNaN(n) ? 0 : n; }
    function focus(node) {
      if (!node || typeof node.focus !== 'function') { return; }
      try { node.focus({ preventScroll: true }); } catch (err) { node.focus(); }
    }
    var el = {
      menu: byId('screen-menu'), game: byId('screen-game'), pause: byId('screen-pause'),
      result: byId('screen-result'), leaderboard: byId('screen-leaderboard'),
      board: byId('board'), hud: byId('hud'), foot: byId('game-foot'),
      hudDifficulty: byId('hud-difficulty'), hudScore: byId('hud-score'), hudCombo: byId('hud-combo'),
      hudMoves: byId('hud-moves'), hudTime: byId('hud-time'), hudBest: byId('hud-best'),
      hudProgress: byId('hud-progress'), hint: byId('hint'),
      resultStars: byId('result-stars'), resultScore: byId('result-score'),
      resultMoves: byId('result-moves'), resultTime: byId('result-time'),
      resultRecord: byId('result-record'), resultEncourage: byId('result-encourage'),
      lbRows: byId('lb-rows'), lbEmpty: byId('lb-empty'), lbTable: byId('lb-table'),
      confirm: byId('confirm'), confirmText: byId('confirm-text'),
      confirmOk: byId('btn-confirm-ok'), confirmCancel: byId('btn-confirm-cancel'),
      sr: byId('sr-status')
    };
    var lastScreen = null;
    var boardSig = '';
    var cardsById = Object.create(null); // id -> { btn, sym, name }
    var currentLayout = null;
    var layoutDirty = true;
    var cachedEnv = null;
    var cachedChrome = null;
    var lbDifficulty = 'easy';
    var confirmCallback = null;
    var confirmReturnFocus = null;
    var pausedCardId = null;
    var mounted = false;
    var announceTimer = null;
    var pendingAnnounce = '';
    var lastAnnounceAt = 0;
    var hintTimer = null;
    var hintHideTimer = null;
    var inertSupported = !!(el.game && 'inert' in el.game);
    var fallbackInertNodes = [];
    function selectedDiffButton() {
      return doc.querySelector('[data-difficulty="' + game.getSnapshot().difficultyId + '"]');
    }
    function currentTab() { return doc.querySelector('[data-lb-difficulty="' + lbDifficulty + '"]'); }

    // ---- 背景 inert / 焦点陷阱（Q-02） ----
    function setGameInert(on) {
      if (!el.game) { return; }
      if (inertSupported) {
        el.game.inert = on;
        el.game.removeAttribute('aria-hidden');
        return;
      }
      var i, node;
      if (on) {
        fallbackInertNodes = [];
        var nodes = el.game.querySelectorAll('button, [tabindex]');
        for (i = 0; i < nodes.length; i += 1) {
          node = nodes[i];
          fallbackInertNodes.push([node, node.getAttribute('tabindex')]);
          node.setAttribute('tabindex', '-1');
        }
        el.game.setAttribute('aria-hidden', 'true');
      } else {
        for (i = 0; i < fallbackInertNodes.length; i += 1) {
          node = fallbackInertNodes[i][0];
          var prev = fallbackInertNodes[i][1];
          if (prev == null) { node.removeAttribute('tabindex'); } else { node.setAttribute('tabindex', prev); }
        }
        fallbackInertNodes = [];
        el.game.removeAttribute('aria-hidden');
      }
    }
    function trapTab(container, getNodes) {
      if (!container) { return; }
      container.addEventListener('keydown', function (event) {
        if (event.key !== 'Tab') { return; }
        var nodes = getNodes().filter(function (node) { return node && !node.hidden && node.offsetParent !== null; });
        if (!nodes.length) { return; }
        var index = nodes.indexOf(doc.activeElement);
        event.preventDefault();
        var next = event.shiftKey
          ? (index <= 0 ? nodes.length - 1 : index - 1)
          : (index === nodes.length - 1 || index === -1 ? 0 : index + 1);
        focus(nodes[next]);
      });
    }

    // ---- 屏幕切换 + 焦点管理（render.md §8.3） ----
    function showScreen(name, prev) {
      var gameVisible = (name === 'playing' || name === 'paused');
      if (el.menu) { el.menu.hidden = name !== 'menu'; }
      if (el.game) { el.game.hidden = !gameVisible; }
      if (el.pause) { el.pause.hidden = name !== 'paused'; }
      if (el.result) { el.result.hidden = name !== 'result'; }
      if (el.leaderboard) { el.leaderboard.hidden = name !== 'leaderboard'; }
      setGameInert(name === 'paused');
      if (name === 'paused' && prev === 'playing') {
        var active = doc.activeElement;
        pausedCardId = active && active.getAttribute ? active.getAttribute('data-card-id') : null;
        focus(byId('btn-resume'));
      } else if (name === 'result') {
        focus(byId('btn-again'));
      } else if (name === 'leaderboard') {
        focus(currentTab());
      } else if (name === 'menu' && prev && prev !== 'menu') {
        focus(selectedDiffButton());
      }
    }
    function renderMute(muted) {
      var i;
      var icons = doc.querySelectorAll('[data-mute-icon]');
      for (i = 0; i < icons.length; i += 1) { icons[i].textContent = muted ? '🔇' : '🔊'; }
      var labels = doc.querySelectorAll('[data-mute-label]');
      for (i = 0; i < labels.length; i += 1) { labels[i].textContent = muted ? '音效关' : '音效开'; }
      var btns = [byId('btn-mute'), byId('btn-mute-game')];
      for (i = 0; i < btns.length; i += 1) {
        if (!btns[i]) { continue; }
        btns[i].setAttribute('aria-pressed', muted ? 'true' : 'false');
        btns[i].setAttribute('aria-label', muted ? '音效已关闭，点击开启' : '音效已开启，点击关闭');
      }
    }
    function renderMenu(snap) {
      var ids = Config.DIFFICULTY_IDS;
      for (var i = 0; i < ids.length; i += 1) {
        var diff = Config.getDifficulty(ids[i]);
        var btn = doc.querySelector('[data-difficulty="' + ids[i] + '"]');
        if (!btn || !diff) { continue; }
        var best = game.getBestScore(ids[i]);
        btn.setAttribute('aria-pressed', ids[i] === snap.difficultyId ? 'true' : 'false');
        btn.setAttribute('aria-label', diff.name + '，' + diff.cols + '×' + diff.rows + '，' + diff.pairs + ' 对，最佳 ' + best + ' 分');
        var bestEl = btn.querySelector('[data-best]');
        if (bestEl) { bestEl.textContent = '最佳 ' + best + ' 分'; }
      }
    }

    // ---- 布局：DOM 实测只在此处发生，其余渲染复用缓存（Q-23） ----
    function measureEnv() {
      var vw = root.innerWidth || (doc.documentElement && doc.documentElement.clientWidth) || 360;
      var vh = root.innerHeight || (doc.documentElement && doc.documentElement.clientHeight) || 640;
      var bodyStyle = root.getComputedStyle ? root.getComputedStyle(doc.body) : null;
      return {
        viewport: { w: vw, h: vh },
        safeInsets: {
          top: bodyStyle ? px(bodyStyle.paddingTop) : 0,
          right: bodyStyle ? px(bodyStyle.paddingRight) : 0,
          bottom: bodyStyle ? px(bodyStyle.paddingBottom) : 0,
          left: bodyStyle ? px(bodyStyle.paddingLeft) : 0
        }
      };
    }
    function measureChrome() {
      var screenStyle = root.getComputedStyle ? root.getComputedStyle(el.game) : null;
      var pagePadY = screenStyle ? px(screenStyle.paddingTop) : 6;
      if (!pagePadY) { pagePadY = 6; }
      return {
        hudH: el.hud ? el.hud.getBoundingClientRect().height : 76,
        footerH: el.foot ? el.foot.getBoundingClientRect().height : 56,
        pagePadY: pagePadY
      };
    }
    function layoutInputs() {
      return {
        viewport: cachedEnv.viewport,
        safeInsets: cachedEnv.safeInsets,
        chrome: cachedChrome,
        limits: { minCard: 44, maxCard: 96, boardMaxW: 720, boardPad: 2 }
      };
    }
    function computeLayoutNow() {
      var snap = game.getSnapshot();
      var diff = Config.getDifficulty(snap.difficultyId);
      if (!diff || !el.board) { return null; }
      cachedEnv = measureEnv();
      cachedChrome = measureChrome();
      var input = layoutInputs();
      input.grid = { cols: diff.cols, rows: diff.rows };
      var layout = RM.computeLayout(input);
      currentLayout = layout;
      el.board.style.setProperty('--cols', String(diff.cols));
      el.board.style.setProperty('--card-size', layout.cardSize.toFixed(2) + 'px');
      el.board.style.setProperty('--gap', layout.gap.toFixed(2) + 'px');
      if (doc.body) { doc.body.classList.toggle('needs-scroll', layout.needsScroll); }
      layoutDirty = false;
      return layout;
    }
    function buildVm(snap) {
      if (!cachedEnv) { cachedEnv = measureEnv(); }
      if (!cachedChrome) { cachedChrome = measureChrome(); }
      var input = layoutInputs();
      input.grid = { cols: 1, rows: 1 }; // 由 buildViewModel 内部按难度覆盖
      input.reducedMotion = false;
      return RM.buildViewModel(snap, input);
    }
    function renderHudVm(hud) {
      if (el.hudDifficulty) { el.hudDifficulty.textContent = hud.difficultyLabel; }
      if (el.hudScore) { el.hudScore.textContent = String(hud.score); }
      if (el.hudCombo) {
        el.hudCombo.textContent = '连击 ×' + hud.combo;
        el.hudCombo.classList.toggle('is-hot', hud.combo >= 2);
      }
      if (el.hudMoves) { el.hudMoves.textContent = String(hud.moves); }
      if (el.hudTime) { el.hudTime.textContent = hud.timeText; }
      if (el.hudBest) { el.hudBest.textContent = hud.bestText; }
      if (el.hudProgress) { el.hudProgress.textContent = hud.progressText; }
      if (el.hud) {
        el.hud.setAttribute('aria-label', '分数 ' + hud.score + '，连击 ' + hud.combo +
          '，步数 ' + hud.moves + '，用时 ' + hud.timeText + '，' + hud.bestText);
      }
    }
    function boardSignature(snap) {
      var sig = snap.difficultyId + ':' + snap.cards.length;
      for (var i = 0; i < snap.cards.length; i += 1) { sig += ',' + snap.cards[i].pairId; }
      return sig;
    }
    function buildBoard(snap) {
      var frag = doc.createDocumentFragment();
      cardsById = Object.create(null);
      snap.cards.forEach(function (card) {
        var btn = mk('button', 'card');
        btn.type = 'button';
        btn.setAttribute('data-card-id', String(card.id));
        var inner = mk('span', 'card__inner');
        var back = mk('span', 'card__face card__face--back');
        back.setAttribute('aria-hidden', 'true');
        back.appendChild(mk('span', 'card__back-mark', '?'));
        var front = mk('span', 'card__face card__face--front');
        front.setAttribute('aria-hidden', 'true');
        var sym = mk('span', 'card__symbol');
        var name = mk('span', 'card__name');
        front.appendChild(sym);
        front.appendChild(name);
        inner.appendChild(back);
        inner.appendChild(front);
        btn.appendChild(inner);
        frag.appendChild(btn);
        cardsById[card.id] = { btn: btn, sym: sym, name: name }; // 缓存节点引用（I-14）
      });
      if (el.board) { el.board.replaceChildren(frag); }
      boardSig = boardSignature(snap);
      hideHint();
    }
    function updateBoard(cardViews) {
      cardViews.forEach(function (view) {
        var refs = cardsById[view.id];
        if (!refs) { return; }
        refs.btn.classList.toggle('is-face-up', view.faceUp);
        refs.btn.classList.toggle('is-matched', view.matched);
        refs.btn.classList.toggle('is-labeled', view.labeled);
        refs.btn.classList.remove('is-shake');
        refs.btn.setAttribute('aria-label', view.ariaLabel);
        refs.btn.setAttribute('aria-pressed', view.ariaPressed ? 'true' : 'false');
        if (view.disabled) { refs.btn.setAttribute('aria-disabled', 'true'); }
        else { refs.btn.removeAttribute('aria-disabled'); }
        if (refs.sym.textContent !== view.emoji) { refs.sym.textContent = view.emoji; }
        if (refs.name.textContent !== view.name) { refs.name.textContent = view.name; }
      });
    }
    function firstCard() {
      var keys = Object.keys(cardsById);
      return keys.length ? cardsById[keys[0]].btn : null;
    }
    function renderGame(snap) {
      var rebuilt = false;
      if (boardSig !== boardSignature(snap)) {
        buildBoard(snap);
        rebuilt = true;
        layoutDirty = true;
      }
      if (layoutDirty || !currentLayout) { computeLayoutNow(); }
      var vm = buildVm(snap);
      renderHudVm(vm.hud);
      updateBoard(vm.cards);
      if (rebuilt) {
        focus(firstCard());
      } else if (snap.state === 'playing' && lastScreen === 'paused') {
        var refs = pausedCardId != null ? cardsById[pausedCardId] : null;
        focus(refs ? refs.btn : firstCard());
      } else if (snap.state === 'playing' && (!lastScreen || lastScreen === 'menu' || lastScreen === 'result')) {
        focus(firstCard());
      }
    }
    function renderResult(snap, prev) {
      var stars = snap.stars || 1;
      var nodes = el.resultStars ? el.resultStars.querySelectorAll('.star') : [];
      var i;
      if (prev !== 'result') {
        for (i = 0; i < nodes.length; i += 1) { nodes[i].classList.remove('is-on'); }
        if (el.resultStars) { void el.resultStars.offsetWidth; } // 强制 reflow：同星级也重播（Q-22）
      }
      for (i = 0; i < nodes.length; i += 1) { nodes[i].classList.toggle('is-on', i < stars); }
      if (el.resultStars) { el.resultStars.setAttribute('aria-label', stars + ' 星'); }
      if (el.resultScore) { el.resultScore.textContent = String(snap.score); }
      if (el.resultMoves) { el.resultMoves.textContent = '步数 ' + snap.moves; }
      if (el.resultTime) { el.resultTime.textContent = '用时 ' + RM.formatTime(snap.timeMs || 0); }
      if (el.resultRecord) { el.resultRecord.hidden = !snap.isNewRecord; }
      if (el.resultEncourage) {
        if (stars === 1) { el.resultEncourage.textContent = '慢慢来，你已经很棒了！'; el.resultEncourage.hidden = false; }
        else if (stars === 2) { el.resultEncourage.textContent = '很接近啦，再试一次！'; el.resultEncourage.hidden = false; }
        else { el.resultEncourage.hidden = true; }
      }
    }
    function renderLeaderboard() {
      var tabs = doc.querySelectorAll('[data-lb-difficulty]');
      for (var i = 0; i < tabs.length; i += 1) {
        tabs[i].setAttribute('aria-pressed', tabs[i].getAttribute('data-lb-difficulty') === lbDifficulty ? 'true' : 'false');
      }
      var entries = game.getLeaderboard(lbDifficulty);
      if (el.lbRows) {
        el.lbRows.replaceChildren();
        entries.forEach(function (e, index) {
          var tr = doc.createElement('tr');
          [String(index + 1), String(e.score), String(e.moves), RM.formatTime(e.timeMs), '⭐'.repeat(e.stars), RM.formatDate(e.completedAt)]
            .forEach(function (text) {
              var td = doc.createElement('td');
              td.textContent = text;
              tr.appendChild(td);
            });
          el.lbRows.appendChild(tr);
        });
      }
      if (el.lbEmpty) { el.lbEmpty.hidden = entries.length > 0; }
      if (el.lbTable) { el.lbTable.hidden = entries.length === 0; }
    }
    function render(snap) {
      var prev = lastScreen;
      if (snap.state !== prev) {
        // 先定位页签再切屏，保证焦点落在当前难度（Q-06）
        if (snap.state === 'leaderboard' && prev !== 'leaderboard') { lbDifficulty = snap.difficultyId; }
        showScreen(snap.state, prev);
      }
      if (snap.state === 'menu') { renderMenu(snap); }
      else if (snap.state === 'playing' || snap.state === 'paused') { renderGame(snap); }
      else if (snap.state === 'result') { renderResult(snap, prev); }
      else if (snap.state === 'leaderboard') { renderLeaderboard(); }
      renderMute(snap.muted);
      if (snap.state !== 'playing') { hideHint(); }
      lastScreen = snap.state;
    }

    // ---- aria-live 播报（≥300ms 合并，保留最后一条；Q-14） ----
    function setSr(text) { if (el.sr) { el.sr.textContent = text; } }
    function announce(text) {
      var now = Date.now();
      if (announceTimer == null && now - lastAnnounceAt >= ANNOUNCE_GAP_MS) {
        lastAnnounceAt = now;
        setSr(text);
        return;
      }
      pendingAnnounce = text;
      if (announceTimer == null) {
        announceTimer = root.setTimeout(function () {
          announceTimer = null;
          if (pendingAnnounce) {
            setSr(pendingAnnounce);
            pendingAnnounce = '';
            lastAnnounceAt = Date.now();
          }
        }, Math.max(0, ANNOUNCE_GAP_MS - (now - lastAnnounceAt)));
      }
    }

    // ---- 可见鼓励提示条（Q-16） ----
    function hideHint() {
      if (hintTimer != null) { root.clearTimeout(hintTimer); hintTimer = null; }
      if (hintHideTimer != null) { root.clearTimeout(hintHideTimer); hintHideTimer = null; }
      if (!el.hint) { return; }
      el.hint.classList.remove('is-visible');
      el.hint.hidden = true;
    }
    function showHint(text) {
      if (!el.hint) { return; }
      hideHint();
      el.hint.textContent = text;
      el.hint.hidden = false;
      void el.hint.offsetWidth; // 触发淡入
      el.hint.classList.add('is-visible');
      hintTimer = root.setTimeout(function () {
        hintTimer = null;
        el.hint.classList.remove('is-visible');
        hintHideTimer = root.setTimeout(function () {
          hintHideTimer = null;
          el.hint.hidden = true;
        }, HINT_FADE_MS);
      }, HINT_MS);
    }
    function shake(cardIds) {
      (cardIds || []).forEach(function (id) {
        var refs = cardsById[id];
        if (refs) { refs.btn.classList.add('is-shake'); }
      });
    }
    function burstAtCard(cardId, count) {
      if (!fx) { return; }
      var refs = cardsById[cardId];
      if (!refs) { return; }
      var rect = refs.btn.getBoundingClientRect();
      fx.burst(rect.left + rect.width / 2, rect.top + rect.height / 2, count || 10);
    }
    function renderHud(snap) { renderHudVm(buildVm(snap).hud); }
    // resize/orientationchange：重算布局并刷新卡片视图（labeled 等）
    function applyLayout() {
      computeLayoutNow();
      var snap = game.getSnapshot();
      if (snap.state === 'playing' || snap.state === 'paused') { updateBoard(buildVm(snap).cards); }
      return currentLayout;
    }
    function isConfirmOpen() { return !!(el.confirm && !el.confirm.hidden); }
    function showConfirm(message, onOk) {
      if (!el.confirm) { if (onOk) { onOk(); } return; }
      confirmCallback = onOk || null;
      confirmReturnFocus = doc.activeElement;
      if (el.confirmText) { el.confirmText.textContent = message; }
      el.confirm.hidden = false;
      focus(el.confirmCancel);
    }
    function closeConfirm() {
      if (!el.confirm) { return; }
      el.confirm.hidden = true;
      confirmCallback = null;
      var back = confirmReturnFocus;
      confirmReturnFocus = null;
      if (back && back.focus && !back.hidden) { focus(back); }
    }
    function cancelConfirm() { if (isConfirmOpen()) { closeConfirm(); } }
    function setLeaderboardDifficulty(id) {
      if (Config.DIFFICULTY_IDS.indexOf(id) === -1) { return; }
      lbDifficulty = id;
      renderLeaderboard();
    }
    function mount() {
      if (mounted) { return; }
      mounted = true;
      if (el.confirmOk) {
        el.confirmOk.addEventListener('click', function () {
          var cb = confirmCallback;
          closeConfirm();
          if (cb) { cb(); }
        });
      }
      if (el.confirmCancel) { el.confirmCancel.addEventListener('click', function () { closeConfirm(); }); }
      trapTab(el.confirm, function () { return [el.confirmCancel, el.confirmOk]; });
      trapTab(el.pause, function () { return [byId('btn-resume'), byId('btn-restart-pause'), byId('btn-home-pause')]; });
    }
    return {
      mount: mount,
      render: render,
      renderHud: renderHud,
      applyLayout: applyLayout,
      announce: announce,
      showHint: showHint,
      hideHint: hideHint,
      shake: shake,
      burstAtCard: burstAtCard,
      showConfirm: showConfirm,
      closeConfirm: closeConfirm,
      cancelConfirm: cancelConfirm,
      isConfirmOpen: isConfirmOpen,
      setLeaderboardDifficulty: setLeaderboardDifficulty,
      getLeaderboardDifficulty: function () { return lbDifficulty; },
      getLayout: function () { return currentLayout; }
    };
  }
  root.MM.Platform.Render = { createRenderer: createRenderer };
})(typeof globalThis !== 'undefined' ? globalThis : this);
