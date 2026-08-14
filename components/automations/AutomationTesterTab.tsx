import React, { useState } from 'react';
import { LeadMagnet, InstagramAccount } from '../../types';
import { BeakerIcon, SparklesIcon, PaperAirplaneIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface TestResult {
  blockers: string[];
  matched: {
    id: string;
    title: string;
    keyword: string;
    delay_seconds: number;
    direct_text: string;
    button_text: string | null;
    button_url: string | null;
    public_reply: string | null;
  } | null;
}

interface AutomationTesterTabProps {
  rules: LeadMagnet[];
  accounts: InstagramAccount[];
}

export const AutomationTesterTab: React.FC<AutomationTesterTabProps> = ({
  rules,
  accounts,
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '');
  const [testTrigger, setTestTrigger] = useState<'comment' | 'dm'>('comment');
  const [testText, setTestText] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const evaluateTrigger = (text: string, triggerType: 'comment' | 'dm') => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTesting(true);

    const activeRules = rules.filter(
      (r) =>
        r.is_active &&
        (!r.instagram_account_id || r.instagram_account_id === selectedAccountId) &&
        (triggerType === 'comment' ? r.trigger_comments : r.trigger_dm)
    );

    let match: { rule: LeadMagnet; matchedKeyword: string } | null = null;
    const normalizedInput = trimmed.toLowerCase();

    for (const rule of activeRules) {
      const kwList = rule.keywords?.length ? rule.keywords : [rule.codeword];
      for (const kw of kwList) {
        const normKw = kw.trim().toLowerCase();
        if (!normKw) continue;

        if (rule.match_mode === 'exact') {
          if (normalizedInput === normKw) {
            match = { rule, matchedKeyword: kw };
            break;
          }
        } else {
          // contains mode
          if (normalizedInput.includes(normKw)) {
            match = { rule, matchedKeyword: kw };
            break;
          }
        }
      }
      if (match) break;
    }

    if (match) {
      const publicReply =
        match.rule.public_reply_enabled && match.rule.public_reply_variants?.length
          ? match.rule.public_reply_variants[0]
          : null;

      setTestResult({
        blockers: [],
        matched: {
          id: match.rule.id,
          title: match.rule.title,
          keyword: match.matchedKeyword,
          delay_seconds: match.rule.reply_delay_seconds || 0,
          direct_text: match.rule.reply_text,
          button_text: match.rule.button_text || 'Получить материал',
          button_url: match.rule.response_url || null,
          public_reply: publicReply,
        },
      });
    } else {
      setTestResult({
        blockers: ['Ни одно активное правило не совпало с введенным текстом.'],
        matched: null,
      });
    }

    setTesting(false);
  };

  const handleRunTest = () => {
    evaluateTrigger(testText, testTrigger);
  };

  const quickChips = ['ГАЙД', 'скиньте гайд', 'Хочу схему', 'Сколько стоит?', 'МАТЕРИАЛ'];

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5 max-w-4xl mx-auto">
      {/* Informational Header */}
      <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/60 flex items-start gap-3">
        <BeakerIcon className="w-5 h-5 text-[#1E60FF] flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-xs font-semibold text-slate-900">
            Тестер логики триггеров (Интерактивная песочница)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            Введите текст комментария или сообщения, чтобы проверить, какое правило сработает и какой ответ отправит бот.
          </p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Instagram аккаунт
          </label>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#1E60FF] font-medium"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                @{a.username}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            Тип входящего события
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTestTrigger('comment')}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
                testTrigger === 'comment'
                  ? 'bg-blue-50 border-blue-200 text-[#1E60FF]'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              💬 Комментарий под Reel
            </button>
            <button
              type="button"
              onClick={() => setTestTrigger('dm')}
              className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-all ${
                testTrigger === 'dm'
                  ? 'bg-blue-50 border-blue-200 text-[#1E60FF]'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              ✉️ Сообщение в Direct
            </button>
          </div>
        </div>
      </div>

      {/* Input Text & Quick Chips */}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1.5">
          Тестовый текст сообщения
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="Например: Отправьте мне гайд пожалуйста!"
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#1E60FF]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRunTest();
            }}
          />
          <button
            type="button"
            onClick={handleRunTest}
            disabled={!testText.trim() || testing}
            className="px-5 py-2.5 bg-[#1E60FF] hover:bg-[#1551E5] disabled:bg-slate-200 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all"
          >
            {testing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
            Проверить
          </button>
        </div>

        {/* Quick Test Chips */}
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          <span className="text-[11px] text-slate-400">Быстрый тест:</span>
          {quickChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setTestText(chip);
                evaluateTrigger(chip, testTrigger);
              }}
              className="text-[11px] font-mono px-2 py-0.5 bg-slate-100 hover:bg-blue-50 hover:text-[#1E60FF] text-slate-600 rounded-md transition-colors border border-slate-200/60"
            >
              «{chip}»
            </button>
          ))}
        </div>
      </div>

      {/* Result Visualizer */}
      {testResult && (
        <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3 animate-in fade-in">
          <span className="text-xs font-semibold text-slate-500">Результат симуляции:</span>

          {testResult.matched ? (
            <div className="space-y-2.5">
              <div className="p-3 bg-emerald-50 border border-emerald-200/60 rounded-xl text-xs text-emerald-900 space-y-1">
                <p className="font-semibold text-xs text-emerald-800">
                  ✓ Сработало правило: «{testResult.matched.title}»
                </p>
                <p className="text-[11px] text-emerald-700">
                  Распознано ключевое слово: <b>{testResult.matched.keyword}</b>
                </p>
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                <span className="text-[11px] text-slate-400 block font-medium">
                  Сообщение в Instagram Direct:
                </span>
                <p className="text-xs text-slate-700 whitespace-pre-line bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {testResult.matched.direct_text}
                </p>

                {testResult.matched.public_reply && testTrigger === 'comment' && (
                  <div className="pt-2 border-t border-slate-100 text-xs text-slate-600 flex items-center gap-1.5">
                    <span className="text-slate-400">Публичный ответ под постом:</span>
                    <span>«{testResult.matched.public_reply}»</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-100 rounded-xl text-xs text-slate-700">
              Ни одно активное правило не совпало с фразой «{testText}».
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AutomationTesterTab;
