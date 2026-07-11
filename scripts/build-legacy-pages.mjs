#!/usr/bin/env node
/**
 * Builds legacy HTML pages for Vercel from original GAS HTML sources.
 * Run: node scripts/build-legacy-pages.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'legacy');

const FAVICON = 'https://i.ibb.co/8LV0snn8/logo-sun-web.png';

const LEGACY_CSS = `
<style id="sun-legacy-root-css">
.legacy-page-root{height:100dvh;display:flex;flex-direction:column;overflow:hidden;min-height:0}
.legacy-page-root .topbar,.legacy-page-root .bottom-nav{flex-shrink:0}
.legacy-page-root .pos-layout,.legacy-page-root .mem-shell{flex:1;min-height:0}
.legacy-page-root .products-scroll,.legacy-page-root .mem-main,.legacy-page-root .mem-portal-main{overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;min-height:0;flex:1;scrollbar-width:none;-ms-overflow-style:none}
.legacy-page-root .products-scroll::-webkit-scrollbar,.legacy-page-root .mem-main::-webkit-scrollbar,.legacy-page-root .mem-portal-main::-webkit-scrollbar{display:none;width:0;height:0}
.legacy-page-root #admin-screen[style*="display: flex"],.legacy-page-root #admin-screen[style*="display:flex"]{display:flex!important;flex-direction:column;flex:1;min-height:0;height:100%;overflow:hidden}
.legacy-page-root #admin-screen .admin-content{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;-ms-overflow-style:none}
.legacy-page-root #admin-screen .admin-content::-webkit-scrollbar{display:none;width:0;height:0}
.legacy-page-root #admin-screen .admin-tabs{scrollbar-width:none;-ms-overflow-style:none}
.legacy-page-root #admin-screen .admin-tabs::-webkit-scrollbar{display:none;width:0;height:0}
</style>`;

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function transform(html, opts = {}) {
  let s = html;

  if (s.includes('<!--SUN_ORDER_CLIENT_JS-->')) {
    s = s.replace('<!--SUN_ORDER_CLIENT_JS-->', read('OrderClient.html'));
  }
  if (s.includes('<!--MEMBER_SCRIPTS_CORE-->')) {
    s = s.replace('<!--MEMBER_SCRIPTS_CORE-->', read('MemberScriptsCore.html'));
  }
  if (s.includes('<!--MEMBER_ORDER_CLIENT-->')) {
    s = s.replace('<!--MEMBER_ORDER_CLIENT-->', read('MemberOrderClient.html'));
  }

  s = s.split('__SUN_FAVICON_URL__').join(FAVICON);
  s = s.split('__SUN_URL_INJECT__').join('""');

  const routeMap = [
    [/\?page=admin/gi, '/admin'],
    [/\?page=order/gi, '/order'],
    [/\?page=member/gi, '/member'],
    [/\?page=pickup/gi, '/pickup'],
  ];
  for (const [re, rep] of routeMap) s = s.replace(re, rep);

  s = s.replace(
    /base \+ sep \+ 'api=memberPortal&phone='/g,
    "('/api/member/portal?phone='"
  );
  s = s.replace(
    /var url = base \+ sep \+ 'api=memberPortalBootstrap'/g,
    "var url = '/api/member/bootstrap'"
  );
  s = s.replace(
    /base \+ sep \+ 'api=memberPortal&phone='/g,
    "'/api/member/portal?phone='"
  );
  s = s.replace(
    /var url = base \+ sep \+ 'api=memberBootstrap'/g,
    "var url = '/api/member/bootstrap'"
  );
  s = s.replace(
    /base \+ sep \+ 'api=orderStatus&order='/g,
    "'/api/order-status?order='"
  );
  s = s.replace(
    /base \+ sep \+ 'api=groupOrder&group='/g,
    "'/api/group-order?group='"
  );
  s = s.replace(
    /base \+ sep \+ 'api=menu'/g,
    "('/api/menu'"
  );

  s = s.replace(
    /function memPage\(p\) \{ return posBase\(\) \+ '\?page=' \+ p; \}/g,
    "function memPage(p) { var m = { admin:'/admin', order:'/order', member:'/member', pickup:'/pickup' }; return m[p] || ('/' + p); }"
  );
  s = s.replace(
    /window\.memPage = function \(p\) \{ return window\.posBase\(\) \+ '\?page=' \+ p; \};/g,
    "window.memPage = function (p) { var m = { admin:'/admin', order:'/order', member:'/member', pickup:'/pickup' }; return m[p] || ('/' + p); };"
  );
  s = s.replace(/lp\.href = posBase\(\) \+ '\?page=order'/g, "lp.href = '/order'");
  s = s.replace(/pk\.href = posBase\(\) \+ '\?page=pickup'/g, "pk.href = '/pickup'");
  s = s.replace(
    /if \(lp\) lp\.href = window\.posBase\(\) \+ '\?page=order'/g,
    "if (lp) lp.href = '/order'"
  );
  s = s.replace(
    /if \(pk\) pk\.href = window\.posBase\(\) \+ '\?page=pickup'/g,
    "if (pk) pk.href = '/pickup'"
  );

  s = s.replace(
    /const api = \{[\s\S]*?callLong:[\s\S]*?\}\s*\};/,
    'if (window.__SUN_INSTALL_API__) __SUN_INSTALL_API__();'
  );

  const SUN_API_SCRIPT = /<script[^>]+src=["']\/sun-api-client\.js["']/i;
  const inject = '<script src="/sun-api-client.js"></script>\n  ';
  if (!SUN_API_SCRIPT.test(s)) {
    s = s.replace(/<head>/i, '<head>\n  ' + inject);
  }

  if (!s.includes('sun-legacy-root-css')) {
    s = s.replace(/<head>/i, '<head>\n  ' + LEGACY_CSS);
  }

  s = s.replace(/<base target="_top">\s*/gi, '');

  s = s.replace(/id="pk-back" href="#"/g, 'id="pk-back" href="/member"');

  if (opts.title) {
    s = s.replace(/<title>[^<]*<\/title>/i, `<title>${opts.title}</title>`);
  }

  return s;
}

function build() {
  fs.mkdirSync(OUT, { recursive: true });

  const pages = [
    { src: 'Admin.html', out: 'admin.html', title: 'Admin | SUN Nut Milk' },
    { src: 'Order.html', out: 'order.html', title: 'POS | SUN Sữa Hạt' },
    { src: 'MemberPortal.html', out: 'member.html', title: 'Tiệm Cafe Sun & Matcha' },
    { src: 'Pickup.html', out: 'pickup.html', title: 'Đặt hàng | SUN Nut Milk' },
  ];

  for (const p of pages) {
    const html = transform(read(p.src), { title: p.title });
    fs.writeFileSync(path.join(OUT, p.out), html, 'utf8');
    console.log('Built', p.out, '(' + html.length + ' bytes)');
  }
}

build();
