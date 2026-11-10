/* MM · 计分与星级（UMD，纯函数；依赖 Config） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'));
  } else {
    root.MM = root.MM || {};
    root.MM.Core = root.MM.Core || {};
    root.MM.Core.Scoring = factory(root.MM.Core.Config);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Config) {
  'use strict';
  if (!Config) { throw new Error('[MM] Scoring requires MM.Core.Config'); }
  var C = Config.CONSTANTS;

  // 本次配对得分：combo 为本次配对后的连击数（n>=1）
  function computeMatchScore(combo) {
    var n = Math.floor(combo);
    if (!(n >= 1)) { n = 1; }
    return C.BASE_SCORE + C.COMBO_STEP * Math.min(n - 1, C.COMBO_CAP);
  }

  function computeMoveStars(pairs, moves) {
    if (moves <= Math.ceil(pairs * 1.5)) { return 3; }
    if (moves <= Math.ceil(pairs * 2.5)) { return 2; }
    return 1;
  }

  function computeTimeStars(pairs, timeMs) {
    if (timeMs <= pairs * 10000) { return 3; }
    if (timeMs <= pairs * 20000) { return 2; }
    return 1;
  }

  // 综合星级 = min(步数星, 用时星)，下限 1（完成即 >=1 星）
  function computeStars(input) {
    var pairs = input.pairs;
    var moveStars = computeMoveStars(pairs, input.moves);
    var timeStars = computeTimeStars(pairs, input.timeMs);
    return Math.max(1, Math.min(moveStars, timeStars));
  }

  return {
    computeMatchScore: computeMatchScore,
    computeMoveStars: computeMoveStars,
    computeTimeStars: computeTimeStars,
    computeStars: computeStars
  };
});
