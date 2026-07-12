import LegacyPage from '../../components/LegacyPage.jsx';
import { buildNextMetadata, getPublicPageMeta } from '../../lib/siteMetadata.js';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return buildNextMetadata(await getPublicPageMeta());
}

export default function MemberPage() {
  return <LegacyPage src="/legacy/member.html" />;
}
