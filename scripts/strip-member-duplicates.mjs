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
  /<!--MEMBER_ORDER_CLIENT-->\s*<script>[\s\S]*?<\/script>\s*(?=\s*<script>\s*\/\*\*\s*\n\s*\* Dự phòng)/,
  '<!--MEMBER_ORDER_CLIENT-->\n'
);

fs.writeFileSync(file, s, 'utf8');
console.log('google.script.run count:', (s.match(/google\.script\.run/g) || []).length);
