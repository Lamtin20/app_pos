import { getMemberPortalSettings } from './backend/members.js';

const FALLBACK_TITLE = 'Tiệm Cafe Sun & Matcha';
const FALLBACK_DESC = 'Tinh hoa từ hạt, trọn vẹn yêu thương.';

/** Resolve tab title + share description from portal CMS settings. */
export function resolvePageMeta(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const title = String(s.pageTitle || s.brandTitle || FALLBACK_TITLE).trim() || FALLBACK_TITLE;
  const description = String(s.pageDescription || s.brandTagline || FALLBACK_DESC).trim() || FALLBACK_DESC;
  const image = String(s.shareImageUrl || s.heroImageUrl || '').trim();
  return { title, description, image };
}

export async function getPublicPageMeta() {
  try {
    const settings = await getMemberPortalSettings(false, false);
    return resolvePageMeta(settings);
  } catch {
    return resolvePageMeta(null);
  }
}

/** Next.js App Router metadata object for layout / page. */
export function buildNextMetadata(meta) {
  const m = meta || resolvePageMeta(null);
  const openGraph = {
    title: m.title,
    description: m.description,
    type: 'website',
    locale: 'vi_VN',
  };
  if (m.image) openGraph.images = [{ url: m.image }];
  return {
    title: m.title,
    description: m.description,
    openGraph,
    twitter: {
      card: m.image ? 'summary_large_image' : 'summary',
      title: m.title,
      description: m.description,
      ...(m.image ? { images: [m.image] } : {}),
    },
  };
}
