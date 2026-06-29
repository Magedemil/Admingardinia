// api/birthday-check.js
// وظيفة سيرفر تشتغل تلقائياً كل يوم (مجدولة في vercel.json)
// بتفحص: هل فيه عيد ميلاد النهاردة لأي مخدوم؟ وتبعت إشعار للخادم المسؤول عن فصله بس.

module.exports = async function handler(req, res) {
  // حماية بسيطة اختيارية — لو ضبطت CRON_SECRET في Vercel، لازم يتطابق
  const secret = process.env.CRON_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
  const ONESIGNAL_REST_KEY = process.env.ONESIGNAL_REST_API_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY || !ONESIGNAL_APP_ID || !ONESIGNAL_REST_KEY) {
    return res.status(500).json({ error: 'متغيرات البيئة (Environment Variables) ناقصة في Vercel' });
  }

  try {
    // ١) حدد "النهاردة" بتوقيت مصر (Africa/Cairo) — مش UTC، عشان مايجيش يوم غلط
    const now = new Date();
    const cairoStr = now.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }); // 'YYYY-MM-DD'
    const [, todayMonthStr, todayDayStr] = cairoStr.split('-');
    const todayMonth = parseInt(todayMonthStr, 10);
    const todayDay = parseInt(todayDayStr, 10);

    // ٢) اجلب كل المخدومين اللي عندهم تاريخ ميلاد مسجّل
    const studentsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/students?select=name,grade,gender,birthday&birthday=not.is.null`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!studentsRes.ok) {
      throw new Error('فشل الاتصال بـ Supabase: ' + studentsRes.status);
    }
    const students = await studentsRes.json();

    // ٣) فلتر اللي عيد ميلادهم النهاردة (شهر + يوم بس، بغض النظر عن السنة)
    const birthdayKids = students.filter(s => {
      const d = new Date(s.birthday);
      return (d.getUTCMonth() + 1) === todayMonth && d.getUTCDate() === todayDay;
    });

    if (birthdayKids.length === 0) {
      return res.status(200).json({ message: 'لا يوجد أعياد ميلاد النهاردة', date: cairoStr, count: 0 });
    }

    // ٤) نفس منطق classSlug في الكود الأمامي (لازم يتطابق تماماً)
    const gradeSlug = (g) => ({ 'الأول الثانوي': 'awal', 'الثاني الثانوي': 'tanya', 'الثالث الثانوي': 'talta' }[g] || 'unknown');
    const genderSlug = (g) => (g === 'بنت' || g === 'بنات') ? 'banat' : 'banin';

    // ٥) جمّع أصحاب الأعياد حسب الفصل
    const byClass = {};
    for (const kid of birthdayKids) {
      const slug = `${gradeSlug(kid.grade)}_${genderSlug(kid.gender)}`;
      (byClass[slug] = byClass[slug] || []).push(kid.name);
    }

    // ٦) ابعت إشعار لكل فصل (مستهدَف بالـ tag فقط، مش لكل المشتركين)
    const results = [];
    for (const [slug, names] of Object.entries(byClass)) {
      const message = names.length === 1
        ? `🎂 النهاردة عيد ميلاد ${names[0]}! متنساش تهنّيه/تهنّيها`
        : `🎂 النهاردة عيد ميلاد: ${names.join('، ')}! متنساش تهنّيهم`;

      const onesignalRes = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Basic ${ONESIGNAL_REST_KEY}`,
        },
        body: JSON.stringify({
          app_id: ONESIGNAL_APP_ID,
          filters: [{ field: 'tag', key: 'servant_class', relation: '=', value: slug }],
          headings: { ar: '🎂 عيد ميلاد مخدوم!', en: '🎂 Birthday!' },
          contents: { ar: message, en: message },
        }),
      });
      const onesignalData = await onesignalRes.json();
      results.push({ class: slug, names, onesignal_status: onesignalRes.status, onesignal_response: onesignalData });
    }

    return res.status(200).json({ message: 'تم إرسال الإشعارات', date: cairoStr, count: birthdayKids.length, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

