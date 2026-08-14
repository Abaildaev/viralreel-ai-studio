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
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import { AudioFile } from '../types';
import { renderBudgetReelsVideo } from '../utils/budgetReelsRenderer';

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

const BUDGET_CAPTIONS = [
  "Хочешь навести порядок в деньгах? Пиши ТАБЛИЦА в комментариях — и я отправлю тебе шаблон для учёта финансов в директ 💸",
  "Сохрани, чтобы не потерять 📌\nПиши «БЮДЖЕТ» в комменты — скину готовый шаблон бесплатно 🎁",
  "90% людей не знают, куда уходят их деньги.\nПиши «ХОЧУ» — отправлю таблицу учёта в директ 📊",
  "Ты тоже каждый месяц не понимаешь, куда делись деньги?\nПиши ШАБЛОН — пришлю бесплатный инструмент для учёта 💰",
  "Этот метод помог мне откладывать 20% с любого дохода.\nХочешь таблицу? Пиши ФИНАНСЫ в комменты 👇",
  "Деньги любят счёт. А ты ведёшь свой бюджет?\nПиши «ПЛАН» — скину готовую систему в директ 📋",
  "Если бы мне показали это раньше, я бы сэкономил(а) сотни тысяч.\nПиши ТАБЛИЦА — получи шаблон бесплатно ✨",
  "Перестань тратить на автомате.\nПиши «УЧЁТ» в комменты — отправлю таблицу для контроля расходов 📱",
  "Сколько ты тратишь на еду? А на развлечения?\nЕсли не знаешь — пиши БЮДЖЕТ, помогу разобраться 🔍",
  "Финансовая грамотность начинается с одной таблицы.\nПиши «СТАРТ» — скину шаблон в директ 🚀",
  "Этот способ планирования бюджета изменит твоё отношение к деньгам.\nПиши ФОРМУЛА — получи в директ бесплатно 💡",
  "Правило 50/30/20 работает, если делать правильно.\nПиши «КАК» — отправлю пошаговую инструкцию 📝",
  "Не экономь — управляй!\nХочешь таблицу для управления бюджетом? Пиши ДЕНЬГИ 👇💸",
  "Я веду бюджет уже 2 года и это лучшее, что я сделал(а).\nПиши «НАЧАТЬ» — скину свой шаблон в директ 🎯",
  "Один простой инструмент = полный контроль над финансами.\nПиши ТАБЛИЦА в комменты — отправлю бесплатно 📊✨",
];

const formatMoney = (amount: number) => {
  if (!isFinite(amount) || isNaN(amount)) return "0";
  return Math.round(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getAudioUrl(path: string): string {
  const { data } = supabase.storage.from('audio').getPublicUrl(path);
  return data.publicUrl;
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
  const abortRef = useRef(false);

  // === Загрузка аудио при монтировании ===
  useEffect(() => {
    if (user) loadAudioFiles();
  }, [user]);

  const loadAudioFiles = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('audio_files')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setAudioFiles(data);
  };

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
      const title = pickRandom(BUDGET_TITLES);
      const sequence = generateBudgetSequence();
      const node = document.getElementById('reels-container');
      if (!node) { setIsRendering(false); return; }

      let audioUrl: string | null = null;
      if (audioMode === 'random' && audioFiles.length > 0) {
        const randomAudio = audioFiles[Math.floor(Math.random() * audioFiles.length)];
        audioUrl = getAudioUrl(randomAudio.file_path);
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

    setBatchRunning(true);
    setBatchDone(false);
    setBatchErrors([]);
    setBatchProgress({ current: 0, total: batchCount, step: 'Подготовка...' });
    abortRef.current = false;

    const errors: string[] = [];
    const usedTitles = new Set<string>();

    for (let i = 0; i < batchCount; i++) {
      if (abortRef.current) break;

      setBatchProgress({ current: i, total: batchCount, step: `Рендерю видео ${i + 1} из ${batchCount}...` });

      try {
        // Рандомный уникальный заголовок
        let title: string;
        if (usedTitles.size >= BUDGET_TITLES.length) usedTitles.clear();
        do { title = pickRandom(BUDGET_TITLES); } while (usedTitles.has(title));
        usedTitles.add(title);

        // Рандомная числовая последовательность
        const sequence = generateBudgetSequence();

        // Рандомный аудиотрек
        let audioUrl: string | null = null;
        if (audioMode === 'random' && audioFiles.length > 0) {
          const randomAudio = audioFiles[Math.floor(Math.random() * audioFiles.length)];
          audioUrl = getAudioUrl(randomAudio.file_path);
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
            caption: pickRandom(BUDGET_CAPTIONS),
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

  // --- РЕНДЕР ГРУППЫ (EXCEL) ---
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
    <div className="p-8 max-w-5xl mx-auto">
      {/* ЗАГОЛОВОК */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Бюджет Reels</h1>
        <p className="text-sm text-gray-500 mt-1">
          Генерация видео с калькулятором бюджета. Формат 9:16.
        </p>
      </div>

      <div className="flex gap-8 items-start">
        {/* === ЛЕВАЯ КОЛОНКА: ПРЕВЬЮ + КНОПКИ === */}
        <div className="flex flex-col items-center gap-4 shrink-0">
          {/* REELS КАРТОЧКА */}
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
                  : 'bg-white border border-gray-200 text-teal-600 hover:bg-teal-50 hover:border-teal-200 shadow-sm'
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
                  : 'bg-teal-600 text-white hover:bg-teal-700 shadow-lg'
              }`}
            >
              <Download size={18} />
              Скачать 1 видео
            </button>
          </div>
        </div>

        {/* === ПРАВАЯ КОЛОНКА: НАСТРОЙКИ ПАКЕТНОЙ ГЕНЕРАЦИИ === */}
        <div className="flex-1 space-y-6">
          {/* Блок настроек */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
              <BoltIcon className="w-5 h-5 text-teal-600" />
              Пакетная генерация
            </h2>

            {/* Количество видео */}
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
                <span className="text-2xl font-bold text-teal-600 w-12 text-right">{batchCount}</span>
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
                      ? 'bg-teal-50 border-teal-200 text-teal-700'
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
                      ? 'bg-teal-50 border-teal-200 text-teal-700'
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
                disabled={disabled || !user}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-200 text-white disabled:text-gray-500 rounded-xl text-sm font-semibold transition-colors shadow-lg disabled:shadow-none"
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
                <span className="text-sm font-mono text-teal-600">
                  {batchProgress.current} / {batchProgress.total}
                </span>
              </div>

              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-teal-600 h-full rounded-full transition-all duration-500"
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
              <strong>Как работает:</strong> Каждое видео получает уникальный заголовок, уникальную числовую анимацию 
              и случайный аудиотрек из вашей базы. Видео сохраняются в хранилище и появляются в Планировщике 
              со статусом «Черновик».
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
