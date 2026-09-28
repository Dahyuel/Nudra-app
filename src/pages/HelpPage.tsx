import React, { useState } from 'react';
import { HelpCircle, BookOpen, GraduationCap, Wrench, ChevronDown, Mail } from 'lucide-react';

interface FaqCategory {
  id: string;
  title: string;
  icon: React.ElementType;
  faqs: { q: string; a: string }[];
}

export const HelpPage: React.FC = () => {
  const [open, setOpen] = useState<string | null>(null);

  const categories: FaqCategory[] = [
    {
      id: 'students',
      title: 'للطلاب',
      icon: BookOpen,
      faqs: [
        {
          q: 'كيف أسجل في مقرر؟',
          a: 'تصفح المقررات من صفحة الاستكشاف، اختر المقرر المناسب، ثم اضغط على زر التسجيل. المقررات المجانية تُفعَّل فوراً.',
        },
        {
          q: 'هل يمكنني تحميل الدروس ومشاهدتها بدون إنترنت؟',
          a: 'ميزة التحميل للمشاهدة دون اتصال قادمة في تحديث قريب.',
        },
        {
          q: 'كيف يعمل المساعد الذكي؟',
          a: 'المساعد الذكي يستخدم محتوى المقرر المسجل فيه للإجابة على أسئلتك. كلما أكملت دروساً أكثر، كانت إجاباته أكثر دقة.',
        },
        {
          q: 'متى أحصل على شهادة الإتمام؟',
          a: 'تُصدر الشهادة تلقائياً عند إتمام 100% من دروس المقرر. يمكنك تحميلها من صفحة التقدم.',
        },
        {
          q: 'كيف أتواصل مع المدرس؟',
          a: 'استخدم مجتمع المقرر للتواصل مع المدرس والطلاب الآخرين. يمكنك النشر بشكل مجهول إذا أردت.',
        },
      ],
    },
    {
      id: 'instructors',
      title: 'للمدرسين',
      icon: GraduationCap,
      faqs: [
        {
          q: 'كيف أرفع مقرراً جديداً؟',
          a: "من لوحة تحكم المدرس، اضغط على 'رفع مقرر جديد' واتبع الخطوات الأربع: المعلومات الأساسية، المنهج، التسعير، النشر.",
        },
        {
          q: 'كم الوقت الذي تستغرقه معالجة الفيديو؟',
          a: 'تستغرق معالجة الفيديو وتحويله عادةً من 5 إلى 15 دقيقة حسب حجم الملف. ستظهر حالة المعالجة بجانب كل درس.',
        },
        {
          q: 'كيف يتم احتساب أرباحي؟',
          a: 'تحصل على نسبة من كل عملية شراء لمقرراتك. يمكنك متابعة أرباحك التفصيلية من صفحة الأرباح في لوحة التحكم.',
        },
        {
          q: 'هل يمكنني إنشاء اختبارات لدروسي؟',
          a: 'نعم، بعد رفع الفيديو يمكنك إنشاء اختبار لكل درس يدوياً أو توليده تلقائياً بالذكاء الاصطناعي.',
        },
      ],
    },
    {
      id: 'technical',
      title: 'مشاكل تقنية',
      icon: Wrench,
      faqs: [
        {
          q: 'الفيديو لا يعمل أو يتوقف كثيراً',
          a: 'تأكد من سرعة الإنترنت. جرب تقليل جودة الفيديو من إعدادات المشغل. إذا استمرت المشكلة، أعد تحميل الصفحة.',
        },
        {
          q: 'المساعد الذكي لا يستجيب',
          a: 'قد تكون وصلت للحد اليومي للمحادثات. حاول مرة أخرى بعد ساعة. إذا استمرت المشكلة، تواصل مع الدعم.',
        },
        {
          q: 'لم أتلق بريد التأكيد',
          a: 'تحقق من مجلد الرسائل غير المرغوب فيها (Spam). إذا لم تجده، تواصل معنا عبر صفحة الدعم.',
        },
      ],
    },
  ];

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in duration-200" dir="rtl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#1B1B1B] tracking-tight">
          مركز المساعدة والدعم
        </h1>
        <p className="text-sm text-[#6B7280] mt-1">
          الأسئلة الشائعة وإرشادات الطلاب وأدوات الدعم
        </p>
      </div>

      {categories.map((category) => {
        const Icon = category.icon;
        return (
          <div key={category.id} className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-[#1B1B1B] flex items-center gap-2">
              <Icon className="w-4 h-4 text-[#2D6A4F]" />
              <span>{category.title}</span>
            </h3>
            <div className="space-y-3">
              {category.faqs.map((faq, idx) => {
                const key = `${category.id}-${idx}`;
                const isOpen = open === key;
                return (
                  <div key={key} className="rounded-xl bg-[#F8FAF9] border border-gray-100 overflow-hidden">
                    <button
                      onClick={() => setOpen(isOpen ? null : key)}
                      className="w-full p-4 flex items-center justify-between gap-3 text-right hover:bg-white transition-colors"
                    >
                      <span className="text-xs sm:text-sm font-bold text-gray-900 flex items-start gap-2">
                        <HelpCircle className="w-4 h-4 text-[#2D6A4F] shrink-0 mt-0.5" />
                        <span>{faq.q}</span>
                      </span>
                      <ChevronDown
                        className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {isOpen && (
                      <p className="px-4 pb-4 pr-10 text-xs text-gray-600 leading-relaxed">{faq.a}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="rounded-2xl p-6 bg-gradient-to-r from-emerald-50 to-[#F8FAF9] border border-emerald-100 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-sm text-[#1B1B1B]">هل تحتاج مساعدة إضافية؟</h4>
          <p className="text-xs text-gray-500 mt-0.5">
            فريق الدعم الأكاديمي متاح من الأحد إلى الخميس.
          </p>
        </div>
        <a
          href="mailto:support@nudra.edu"
          className="px-4 py-2 rounded-xl bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#22523d] transition-colors"
        >
          تواصل مع الدعم
        </a>
      </div>
    </div>
  );
};
