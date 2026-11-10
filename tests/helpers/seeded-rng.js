'use strict';

/**
 * 种子随机源（logic.md §14.3：复用 core createSeededRng；或独立 LCG 交叉验证）
 *
 * 测试统一使用 core 的 createSeededRng，保证与生产同源；
 * 另提供 createReferenceRng（独立 mulberry32）仅用于"同种子可复现"的交叉验证，
 * 不断言与 core 序列逐位相等（AC-13 只要求同种子可复现，不锁定具体算法）。
 */
const { createSeededRng } = require('../../src/core/rng.js');

function createReferenceRng(seed) {
  let a = seed >>> 0;
  const rng = function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.seed = seed >>> 0;
  return rng;
}

module.exports = { createSeededRng, createReferenceRng };
