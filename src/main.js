/* MM · 启动与装配（IIFE，浏览器；启动断言 + 友好错误页，不白屏） */
(function (root) {
  'use strict';
  root.MM = root.MM || {};
  root.MM.Platform = root.MM.Platform || {};

  function boot() {
    var doc = root.document;
    var errBox = doc.getElementById('boot-error');
    var errDetail = doc.getElementById('boot-error-detail');

    function fail(message) {
      if (errBox) { errBox.hidden = false; }
      if (errDetail) { errDetail.textContent = message; }
    }

    var MM = root.MM;
    var missing = [];
    if (!MM || !MM.Core) {
      missing.push('MM.Core');
    } else {
      ['Rng', 'Config', 'Deck', 'Scoring', 'Timer', 'Leaderboard', 'Settings', 'Game', 'RenderModel'].forEach(function (name) {
        if (!MM.Core[name]) { missing.push('MM.Core.' + name); }
      });
    }
    if (!MM || !MM.Platform) {
      missing.push('MM.Platform');
    } else {
      ['Storage', 'Audio', 'Fx', 'Render', 'Input'].forEach(function (name) {
        if (!MM.Platform[name]) { missing.push('MM.Platform.' + name); }
      });
    }
    if (missing.length) {
      fail('缺少模块：' + missing.join('、'));
      return;
    }

    try {
      var storage = MM.Platform.Storage.createStorage();
      var timer = MM.Core.Timer.createTimer();
      var game = MM.Core.Game.createGame({
        storage: storage,
        timer: timer,
        rng: Math.random,
        wallNow: function () { return Date.now(); }
      });
      var audio = MM.Platform.Audio.createAudio({ muted: game.getSettings().muted });
      var reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
      var fx = MM.Platform.Fx.createFx({ layer: doc.getElementById('fx'), reducedMotion: reduced });
      var renderer = MM.Platform.Render.createRenderer({ doc: doc, game: game, fx: fx });
      var input = MM.Platform.Input.createInput({
        doc: doc, win: root, game: game, renderer: renderer, audio: audio
      });

      renderer.mount();
      input.bind();

      // 通配订阅签名：(payload, eventName)（logic.md §11.3）
      var MISMATCH_HINTS = ['再试一次～', '差一点点！', '没关系，记住它们'];

      function onEvent(payload, name) {
        var snap = game.getSnapshot();
        if (name === 'tick') { renderer.renderHud(snap); return; }
        renderer.render(snap);

        if (name === 'flip') {
          audio.play('flip');
          var sym = MM.Core.RenderModel.getSymbol(payload.symbolId);
          renderer.announce('翻开' + sym.name);
        } else if (name === 'match') {
          audio.play('match', { combo: payload.combo });
          if (payload.cardIds && payload.cardIds.length) { renderer.burstAtCard(payload.cardIds[0], 10); }
          renderer.announce('配对成功，加 ' + payload.scoreDelta + ' 分' + (payload.combo >= 2 ? '，连击 ' + payload.combo : ''));
        } else if (name === 'mismatch') {
          audio.play('mismatch');
          renderer.shake(payload.cardIds || []);
          renderer.showHint(MISMATCH_HINTS[Math.floor(Math.random() * MISMATCH_HINTS.length)]);
          renderer.announce('两张不一样，再试一次');
        } else if (name === 'won') {
          audio.play('win');
          fx.celebrate();
          renderer.announce((payload.isNewRecord ? '新纪录！' : '') + '本局完成，' + payload.stars + ' 星，' + payload.score + ' 分');
        } else if (name === 'state') {
          if (payload.to === 'paused') { fx.clear(); audio.suspend(); renderer.announce('已暂停'); }
          else if (payload.to === 'playing') { audio.resume(); }
          else if (payload.to === 'result' || payload.to === 'menu') { fx.clear(); }
        } else if (name === 'restart') {
          fx.clear();
          renderer.hideHint();
        } else if (name === 'settings') {
          audio.setMuted(payload.muted);
        }
      }

      game.subscribe('*', onEvent);
      renderer.render(game.getSnapshot());

      // reduced-motion 运行中切换立即生效（AC-45）
      if (root.matchMedia) {
        var mq = root.matchMedia('(prefers-reduced-motion: reduce)');
        var onMotionChange = function (event) { fx.setReducedMotion(event.matches); };
        if (mq.addEventListener) { mq.addEventListener('change', onMotionChange); }
        else if (mq.addListener) { mq.addListener(onMotionChange); }
      }

      if (storage.isDegraded()) {
        renderer.announce('这台设备暂时存不了最高分，但游戏可以正常玩');
      }

      // 调试/自测钩子：合并进 MM 单一命名空间，不额外污染全局（Q-10/I-09）
      MM.debug = { game: game, renderer: renderer, audio: audio, fx: fx, storage: storage };
      if (doc.body) { doc.body.setAttribute('data-boot', 'ok'); }
    } catch (err) {
      fail(String(err && err.message ? err.message : err));
    }
  }

  if (root.document) {
    if (root.document.readyState === 'loading') {
      root.document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
