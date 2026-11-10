/* MM · localStorage 适配器（IIFE，浏览器；探测失败降级内存态） */
(function (root) {
  'use strict';
  root.MM = root.MM || {};
  root.MM.Platform = root.MM.Platform || {};

  function createStorage() {
    var available = false;
    var degraded = false;
    var mem = Object.create(null);

    try {
      var ls = root.localStorage;
      if (ls) {
        ls.setItem('mm.probe', '1');
        ls.removeItem('mm.probe');
        available = true;
      }
    } catch (err) {
      available = false;
    }
    degraded = !available;

    function fallbackGet(key) {
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    }

    return {
      getItem: function (key) {
        if (available) {
          try { return root.localStorage.getItem(key); } catch (err) { available = false; degraded = true; }
        }
        return fallbackGet(key);
      },
      setItem: function (key, value) {
        if (available) {
          try { root.localStorage.setItem(key, value); return; } catch (err) { available = false; degraded = true; }
        }
        mem[key] = String(value);
      },
      removeItem: function (key) {
        if (available) {
          try { root.localStorage.removeItem(key); } catch (err) { available = false; degraded = true; }
        }
        delete mem[key];
      },
      isDegraded: function () { return degraded || !available; }
    };
  }

  root.MM.Platform.Storage = { createStorage: createStorage };
})(typeof globalThis !== 'undefined' ? globalThis : this);
