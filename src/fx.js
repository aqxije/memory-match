/* MM · DOM + WAAPI 粒子（IIFE，浏览器；单次 8–12、存活 ≤120、reduced-motion 关闭） */
(function (root) {
  'use strict';
  root.MM = root.MM || {};
  root.MM.Platform = root.MM.Platform || {};

  var COLORS = ['#FF8FA3', '#7ED9C3', '#FFD166', '#A0C4FF'];
  var MAX_LIVE = 120;

  function createFx(options) {
    options = options || {};
    var layer = options.layer || null;
    var reduced = !!options.reducedMotion;
    var live = 0;
    var waveTimers = [];

    function supported() {
      return !!(root.Element && root.Element.prototype && typeof root.Element.prototype.animate === 'function');
    }

    function remove(el) {
      if (!el || !el.parentNode) { return; }
      el.parentNode.removeChild(el);
      live = Math.max(0, live - 1);
    }

    function burst(x, y, count) {
      if (!layer || reduced || !supported()) { return 0; }
      var n = Math.min(count || 10, 12);
      var made = 0;
      for (var i = 0; i < n; i += 1) {
        if (live >= MAX_LIVE) { break; }
        var el = root.document.createElement('span');
        el.className = 'fx-p';
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        el.style.background = COLORS[i % COLORS.length];
        layer.appendChild(el);
        live += 1;
        var angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
        var dist = 34 + Math.random() * 46;
        var dx = Math.cos(angle) * dist;
        var dy = Math.sin(angle) * dist - 18;
        var dur = 450 + Math.random() * 250;
        var anim;
        try {
          anim = el.animate([
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
            { transform: 'translate(calc(-50% + ' + dx.toFixed(1) + 'px), calc(-50% + ' + dy.toFixed(1) + 'px)) scale(0.2)', opacity: 0 }
          ], { duration: dur, easing: 'cubic-bezier(.2,.7,.3,1)' });
        } catch (err) {
          remove(el);
          continue;
        }
        made += 1;
        anim.onfinish = (function (node) { return function () { remove(node); }; })(el);
        anim.oncancel = (function (node) { return function () { remove(node); }; })(el);
      }
      return made;
    }

    // 通关庆祝：3 波彩带（0/160/320ms），最后一波粒子约 1s 后结束（AC-44）
    function celebrate() {
      if (!layer || reduced || !supported()) { return; }
      clear();
      for (var w = 0; w < 3; w += 1) {
        waveTimers[w] = root.setTimeout((function (index) {
          return function () {
            waveTimers[index] = null;
            var vw = root.innerWidth || 360;
            var vh = root.innerHeight || 640;
            burst(vw * (0.18 + Math.random() * 0.64), vh * (0.18 + Math.random() * 0.3), 12);
          };
        })(w), w * 160);
      }
    }

    function clear() {
      for (var w = 0; w < waveTimers.length; w += 1) {
        if (waveTimers[w] != null) { root.clearTimeout(waveTimers[w]); waveTimers[w] = null; }
      }
      if (!layer) { return; }
      var nodes = layer.querySelectorAll('.fx-p');
      for (var i = 0; i < nodes.length; i += 1) {
        var el = nodes[i];
        if (el.getAnimations) {
          try { el.getAnimations().forEach(function (a) { a.cancel(); }); } catch (err) {}
        }
        if (el.parentNode) { el.parentNode.removeChild(el); }
      }
      live = 0;
    }

    function setReducedMotion(value) {
      reduced = !!value;
      if (reduced) { clear(); }
    }

    return {
      burst: burst,
      celebrate: celebrate,
      clear: clear,
      setReducedMotion: setReducedMotion,
      isReduced: function () { return reduced; },
      count: function () { return live; }
    };
  }

  root.MM.Platform.Fx = { createFx: createFx };
})(typeof globalThis !== 'undefined' ? globalThis : this);
