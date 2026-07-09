import { getProperty } from '../properties.js';
import { getMenu } from './menu.js';

const GEMINI_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash-lite', 'gemini-1.5-flash'];

async function callGemini(prompt, maxTokens = 512) {
  const apiKey = await getProperty('GEMINI_API_KEY');
  if (!apiKey) {
    return {
      ok: false,
      error:
        'Chưa cấu hình GEMINI_API_KEY. Thêm vào ScriptConfig sheet hoặc biến môi trường.',
    };
  }
  const payload = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.4 },
  });
  let lastErr = '';
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
      const parts = result.candidates?.[0]?.content?.parts;
      if (!parts?.[0]?.text) {
        lastErr = 'Model không trả nội dung.';
        continue;
      }
      return { ok: true, text: parts[0].text.trim(), model };
    } catch (e) {
      lastErr = String(e?.message || e);
    }
  }
  return { ok: false, error: lastErr || 'Không gọi được Gemini.' };
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
  const r = await callGemini(prompt, 800);
  if (!r.ok) return { suggestion: '', error: r.error };
  return { suggestion: r.text, model: r.model };
}

export async function suggestMenuDescriptionShort(name, category, ingredientsHint) {
  const prompt = `Viết mô tả ngắn (2-3 câu, tiếng Việt) cho món sữa hạt:
Tên: ${name}
Danh mục: ${category || ''}
Thành phần: ${ingredientsHint || ''}
Giọng thân thiện, không quảng cáo quá đà.`;
  const r = await callGemini(prompt, 200);
  return r.ok ? { ok: true, description: r.text } : { ok: false, error: r.error };
}

export async function suggestMenuBenefitsPro(name, category, ingredientsHint) {
  const prompt = `Liệt kê 3-5 công dụng/sức khỏe (bullet ngắn, tiếng Việt) cho món sữa hạt:
Tên: ${name}
Danh mục: ${category || ''}
Thành phần: ${ingredientsHint || ''}`;
  const r = await callGemini(prompt, 300);
  return r.ok ? { ok: true, benefits: r.text } : { ok: false, error: r.error };
}

export async function suggestMenuNutritionAndBenefitsBundle(name, category, ingredientsHint) {
  const prompt = `Ước tính dinh dưỡng và công dụng cho món sữa hạt (JSON hợp lệ):
Tên: ${name}
Danh mục: ${category || ''}
Thành phần: ${ingredientsHint || ''}
Trả về JSON: {"kcal":number,"proteinG":number,"fatG":number,"benefits":"string","description":"string"}`;
  const r = await callGemini(prompt, 400);
  if (!r.ok) return { ok: false, error: r.error };
  try {
    const jsonMatch = r.text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    return {
      ok: true,
      nutritionKcal: parseFloat(parsed.kcal) || 0,
      nutritionProteinG: parseFloat(parsed.proteinG) || 0,
      nutritionFatG: parseFloat(parsed.fatG) || 0,
      benefits: String(parsed.benefits || ''),
      description: String(parsed.description || ''),
      model: r.model,
    };
  } catch {
    return { ok: true, benefits: r.text, description: '', model: r.model };
  }
}

export async function testSunAdminGemini(apiKeyOptional) {
  let k = String(apiKeyOptional != null ? apiKeyOptional : '').trim();
  if (!k) k = String(await getProperty('GEMINI_API_KEY')).trim();
  if (!k) return { ok: false, error: 'Chưa có GEMINI_API_KEY (nhập key rồi Test, hoặc Lưu trước).' };
  const payload = JSON.stringify({
    contents: [{ parts: [{ text: 'Reply with exactly: OK' }] }],
    generationConfig: { maxOutputTokens: 16, temperature: 0 },
  });
  let lastErr = '';
  for (const model of GEMINI_MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(k)}`;
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
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastErr = 'Model không trả nội dung.';
        continue;
      }
      return { ok: true, message: `Gemini phản hồi OK (model: ${model}).` };
    } catch (e) {
      lastErr = String(e?.message || e);
    }
  }
  return { ok: false, error: lastErr || 'Không gọi được Gemini với các model đã thử.' };
}
