// api/ai-assist.js
// وظيفة سيرفر بتستخدم Claude API لمساعدة الخادم في كتابة رسالة افتقاد مخصّصة لكل مخدوم

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY ناقص في إعدادات Vercel' });
  }

  try {
    const { name, gender, grade, consec, pct, lastAtt, lastNote, extra } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: 'اسم المخدوم مطلوب' });
    }

    const genderWord = (gender === 'بنت') ? 'بنت' : 'ولد';

    // نبني وصف موجز لحالة المخدوم عشان الذكاء الاصطناعي يكتب رسالة مناسبة فعلاً
    let statusLines = [];
    if (consec !== null && consec !== undefined) {
      statusLines.push(consec === 0 ? 'مواظب، مغبش عن الأسرة' : `غايب ${consec} مرة متتالية عن الأسرة`);
    }
    if (pct !== null && pct !== undefined) statusLines.push(`نسبة حضوره الإجمالية ${pct}٪`);
    if (lastAtt) statusLines.push(`آخر حضور: ${lastAtt}`);
    if (lastNote) statusLines.push(`آخر ملحوظة افتقاد مسجّلة: ${lastNote}`);
    if (extra) statusLines.push(`معلومة إضافية من الخادم: ${extra}`);

    const systemPrompt = `أنت تساعد خادم/خادمة في كنيسة قبطية أرثوذكسية في كتابة رسالة واتساب قصيرة ودودة لمخدوم في أسرة ثانوي (مرحلة الثانوية العامة).
القواعد:
- اكتب بالعربية المصرية العامية البسيطة، بأسلوب ودود وشخصي ودافئ، مش رسمي خالص.
- الرسالة لازم تكون قصيرة (٢-٤ جمل بحد أقصى)، مناسبة للإرسال على واتساب.
- لو المخدوم ${genderWord==='بنت'?'بنت':'ولد'}, خاطبه/ـها بصيغة ${genderWord==='بنت'?'المؤنث':'المذكر'} الصحيحة نحوياً.
- لا تستخدم لغة دينية ثقيلة أو وعظ مباشر — التركيز على الاهتمام الشخصي والمحبة.
- لا تذكر أرقام أو نسب حضور بشكل مباشر في الرسالة (هي معلومات سياقية للمساعدة في الصياغة بس، مش للذكر الحرفي).
- رجّع نص الرسالة فقط، من غير أي شرح أو علامات اقتباس أو عنوان.`;

    const userPrompt = `اسم المخدوم: ${name}
الصف: ${grade || 'غير محدد'}
${statusLines.length ? statusLines.join('\n') : ''}

اكتب رسالة افتقاد قصيرة ومناسبة للحالة دي.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      console.error('Anthropic API error:', aiRes.status, errBody);
      return res.status(502).json({ error: 'فشل الاتصال بخدمة الذكاء الاصطناعي' });
    }

    const aiData = await aiRes.json();
    const textBlock = (aiData.content || []).find(b => b.type === 'text');
    const message = textBlock ? textBlock.text.trim() : null;

    if (!message) {
      return res.status(502).json({ error: 'لم يتم استلام رد من الذكاء الاصطناعي' });
    }

    return res.status(200).json({ message });
  } catch (err) {
    console.error('ai-assist error:', err);
    return res.status(500).json({ error: err.message });
  }
};
