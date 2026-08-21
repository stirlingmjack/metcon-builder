/**
 * rng.js — small seedable PRNG so "today's" workout is stable across page
 * reloads (seeded from the date) but a "Shuffle" button can still ask for
 * a fresh one.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.MetconRng = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // xmur3 string hash -> 32-bit seed
  function xmur3(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  // mulberry32 PRNG -> function returning floats in [0, 1)
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Build a rng object from a seed string (or Math.random-backed if
   * seedString is falsy, for genuinely non-deterministic reshuffles).
   */
  function createRng(seedString) {
    var next;
    if (seedString) {
      var seedFn = xmur3(String(seedString));
      next = mulberry32(seedFn());
    } else {
      next = Math.random;
    }

    return {
      // float in [0, 1)
      float: function () {
        return next();
      },
      // integer in [min, max], inclusive
      int: function (min, max) {
        if (max < min) {
          var tmp = min;
          min = max;
          max = tmp;
        }
        return Math.floor(next() * (max - min + 1)) + min;
      },
      // pick one element from an array
      pick: function (arr) {
        return arr[Math.floor(next() * arr.length)];
      },
      // Fisher-Yates shuffle, returns a new array
      shuffle: function (arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
          var j = Math.floor(next() * (i + 1));
          var t = a[i];
          a[i] = a[j];
          a[j] = t;
        }
        return a;
      },
      // true with probability p (0..1)
      chance: function (p) {
        return next() < p;
      },
    };
  }

  return { createRng: createRng };
});
