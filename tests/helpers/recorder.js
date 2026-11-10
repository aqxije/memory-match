'use strict';

/**
 * 事件记录器（logic.md §14.3 契约，T5 实现）
 * subscribe('*', ...) 收集 [eventName, payload]，用于断言事件顺序与 payload。
 */
function createRecorder(game) {
  const events = [];
  const unsubscribe = game.subscribe('*', (payload, eventName) => {
    events.push({ name: eventName, payload });
  });

  return {
    events,
    unsubscribe,
    names() {
      return events.map((e) => e.name);
    },
    of(name) {
      return events.filter((e) => e.name === name).map((e) => e.payload);
    },
    last(name) {
      const matched = events.filter((e) => e.name === name);
      return matched.length ? matched[matched.length - 1].payload : undefined;
    },
    clear() {
      events.length = 0;
    },
  };
}

module.exports = { createRecorder };
