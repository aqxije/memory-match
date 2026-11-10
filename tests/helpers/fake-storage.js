'use strict';

/**
 * 假 storage（logic.md §14.3 契约，T5 实现）
 *
 * createFakeStorage({ initial, throwOnGet, throwOnSet, throwOnRemove, corrupt }) -> {
 *   data, getItem, setItem, removeItem,        // localStorage 兼容适配器
 *   raw(key), json(key), setRaw(key, value),   // 断言辅助
 *   calls: { get, set, remove }                 // 调用计数
 * }
 *
 * - initial：{ key: string | object }，对象自动 JSON.stringify
 * - corrupt：true → 两个存储键写入非法 JSON；对象 → 合并写入指定键的原文
 * - throwOnGet / throwOnSet / throwOnRemove：模拟隐私模式 / 配额耗尽（AC-30/31）
 */
const STORAGE_KEYS = { leaderboard: 'mm.v1.leaderboard', settings: 'mm.v1.settings' };

function createFakeStorage(options) {
  const opts = options || {};
  const data = new Map();
  const calls = { get: 0, set: 0, remove: 0 };

  function put(key, value) {
    data.set(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  if (opts.initial) {
    for (const [key, value] of Object.entries(opts.initial)) put(key, value);
  }
  if (opts.corrupt === true) {
    put(STORAGE_KEYS.leaderboard, '{"version":1,"boards":');
    put(STORAGE_KEYS.settings, 'not-json-at-all');
  } else if (opts.corrupt && typeof opts.corrupt === 'object') {
    for (const [key, value] of Object.entries(opts.corrupt)) put(key, value);
  }

  return {
    data,
    calls,

    getItem(key) {
      calls.get += 1;
      if (opts.throwOnGet) throw new Error('SecurityError: storage is disabled');
      return data.has(key) ? data.get(key) : null;
    },

    setItem(key, value) {
      calls.set += 1;
      if (opts.throwOnSet) throw new Error('QuotaExceededError: storage is full');
      data.set(key, String(value));
    },

    removeItem(key) {
      calls.remove += 1;
      if (opts.throwOnRemove) throw new Error('SecurityError: storage is disabled');
      data.delete(key);
    },

    /** 原始字符串（不存在返回 null） */
    raw(key) {
      return data.has(key) ? data.get(key) : null;
    },

    /** 解析后的 JSON（不存在返回 null；非法 JSON 抛错，供测试显式断言） */
    json(key) {
      const value = data.get(key);
      return value == null ? null : JSON.parse(value);
    },

    /** 直接写入原文（模拟外部脏数据） */
    setRaw(key, value) {
      data.set(key, String(value));
    },
  };
}

module.exports = { createFakeStorage, STORAGE_KEYS };
