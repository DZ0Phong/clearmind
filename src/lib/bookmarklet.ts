/**
 * Bookmarklet builder for the schedule importer.
 *
 * Important gotchas in this file — DO NOT add `//` line comments to the
 * template string. The minify step collapses all whitespace (including
 * newlines) into single spaces, which causes `//` line comments to extend
 * to the end of the string and silently eat the rest of the code, breaking
 * JS syntax. Use /* block comments *\/ ONLY, or no comments at all.
 *
 * To test from node: see `parser-test.mjs` pattern in repo root or
 * `npx tsx -e "import {buildBookmarklet} from './src/lib/bookmarklet.ts'; ..."`
 */

const BOOKMARKLET_SRC = `(function(){
  try {
    var dayRe = /(thu\\s*[2-7]|t[2-7]|chu\\s*nhat|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)/i;
    var timeRe = /\\d{1,2}[:hg]\\d{2}/;
    var docs = [document];
    var frames = document.querySelectorAll('iframe,frame');
    for (var fi = 0; fi < frames.length; fi++) {
      try { var d = frames[fi].contentDocument; if (d) docs.push(d); } catch (e) {}
    }
    var best = null, bestScore = 0, totalTables = 0;
    for (var di = 0; di < docs.length; di++) {
      var tbls;
      try { tbls = docs[di].querySelectorAll('table'); } catch (e) { continue; }
      totalTables += tbls.length;
      for (var ti = 0; ti < tbls.length; ti++) {
        var t = tbls[ti];
        var tx = (t.innerText || '').toLowerCase();
        var s = 0;
        if (dayRe.test(tx)) s += 12;
        if (timeRe.test(tx)) s += 10;
        if (/tiet|tiết|slot/.test(tx)) s += 6;
        s += Math.min(tx.length / 800, 6);
        if (t.querySelectorAll('table').length > 0) s -= 50;
        if (s > bestScore) { bestScore = s; best = t; }
      }
    }
    var payload = '';
    if (best && bestScore >= 8) {
      payload = best.outerHTML.slice(0, 200000);
    } else {
      payload = (document.body.innerText || '').slice(0, 50000);
    }
    var url = '__ORIGIN__/import#paste=' + encodeURIComponent(payload)
      + '&tables=' + totalTables
      + '&frames=' + frames.length
      + '&score=' + Math.round(bestScore);
    var a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ try { a.remove(); } catch (e) {} }, 200);
  } catch (e) {
    alert('Clearmind error: ' + (e && e.message || 'unknown'));
  }
})();`;

/**
 * Build the bookmarklet URL ready to drop into an `<a>` element's href.
 * Returns a `javascript:` URL with the full IIFE minified and encoded.
 *
 * No comment-stripping pass: the regex `/\/\/.*$/` would also match `//`
 * inside string literals like `http://...`, corrupting the URL. The source
 * above is already comment-free; just collapse whitespace.
 */
export function buildBookmarklet(origin: string): string {
  const src = BOOKMARKLET_SRC.replace("__ORIGIN__", origin);
  const min = src.replace(/\s+/g, " ").trim();
  return "javascript:" + encodeURIComponent(min).replace(/'/g, "%27");
}

/**
 * Get the raw JS body (without `javascript:` prefix, decoded) — useful for
 * the in-page "Test" button which runs the same logic via `new Function`.
 */
export function getBookmarkletBody(origin: string): string {
  const url = buildBookmarklet(origin);
  return decodeURIComponent(url.replace(/^javascript:/, ""));
}
