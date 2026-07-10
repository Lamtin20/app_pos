import { getProperty } from '../properties.js';
import { getMenu } from './menu.js';

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-001',
  'gemini-1.5-pro',
];

const GEMINI_API_BASES = [
  'https://generativelanguage.googleapis.com/v1beta/models/',
  'https://generativelanguage.googleapis.com/v1/models/',
];

async function getGeminiApiKey() {
  return String(await getProperty('GEMINI_API_KEY')).trim();
}

async function callGeminiWithKey(apiKey, prompt, generationConfig = {}) {
  if (!apiKey) {
    return {
      ok: false,
      error:
        'Chưa cấu hình GEMINI_API_KEY. Thêm vào ScriptConfig sheet hoặc biến môi trường.',
    };
  }
  const payload = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 512,
      ...generationConfig,
    },
  });
  let lastErr = '';
  for (const model of GEMINI_MODELS) {
    for (const base of GEMINI_API_BASES) {
      const url = `${base}${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
        });
        const result = await response.json();
        if (result.error) {
          lastErr = result.error.message || JSON.stringify(result.error);
          continue;
        }
        if (!response.ok) {
          lastErr = `HTTP ${response.status}`;
          continue;
        }
        const parts = result.candidates?.[0]?.content?.parts;
        if (!parts?.[0]?.text) {
          lastErr = 'Model không trả nội dung (có thể bị chặn bởi safety).';
          continue;
        }
        return { ok: true, text: parts[0].text.trim(), model };
      } catch (e) {
        lastErr = String(e?.message || e);
      }
    }
  }
  return { ok: false, error: lastErr || 'Không gọi được Gemini. Kiểm tra GEMINI_API_KEY và bật Generative Language API.' };
}

async function callGemini(prompt, maxTokens = 512, temperature = 0.4) {
  const apiKey = await getGeminiApiKey();
  return callGeminiWithKey(apiKey, prompt, { maxOutputTokens: maxTokens, temperature });
}

function stripJsonFence(raw) {
  return String(raw || '')
    .trim()
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

export async function getAISuggestion(userGoal, availableNuts) {
  const menu = await getMenu();
  const nuts = Array.isArray(availableNuts) ? availableNuts : [];
  const menuLines = menu
    .filter((m) => m.available !== false)
    .slice(0, 20)
    .map((m) => `- ${m.name}: ${m.description || m.benefits || ''}`)
    .join('\n');
  const prompt = `Bạn là chuyên gia dinh dưỡng sữa hạt SUN Nut Milk tại Việt Nam.
Mục tiêu khách: ${String(userGoal || '').trim()}
Hạt có sẵn: ${nuts.join(', ') || 'đa dạng'}
Menu:
${menuLines}
Gợi ý ngắn gọn (tiếng Việt) lịch uống 7 ngày, mỗi ngày 1 món từ menu, kèm lợi ích. Không công thức nấu.`;
  const r = await callGemini(prompt, 800, 0.65);
  if (!r.ok) return { suggestion: '', error: r.error };
  return { suggestion: r.text, model: r.model };
}

export async function suggestMenuDescriptionShort(name, category, ingredientsHint) {
  const n = String(name || '').trim();
  if (!n) return { ok: false, text: '', benefits: '', error: 'Thiếu tên món' };
  const cat = String(category || '').trim();
  const ing = String(ingredientsHint || '').trim().slice(0, 500);
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    const fb = `${n} - sữa hạt tươi xay tại chỗ, vị thanh ngọt tự nhiên, uống nóng hoặc lạnh đều hợp. Phù hợp bữa sáng / chiều nhẹ.`;
    const bf =
      'Có thể hỗ trợ bổ sung năng lượng nhẹ và dưỡng chất từ hạt (đạm thực vật, chất xơ); góp phần thói quen uống lành mạnh - nhiều người cũng quan tâm góc làn da & vóc dáng ở dinh dưỡng chung (tùy cơ địch, không thay tư vấn y tế).';
    return { ok: true, text: fb, benefits: bf, fallback: true };
  }
  const prompt =
    'Bạn là copywriter cho khách hàng (B2C) của thương hiệu sữa hạt. Viết ngắn gọn, dễ hiểu, tập trung cảm giác ngon & lợi ích nhẹ nhàng cho người uống. ' +
    'Trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích) theo schema:\n' +
    '{"desc":"...","benefits":"..."}\n' +
    '- desc: 1–2 câu tiếng Việt, tối đa 220 ký tự, không emoji, không gạch đầu dòng. Viết như mô tả trên menu để khách đọc.\n' +
    '- benefits: 2–3 câu tiếng Việt, tối đa 320 ký tự. Gắn với thành phần hạt (nếu có): gợi ý nhẹ "có thể hỗ trợ" cho năng lượng, tiêu hóa, làn da (góc dinh dưỡng/chống oxy hóa), vóc dáng (vai trò bữa phụ/no lâu) - không cam kết giảm cân/trắng da/chữa mụn; không chẩn đoán bệnh.\n' +
    'Giọng điệu: ấm áp, premium, healthy; không dùng từ nội bộ như "upsell/giá vốn/admin/POS".\n' +
    `Dữ liệu: Tên món="${n}"; Danh mục="${cat}"; Thành phần gợi ý="${ing || 'không khai báo'}".`;
  const r = await callGeminiWithKey(apiKey, prompt, { temperature: 0.55, maxOutputTokens: 256 });
  if (r.ok) {
    const raw = stripJsonFence(r.text);
    let obj = null;
    try {
      obj = JSON.parse(raw);
    } catch {
      obj = null;
    }
    let txt = '';
    let ben = '';
    if (obj && typeof obj === 'object') {
      txt = String(obj.desc || '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^["']|["']$/g, '')
        .slice(0, 280);
      ben = String(obj.benefits || '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^["']|["']$/g, '')
        .slice(0, 400);
    } else {
      txt = raw.replace(/\s+/g, ' ').trim().replace(/^["']|["']$/g, '').slice(0, 280);
    }
    if (txt) {
      if (!ben) {
        ben =
          'Có thể hỗ trợ bổ sung năng lượng nhẹ nhàng, giàu dưỡng chất từ hạt. Phù hợp người muốn uống lành mạnh (ít đường).';
      }
      return { ok: true, text: txt, benefits: ben, model: r.model };
    }
  }
  const fb2 = `${n} - món uống từ sữa hạt tươi, ít đường, thơm tự nhiên - phù hợp uống sáng hoặc giải khát trong ngày.`;
  return {
    ok: true,
    text: fb2,
    benefits:
      'Có thể hỗ trợ bổ sung năng lượng nhẹ và dưỡng chất từ hạt; góp phần thói quen uống lành mạnh - góc làn da & vóc dáng theo dinh dưỡng đại chúng, tùy cơ địch.',
    fallback: true,
  };
}

export async function suggestMenuBenefitsPro(name, category, ingredientsHint) {
  const n = String(name || '').trim();
  if (!n) return { ok: false, text: '', error: 'Thiếu tên món' };
  const cat = String(category || '').trim();
  const ing = String(ingredientsHint || '').trim().slice(0, 1200);
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    const fb =
      'Vị thơm béo tự nhiên, dễ uống. Có thể hỗ trợ bổ sung năng lượng nhẹ nhàng và giúp bạn no lâu hơn. Phù hợp dùng buổi sáng hoặc xế chiều.\n' +
      'Lưu ý: nếu bạn dị ứng các loại hạt, hãy cân nhắc trước khi dùng.';
    return { ok: true, text: fb, fallback: true };
  }
  const prompt =
    'Bạn là copywriter (B2C) cho thương hiệu sữa hạt cao cấp. ' +
    'Viết "Công dụng" để KHÁCH HÀNG đọc trên menu, ngắn gọn, dễ hiểu, gợi cảm giác healthy & ngon miệng. ' +
    'Không phóng đại, không cam kết chữa bệnh, không dùng ngôn ngữ nội bộ của người bán.\n\n' +
    'Thông tin sản phẩm:\n' +
    `- Tên món: ${n}\n` +
    `- Danh mục: ${cat || 'không rõ'}\n` +
    `- Thành phần gợi ý (nếu có): ${ing || 'không khai báo'}\n\n` +
    'Yêu cầu đầu ra:\n' +
    '1) Viết 3 đến 5 câu, tối đa 480 ký tự.\n' +
    '2) BẮT BUỘC có ít nhất 1–2 câu gắn với thành phần hạt đã cho.\n' +
    '3) Thêm câu hướng tới khách: "phù hợp cho...", "gợi ý dùng..." kèm 1 gợi ý thời điểm uống.\n' +
    '4) Nếu có lưu ý dị ứng hạt thì thêm 1 câu cuối "Lưu ý: ...".\n' +
    '5) Mỗi câu một dòng; có thể bắt đầu dòng bằng MỘT emoji Unicode rồi khoảng trắng rồi nội dung. Không bullet ASCII/Markdown.\n';
  const r = await callGeminiWithKey(apiKey, prompt, { temperature: 0.58, maxOutputTokens: 640 });
  if (r.ok && r.text) {
    const raw = String(r.text).replace(/```/g, '').trim().replace(/\u2014/g, '-');
    if (raw) return { ok: true, text: raw, model: r.model };
  }
  return {
    ok: false,
    text: '',
    error: r.error || 'Không tạo được công dụng. Kiểm tra GEMINI_API_KEY và quyền gọi mạng.',
  };
}

function buildCombinedBenefits(cust, adm) {
  const c = String(cust || '').trim();
  const a = String(adm || '').trim();
  if (!c && !a) return '';
  if (!a) return c;
  if (!c) return `Mở rộng cho admin tham khảo\n${a}`;
  return `${c}\n\nMở rộng cho admin tham khảo\n${a}`;
}

function nutritionBundleFallback(name, category) {
  const n = String(name || '').trim();
  const cat = String(category || '').trim();
  const cust =
    '✨ Gợi ý uống ấm hoặc lạnh tùy khẩu vị - vị thanh, ít ngọt.\n' +
    '💛 Từ hạt trong món: có thể góp phần đạm thực vật và các hợp chất chống oxy hóa nền tảng mà nhiều người quan tâm cho làn da & sức khỏe chung (tùy cơ địch).\n' +
    '🌿 Có thể hỗ trợ cảm giác no nhẹ khi dùng làm bữa phụ; phù hợp người muốn thói quen uống lành mạnh từ hạt.\n' +
    '💧 Gợi ý buổi sáng hoặc xế chiều - không thay bữa chính.';
  const adm =
    'Món này thường được xem như thức uống bổ sung nước và một phần năng lượng nhẹ từ hạt; không thay thế bữa chính hay thuốc.\n' +
    'Nếu khách uống đều vài tuần kèm ăn uống cân bằng, nhiều người thấy dễ duy trì thói quen - hiệu quả cụ thể phụ thuộc cơ địch, không có mốc thời gian cố định.\n' +
    'Dài hạn: nên xen ngày, tránh cộng dồn đường/topping; người dị ứng hạt hoặc có bệnh nền cần hỏi bác sĩ trước khi coi đây là phần chính của chế độ dinh dưỡng.\n' +
    'Không phù hợp hoặc nên hạn chế (cần tùy chỉnh theo công thức thật tại quán): dị ứng hạt/đậu nành nếu có trong món; cần kiểm soát đường huyết nếu thêm đường/siro/topping ngọt.\n' +
    'Vận hành quán: luôn hỏi dị ứng, gợi ít ngọt khi khách quan tâm đường huyết.';
  const h = `${n}|${cat}`.replace(/\s/g, '').length;
  const kcal = 130 + (h % 90);
  const pr = 4.5 + (h % 40) / 20;
  const ft = 5 + (h % 35) / 20;
  return {
    ok: true,
    combinedBenefits: buildCombinedBenefits(cust, adm),
    nutritionKcal: Math.round(kcal),
    nutritionProteinG: Math.round(pr * 10) / 10,
    nutritionFatG: Math.round(ft * 10) / 10,
    fallback: true,
  };
}

export async function suggestMenuNutritionAndBenefitsBundle(name, category, ingredientsHint) {
  const n = String(name || '').trim();
  if (!n) return { ok: false, error: 'Thiếu tên món' };
  const cat = String(category || '').trim();
  const ing = String(ingredientsHint || '').trim().slice(0, 1200);
  const apiKey = await getGeminiApiKey();
  if (!apiKey) return nutritionBundleFallback(n, cat);

  const prompt =
    'Bạn là chuyên gia tư vấn dinh dưỡng lâm sàng (RD) hoặc điều dưỡng viên có kinh nghiệm thực hành tại Việt Nam, đồng thời am hiểu thực đơn sữa hạt quán cà phê. ' +
    'Ước lượng dinh dưỡng cho 1 khẩu phần khoảng 350ml (ly thường) - chỉ ước lượng thực hành, không thay thế phân tích phòng lab.\n' +
    'Trả về DUY NHẤT một JSON hợp lệ (không markdown, không giải thích ngoài JSON) theo schema:\n' +
    '{"benefitsCustomer":"...","benefitsAdmin":"...","kcal":0,"proteinG":0,"fatG":0}\n' +
    'Quy tắc benefitsCustomer: 3–5 dòng, mỗi dòng bắt đầu bằng emoji Unicode, tối đa 520 ký tự.\n' +
    'Quy tắc benefitsAdmin: 800–1700 ký tự, giọng chuyên gia thận trọng, không chẩn đoán bệnh.\n' +
    'kcal, proteinG, fatG: số hợp lý với mô tả món.\n' +
    `Dữ liệu món: Tên="${n}"; Danh mục="${cat || 'không rõ'}"; Thành phần="${ing || 'không khai báo'}".`;

  const r = await callGeminiWithKey(apiKey, prompt, { temperature: 0.42, maxOutputTokens: 2048 });
  if (!r.ok) return nutritionBundleFallback(n, cat);

  const raw = stripJsonFence(r.text);
  let obj = null;
  try {
    obj = JSON.parse(raw);
  } catch {
    obj = null;
  }
  if (!obj || typeof obj !== 'object') return nutritionBundleFallback(n, cat);

  let bc = String(obj.benefitsCustomer || '')
    .trim()
    .replace(/\r\n/g, '\n');
  if (bc.length > 560) bc = `${bc.slice(0, 557)}…`;
  let ba = String(obj.benefitsAdmin || '')
    .trim()
    .replace(/\r\n/g, '\n');
  if (ba.length > 4500) ba = `${ba.slice(0, 4497)}…`;
  let kcal = Math.round(parseFloat(obj.kcal) || 0);
  let pr = Math.round((parseFloat(obj.proteinG) || 0) * 10) / 10;
  let ft = Math.round((parseFloat(obj.fatG) || 0) * 10) / 10;
  if (kcal < 30 || kcal > 900) kcal = Math.max(80, Math.min(450, kcal));
  if (pr < 0 || pr > 40) pr = 6;
  if (ft < 0 || ft > 50) ft = 7;
  if (!bc) return nutritionBundleFallback(n, cat);

  return {
    ok: true,
    combinedBenefits: buildCombinedBenefits(bc, ba),
    nutritionKcal: kcal,
    nutritionProteinG: pr,
    nutritionFatG: ft,
    model: r.model,
  };
}

export async function testSunAdminGemini(apiKeyOptional) {
  let k = String(apiKeyOptional != null ? apiKeyOptional : '').trim();
  if (!k) k = await getGeminiApiKey();
  if (!k) return { ok: false, error: 'Chưa có GEMINI_API_KEY (nhập key rồi Test, hoặc Lưu trước).' };
  const r = await callGeminiWithKey(k, 'Reply with exactly: OK', {
    maxOutputTokens: 16,
    temperature: 0,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, message: `Gemini phản hồi OK (model: ${r.model}).` };
}
