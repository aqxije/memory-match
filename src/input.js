/* MM · 输入映射（IIFE，浏览器；事件委托，重开不重绑监听器） */
(function (root) {
  'use strict';
  root.MM = root.MM || {};
  root.MM.Platform = root.MM.Platform || {};

  function createInput(options) {
    options = options || {};
    var doc = options.doc || root.document;
    var win = options.win || root;
    var game = options.game;
    var renderer = options.renderer;
    var audio = options.audio || null; // 仅用于按钮点击音效
    if (!game) { throw new Error('[MM] Input requires game'); }
    if (!renderer) { throw new Error('[MM] Input requires renderer'); }

    var bound = false;
    var resizeTimer = null;

    function byId(id) { return doc.getElementById(id); }

    function click(id, handler) {
      var node = byId(id);
      if (node) { node.addEventListener('click', handler); }
    }

    function onDifficultyClick(event) {
      var id = event.currentTarget.getAttribute('data-difficulty');
      if (id) { game.selectDifficulty(id); }
    }

    function confirmRestart() {
      var state = game.getSnapshot().state;
      if (state !== 'playing' && state !== 'paused') { return; }
      renderer.showConfirm('重开这一局吗？当前进度会清空。', function () { game.restart(); });
    }

    function confirmClear() {
      var id = renderer.getLeaderboardDifficulty();
      var diff = root.MM.Core.Config.getDifficulty(id);
      renderer.showConfirm('仅清空「' + (diff ? diff.name : '') + '」的记录吗？其他难度不受影响。', function () {
        game.clearLeaderboard(id);
        renderer.render(game.getSnapshot());
      });
    }

    function onBoardClick(event) {
      var target = event.target;
      var cardEl = target && target.closest ? target.closest('[data-card-id]') : null;
      if (!cardEl) { return; }
      var id = parseInt(cardEl.getAttribute('data-card-id'), 10);
      if (isNaN(id)) { return; }
      game.flip(id); // reason 静默忽略（不向儿童展示错误）
    }

    function onDocumentClick(event) {
      var target = event.target;
      if (!target || !target.closest) { return; }
      if (target.closest('[data-card-id]')) { return; } // 卡片音效由 flip 事件驱动
      var btn = target.closest('button');
      if (btn && audio) { audio.play('button'); }
    }

    function onKeydown(event) {
      if (event.key === 'Escape') {
        if (renderer.isConfirmOpen()) { renderer.cancelConfirm(); return; }
        var state = game.getSnapshot().state;
        if (state === 'playing') { game.pause(); }
        else if (state === 'paused') { game.resume(); }
        else if (state === 'leaderboard') { game.closeLeaderboard(); }
      } else if (event.key === 'm' || event.key === 'M') {
        var el = event.target;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) { return; }
        game.toggleMute();
      }
    }

    function onVisibilityChange() {
      game.handleVisibilityChange(doc.hidden);
    }

    function onResize() {
      if (resizeTimer != null) { win.clearTimeout(resizeTimer); }
      resizeTimer = win.setTimeout(function () {
        resizeTimer = null;
        renderer.applyLayout();
      }, 150);
    }

    function unlockAudio() {
      if (audio) { audio.unlock(); }
    }

    function bind() {
      if (bound) { return; }
      bound = true;

      // 首次用户手势解锁音频（capture, once；不参与游戏逻辑）
      doc.addEventListener('pointerdown', unlockAudio, { capture: true, once: true, passive: true });
      doc.addEventListener('keydown', unlockAudio, { capture: true, once: true });

      // 棋盘事件委托：只绑一次，重开/换难度不重绑（AC-61）
      var board = byId('board');
      if (board) { board.addEventListener('click', onBoardClick); }

      // 菜单
      click('btn-start', function () { game.start(); });
      var diffs = doc.querySelectorAll('[data-difficulty]');
      for (var i = 0; i < diffs.length; i += 1) { diffs[i].addEventListener('click', onDifficultyClick); }
      click('btn-mute', function () { game.toggleMute(); });
      click('btn-mute-game', function () { game.toggleMute(); });
      click('btn-leaderboard', function () { game.openLeaderboard(); });

      // 游戏
      click('btn-pause', function () { game.pause(); });
      click('btn-restart', confirmRestart);
      click('btn-home', function () { game.goToMenu(); });

      // 暂停
      click('btn-resume', function () { game.resume(); });
      click('btn-restart-pause', confirmRestart);
      click('btn-home-pause', function () { game.goToMenu(); });

      // 结算
      click('btn-again', function () { game.restart(); });
      click('btn-change-diff', function () { game.goToMenu(); });
      click('btn-result-lb', function () { game.openLeaderboard(); });

      // 排行榜页签
      var tabs = doc.querySelectorAll('[data-lb-difficulty]');
      for (var j = 0; j < tabs.length; j += 1) {
        (function (tab) {
          tab.addEventListener('click', function () {
            renderer.setLeaderboardDifficulty(tab.getAttribute('data-lb-difficulty'));
          });
        })(tabs[j]);
      }
      click('btn-lb-clear', confirmClear);
      click('btn-lb-back', function () { game.closeLeaderboard(); });

      // 全局
      doc.addEventListener('click', onDocumentClick);
      doc.addEventListener('keydown', onKeydown);
      doc.addEventListener('visibilitychange', onVisibilityChange);
      win.addEventListener('resize', onResize);
      win.addEventListener('orientationchange', onResize);
    }

    return { bind: bind };
  }

  root.MM.Platform.Input = { createInput: createInput };
})(typeof globalThis !== 'undefined' ? globalThis : this);
