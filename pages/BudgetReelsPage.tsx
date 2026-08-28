import React, { useState, useRef, useEffect } from 'react';
import { 
  Home, ShoppingCart, Zap, Phone, Car, Droplet, Pill, 
  Plane, TrendingUp, PlayCircle, Download, Shirt, Film, Wallet
} from 'lucide-react';
import {
  BoltIcon,
  MusicalNoteIcon,
  StopIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { PageHeader, PageShell } from '../components/ui';
import { supabase, getSignedUrl } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import { AudioFile } from '../types';
import { renderBudgetReelsVideo } from '../utils/budgetReelsRenderer';
import {
  generateBudgetReelsCaptions,
  normalizeBudgetCodeword,
} from '../services/ai/budgetReelsCaptions';

// --- ДАННЫЕ И КОНФИГИ ---

const generateRandomTarget = () => {
  const base = Math.floor(Math.random() * 310 + 40) * 1000;
  const randomHundreds = Math.floor(Math.random() * 10) * 100;
  const randomTens = Math.floor(Math.random() * 10) * 10;
  return base + randomHundreds + randomTens;
};

const generateTypingSequence = (target: number) => {
  const str = target.toString();
  const seq: (number | string)[] = [];
  for (let i = 1; i <= str.length; i++) {
    seq.push(parseInt(str.substring(0, i), 10));
  }
  return seq;
};

const generateDeletingSequence = (target: number) => {
  const str = target.toString();
  const seq: (number | string)[] = [];
  for (let i = str.length - 1; i > 0; i--) {
    seq.push(parseInt(str.substring(0, i), 10));
  }
  seq.push("");
  return seq;
};

const generateBudgetSequence = () => {
  const target1 = generateRandomTarget();
  const target2 = generateRandomTarget();
  const finalTarget = generateRandomTarget();
  return [
    "",
    ...generateTypingSequence(target1),
    target1,
    ...generateDeletingSequence(target1),
    ...generateTypingSequence(target2),
    target2,
    ...generateDeletingSequence(target2),
    ...generateTypingSequence(finalTarget),
    finalTarget,
    finalTarget
  ];
};

const DEFAULTS = { budget: 150000 };

const BUDGET_TITLES = [
  "ИДЕАЛЬНЫЙ БЮДЖЕТ\nНА МЕСЯЦ",
  "КУДА УХОДЯТ\nТВОИ ДЕНЬГИ?",
  "ПРАВИЛО БЮДЖЕТА\nДЛЯ БОГАТЫХ",
  "КАК НАКОПИТЬ\nНА МЕЧТУ",
  "ОШИБКИ, КОТОРЫЕ\nДЕЛАЮТ ВСЕ",
  "СЕКРЕТ УСПЕШНЫХ\nНАКОПЛЕНИЙ",
  "ПОЧЕМУ ТЫ\nВСЕ ЕЩЕ БЕДНЫЙ?",
  "КАК ПРАВИЛЬНО\nОТКЛАДЫВАТЬ?",
  "ФИНАНСОВАЯ\nНЕЗАВИСИМОСТЬ",
  "СКОЛЬКО НУЖНО\nДЛЯ СЧАСТЬЯ?",
  "ПРИВЫЧКИ\nБОГАТЫХ ЛЮДЕЙ",
  "КАК ЗАКРЫТЬ\nВСЕ КРЕДИТЫ",
  "ТВОЯ ЗАРПЛАТА\nМОЖЕТ БОЛЬШЕ",
  "ГЛАВНОЕ ПРАВИЛО\nДЕНЕГ",
  "КАК ПЕРЕСТАТЬ\nЖИТЬ ОТ ЗП ДО ЗП",
  "ЭКОНОМИЯ БЕЗ\nСТРАДАНИЙ",
  "УПРАВЛЯЙ ДЕНЬГАМИ\nКАК ПРОФИ",
  "ИНВЕСТИЦИИ\nДЛЯ НОВИЧКОВ",
  "КАК УДВОИТЬ\nСВОЙ ДОХОД",
  "ФИНАНСОВАЯ\nПОДУШКА БЕЗОПАСНОСТИ"
];

const formatMoney = (amount: number): string => {
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function getAudioUrl(path: string): Promise<string> {
  return getSignedUrl('audio', path);
}

// --- КОМПОНЕНТ ---

export default function BudgetReelsPage() {
  const { user } = useAuth();
  const { selectedAccount } = useAccount();

  // === Состояния превью ===
  const [inputValue, setInputValue] = useState<number | string>(DEFAULTS.budget);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [budgetTitle, setBudgetTitle] = useState(() => BUDGET_TITLES[Math.floor(Math.random() * BUDGET_TITLES.length)]);
  const inputRef = useRef<HTMLInputElement>(null);

  // === Состояния пакетной генерации ===
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [audioMode, setAudioMode] = useState<'random' | 'none'>('random');
  const [batchCount, setBatchCount] = useState(10);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; step: string } | null>(null);
  const [batchErrors, setBatchErrors] = useState<string[]>([]);
  const [batchDone, setBatchDone] = useState(false);
  const [codewordOptions, setCodewordOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedCodeword, setSelectedCodeword] = useState('');
  const abortRef = useRef(false);

  // === Загрузка аудио при монтировании ===
  useEffect(() => {
    if (!user) return;
    supabase.from('audio_files').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setAudioFiles(data); });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadCodewords = async () => {
      let query = supabase
        .from('lead_magnets')
        .select('id,title,codeword')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (selectedAccount?.id) {
        query = query.or(`instagram_account_id.eq.${selectedAccount.id},instagram_account_id.is.null`);
      }

      const { data } = await query.order('created_at', { ascending: false });
      if (cancelled) return;

      const seen = new Set<string>();
      const options = (data ?? []).flatMap((rule) => {
        const value = normalizeBudgetCodeword(String(rule.codeword ?? ''));
        if (!value || seen.has(value)) return [];
        seen.add(value);
        return [{ value, label: `${value} — ${rule.title}` }];
      });

      setCodewordOptions(options);
      setSelectedCodeword((current) =>
        options.some((option) => option.value === current)
          ? current
          : options[0]?.value || '',
      );
    };

    void loadCodewords();
    return () => { cancelled = true; };
  }, [user, selectedAccount?.id]);

  // === Превью ===
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '');
    setInputValue(val ? parseInt(val, 10) : '');
  };

  const shuffleTitle = () => {
    const currentIndex = BUDGET_TITLES.indexOf(budgetTitle);
    let nextIndex;
    do { nextIndex = Math.floor(Math.random() * BUDGET_TITLES.length); } while (nextIndex === currentIndex);
    setBudgetTitle(BUDGET_TITLES[nextIndex]);
  };

  const startAnimation = async () => {
    if (isAnimating) return;
    setIsAnimating(true);
    shuffleTitle();
    if (inputRef.current) inputRef.current.focus();
    const sequence = generateBudgetSequence();
    let step = 0;
    const interval = setInterval(() => {
      if (step < sequence.length) {
        setInputValue(sequence[step]);
        step++;
      } else {
        clearInterval(interval);
        setIsAnimating(false);
        if (inputRef.current) inputRef.current.blur();
      }
    }, 200);
  };

  // === Одиночная запись (скачивание) ===
  const startSingleRecording = async () => {
    if (isRendering || isAnimating) return;
    setIsRendering(true);

    try {
      const sequence = generateBudgetSequence();
      const title = budgetTitle;
      const node = document.getElementById('reels-container');
      if (!node) { setIsRendering(false); return; }

      let audioUrl: string | null = null;
      if (audioMode === 'random' && audioFiles.length > 0) {
        const randomAudio = audioFiles[Math.floor(Math.random() * audioFiles.length)];
        audioUrl = await getAudioUrl(randomAudio.file_path);
      }

      const blob = await renderBudgetReelsVideo({
        containerElement: node,
        sequence,
        setInputValue,
        setBudgetTitle,
        title,
        audioUrl,
        uniquifierEnabled: true,
        uniquifierIntensity: 'medium',
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reel-budget-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error('Ошибка записи:', e);
    }

    setIsRendering(false);
  };

  // === ПАКЕТНАЯ ГЕНЕРАЦИЯ ===
  const startBatchGeneration = async () => {
    if (!user || batchRunning) return;

    const codeword = normalizeBudgetCodeword(selectedCodeword);
    if (!codeword) {
      setBatchErrors(['Выберите кодовое слово из активной Instagram-воронки.']);
      setBatchDone(true);
      return;
    }

    setBatchRunning(true);
    setBatchDone(false);
    setBatchErrors([]);
    setBatchProgress({ current: 0, total: batchCount, step: 'Подготовка...' });
    abortRef.current = false;

    const errors: string[] = [];
    const usedTitles = new Set<string>();
    setBatchProgress({ current: 0, total: batchCount, step: 'ИИ пишет описания...' });
    const captions = await generateBudgetReelsCaptions({ codeword, count: batchCount });

    for (let i = 0; i < batchCount; i++) {
      if (abortRef.current) break;

      setBatchProgress({ current: i, total: batchCount, step: `Рендерю видео ${i + 1} из ${batchCount}...` });

      try {
        let title: string;
        if (usedTitles.size >= BUDGET_TITLES.length) usedTitles.clear();
        do { title = pickRandom(BUDGET_TITLES); } while (usedTitles.has(title));
        usedTitles.add(title);

        const sequence = generateBudgetSequence();

        let audioUrl: string | null = null;
        if (audioMode === 'random' && audioFiles.length > 0) {
          const randomAudio = audioFiles[Math.floor(Math.random() * audioFiles.length)];
          audioUrl = await getAudioUrl(randomAudio.file_path);
        }

        const node = document.getElementById('reels-container');
        if (!node) throw new Error('reels-container не найден');

        // Рендерим видео
        const blob = await renderBudgetReelsVideo({
          containerElement: node,
          sequence,
          setInputValue,
          setBudgetTitle,
          title,
          audioUrl,
          uniquifierEnabled: true,
          uniquifierIntensity: 'medium',
        });

        // Загружаем в Supabase Storage
        const fileName = `${user.id}/${Date.now()}_budget_${i}.mp4`;
        setBatchProgress({ current: i, total: batchCount, step: `Загружаю видео ${i + 1}...` });

        const { error: uploadErr } = await supabase.storage
          .from('reels')
          .upload(fileName, blob, { contentType: 'video/mp4' });
        if (uploadErr) throw uploadErr;

        // Сохраняем в scheduled_posts
        const { error: insertErr } = await supabase
          .from('scheduled_posts')
          .insert({
            user_id: user.id,
            instagram_account_id: selectedAccount?.id || null,
            video_path: fileName,
            caption: captions[i],
            hook_text: title.replace(/\n/g, ' '),
            font_settings: {
              type: 'budget_reels',
              uniquifierEnabled: true,
              uniquifierIntensity: 'medium',
            },
            status: 'draft',
          });
        if (insertErr) throw insertErr;

      } catch (e: any) {
        errors.push(`Видео ${i + 1}: ${e.message}`);
      }
    }

    setBatchErrors(errors);
    setBatchProgress({ current: batchCount, total: batchCount, step: 'Завершено!' });
    setBatchDone(true);
    setBatchRunning(false);

    // Восстанавливаем дефолт
    setInputValue(DEFAULTS.budget);
  };

  const stopBatch = () => { abortRef.current = true; };

  const currentVal = typeof inputValue === 'number' ? inputValue : 0;

  /*
    --- РЕНДЕР ГРУППЫ (EXCEL) ---
    The literal hex values below are artwork, not interface chrome: this block
    is rasterised into the Reel and has to look like a spreadsheet, so it uses
    Excel's own fill colours. They are deliberately exempt from the design
    tokens — retinting them to the brand palette would break the illusion.
  */
  const renderGroup = (theme: 'green' | 'blue' | 'yellow' | 'gray', tabTitle: string, items: any[]) => {
    const themes = {
      green: { tab: 'bg-[#c5e0b4]', row: 'bg-[#e2efda]', val: 'bg-[#c5e0b4]' },
      blue: { tab: 'bg-[#b4c6e7]', row: 'bg-[#d9e1f2]', val: 'bg-[#b4c6e7]' },
      yellow: { tab: 'bg-[#ffe699]', row: 'bg-[#fff2cc]', val: 'bg-[#ffe699]' },
      gray: { tab: 'bg-[#d9d9d9]', row: 'bg-[#f2f2f2]', val: 'bg-[#d9d9d9]' },
    };
    const t = themes[theme];
    return (
      <div className="flex gap-[2px] mb-[4px]">
        <div className={`${t.tab} w-[100px] flex items-center justify-center px-1 py-0.5`}>
          <span className="text-black font-extrabold text-[10px] uppercase text-center leading-tight tracking-tight">{tabTitle}</span>
        </div>
        <div className="flex-1 flex flex-col gap-[2px]">
          {items.map((item, idx) => (
            <div key={idx} className="flex gap-[2px] h-[22px]">
              <div className={`${t.row} flex items-center justify-between flex-1 px-1.5`}>
                <div className="flex items-center gap-1.5">
                  {item.icon && <item.icon size={12} className={item.iconColor || "text-gray-700"} strokeWidth={2.5} />}
                  <span className="text-[11px] font-bold text-black leading-none">{item.name}</span>
                </div>
                {item.percent !== undefined && (
                  <span className="text-[10px] font-semibold text-gray-700 leading-none">{item.percent}</span>
                )}
              </div>
              <div className={`${t.val} w-[75px] flex items-center justify-end px-1.5`}>
                <span className="text-[11px] font-extrabold text-black leading-none whitespace-nowrap">{item.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderBudget = () => (
    <div className="flex flex-col pb-2 w-full px-4">
      {renderGroup('green', 'ПОТРЕБНОСТИ', [
        { name: 'Аренда', percent: '35%', value: `${formatMoney((currentVal * 35) / 100)} ₽`, icon: Home, iconColor: 'text-green-700' },
        { name: 'Продукты', percent: '15%', value: `${formatMoney((currentVal * 15) / 100)} ₽`, icon: ShoppingCart, iconColor: 'text-gray-500' },
        { name: 'Коммун услуги', percent: '5%', value: `${formatMoney((currentVal * 5) / 100)} ₽`, icon: Zap, iconColor: 'text-amber-500' },
        { name: 'Связь', percent: '3%', value: `${formatMoney((currentVal * 3) / 100)} ₽`, icon: Phone, iconColor: 'text-gray-600' },
        { name: 'Транспорт', percent: '5%', value: `${formatMoney((currentVal * 5) / 100)} ₽`, icon: Car, iconColor: 'text-red-600' },
        { name: 'Гигиена', percent: '3%', value: `${formatMoney((currentVal * 3) / 100)} ₽`, icon: Droplet, iconColor: 'text-blue-500' },
        { name: 'Лекарства', percent: '7%', value: `${formatMoney((currentVal * 7) / 100)} ₽`, icon: Pill, iconColor: 'text-red-400' },
      ])}
      <div className="h-1"></div>
      {renderGroup('blue', 'ЖЕЛАНИЯ', [
        { name: 'Шопинг', percent: '7%', value: `${formatMoney((currentVal * 7) / 100)} ₽`, icon: Shirt, iconColor: 'text-blue-400' },
        { name: 'Развлечения', percent: '5%', value: `${formatMoney((currentVal * 5) / 100)} ₽`, icon: Film, iconColor: 'text-gray-800' },
        { name: 'Путешествия', percent: '5%', value: `${formatMoney((currentVal * 5) / 100)} ₽`, icon: Plane, iconColor: 'text-blue-500' },
      ])}
      <div className="h-1"></div>
      {renderGroup('yellow', 'ИНВЕСТИЦИИ', [
        { name: 'Инвестиции', percent: '5%', value: `${formatMoney((currentVal * 5) / 100)} ₽`, icon: TrendingUp, iconColor: 'text-red-500' },
        { name: 'Резервный фонд', percent: '5%', value: `${formatMoney((currentVal * 5) / 100)} ₽`, icon: Wallet, iconColor: 'text-amber-500' },
      ])}
      <div className="h-1"></div>
      {renderGroup('gray', 'ИТОГО', [
        { name: '', percent: '100%', value: `${formatMoney(currentVal)} ₽` },
      ])}
    </div>
  );

  const disabled = isAnimating || isRendering || batchRunning;

  return (
    <PageShell>
      <PageHeader
        title="Бюджет Reels"
        description="Генерация видео с калькулятором бюджета. Формат 9:16."
      />

      {/* The preview is a fixed 360px frame the renderer captures, so below
          `xl` the controls stack under it rather than being squeezed beside it. */}
      <div className="flex flex-col items-start gap-8 xl:flex-row">
        {/*
          === ЛЕВАЯ КОЛОНКА: ПРЕВЬЮ + КНОПКИ ===
          The frame below is locked to 360px because the renderer captures it at
          that size, so on a narrow phone it is the column that scrolls — the
          negative margin lets it use the shell's padding before it does.
        */}
        <div className="scroll-x -mx-4 w-full px-4 sm:mx-0 sm:w-auto sm:px-0">
        <div className="flex flex-col items-center gap-4 shrink-0">
          {/*
            REELS КАРТОЧКА
            Everything inside this container is captured by the renderer and
            burned into the video, so its literal colours and pixel sizes are
            artwork rather than interface chrome. Design tokens and responsive
            utilities deliberately stop at this boundary — the frame has to
            stay 360x640 for the capture to line up.
          */}
          <div id="reels-container" className="w-[360px] h-[640px] bg-white shadow-2xl flex flex-col relative overflow-hidden shrink-0 rounded-lg">
            <div 
              className="bg-[#a61c1c] text-white text-center py-5 px-4 shrink-0 relative group cursor-pointer select-none"
              onClick={() => { if (!disabled) shuffleTitle(); }}
            >
              <h1 className="font-bold text-[24px] uppercase leading-[1.1] tracking-wide whitespace-pre-line">
                {budgetTitle}
              </h1>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[9px] bg-black/20 px-2 py-1 rounded-full">Сменить</span>
              </div>
            </div>

            <div className="flex flex-col items-center mt-6 mb-4 relative shrink-0">
              <div className="bg-[#f59e0b] text-black text-[12px] px-4 py-0.5 font-bold">ваш бюджет</div>
              <div className="relative mt-[0px]">
                <div className="border-[2px] border-[#4472c4] bg-white h-[32px] w-[140px] flex items-center justify-center">
                  <div className="relative flex items-center justify-center w-full h-full">
                    <input
                      ref={inputRef}
                      type="text"
                      value={typeof inputValue === 'number' ? formatMoney(inputValue) : inputValue}
                      onChange={handleInputChange}
                      className="w-full text-center text-[18px] font-extrabold outline-none text-black bg-transparent pr-5"
                      placeholder="0"
                    />
                    <div className="absolute right-1.5 text-[18px] font-extrabold text-black">₽</div>
                  </div>
                </div>
                <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-[#4472c4] border border-white"></div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar px-1">
              {renderBudget()}
            </div>
          </div>

          {/* КНОПКИ ПРЕВЬЮ */}
          <div className="flex gap-3">
            <button
              onClick={startAnimation}
              disabled={disabled}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                disabled
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-white border border-gray-200 text-brand-600 hover:bg-brand-50 hover:border-brand-200 shadow-sm'
              }`}
            >
              <PlayCircle size={18} />
              Предпросмотр
            </button>
            <button
              onClick={startSingleRecording}
              disabled={disabled}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                disabled
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-brand-600 text-white hover:bg-brand-700 shadow-lg'
              }`}
            >
              <Download size={18} />
              Скачать 1 видео
            </button>
          </div>
        </div>
        </div>

        {/* === ПРАВАЯ КОЛОНКА: НАСТРОЙКИ ПАКЕТНОЙ ГЕНЕРАЦИИ === */}
        <div className="w-full flex-1 space-y-6">
          {/* Блок настроек */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
              <BoltIcon className="w-5 h-5 text-brand-600" />
              Пакетная генерация
            </h2>

            {/* Количество видео */}
            <div className="mb-5">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Кодовое слово в описании
              </label>
              <select
                value={selectedCodeword}
                onChange={(event) => setSelectedCodeword(event.target.value)}
                disabled={batchRunning}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-brand-400 disabled:bg-gray-50"
              >
                {codewordOptions.length === 0 && (
                  <option value="">Нет активных кодовых слов</option>
                )}
                {codewordOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-2 text-xs text-gray-500">
                ИИ использует только выбранное слово во всех описаниях; оно должно совпадать с активной воронкой.
              </p>
            </div>

            <div className="mb-5">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Количество видео
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={batchCount}
                  onChange={e => setBatchCount(Number(e.target.value))}
                  className="flex-1"
                  disabled={batchRunning}
                />
                <span className="text-2xl font-bold text-brand-600 w-12 text-right">{batchCount}</span>
              </div>
            </div>

            {/* Аудио */}
            <div className="mb-5">
              <label className="text-sm font-medium text-gray-700 mb-2 block flex items-center gap-1.5">
                <MusicalNoteIcon className="w-4 h-4" />
                Аудио
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setAudioMode('random')}
                  disabled={batchRunning}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    audioMode === 'random'
                      ? 'bg-brand-50 border-brand-200 text-brand-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  🎲 Рандом из базы
                </button>
                <button
                  onClick={() => setAudioMode('none')}
                  disabled={batchRunning}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    audioMode === 'none'
                      ? 'bg-brand-50 border-brand-200 text-brand-700'
                      : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  🔇 Без аудио
                </button>
              </div>
              {audioMode === 'random' && audioFiles.length === 0 && (
                <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5" />
                  Нет аудиофайлов. Загрузите в разделе «Аудио».
                </p>
              )}
              {audioMode === 'random' && audioFiles.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  {audioFiles.length} аудиофайлов в базе
                </p>
              )}
            </div>

            {/* Аккаунт */}
            <div className="mb-6">
              <label className="text-sm font-medium text-gray-700 mb-1 block">
                Аккаунт
              </label>
              <p className="text-sm text-gray-900">
                {selectedAccount ? `@${selectedAccount.username}` : 'Не выбран (из сайдбара)'}
              </p>
            </div>

            {/* Кнопка запуска */}
            {!batchRunning ? (
              <button
                onClick={startBatchGeneration}
                disabled={disabled || !user || !selectedCodeword}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-200 text-white disabled:text-gray-500 rounded-xl text-sm font-semibold transition-colors shadow-lg disabled:shadow-none"
              >
                <BoltIcon className="w-5 h-5" />
                Сгенерировать {batchCount} видео
              </button>
            ) : (
              <button
                onClick={stopBatch}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold transition-colors shadow-lg"
              >
                <StopIcon className="w-5 h-5" />
                Остановить
              </button>
            )}
          </div>

          {/* Прогресс */}
          {batchProgress && (batchRunning || batchDone) && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{batchProgress.step}</p>
                </div>
                <span className="text-sm font-mono text-brand-600">
                  {batchProgress.current} / {batchProgress.total}
                </span>
              </div>

              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-brand-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                />
              </div>

              {batchErrors.length > 0 && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 max-h-32 overflow-y-auto">
                  {batchErrors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600 flex items-start gap-1.5 mb-1">
                      <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      {err}
                    </p>
                  ))}
                </div>
              )}

              {batchDone && (
                <div className="mt-4 flex items-center gap-2 text-green-600">
                  <CheckCircleIcon className="w-5 h-5" />
                  <span className="text-sm font-medium">
                    {batchErrors.length > 0
                      ? `Завершено с ${batchErrors.length} ошибками`
                      : 'Все видео готовы! Перейдите в Планировщик.'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Подсказка */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              <strong>Как работает:</strong> Каждое видео получает уникальный заголовок, числовую анимацию,
              отдельное описание от ИИ с выбранным кодовым словом и случайный аудиотрек из базы. Описания
              пишутся от мужского лица или нейтрально — без форм вроде «сделал(а)». Видео сохраняются в
              хранилище и появляются в Планировщике со статусом «Черновик».
            </p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
