/* MM · 可注入定时器 + 秒表（UMD；默认工厂触碰宿主全局，测试注入假 timer） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MM = root.MM || {};
    root.MM.Core = root.MM.Core || {};
    root.MM.Core.Timer = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function defaultNow() {
    if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  // 生产用 timer：performance.now + setTimeout，并统计活跃任务数（泄漏断言）
  function createTimer(options) {
    options = options || {};
    var now = options.now || defaultNow;
    var rawSet = options.setTimeout || function (fn, ms) { return globalThis.setTimeout(fn, ms); };
    var rawClear = options.clearTimeout || function (id) { globalThis.clearTimeout(id); };
    var active = new Set();

    function setTimeoutTracked(fn, ms) {
      var id = rawSet(function () {
        active.delete(id);
        fn();
      }, ms);
      active.add(id);
      return id;
    }

    function clearTimeoutTracked(id) {
      active.delete(id);
      rawClear(id);
    }

    return {
      now: now,
      setTimeout: setTimeoutTracked,
      clearTimeout: clearTimeoutTracked,
      pendingCount: function () { return active.size; }
    };
  }

  // 秒表：首翻启动、暂停冻结、通关停止、重开归零（logic.md §9.2）
  function createStopwatch(timer) {
    var acc = 0;
    var startedAt = 0;
    var running = false;
    var started = false;
    var stopped = false;

    function elapsed() {
      return acc + (running ? timer.now() - startedAt : 0);
    }

    return {
      start: function () {
        if (started || stopped) { return; }
        started = true;
        running = true;
        startedAt = timer.now();
      },
      pause: function () {
        if (!running) { return; }
        acc += timer.now() - startedAt;
        running = false;
      },
      resume: function () {
        if (!started || running || stopped) { return; }
        startedAt = timer.now();
        running = true;
      },
      stop: function () {
        if (running) {
          acc += timer.now() - startedAt;
          running = false;
        }
        stopped = true;
        return acc;
      },
      reset: function () {
        acc = 0;
        running = false;
        started = false;
        stopped = false;
      },
      elapsed: elapsed,
      isRunning: function () { return running; },
      isStarted: function () { return started; }
    };
  }

  return { createTimer: createTimer, createStopwatch: createStopwatch };
});
