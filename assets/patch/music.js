/* 大肥鱼 · 音乐下载补丁 v2（QQ 双源 + 网易云换源 + VIP cookie 支持）
 * 注入：assets/index.html 里 defer 引入，主包之后执行。
 * 原生桥：window.__NATIVE__（enabled / proxyPort / downloadVideo / saveFile）
 */
(function () {
  'use strict';
  if (window.__DFY_MUSIC__) return;
  window.__DFY_MUSIC__ = 1;

  var MARK = 'data-dfy-music';
  var LS_COOKIE = 'dfy_qq_cookie';
  var LS_SRC = 'dfy_music_src';

  /* ================= 基础 ================= */
  function nv() {
    try {
      var n = window.__NATIVE__;
      if (n && typeof n.enabled === 'function' && n.enabled()) return n;
    } catch (e) {}
    return null;
  }
  function proxy(u) {
    var n = nv();
    if (n && typeof n.proxyPort === 'function' && /^https?:\/\//i.test(u)) {
      return 'http://127.0.0.1:' + n.proxyPort() + '/proxy?u=' + encodeURIComponent(u);
    }
    return u;
  }
  function jget(u) {
    return fetch(proxy(u), { cache: 'no-store', credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (t) {
      try { return JSON.parse(t); } catch (e) { throw new Error('返回不是 JSON'); }
    });
  }
  function fmtDur(s) {
    s = s | 0;
    var m = (s / 60) | 0, r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }
  function safeName(s) {
    return String(s).replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 80);
  }

  /* ================= 音源 A：QQ 音乐 ================= */
  function qqCookie() {
    try { return localStorage.getItem(LS_COOKIE) || ''; } catch (e) { return ''; }
  }
  function qqSearch(kw) {
    var u = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=' + encodeURIComponent(kw) +
      '&format=json&n=30&p=1&cr=1&new_json=1';
    return jget(u).then(function (d) {
      var list = (d && d.data && d.data.song && d.data.song.list) || [];
      return list.map(function (s) {
        return {
          src: 'qq', mid: s.mid,
          name: s.name || s.title || '',
          singer: (s.singer || []).map(function (x) { return x.name; }).join(' / '),
          album: (s.album && s.album.name) || '',
          dur: s.interval || 0,
          vip: !!(s.pay && s.pay.pay_play)
        };
      });
    });
  }
  function qqUrl(mid) {
    var ck = qqCookie();
    var body = {
      req_0: {
        module: 'vkey.GetVkeyServer', method: 'CgiGetVkey',
        param: { guid: '10000', songmid: [mid], songtype: [0], uin: '0', loginflag: 1, platform: '20' }
      },
      comm: { uin: 0, format: 'json', ct: 24, cv: 0 }
    };
    // 有会员 cookie 时改走带登录态的取链
    if (ck) {
      var uin = (ck.match(/uin=o?(\d+)/) || [])[1] || '';
      if (uin) {
        body.req_0.param.uin = uin;
        body.req_0.param.loginflag = 5;
        body.comm.uin = uin | 0;
      }
    }
    var u = 'https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(JSON.stringify(body));
    return jget(u).then(function (d) {
      var data = d && d.req_0 && d.req_0.data;
      var info = data && data.midurlinfo && data.midurlinfo[0];
      if (!info || !info.purl) return '';
      var sip = (data.sip || []).filter(function (s) { return /aqqmusic\.tc\.qq\.com|stream\.qqmusic/.test(s); })[0]
        || (data.sip || [])[0] || 'http://aqqmusic.tc.qq.com/';
      if (sip.charAt(sip.length - 1) !== '/') sip += '/';
      return sip + info.purl;
    });
  }

  /* ================= 音源 B：网易云（明文 api，免加密、免登录） ================= */
  function neSearch(kw) {
    var u = 'https://music.163.com/api/search/get/web?s=' + encodeURIComponent(kw) +
      '&type=1&limit=10&offset=0';
    return jget(u).then(function (d) {
      var list = (d && d.result && d.result.songs) || [];
      return list.map(function (s) {
        return {
          src: 'ne', mid: s.id,
          name: s.name,
          singer: (s.artists || []).map(function (x) { return x.name; }).join(' / '),
          album: (s.album && s.album.name) || '',
          dur: (s.duration || 0) / 1000,
          vip: s.fee === 1
        };
      });
    });
  }
  /* 走 /api/song/enhance/player/url（老明文接口）：响应是明文 JSON，
   * 付费歌（fee=8）实测直接给 320k mp3，只有真独家（周杰伦原版）返 code:404。 */
  function neUrl(id, br) {
    var u = 'https://music.163.com/api/song/enhance/player/url?ids=' +
      encodeURIComponent('[' + id + ']') + '&br=' + (br || 320000);
    return jget(u).then(function (j) {
      var it = (j && j.data && j.data[0]) || {};
      return it.url ? it.url.replace(/^http:/, 'https:') : '';
    }).catch(function () { return ''; });
  }

  /* ================= 落盘 ================= */
  /* 目标目录：/storage/emulated/0/Download/音乐/
   * 原生层 BiliDownload 已按「音频 → MediaStore.Downloads(relative_path=Download/音乐)」
   * 分流，这里只传纯文件名（带 / 会被 sanitize 拍平成下划线）。 */
  function toNative(url, filename) {
    var n = nv();
    if (n && typeof n.downloadVideo === 'function') {
      try { if (n.downloadVideo(url, filename) === true) return 'native'; } catch (e) {}
    }
    var a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    return 'browser';
  }

  /* ================= 样式 ================= */
  var CSS = [
    '#dfy-music-mask{position:fixed;inset:0;z-index:2147483000;background:rgba(17,24,39,.45);display:flex;align-items:flex-end;justify-content:center;font:15px/1.5 -apple-system,"PingFang SC","Noto Sans CJK SC",sans-serif;-webkit-tap-highlight-color:transparent}',
    '#dfy-music-mask .p{width:100%;max-width:560px;max-height:86vh;background:#fff;border-radius:18px 18px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -8px 32px rgba(0,0,0,.18)}',
    '#dfy-music-mask .h{display:flex;align-items:center;justify-content:space-between;padding:14px 16px 10px;border-bottom:1px solid #eef0f3}',
    '#dfy-music-mask .h b{font-size:16px;color:#111827;font-weight:600}',
    '#dfy-music-mask .h .ck{border:0;background:transparent;font-size:13px;color:#4d6bfe;padding:2px 6px}',
    '#dfy-music-mask .h button{font-size:22px;line-height:1;color:#9ca3af;border:0;background:transparent;padding:2px 6px}',
    '#dfy-music-mask .s{display:flex;gap:8px;padding:10px 16px 6px}',
    '#dfy-music-mask .s input{flex:1;min-width:0;height:38px;border:1px solid #e5e7eb;border-radius:10px;padding:0 12px;font-size:15px;color:#111827;background:#f9fafb;outline:none}',
    '#dfy-music-mask .s input:focus{border-color:#4d6bfe;background:#fff}',
    '#dfy-music-mask .s button{height:38px;padding:0 16px;border:0;border-radius:10px;background:#4d6bfe;color:#fff;font-size:15px;font-weight:500}',
    '#dfy-music-mask .s button:disabled{opacity:.55}',
    '#dfy-music-mask .l{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 8px 8px}',
    '#dfy-music-mask .row{display:flex;align-items:center;gap:10px;padding:10px 8px;border-radius:12px}',
    '#dfy-music-mask .row:active{background:#f3f5f9}',
    '#dfy-music-mask .row .m{flex:1;min-width:0}',
    '#dfy-music-mask .row .t{font-size:15px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#dfy-music-mask .row .d{font-size:12px;color:#9ca3af;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#dfy-music-mask .row .vip{display:inline-block;font-size:10px;color:#f59e0b;border:1px solid #fde68a;border-radius:4px;padding:0 3px;margin-left:6px;vertical-align:1px}',
    '#dfy-music-mask .row button{flex:none;height:32px;padding:0 12px;border:1px solid #dbe2ef;background:#fff;border-radius:9px;color:#4d6bfe;font-size:13px}',
    '#dfy-music-mask .row button:disabled{color:#9ca3af;border-color:#eee}',
    '#dfy-music-mask .tip{padding:8px 16px 14px;font-size:12px;color:#9ca3af;min-height:18px}',
    '#dfy-music-mask .tip.err{color:#ef4444}',
    '#dfy-music-mask .tip.ok{color:#10b981}'
  ].join('\n');
  function style() {
    if (document.getElementById('dfy-music-style')) return;
    var s = document.createElement('style');
    s.id = 'dfy-music-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  /* ================= 面板 ================= */
  var mask = null, input = null, listEl = null, tipEl = null, btnGo = null;
  var pending = {};

  function setTip(msg, cls) {
    if (!tipEl) return;
    tipEl.textContent = msg || '';
    tipEl.className = 'tip' + (cls ? ' ' + cls : '');
  }
  function closePanel() {
    if (mask && mask.parentNode) mask.parentNode.removeChild(mask);
    mask = null;
  }
  function buildPanel() {
    style();
    if (mask) return mask;
    mask = document.createElement('div');
    mask.id = 'dfy-music-mask';
    mask.innerHTML = [
      '<div class="p">',
      '<div class="h"><b>下载音乐</b><span><button type="button" class="ck">会员Cookie</button><button type="button" aria-label="关闭">×</button></span></div>',
      '<div class="s"><input type="search" placeholder="歌名 / 歌手 / 专辑" enterkeyhint="search"><button type="button">搜索</button></div>',
      '<div class="l"></div>',
      '<div class="tip">点「下载」自动换源找直链，文件存到 Download/音乐/</div>',
      '</div>'
    ].join('');
    document.body.appendChild(mask);
    input = mask.querySelector('input');
    btnGo = mask.querySelector('.s button');
    listEl = mask.querySelector('.l');
    tipEl = mask.querySelector('.tip');
    mask.querySelector('.h .ck').addEventListener('click', askCookie);
    mask.querySelectorAll('.h button')[1].addEventListener('click', closePanel);
    mask.addEventListener('click', function (e) { if (e.target === mask) closePanel(); });
    btnGo.addEventListener('click', doSearch);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 80);
    return mask;
  }

  function askCookie() {
    var cur = qqCookie();
    var v = window.prompt('粘贴 QQ 音乐会员 Cookie（含 uin= 和 qm_keyst=，留空清除）', cur);
    if (v === null) return;
    try {
      if (v.trim()) localStorage.setItem(LS_COOKIE, v.trim());
      else localStorage.removeItem(LS_COOKIE);
      setTip(qqCookie() ? '会员 Cookie 已保存，VIP 歌可尝试直取' : '会员 Cookie 已清除', 'ok');
    } catch (e) { setTip('保存失败', 'err'); }
  }

  function doSearch() {
    var kw = (input.value || '').trim();
    if (!kw) { setTip('先输入关键词', 'err'); return; }
    btnGo.disabled = true;
    listEl.innerHTML = '';
    setTip('搜索中…');
    neSearch(kw).then(function (rows) {
      if (!rows.length) { setTip('没搜到，换个关键词试试', 'err'); return; }
      setTip('共 ' + rows.length + ' 条；拿不到会自动换源再试');
      rows.forEach(function (r) { listEl.appendChild(renderRow(r)); });
    }).catch(function (e) {
      setTip('搜索失败：' + (e && e.message || e), 'err');
    }).then(function () { btnGo.disabled = false; });
  }

  function renderRow(r) {
    var row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = '<div class="m"><div class="t"></div><div class="d"></div></div><button type="button">下载</button>';
    row.querySelector('.t').textContent = r.name;
    var meta = [r.singer, r.album, fmtDur(r.dur)].filter(Boolean).join(' · ');
    var d = row.querySelector('.d');
    d.textContent = meta;
    if (r.vip) {
      var tag = document.createElement('span');
      tag.className = 'vip';
      tag.textContent = 'VIP';
      d.appendChild(tag);
    }
    var btn = row.querySelector('button');
    btn.addEventListener('click', function () { download(r, btn); });
    return row;
  }

  /* 换源：QQ 拿不到 → 网易云搜同名 → 取直链 */
  function download(r, btn) {
    if (pending[r.mid]) return;
    pending[r.mid] = 1;
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = '取链…';
    setTip('正在取直链…');

    var first = r.src === 'qq' ? qqUrl(r.mid) : neUrl(r.mid);
    first.then(function (u) {
      if (u) return { url: u, ext: r.src === 'qq' ? '.m4a' : '.mp3', from: r.src === 'qq' ? 'QQ' : '网易云' };
      setTip('这个源没直链，换源找…');
      if (r.src === 'qq') {
        return neSearch((r.singer ? r.singer + ' ' : '') + r.name).then(function (rows) {
          if (!rows.length) throw new Error('另一个源也没搜到');
          return neUrl(rows[0].mid).then(function (u2) {
            if (u2) return { url: u2, ext: '.mp3', from: '网易云' };
            throw new Error('两个源都拿不到（多半是独家 VIP），换个版本试试');
          });
        });
      }
      return qqSearch((r.singer ? r.singer + ' ' : '') + r.name).then(function (rows) {
        if (!rows.length) throw new Error('另一个源也没搜到');
        return qqUrl(rows[0].mid).then(function (u2) {
          if (u2) return { url: u2, ext: '.m4a', from: 'QQ' };
          throw new Error('两个源都拿不到（在 QQ 里可能是会员歌），换个版本试试');
        });
      });
    }).then(function (got) {
      var name = safeName(r.singer ? r.singer + ' - ' + r.name : r.name) + got.ext;
      var how = toNative(got.url, name);
      setTip('[' + got.from + '] 存到 Download/音乐/：' + name, 'ok');
      btn.textContent = '已发';
    }).catch(function (e) {
      setTip('失败：' + (e && e.message || e), 'err');
      btn.textContent = old;
    }).then(function () {
      btn.disabled = false;
      delete pending[r.mid];
    });
  }

  /* ================= 菜单注入 ================= */
  var NOTE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>';

  function injectMenu() {
    var btns = document.querySelectorAll('[role="menuitem"]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.getAttribute(MARK)) continue;
      if ((b.textContent || '').replace(/\s+/g, '') !== '添加文件') continue;
      var nx = b.nextElementSibling;
      if (nx && nx.getAttribute(MARK)) continue;
      var c = b.cloneNode(true);
      c.setAttribute(MARK, '1');
      var svg = c.querySelector('svg');
      if (svg) svg.outerHTML = NOTE_SVG;
      var sp = c.querySelector('span');
      if (sp) sp.textContent = '下载音乐';
      else c.textContent = '下载音乐';
      c.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        buildPanel();
      }, true);
      if (b.parentNode) b.parentNode.insertBefore(c, b.nextSibling);
    }
  }

  function boot() {
    injectMenu();
    new MutationObserver(injectMenu).observe(document.documentElement, { childList: true, subtree: true });
    var t = 0, iv = setInterval(function () {
      injectMenu();
      if (++t > 40) clearInterval(iv);
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
