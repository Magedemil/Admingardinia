// api/ai-chat.js
// المساعد الذكي العائم — بياخد سؤال الخادم/الأمين + ملخص بيانات فصله/خدمته، ويرد بتحليل مفيد

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY ناقص في إعدادات Vercel' });
  }

  try {
    const { question, role, context } = req.body || {};
    if (!question) {
      return res.status(400).json({ error: 'السؤال مطلوب' });
    }

    const roleLabel = role === 'amin' ? 'أمين خدمة (مسؤول عن كل فصول الأسرة)' : 'خادم/خادمة (مسؤول عن فصل واحد)';

    const systemPrompt = `أنت مساعد ذكي داخل تطبيق "افتقادي" — تطبيق متابعة حضور وافتقاد مخدومي أسرة ثانوي في كنيسة قبطية أرثوذكسية.
المستخدم: ${roleLabel}.

دورك: تساعده يفهم بيانات حضور وافتقاد مخدومينه ويتصرّف بحكمة محبة.

قواعد مهمة:
- اكتب بالعربية المصرية العامية البسيطة، بأسلوب ودود ومحترم.
- خليك عملي ومباشر — لو السؤال عن "مين محتاج افتقاد"، اطلّع أسماء فعلية من البيانات ورتّبها بالأولوية.
- البيانات المرفقة فيها: اسم كل مخدوم، صفه، نوعه، عدد مرات غيابه المتتالي عن الأسرة (consec)، نسبة حضوره (pct)، آخر حضور، آخر ملحوظة افتقاد.
- consec أعلى = غياب أطول = أولوية افتقاد أعلى. pct أقل = حضور أضعف.
- متخترعش بيانات مش موجودة. لو معلومة مش في البيانات، قول إنها مش متوفرة.
- ركّز على البُعد الرعوي الإنساني (المحبة والاهتمام)، مش مجرد أرقام. الافتقاد خدمة محبة مش مراقبة.
- خلّي ردك مركّز ومناسب لقراءة سريعة على موبايل. استخدم نقاط لو فيه قائمة.
- متستخدمش لغة دينية ثقيلة أو وعظ. كن طبيعي ودافئ.`;

    const userPrompt = `بيانات ${context && context.scope ? context.scope : 'المخدومين'} (${context && context.total ? context.total : 0} مخدوم):
${JSON.stringify(context && context.students ? context.students : [], null, 1)}

سؤال المستخدم: ${question}`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
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
      return res.status(502).json({ error: 'لم يتم استلام رد' });
    }

    return res.status(200).json({ message });
  } catch (err) {
    console.error('ai-chat error:', err);
    return res.status(500).json({ error: err.message });
  }
};
