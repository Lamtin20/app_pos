import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function patchPortal() {
  const file = path.join(ROOT, 'MemberPortal.html');
  let s = fs.readFileSync(file, 'utf8');

  s = s.replace(
    /function initMemPickup\(\) \{\s*\n\s*if \(!state\.phone && !state\.guest\) return;/,
    'function initMemPickup() {\n        if (!state.phone && !state.guest) return;'
  );
  s = s.replace(/\n\s{12}function initMemPickup\(\)/, '\n      function initMemPickup()');

  s = s.replace(
    /state\.bootPkgMsg = '<div class="card err"[^']*google\.script\.run[^']*<\/div>';/,
    "state.bootPkgMsg = '<div class=\"card err\" style=\"line-height:1.5;\">Không tải được dữ liệu trang hội viên. Kiểm tra kết nối mạng và thử tải lại trang <strong>/member</strong>.</div>';"
  );

  s = s.replace(
    /\/\*\* Ưu tiên 1 GET JSON \(gộp settings\+menu\+gói\), fallback 3× google\.script\.run\. \*\//,
    '/** Bootstrap trang: GET /api/member/bootstrap, fallback api() RPC. */'
  );

  fs.writeFileSync(file, s, 'utf8');
  console.log('Patched MemberPortal.html');
}

function run(name) {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', name)], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

patchPortal();
run('strip-member-duplicates.mjs');
run('patch-member-order-flow.mjs');
run('build-legacy-pages.mjs');

const member = fs.readFileSync(path.join(ROOT, 'public/legacy/member.html'), 'utf8');
if (member.includes('/member&group=')) {
  console.error('ERROR: shareGroupUrl still broken in member.html');
  process.exit(1);
}
if ((member.match(/global\.MemOrder\s*=/g) || []).length !== 1) {
  console.error('ERROR: expected exactly one MemOrder export');
  process.exit(1);
}
console.log('Member legacy build OK');
