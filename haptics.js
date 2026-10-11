/* D'Verse haptics - dependency-free. Android: Vibration API. iOS Safari 17.4+: native <input switch> haptic
   (same technique as github.com/tijnjh/ios-haptics, MIT). Auto-wires taps; use data-haptic="none" to opt out,
   data-haptic="success|warn|error|win|select|tap" to pick a pattern. JS: window.haptic('success'). */
(function () {
  if (window.haptic) return;
  var ua = navigator.userAgent || '';
  var isIOS = /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var canVibrate = typeof navigator.vibrate === 'function';
  var canSwitch = isIOS; // <input switch> haptics need Safari/iOS 17.4+; older versions simply do nothing
  var P = { tap: 10, select: 14, success: [12, 40, 12], warn: [28, 50, 28], error: [40, 40, 40, 40, 40], win: [14, 40, 14, 40, 30] };
  var muted = false, last = 0, root = null, label = null, input = null;
  try { muted = localStorage.getItem('dverse-haptics') === 'off'; } catch (e) {}
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
    input = document.createElement('input'); input.type = 'checkbox'; input.setAttribute('switch', ''); input.id = 'dverse-hx'; input.tabIndex = -1;
    label = document.createElement('label'); label.htmlFor = 'dverse-hx'; label.tabIndex = -1;
    root.appendChild(input); root.appendChild(label); (document.body || document.documentElement).appendChild(root);
  }
  function pulse() { build(); label.click(); }

  function fire(name) {
    if (muted || reduce) return false;
    var now = Date.now(); if (now - last < 30) return false; last = now;
    var p = P[name] || P.tap;
    if (canVibrate) { try { return navigator.vibrate(p); } catch (e) { return false; } }
    if (isIOS && canSwitch) {
      // iOS has no duration: one pulse per beat. Must run inside a user gesture.
      var beats = Array.isArray(p) ? p.filter(function (_, i) { return i % 2 === 0; }).length : 1;
      pulse(); for (var i = 1; i < beats; i++) setTimeout(pulse, i * 90);
      return true;
    }
    return false;
  }
  fire.setMuted = function (m) { muted = !!m; try { localStorage.setItem('dverse-haptics', m ? 'off' : 'on'); } catch (e) {} };
  fire.isMuted = function () { return muted; };
  fire.supported = canVibrate || (isIOS && canSwitch);
  window.haptic = fire;

  var SEL = 'button,a[href],summary,[role=button],[role=tab],[role=switch],[role=menuitem],input[type=checkbox],input[type=radio],input[type=range],select,[data-haptic]';
  function kind(el) {
    var d = el.getAttribute('data-haptic'); if (d) return d;
    if (el.matches('input[type=checkbox],input[type=radio],[role=switch],select,[role=tab]')) return 'select';
    return 'tap';
  }
  // click = trusted user gesture on both platforms (iOS requires it). Capture so stopPropagation in apps can't swallow it.
  document.addEventListener('click', function (e) {
    if (!e.isTrusted) return;
    var el = e.target && e.target.closest && e.target.closest(SEL);
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
    var k = kind(el); if (k === 'none') return;
    fire(k);
  }, true);
})();
