/* MM · 种子随机源（UMD：Node require / 浏览器 window.MM.Core.Rng） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MM = root.MM || {};
    root.MM.Core = root.MM.Core || {};
    root.MM.Core.Rng = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // mulberry32：32 位种子，确定性、实现短、无外部依赖
  function createSeededRng(seed) {
    var s = (seed >>> 0) || 1;
    function rng() {
      s = (s + 0x6d2b79f5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    rng.seed = seed >>> 0;
    return rng;
  }

  // 拒绝采样：避免取模偏差
  function randomInt(rng, n) {
    if (!(n > 0)) { throw new RangeError('[MM] randomInt(n) requires n > 0'); }
    var max = Math.floor(4294967296 / n) * n;
    var x;
    do { x = Math.floor(rng() * 4294967296); } while (x >= max);
    return x % n;
  }

  // Fisher–Yates，原地洗牌
  function shuffleInPlace(array, rng) {
    for (var i = array.length - 1; i > 0; i -= 1) {
      var j = randomInt(rng, i + 1);
      var tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }

  return { createSeededRng: createSeededRng, randomInt: randomInt, shuffleInPlace: shuffleInPlace };
});
