import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const file = path.join(ROOT, 'MemberPortal.html');
let s = fs.readFileSync(file, 'utf8');

s = s.replace(
  /<!--MEMBER_SCRIPTS_CORE-->\s*<script>[\s\S]*?<\/script>\s*(?=<!--MEMBER_ORDER_CLIENT-->)/,
  '<!--MEMBER_SCRIPTS_CORE-->\n'
);
s = s.replace(
  /<!--MEMBER_ORDER_CLIENT-->\s*<script>[\s\S]*?<\/script>\s*(?=\s*<script>\s*(?:\/\*\*\s*\n\s*\* Dự phòng|\/\/ Cổng SĐT))/,
  '<!--MEMBER_ORDER_CLIENT-->\n'
);
s = s.replace(
  /\s*<script>\s*\/\*\*\s*\n\s*\* Dự phòng[\s\S]*?<\/script>\s*(?=\s*<script>\s*\n?\s*\/\/ Cổng SĐT)/,
  '\n'
);

fs.writeFileSync(file, s, 'utf8');
console.log('Stripped duplicates from MemberPortal.html');
console.log('google.script.run count:', (s.match(/google\.script\.run/g) || []).length);
console.log('MemOrder inline blocks:', (s.match(/global\.MemOrder\s*=/g) || []).length);
