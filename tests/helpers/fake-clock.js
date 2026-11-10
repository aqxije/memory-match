'use strict';

/**
 * 假时钟 / 假定时器（logic.md §4.3 契约，T5 实现）
 *
 * createFakeTimer() -> {
 *   now(): number                       // 初始 0，advance 后增加
 *   setTimeout(fn, ms): id              // 记录 {id, at: now()+ms, fn}
 *   clearTimeout(id): void
 *   advance(ms): void                   // now += ms；按 at 升序执行所有 at <= now 的任务（含 0ms）
 *   pendingCount(): number              // 未执行且未取消的任务数（泄漏断言用）
 * }
 *
 * 注意：advance(0) 必须执行所有 at <= now 的任务——judgeDelayMs=0 时用它触发判定（logic.md §14.3）。
 */
function createFakeTimer() {
  let now = 0;
  let nextId = 1;
  const tasks = new Map(); // id -> { id, at, fn }

  function nextDueTask() {
    let due = null;
    for (const task of tasks.values()) {
      if (task.at > now) continue;
      if (due === null || task.at < due.at || (task.at === due.at && task.id < due.id)) {
        due = task;
      }
    }
    return due;
  }

  return {
    now() {
      return now;
    },

    setTimeout(fn, ms) {
      if (typeof fn !== 'function') throw new TypeError('fake timer: fn must be a function');
      const delay = Number(ms);
      const id = nextId++;
      tasks.set(id, { id, at: now + (Number.isFinite(delay) && delay > 0 ? delay : 0), fn });
      return id;
    },

    clearTimeout(id) {
      tasks.delete(id);
    },

    advance(ms) {
      const step = Number(ms);
      if (!Number.isFinite(step) || step < 0) throw new RangeError('fake timer: advance(ms) requires ms >= 0');
      now += step;
      let guard = 0;
      for (;;) {
        const task = nextDueTask();
        if (!task) break;
        tasks.delete(task.id);
        task.fn();
        if (++guard > 100000) throw new Error('fake timer: runaway timer callbacks');
      }
    },

    pendingCount() {
      return tasks.size;
    },

    /** 调试辅助：当前挂起任务 [{id, at}]（按 at 升序） */
    pending() {
      return Array.from(tasks.values())
        .map((t) => ({ id: t.id, at: t.at }))
        .sort((a, b) => a.at - b.at || a.id - b.id);
    },
  };
}

module.exports = { createFakeTimer };
