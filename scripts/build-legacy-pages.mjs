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

function read(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function transform(html, opts = {}) {
  let s = html;

  // Merge includes
  if (s.includes('<!--SUN_ORDER_CLIENT_JS-->')) {
    s = s.replace('<!--SUN_ORDER_CLIENT_JS-->', read('OrderClient.html'));
  }
  if (s.includes('<!--MEMBER_SCRIPTS_CORE-->')) {
    s = s.replace('<!--MEMBER_SCRIPTS_CORE-->', read('MemberScriptsCore.html'));
  }
  if (s.includes('<!--MEMBER_ORDER_CLIENT-->')) {
    s = s.replace('<!--MEMBER_ORDER_CLIENT-->', read('MemberOrderClient.html'));
  }

  // Favicon / URL inject tokens
  s = s.split('__SUN_FAVICON_URL__').join(FAVICON);
  s = s.split('__SUN_URL_INJECT__').join('""');

  // Route rewrites
  const routeMap = [
    [/\?page=admin/gi, '/admin'],
    [/\?page=order/gi, '/order'],
    [/\?page=member/gi, '/member'],
    [/\?page=pickup/gi, '/pickup'],
    [/api=memberPortalBootstrap/gi, 'api=memberBootstrap'],
    [/api=memberPortal&/gi, 'api=memberPortal&'],
  ];
  for (const [re, rep] of routeMap) s = s.replace(re, rep);

  // HTTP JSON fallbacks → REST endpoints
  s = s.replace(
    /base \+ sep \+ 'api=memberPortal&phone='/g,
    "base + '/api/member/portal?phone='"
  );
  s = s.replace(
    /base \+ sep \+ 'api=memberPortalBootstrap'/g,
    "base + '/api/member/bootstrap'"
  );
  s = s.replace(
    /base \+ sep \+ 'api=groupOrder&group='/g,
    "base + '/api/group-order?group='"
  );
  s = s.replace(
    /base \+ sep \+ 'api=orderStatus&order='/g,
    "base + '/api/order-status?order='"
  );
  s = s.replace(
    /base \+ sep \+ 'api=menu'/g,
    "base + '/api/menu'"
  );

  // memPage / posBase helpers
  s = s.replace(
    /function memPage\(p\) \{ return posBase\(\) \+ '\?page=' \+ p; \}/g,
    "function memPage(p) { var m = { admin:'/admin', order:'/order', member:'/member', pickup:'/pickup' }; return m[p] || ('/' + p); }"
  );
  s = s.replace(
    /lp\.href = posBase\(\) \+ '\?page=order'/g,
    "lp.href = '/order'"
  );
  s = s.replace(
    /pk\.href = posBase\(\) \+ '\?page=pickup'/g,
    "pk.href = '/pickup'"
  );

  // Replace Admin api layer with fetch-based (after sun-api-client loads)
  s = s.replace(
    /const api = \{[\s\S]*?callLong:[\s\S]*?\}\s*\};/,
    'if (window.__SUN_INSTALL_API__) __SUN_INSTALL_API__();'
  );

  // Inject sun-api-client before first script
  const inject = '<script src="/sun-api-client.js"></script>\n  ';
  if (!s.includes('sun-api-client.js')) {
    s = s.replace(/<head>/i, '<head>\n  ' + inject);
    // Also before body scripts if head injection missed inline scripts at top
    s = s.replace(/<script>\s*try \{ var SCRIPT_URL/i, inject + '<script>try { var SCRIPT_URL');
  }

  // Remove GAS-only tags
  s = s.replace(/<base target="_top">\s*/gi, '');

  // Pickup back link
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
    { src: 'MemberPortal.html', out: 'member.html', title: 'Hội viên | SUN Nut Milk' },
    { src: 'Pickup.html', out: 'pickup.html', title: 'Đặt hàng | SUN Nut Milk' },
  ];

  for (const p of pages) {
    const html = transform(read(p.src), { title: p.title });
    fs.writeFileSync(path.join(OUT, p.out), html, 'utf8');
    console.log('Built', p.out, '(' + html.length + ' bytes)');
  }
}

build();
