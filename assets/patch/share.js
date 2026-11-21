/* 大肥鱼 · 系统分享补丁 v1
 * 1) 消息工具栏注入「分享」按钮 → 调起 Android 系统分享面板
 * 2) 接收系统分享进来的文本 → 自动填入输入框
 * 原生桥：window.__NATIVE__.shareText(text)
 */
(function () {
  'use strict';
  if (window.__DFY_SHARE_BRIDGE__) return;
  window.__DFY_SHARE_BRIDGE__ = 1;

  var MARK = 'data-dfy-share';
  var pending = null;

  /* ================= 工具 ================= */
  function nv() {
    try {
      var n = window.__NATIVE__;
      if (n && typeof n.shareText === 'function') return n;
    } catch (e) {}
    return null;
  }

  function toast(msg) {
    var d = document.getElementById('dfy-share-toast');
    if (!d) {
      d = document.createElement('div');
      d.id = 'dfy-share-toast';
      d.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);' +
        'background:rgba(0,0,0,.84);color:#fff;font-size:13px;line-height:1.5;padding:9px 14px;' +
        'border-radius:10px;z-index:2147483647;max-width:80vw;word-break:break-word;' +
        'box-shadow:0 4px 16px rgba(0,0,0,.24);transition:opacity .25s;pointer-events:none;opacity:1;';
      document.body.appendChild(d);
    }
    d.textContent = msg;
    d.style.opacity = '1';
    clearTimeout(d._dfyT);
    d._dfyT = setTimeout(function () { d.style.opacity = '0'; }, 2200);
  }

  function copyText(t) {
    try {
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {}
  }

  function decodeB64(s) {
    try {
      var bin = atob(s || '');
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
      return '';
    }
  }

  /* ================= 发起分享 ================= */
  function share(text) {
    if (!text) return false;
    var n = nv();
    if (n) {
      try { if (n.shareText(text)) return true; } catch (e) {}
    }
    if (navigator.share) {
      navigator.share({ title: document.title || '分享', text: text }).catch(function () {});
      return true;
    }
    copyText(text);
    toast('当前环境不支持系统分享，内容已复制');
    return true;
  }

  function plainText(node) {
    var c = node.cloneNode(true);
    var junk = c.querySelectorAll('button,svg,[role="tooltip"]');
    for (var i = 0; i < junk.length; i++) {
      if (junk[i].parentNode) junk[i].parentNode.removeChild(junk[i]);
    }
    return (c.innerText || c.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* 从工具条按钮向上找这条消息的正文 */
  function messageText(anchor) {
    var el = anchor, guard = 0, best = '';
    while (el && guard++ < 9) {
      if (el.querySelector) {
        var md = el.querySelector('.ds-assistant-message-main-content, .ds-markdown');
        if (md) {
          var t = plainText(md);
          if (t.length > 1) return t;
        }
      }
      var cur = plainText(el);
      if (cur.length > 1 && (best === '' || cur.length < best.length)) best = cur;
      el = el.parentElement;
    }
    return best;
  }

  /* ================= 注入分享按钮 ================= */
  var ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/>' +
    '<path d="M8.3 10.7 15.7 6.3M8.3 13.3l7.4 4.4"/></svg>';

  function isCopyLabel(s) {
    s = (s || '').trim();
    return s === '复制' || s === 'Copy' || s === '拷贝';
  }

  function inject() {
    var btns = document.querySelectorAll('button[aria-label]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (!isCopyLabel(b.getAttribute('aria-label'))) continue;
      var wrap = b.parentElement;
      if (!wrap || wrap.getAttribute(MARK)) continue;
      var host = wrap.parentElement;
      if (!host) continue;
      wrap.setAttribute(MARK, '1');

      var box = wrap.cloneNode(true);
      box.setAttribute(MARK, '1');
      var btn = box.querySelector('button');
      if (!btn) continue;
      btn.setAttribute('aria-label', '分享');
      btn.setAttribute('title', '分享');
      var svg = btn.querySelector('svg');
      if (svg) svg.outerHTML = ICON;

      (function (node) {
        node.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (e.stopImmediatePropagation) e.stopImmediatePropagation();
          var txt = messageText(node);
          if (!txt || txt.length < 2) {
            txt = (document.title || '') + (location.href ? '\n' + location.href : '');
          }
          share(txt);
        }, true);
      })(btn);

      host.insertBefore(box, wrap.nextSibling);
    }
  }

  var timer = 0;
  function schedule() {
    if (timer) return;
    timer = setTimeout(function () {
      timer = 0;
      try { inject(); } catch (e) {}
    }, 240);
  }

  /* ================= 接收分享 ================= */
  function findInput() {
    var el = document.querySelector('[contenteditable="true"]');
    if (el && el.getClientRects().length) return el;
    var list = document.querySelectorAll('textarea');
    for (var i = 0; i < list.length; i++) {
      if (list[i].getClientRects().length && !list[i].disabled) return list[i];
    }
    return null;
  }

  function fillInput() {
    if (!pending) return;
    var el = findInput();
    if (!el) return;
    var text = pending;
    pending = null;
    try { el.focus(); } catch (e) {}
    try {
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        var desc = Object.getOwnPropertyDescriptor(proto, 'value');
        desc.set.call(el, text);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        var sel = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        var ok = false;
        try { ok = document.execCommand('insertText', false, text); } catch (e) {}
        if (!ok) {
          el.textContent = text;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
        }
      }
      toast('已填入分享内容，确认后发送');
    } catch (e) {
      pending = text;
      copyText(text);
      toast('已复制分享内容，可手动粘贴');
    }
  }

  window.__DFY_SHARE__ = function (b64) {
    var text = decodeB64(b64);
    if (!text) return;
    pending = text;
    fillInput();
  };

  function boot() {
    schedule();
    new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(function () { if (pending) fillInput(); }, 900);
    var n = 0, iv = setInterval(function () { inject(); if (++n > 40) clearInterval(iv); }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
