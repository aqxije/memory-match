/* MM · 设置持久化（UMD，纯逻辑；storage 注入，损坏/配额降级） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./config.js'));
  } else {
    root.MM = root.MM || {};
    root.MM.Core = root.MM.Core || {};
    root.MM.Core.Settings = factory(root.MM.Core.Config);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Config) {
  'use strict';
  if (!Config) { throw new Error('[MM] Settings requires MM.Core.Config'); }
  var C = Config.CONSTANTS;

  function createSettings(options) {
    options = options || {};
    var storage = options.storage || null;
    var key = C.STORAGE_KEYS.settings;
    var degraded = !storage;
    var muted = false;
    var difficultyId = 'easy';

    function isValidId(id) { return Config.DIFFICULTY_IDS.indexOf(id) !== -1; }

    function load() {
      if (!storage) { return; }
      var raw;
      try { raw = storage.getItem(key); } catch (err) { degraded = true; return; }
      if (raw === null || raw === undefined) { return; }
      var data;
      try { data = JSON.parse(raw); } catch (err) { return; }
      if (!data || data.version !== C.STORAGE_VERSION) { return; }
      if (typeof data.muted === 'boolean') { muted = data.muted; }
      if (isValidId(data.difficulty)) { difficultyId = data.difficulty; }
    }

    function persist() {
      if (!storage) { degraded = true; return; }
      try {
        storage.setItem(key, JSON.stringify({ version: C.STORAGE_VERSION, muted: muted, difficulty: difficultyId }));
      } catch (err) {
        degraded = true;
      }
    }

    load();

    return {
      get: function () { return { muted: muted, difficultyId: difficultyId }; },
      setMuted: function (value) { muted = !!value; persist(); },
      setDifficulty: function (id) {
        if (!isValidId(id)) { return false; }
        difficultyId = id;
        persist();
        return true;
      },
      isDegraded: function () { return degraded; }
    };
  }

  return { createSettings: createSettings };
});
