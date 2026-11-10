/* MM · WebAudio 合成音效（IIFE，浏览器；失败静默降级，零外部资源） */
(function (root) {
  'use strict';
  root.MM = root.MM || {};
  root.MM.Platform = root.MM.Platform || {};

  var AC = root.AudioContext || root.webkitAudioContext;

  function createAudio(options) {
    options = options || {};
    var muted = !!options.muted;
    var ctx = null;
    var master = null;
    var comp = null;
    var supported = !!AC;
    var unlocked = false;
    var voices = 0;
    var lastPlayed = {};
    var MAX_VOICES = 8;

    function ensure() {
      if (!supported) { return null; }
      if (ctx) { return ctx; }
      try {
        ctx = new AC();
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.ratio.value = 4;
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.15;
        master.connect(comp);
        comp.connect(ctx.destination);
      } catch (err) {
        supported = false;
        ctx = null;
        return null;
      }
      return ctx;
    }

    // 首次用户手势内同步调用（iOS 要求在手势调用栈内创建/resume）
    function unlock() {
      var c = ensure();
      if (!c) { return false; }
      try {
        if (c.state === 'running') { unlocked = true; return true; }
        var p = c.resume();
        if (p && typeof p.then === 'function') {
          p.then(function () { unlocked = c.state === 'running'; }, function () {});
        }
        unlocked = c.state === 'running';
      } catch (err) {
        supported = false;
      }
      return unlocked;
    }

    function setMuted(value) {
      muted = !!value;
      if (master && ctx) {
        try { master.gain.setTargetAtTime(muted ? 0 : 0.15, ctx.currentTime, 0.01); }
        catch (err) { master.gain.value = muted ? 0 : 0.15; }
      }
    }

    function voice(freq, when, dur, gain, type, glideTo) {
      if (!ctx || voices >= MAX_VOICES) { return; }
      try {
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = type || 'triangle';
        osc.frequency.setValueAtTime(freq, when);
        if (glideTo) { osc.frequency.exponentialRampToValueAtTime(glideTo, when + dur); }
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), when + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        osc.connect(g);
        g.connect(master);
        voices += 1;
        osc.onended = function () {
          voices = Math.max(0, voices - 1);
          try { g.disconnect(); osc.disconnect(); } catch (err) {}
        };
        osc.start(when);
        osc.stop(when + dur + 0.02);
      } catch (err) {
        // 静默降级：音频失败不影响游戏
      }
    }

    function play(name, params) {
      if (!supported || muted) { return; }
      // 手势前不创建 AudioContext（AC-42）；已存在且 running 时即使 unlocked 标记未及时更新也允许播放（Q-21）
      if (!unlocked && !ctx) { return; }
      var c = ensure();
      if (!c || c.state !== 'running') { return; }
      var t = c.currentTime;
      if (lastPlayed[name] != null && t - lastPlayed[name] < 0.06) { return; }
      lastPlayed[name] = t;
      var p = params || {};
      if (name === 'flip') {
        voice(880, t, 0.04, 0.10, 'triangle');
      } else if (name === 'match') {
        var combo = Math.max(1, p.combo || 1);
        var semis = Math.min(8, 2 * (combo - 1));
        var mult = Math.pow(2, semis / 12);
        voice(523.25 * mult, t, 0.12, 0.14, 'triangle');
        voice(659.25 * mult, t + 0.12, 0.12, 0.14, 'triangle');
      } else if (name === 'mismatch') {
        voice(220, t, 0.18, 0.08, 'sine', 174);
      } else if (name === 'win') {
        var notes = [523.25, 659.25, 783.99, 1046.5];
        for (var i = 0; i < notes.length; i += 1) { voice(notes[i], t + i * 0.12, 0.15, 0.16, 'triangle'); }
      } else if (name === 'button') {
        voice(660, t, 0.04, 0.06, 'triangle');
      }
    }

    function suspend() {
      if (!ctx) { return; }
      try { if (ctx.state === 'running') { ctx.suspend(); } } catch (err) {}
    }

    function resume() {
      if (!ctx || !unlocked) { return; }
      try { if (ctx.state === 'suspended') { ctx.resume(); } } catch (err) {}
    }

    return {
      unlock: unlock,
      play: play,
      setMuted: setMuted,
      suspend: suspend,
      resume: resume,
      isUnlocked: function () { return unlocked; },
      isSupported: function () { return supported; },
      isMuted: function () { return muted; }
    };
  }

  root.MM.Platform.Audio = { createAudio: createAudio };
})(typeof globalThis !== 'undefined' ? globalThis : this);
