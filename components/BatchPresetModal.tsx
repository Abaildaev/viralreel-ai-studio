import React, { useState } from 'react';
import {
  BatchPreset,
  InstagramAccount,
  AudioFile,
  AudioMode,
  CtaType,
  FontFamily,
  FontWeight,
  TextStylePreset,
  BgStyle,
  TextAlign,
} from '../types';
import {
  XMarkIcon,
  PlusIcon,
  ChevronDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
  Bars3BottomLeftIcon,
  Bars3Icon,
  Bars3BottomRightIcon,
} from '@heroicons/react/24/outline';
import AppSelect from './ui/AppSelect';

interface Props {
  preset: BatchPreset | null;
  accounts: InstagramAccount[];
  audioFiles: AudioFile[];
  onSave: (data: Partial<BatchPreset>) => void;
  onClose: () => void;
}

const DEFAULT_STYLE: TextStylePreset = {
  font: 'GenShinGothic',
  fontSize: 13,
  fontWeight: '300',
  textAlign: 'left',
  textShadow: true,
  bgStyle: 'none',
  bgOpacity: 80,
  posX: 50,
  posY: 20,
  videoScale: 1.0,
  videoPanX: 0,
  videoPanY: 0,
  showCarouselBait: true,
  carouselBaitPosY: 90,
};

const toneOptions = [
  { value: 'Provokacionnyj', label: 'Провокационный' },
  { value: 'Obrazovatelnyj', label: 'Образовательный' },
  { value: 'Prodajushchij', label: 'Продающий' },
];

const fontOptions: { label: string; value: FontFamily }[] = [
  { label: 'Roboto', value: 'Roboto' },
  { label: 'Gen Shin Gothic', value: 'GenShinGothic' },
  { label: 'Open Serif', value: 'OpenSerif' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Inter', value: 'Inter' },
  { label: 'Merriweather', value: 'Merriweather' },
];

const fontWeightOptions: { label: string; value: FontWeight }[] = [
  { label: 'Легкий', value: '300' },
  { label: 'Обычный', value: '400' },
  { label: 'Средний', value: '500' },
  { label: 'Полужирный', value: '600' },
  { label: 'Жирный', value: '700' },
];

const bgOptions: { id: BgStyle; label: string }[] = [
  { id: 'none', label: 'Нет' },
  { id: 'glass', label: 'Стекло' },
  { id: 'solid-black', label: 'Темный' },
  { id: 'solid-white', label: 'Светлый' },
  { id: 'quote-white', label: 'Цитата' },
  { id: 'bank-transfer', label: 'Банк. счет' },
];

const positionOptions: { label: string; icon: React.ReactNode; posY: number }[] = [
  { label: 'Сверху', icon: <ArrowUpIcon className="w-4 h-4" />, posY: 20 },
  { label: 'Центр', icon: <MinusIcon className="w-4 h-4" />, posY: 50 },
  { label: 'Снизу', icon: <ArrowDownIcon className="w-4 h-4" />, posY: 80 },
];

function getFontFamily(font: FontFamily): string {
  const map: Record<FontFamily, string> = {
    Roboto: '"Roboto", sans-serif',
    GenShinGothic: '"M PLUS 1p", sans-serif',
    OpenSerif: '"Noto Serif", serif',
    Georgia: 'Georgia, serif',
    Inter: 'Inter, sans-serif',
    Merriweather: 'Merriweather, serif',
  };
  return map[font];
}

function getPreviewBg(bgStyle: BgStyle, bgOpacity: number): string {
  if (bgStyle === 'glass') return `rgba(255,255,255,${bgOpacity * 0.007})`;
  if (bgStyle === 'solid-black') return `rgba(0,0,0,${bgOpacity / 100})`;
  if (bgStyle === 'solid-white') return `rgba(255,255,255,${bgOpacity / 100})`;
  if (bgStyle === 'quote-white') return `rgba(255,255,255,${bgOpacity / 100})`;
  return 'transparent';
}

function getPreviewTextColor(bgStyle: BgStyle): string {
  if (bgStyle === 'solid-white' || bgStyle === 'glass' || bgStyle === 'quote-white') return '#1e293b';
  return '#ffffff';
}

const StylePreview: React.FC<{ style: TextStylePreset }> = ({ style }) => {
  const textColor = getPreviewTextColor(style.bgStyle);
  const bgColor = getPreviewBg(style.bgStyle, style.bgOpacity);
  const isSerif = style.font === 'Georgia' || style.font === 'Merriweather' || style.font === 'OpenSerif';
  const fontStyle = isSerif ? 'italic' : 'normal';
  const scaledFontSize = style.fontSize * (160 / 300);
  const baitFontSize = 17 * (160 / 300);

  const posMap: Record<number, string> = { 20: '10%', 50: '42%', 80: '70%' };
  const topValue = posMap[style.posY] || '10%';

  return (
    <div
      className="relative rounded-xl overflow-hidden flex-shrink-0"
      style={{
        width: 160,
        height: 284,
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 50%, rgba(0,0,0,0.6) 100%)',
        }}
      />

      <div
        className="absolute left-[5%] right-[5%] transition-all duration-300"
        style={{ top: topValue }}
      >
        {style.bgStyle === 'bank-transfer' ? (
          <div style={{ textAlign: style.textAlign }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: `${scaledFontSize * 0.4}px ${scaledFontSize * 0.8}px`,
                backgroundColor: '#ffffff',
                borderRadius: `${scaledFontSize * 0.8}px`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                marginBottom: `${scaledFontSize * 0.5}px`,
                gap: `${scaledFontSize * 0.5}px`,
              }}
            >
              <div
                style={{
                  width: `${scaledFontSize * 1.8}px`,
                  height: `${scaledFontSize * 1.8}px`,
                  backgroundColor: '#3b82f6',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg viewBox="0 0 24 24" fill="white" style={{ width: `${scaledFontSize}px`, height: `${scaledFontSize}px` }}>
                  <path d="M19 7h-1V6a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V10a3 3 0 0 0-3-3Zm-4-2h-3v2h3V5Zm2 12H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1v12a3 3 0 0 0 3 3h8v-2a1 1 0 0 1-1-1Z"/>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: `${scaledFontSize * 0.9}px`, fontWeight: 700, color: '#1e293b', lineHeight: 1.1 }}>{style.bankAmount || '1 777 807,23 ₽'}</span>
                <span style={{ fontSize: `${scaledFontSize * 0.55}px`, fontWeight: 500, color: '#64748b', marginTop: '2px' }}>Счет для бизнеса</span>
              </div>
            </div>
            <div>
              <span
                style={{
                  fontFamily: getFontFamily(style.font),
                  fontSize: `${scaledFontSize}px`,
                  fontWeight: Number(style.fontWeight),
                  color: '#ffffff',
                  display: 'inline',
                  lineHeight: 1.35,
                  WebkitTextStroke: '1px #000000',
                  paintOrder: 'stroke fill',
                  textShadow: 'none',
                } as React.CSSProperties}
              >
                Пример текста хука для видео
              </span>
            </div>
          </div>
        ) : style.bgStyle === 'quote-white' ? (
          <div style={{ textAlign: style.textAlign }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: `${scaledFontSize * 0.2}px ${scaledFontSize * 0.5}px`,
                background: 'linear-gradient(to right, rgba(94, 187, 169, 0.95), rgba(58, 139, 124, 0.95))',
                borderBottom: `${Math.max(1, scaledFontSize * 0.1)}px solid rgba(42, 107, 95, 0.95)`,
                borderRadius: `${scaledFontSize * 0.1}px`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                marginBottom: `${scaledFontSize * 0.3}px`,
              }}
            >
              <svg viewBox="0 0 30 20" fill="white" style={{ width: `${scaledFontSize * 1.0}px`, height: `${scaledFontSize * 0.65}px` }}>
                <path d="M12 20H0V10L4 0H14L9 10H12V20ZM28 20H16V10L20 0H30L25 10H28V20Z" />
              </svg>
            </div>
            <div>
              <span
                style={{
                  fontFamily: getFontFamily(style.font),
                  fontSize: `${scaledFontSize}px`,
                  fontWeight: Number(style.fontWeight),
                  color: '#1a1a1a',
                  backgroundColor: '#ffffff',
                  display: 'inline',
                  lineHeight: 1.5,
                  padding: '0.1em 0.2em',
                  boxDecorationBreak: 'clone' as any,
                  WebkitBoxDecorationBreak: 'clone' as any,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                }}
              >
                Пример текста хука для видео
              </span>
            </div>
          </div>
        ) : (
          <div
            className="inline-block px-2 py-1.5 transition-all duration-200"
            style={{
              background: bgColor,
              borderRadius: style.bgStyle !== 'none' ? '6px' : '0',
              textAlign: style.textAlign,
              width: '100%',
            }}
          >
            <p
              className="leading-tight transition-all duration-200"
              style={{
                fontFamily: getFontFamily(style.font),
                fontSize: `${scaledFontSize}px`,
                fontWeight: Number(style.fontWeight),
                fontStyle,
                color: textColor,
                textAlign: style.textAlign,
                textShadow: style.textShadow
                  ? (style.bgStyle === 'solid-white' || style.bgStyle === 'glass')
                    ? '0 1px 4px rgba(0,0,0,0.3)'
                    : '0 2px 10px rgba(0,0,0,0.9)'
                  : 'none',
                letterSpacing: '0.5px',
              }}
            >
              Пример текста хука для видео
            </p>
          </div>
        )}
      </div>

      {style.showCarouselBait && (
        <div className="absolute bottom-4 left-0 right-0 text-center transition-all duration-200">
          <div className="flex justify-center gap-1.5 mb-1.5">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: 4,
                  height: 4,
                  background: i === 0 ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.5)',
                }}
              />
            ))}
          </div>
          <p
            style={{
              fontFamily: getFontFamily(style.font),
              fontSize: `${baitFontSize}px`,
              fontWeight: Number(style.fontWeight),
              fontStyle,
              color: '#fff',
              textShadow: style.textShadow ? '0 2px 10px rgba(0,0,0,0.9)' : 'none',
              letterSpacing: '0.5px',
            }}
          >
            Читай описание ↓
          </p>
        </div>
      )}

      <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-sm rounded-md px-1.5 py-0.5">
        <span className="text-[8px] text-white/70 font-medium">PREVIEW</span>
      </div>
    </div>
  );
};

const BatchPresetModal: React.FC<Props> = ({ preset, accounts, audioFiles, onSave, onClose }) => {
  const [name, setName] = useState(preset?.name || '');
  const [accountId, setAccountId] = useState(preset?.instagram_account_id || '');
  const [topics, setTopics] = useState<string[]>(preset?.topics || []);
  const [topicInput, setTopicInput] = useState('');
  const [tone, setTone] = useState(preset?.tone || 'Provokacionnyj');
  const [ctaType, setCtaType] = useState<CtaType>(preset?.cta_type || 'instagram');
  const [audioMode, setAudioMode] = useState<AudioMode>(preset?.audio_mode || 'from_video');
  const [audioFileId, setAudioFileId] = useState(preset?.audio_file_id || '');
  const [count, setCount] = useState(preset?.variations_count || 5);
  const [intervalMin, setIntervalMin] = useState(preset?.schedule_interval_minutes || 120);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [presetType, setPresetType] = useState<'standard' | 'ai_showcase'>(
    preset?.text_style?.presetType || 'standard'
  );

  const savedStyle = preset?.text_style;
  const [style, setStyle] = useState<TextStylePreset>(
    savedStyle && savedStyle.font ? { ...DEFAULT_STYLE, ...savedStyle } : DEFAULT_STYLE
  );

  const addTopic = () => {
    const t = topicInput.trim();
    if (t && !topics.includes(t)) {
      setTopics([...topics, t]);
    }
    setTopicInput('');
  };

  const removeTopic = (index: number) => {
    setTopics(topics.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    onSave({
      name: name || 'Без имени',
      instagram_account_id: accountId || null,
      topics,
      tone,
      cta_type: ctaType,
      audio_mode: audioMode,
      audio_file_id: audioMode === 'specific' ? (audioFileId || null) : null,
      variations_count: count,
      text_style: { ...style, presetType },
      schedule_interval_minutes: intervalMin,
      is_active: true,
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">
            {preset ? 'Редактировать пресет' : 'Новый пресет'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Название</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Психология, аккаунт 1"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Аккаунт</label>
            <AppSelect
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50"
            >
              <option value="">Без привязки</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>@{a.username}</option>
              ))}
            </AppSelect>
          </div>

          {/* Preset Type Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Тип пресета</label>
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => {
                  setPresetType('standard');
                  setStyle(prev => ({
                    ...prev,
                    bgStyle: 'none',
                    aiModel: 'none',
                    presetType: 'standard',
                  }));
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                  presetType === 'standard'
                    ? 'bg-white text-gray-900 shadow-sm font-semibold'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                📝 Стандартный
              </button>
              <button
                type="button"
                onClick={() => {
                  setPresetType('ai_showcase');
                  setStyle(prev => ({
                    ...prev,
                    bgStyle: 'ai-showcase',
                    aiModel: 'claude',
                    font: 'GenShinGothic',
                    fontSize: 13,
                    fontWeight: '300',
                    textAlign: 'left',
                    posY: 18,
                    textRotation: -4,
                    showCarouselBait: true,
                    carouselBaitPosY: 90,
                    presetType: 'ai_showcase',
                  }));
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                  presetType === 'ai_showcase'
                    ? 'bg-white text-brand-700 shadow-sm font-semibold'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                ✨ AI Showcase
              </button>
            </div>
            {presetType === 'ai_showcase' && (
              <p className="text-xs text-brand-600 mt-1.5 font-medium">✨ Автогенерация Reels с плашками нейросетей (Claude, ChatGPT, Gemini) и вирусными ИИ-хуками.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Темы ({topics.length})
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTopic())}
                placeholder="Введите тему и нажмите Enter"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50"
              />
              <button
                onClick={addTopic}
                className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                <PlusIcon className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            {topics.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {topics.map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-brand-200"
                  >
                    {t}
                    <button onClick={() => removeTopic(i)} className="hover:text-red-500">
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Тон</label>
              <AppSelect
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50"
              >
                {toneOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </AppSelect>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Призыв</label>
              <AppSelect
                value={ctaType}
                onChange={(e) => setCtaType(e.target.value as CtaType)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50"
              >
                <option value="telegram">ТГ канал</option>
                <option value="instagram">Подписка на Инсту</option>
                <option value="codeword">Кодовое слово</option>
              </AppSelect>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Музыка</label>
            <div className="space-y-2">
              {([
                { value: 'from_video' as AudioMode, label: 'Из подложки', desc: 'Оригинальный звук видео' },
                { value: 'random' as AudioMode, label: 'Случайная из библиотеки', desc: `${audioFiles.length} треков доступно` },
                { value: 'specific' as AudioMode, label: 'Конкретный трек', desc: 'Один трек для всех видео' },
              ]).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    audioMode === opt.value
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="audioMode"
                    value={opt.value}
                    checked={audioMode === opt.value}
                    onChange={() => setAudioMode(opt.value)}
                    className="accent-brand-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {audioMode === 'specific' && (
              <AppSelect
                value={audioFileId}
                onChange={(e) => setAudioFileId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50 mt-2"
              >
                <option value="">Выберите трек</option>
                {audioFiles.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </AppSelect>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Видео за запуск
              </label>
              <AppSelect
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </AppSelect>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Интервал (мин)
              </label>
              <input
                type="number"
                value={intervalMin}
                onChange={(e) => setIntervalMin(Number(e.target.value))}
                min={30}
                step={30}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50"
              />
            </div>
          </div>

          {presetType === 'standard' && (
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              <ChevronDownIcon className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              Стиль текста и предпросмотр
            </button>

            {showAdvanced && (
              <div className="mt-3 bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-4">
                <div className="flex gap-4">
                  <StylePreview style={style} />

                  <div className="flex-1 space-y-3 min-w-0">
                      <div className="flex bg-white rounded-lg p-0.5 border border-gray-200 mb-3">
                        <button
                          onClick={() => {
                            if (style.bgStyle === 'quote-white' || style.bgStyle === 'bank-transfer') {
                              setStyle({ ...style, bgStyle: 'none' });
                            }
                          }}
                          className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${style.bgStyle !== 'quote-white' && style.bgStyle !== 'bank-transfer' ? 'bg-brand-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Стандарт
                        </button>
                        <button
                          onClick={() => {
                            setStyle({ ...style, bgStyle: 'quote-white', fontSize: 13, showCarouselBait: false });
                          }}
                          className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${style.bgStyle === 'quote-white' ? 'bg-brand-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Цитата
                        </button>
                        <button
                          onClick={() => {
                            setStyle({ ...style, bgStyle: 'bank-transfer', fontSize: 13, fontWeight: '400', textShadow: false, showCarouselBait: false, posY: 35, textAlign: 'center' });
                          }}
                          className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${style.bgStyle === 'bank-transfer' ? 'bg-brand-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Банк
                        </button>
                      </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5 font-medium">Позиция текста</label>
                      <div className="flex bg-white rounded-lg p-0.5 border border-gray-200">
                        {positionOptions.map((opt) => (
                          <button
                            key={opt.posY}
                            onClick={() => setStyle({ ...style, posY: opt.posY })}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all ${
                              style.posY === opt.posY
                                ? 'bg-brand-600 text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            {opt.icon}
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5 font-medium">Выравнивание</label>
                      <div className="flex bg-white rounded-lg p-0.5 border border-gray-200">
                        {([
                          { value: 'left' as TextAlign, icon: <Bars3BottomLeftIcon className="w-4 h-4" /> },
                          { value: 'center' as TextAlign, icon: <Bars3Icon className="w-4 h-4" /> },
                          { value: 'right' as TextAlign, icon: <Bars3BottomRightIcon className="w-4 h-4" /> },
                        ]).map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setStyle({ ...style, textAlign: opt.value })}
                            className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all ${
                              style.textAlign === opt.value
                                ? 'bg-brand-600 text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            {opt.icon}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Шрифт</label>
                        <AppSelect
                          value={style.font}
                          onChange={(e) => setStyle({ ...style, font: e.target.value as FontFamily })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none bg-white"
                        >
                          {fontOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </AppSelect>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Толщина</label>
                        <AppSelect
                          value={style.fontWeight}
                          onChange={(e) => setStyle({ ...style, fontWeight: e.target.value as FontWeight })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none bg-white"
                        >
                          {fontWeightOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </AppSelect>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Размер хука</label>
                        <AppSelect
                          value={style.fontSize}
                          onChange={(e) => setStyle({ ...style, fontSize: Number(e.target.value) })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none bg-white"
                        >
                          {[12, 13, 14, 15, 16, 17, 18, 19, 20].map((s) => (
                            <option key={s} value={s}>{s}px</option>
                          ))}
                        </AppSelect>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Фон</label>
                        <AppSelect
                          value={style.bgStyle}
                          onChange={(e) => {
                            const newBg = e.target.value as BgStyle;
                            if (newBg === 'quote-white') {
                              setStyle({ ...style, bgStyle: newBg, fontSize: 13, showCarouselBait: false });
                            } else if (newBg === 'bank-transfer') {
                              setStyle({ ...style, bgStyle: newBg, fontSize: 13, fontWeight: '400', textShadow: false, showCarouselBait: false, posY: 35, textAlign: 'center' });
                            } else {
                              setStyle({ ...style, bgStyle: newBg });
                            }
                          }}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none bg-white"
                        >
                          {bgOptions.map((o) => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </AppSelect>
                      </div>
                    </div>

                    {style.bgStyle !== 'none' && style.bgStyle !== 'bank-transfer' && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Прозрачность фона</span>
                          <span>{style.bgOpacity}%</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={style.bgOpacity}
                          onChange={(e) => setStyle({ ...style, bgOpacity: Number(e.target.value) })}
                          className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-4 pt-1">
                      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={style.textShadow}
                          onChange={(e) => setStyle({ ...style, textShadow: e.target.checked })}
                          className="accent-brand-600 rounded"
                        />
                        Тень текста
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={style.showCarouselBait}
                          onChange={(e) => setStyle({ ...style, showCarouselBait: e.target.checked })}
                          className="accent-brand-600 rounded"
                        />
                        Байт (17px)
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={presetType === 'standard' && topics.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-gray-200 text-white disabled:text-gray-500 text-sm font-medium transition-colors shadow-lg disabled:shadow-none"
          >
            {preset ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchPresetModal;
