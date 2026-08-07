import React, { useState } from 'react';
import { useGenerator } from '../hooks/useGenerator';
import { AiModelType, AiShowcaseStyle, AppState, ViralVariation } from '../types';
import VideoPlayer from '../components/VideoPlayer';
import VariationsGrid from '../components/VariationsGrid';
import AudioModal from '../components/AudioModal';
import { generateAiShowcaseContent } from '../services/geminiService';
import {
  SparklesIcon,
  CloudArrowUpIcon,
  ArrowPathIcon,
  ChatBubbleBottomCenterTextIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

const AI_SHOWCASE_DEMO_VIDEO_URL = 'https://assets.mixkit.co/videos/preview/mixkit-hand-holding-a-smartphone-with-a-green-screen-41544-large.mp4';

type AiShowcaseLayout = Pick<
  ViralVariation,
  | 'font'
  | 'fontSize'
  | 'fontWeight'
  | 'textAlign'
  | 'textShadow'
  | 'bgStyle'
  | 'bgOpacity'
  | 'posX'
  | 'posY'
  | 'showCarouselBait'
  | 'carouselBaitPosY'
  | 'textRotation'
  | 'showcaseStyle'
  | 'showcaseEmoji'
> & {
  visualStyle: AiShowcaseStyle;
};

// Композиции собраны по референсам: компактные плашки, свободный текст,
// небольшой наклон и разные безопасные зоны по вертикали.
const AI_SHOWCASE_LAYOUTS: AiShowcaseLayout[] = [
  {
    visualStyle: 'white-badge',
    showcaseStyle: 'white-badge',
    font: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    textShadow: false,
    bgStyle: 'white-badge',
    bgOpacity: 100,
    posX: 50,
    posY: 23,
    showCarouselBait: false,
    carouselBaitPosY: 88,
    textRotation: 0,
  },
  {
    visualStyle: 'emoji-white',
    showcaseStyle: 'emoji-white',
    showcaseEmoji: '✨',
    font: 'Inter',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    textShadow: true,
    bgStyle: 'none',
    bgOpacity: 0,
    posX: 50,
    posY: 20,
    showCarouselBait: false,
    carouselBaitPosY: 88,
    textRotation: 0,
  },
  {
    visualStyle: 'figma-ai',
    showcaseStyle: 'figma-ai',
    font: 'Roboto',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    textShadow: false,
    bgStyle: 'white-badge',
    bgOpacity: 100,
    posX: 50,
    posY: 19,
    showCarouselBait: false,
    carouselBaitPosY: 88,
    textRotation: 0,
  },
  {
    visualStyle: 'dark-card',
    showcaseStyle: 'dark-card',
    font: 'Inter',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    textShadow: true,
    bgStyle: 'solid-black',
    bgOpacity: 92,
    posX: 50,
    posY: 61,
    showCarouselBait: false,
    carouselBaitPosY: 88,
    textRotation: 0,
  },
  {
    visualStyle: 'plain-white',
    showcaseStyle: 'plain-white',
    font: 'Inter',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
    textShadow: true,
    bgStyle: 'none',
    bgOpacity: 0,
    posX: 50,
    posY: 16,
    showCarouselBait: false,
    carouselBaitPosY: 88,
    textRotation: 0,
  },
  {
    visualStyle: 'ai-card',
    showcaseStyle: 'ai-card',
    font: 'Roboto',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    textShadow: true,
    bgStyle: 'ai-showcase',
    bgOpacity: 88,
    posX: 50,
    posY: 27,
    showCarouselBait: false,
    carouselBaitPosY: 88,
    textRotation: -3,
  },
];

// Логотип ставится только когда DeepSeek упомянул конкретную модель в заголовке.
function detectAiModelFromHook(hookText: string): AiModelType {
  const lower = hookText.toLowerCase();
  if (lower.includes('клауд') || lower.includes('клод') || lower.includes('claude')) {
    return 'claude';
  }
  if (lower.includes('chatgpt') || lower.includes('чатгпт') || lower.includes('openai')) {
    return 'chatgpt';
  }
  if (lower.includes('gemini') || lower.includes('джемини') || lower.includes('гемини')) {
    return 'gemini';
  }
  return 'none';
}

const AiShowcasePage: React.FC = () => {
  const gen = useGenerator();
  const [selectedModel, setSelectedModel] = useState<AiModelType | 'all'>('all');
  const [codeword, setCodeword] = useState<string>('ПРОМПТ');
  const [topic, setTopic] = useState('Создание сайтов и интерфейсов с помощью ИИ');
  const [generationError, setGenerationError] = useState<string | null>(null);

  const presetCodewords = ['ПРОМПТ', 'ГАЙД', 'РАЗБОР', 'САЙТ', 'СХЕМА', 'УРОК'];

  const handleGenerateAiHooks = async () => {
    if (!topic.trim()) {
      setGenerationError('Укажите тему или нишу для генерации.');
      return;
    }

    gen.setIsGenerating(true);
    gen.setProgressMsg('DeepSeek создаёт уникальные варианты...');
    setGenerationError(null);

    try {
      const count = gen.variationCount || 4;
      const result = await generateAiShowcaseContent({
        topic,
        variationCount: count,
        codeword,
        logoMode: selectedModel,
      });
      const visibleLayouts = selectedModel === 'none'
        ? AI_SHOWCASE_LAYOUTS.filter(layout => layout.visualStyle !== 'figma-ai' && layout.visualStyle !== 'ai-card')
        : AI_SHOWCASE_LAYOUTS;
      const modelCycle: AiModelType[] = ['claude', 'chatgpt', 'gemini'];

      const newVariations: ViralVariation[] = result.variations.map((variation, index) => {
        const requestedLayout = visibleLayouts.find(layout => layout.visualStyle === variation.visualStyle);
        const layout = requestedLayout || visibleLayouts[index % visibleLayouts.length];
        const detectedModel = detectAiModelFromHook(variation.hook);
        const aiModel = selectedModel === 'all'
          ? (detectedModel === 'none' ? modelCycle[index % modelCycle.length] : detectedModel)
          : selectedModel;

        return {
          id: `${Date.now()}-${index}`,
          hookText: variation.hook,
          captionText: variation.caption,
          status: 'pending',
          ...layout,
          videoScale: 1.0,
          videoPanX: 0,
          videoPanY: 0,
          aiModel,
          uniquifierEnabled: true,
          uniquifierIntensity: 'medium',
        };
      });

      gen.setVariations(newVariations);
      gen.setAppState(AppState.PREVIEW);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : 'Не удалось сгенерировать варианты через DeepSeek.');
    } finally {
      gen.setIsGenerating(false);
      gen.setProgressMsg('');
    }
  };

  const activeAiModel: AiModelType = selectedModel === 'all' ? 'claude' : selectedModel;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-6 rounded-3xl text-white shadow-xl">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/20 text-teal-300 text-xs font-semibold border border-teal-500/30">
            <ShieldCheckIcon className="w-4 h-4 text-green-400" /> Умный автоподбор логотипов по смыслу
          </div>
          <h1 className="text-2xl font-bold tracking-tight">✨ AI Showcase (Claude, ChatGPT, Gemini)</h1>
          <p className="text-slate-300 text-xs max-w-2xl">
            Каждый запуск создаёт уникальные тексты через DeepSeek и распределяет их по белым плашкам, белому тексту с эмодзи, Figma + AI-композициям и тёмным карточкам.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Control Panel */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-3">
            <label htmlFor="showcase-topic" className="block text-sm font-semibold text-gray-900">
              1. Тема или ниша
            </label>
            <p className="text-xs text-gray-500">
              DeepSeek использует её, чтобы подготовить уникальные заголовки и описания.
            </p>
            <textarea
              id="showcase-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Например: как дизайнеру создавать лендинги с ИИ"
              rows={3}
              className="w-full resize-y bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-gray-900 focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          {/* AI Model Brand Selector */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <label className="block text-sm font-semibold text-gray-900">
              2. Выберите Нейросеть (режим логотипа)
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedModel('claude')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  selectedModel === 'claude'
                    ? 'border-orange-500 bg-orange-50 text-orange-900 font-semibold shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <img src="/assets/logos/claude.svg" alt="Claude" className="w-5 h-5" />
                <span className="text-[11px]">Claude</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedModel('chatgpt')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  selectedModel === 'chatgpt'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-semibold shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <img src="/assets/logos/chatgpt.svg" alt="ChatGPT" className="w-5 h-5" />
                <span className="text-[11px]">ChatGPT</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedModel('gemini')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  selectedModel === 'gemini'
                    ? 'border-purple-500 bg-purple-50 text-purple-900 font-semibold shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <img src="/assets/logos/gemini.svg" alt="Gemini" className="w-5 h-5" />
                <span className="text-[11px]">Gemini</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedModel('none')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  selectedModel === 'none'
                    ? 'border-slate-700 bg-slate-100 text-slate-900 font-semibold shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <span className="text-base leading-none">🚫</span>
                <span className="text-[11px]">Без лого</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedModel('all')}
                className={`p-2.5 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  selectedModel === 'all'
                    ? 'border-teal-500 bg-teal-50 text-teal-900 font-semibold shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <span className="text-base leading-none">⚡</span>
                <span className="text-[11px]">Авто ИИ</span>
              </button>
            </div>
          </div>

          {/* Codeword Selector for ManyChat / Direct */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <label className="block text-sm font-semibold text-gray-900 flex items-center gap-2">
              <ChatBubbleBottomCenterTextIcon className="w-5 h-5 text-teal-600" />
              3. Кодовое слово (для ManyChat / ЛС)
            </label>
            <p className="text-xs text-gray-500">
              Выбирайте естественные слова, которые не вызывают спам-фильтров алгоритма.
            </p>

            <div className="flex flex-wrap gap-2">
              {presetCodewords.map((word) => (
                <button
                  key={word}
                  type="button"
                  onClick={() => setCodeword(word)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                    codeword === word
                      ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {word}
                </button>
              ))}
            </div>

            <div className="relative">
              <input
                type="text"
                value={codeword}
                onChange={(e) => setCodeword(e.target.value.toUpperCase())}
                placeholder="Свое кодовое слово (напр. ГАЙД)"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-bold tracking-wider text-teal-700 focus:ring-2 focus:ring-teal-500 outline-none uppercase"
              />
            </div>
          </div>

          {/* Video Footage Selection */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <label className="block text-sm font-semibold text-gray-900">
              4. Видео-футаж сайта или интерфейса
            </label>
            <p className="text-xs text-gray-500">
              Нужен только для сохранения финального MP4. До загрузки для предпросмотра используется демо-футаж.
            </p>
            <input
              type="file"
              ref={gen.fileInputRef}
              onChange={gen.handleFileChange}
              accept="video/*"
              className="hidden"
            />
            <button
              onClick={() => gen.fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-300 hover:border-teal-500 p-6 rounded-2xl flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-teal-600 transition-all bg-gray-50/50"
            >
              <CloudArrowUpIcon className="w-8 h-8" />
              <span className="text-sm font-medium">Загрузить видео футажа сайта (9:16)</span>
            </button>
          </div>

          {/* Quantity Selector & One-click Generation */}
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
            <label className="block text-sm font-semibold text-gray-900">
              5. Количество роликов для генерации
            </label>

            <select
              value={gen.variationCount}
              onChange={(e) => gen.setVariationCount(Number(e.target.value))}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3.5 text-sm focus:ring-2 focus:ring-teal-500 outline-none font-medium"
            >
              {[1, 2, 3, 4, 5, 6, 8, 10].map(num => (
                <option key={num} value={num}>{num} {num === 1 ? 'ролик' : num < 5 ? 'ролика' : 'роликов'}</option>
              ))}
            </select>

            <button
              onClick={handleGenerateAiHooks}
              disabled={gen.isGenerating}
              className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20 transition-all disabled:bg-gray-300"
            >
              {gen.isGenerating ? (
                <>
                  <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  DeepSeek генерирует...
                </>
              ) : (
                <>
                  <SparklesIcon className="w-5 h-5" />
                  Сгенерировать {gen.variationCount} {gen.variationCount === 1 ? 'ролик' : gen.variationCount < 5 ? 'ролика' : 'роликов'}
                </>
              )}
            </button>
            {generationError && (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {generationError}
              </p>
            )}
          </div>
        </div>

        {/* Right Live Preview & Grid */}
        <div className="lg:col-span-6 space-y-6">
          {gen.appState === AppState.PREVIEW && gen.variations.length > 0 ? (
            <VariationsGrid
              appState={gen.appState}
              videoUrl={gen.videoUrl || AI_SHOWCASE_DEMO_VIDEO_URL}
              variations={gen.variations}
              activeEditorTab={gen.activeEditorTab}
              setActiveEditorTab={gen.setActiveEditorTab}
              savingId={gen.savingId}
              onUpdateStyle={gen.updateStyle}
              onUpdatePosition={gen.updatePosition}
              onRemove={gen.removeVariation}
              onSave={(id) => gen.setShowAudioModal(id)}
              onReset={gen.handleReset}
            />
          ) : (
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">Предпросмотр формата</h2>
                <span className="text-xs text-teal-600 font-semibold bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                  ⚡ Автоподбор логотипа по контексту
                </span>
              </div>

              <div className="w-full max-w-xs mx-auto aspect-[9/16] rounded-2xl overflow-hidden shadow-2xl">
                <VideoPlayer
                  src={gen.videoUrl || AI_SHOWCASE_DEMO_VIDEO_URL}
                  hookText={"POV: $10K website — Figma + Claude"}
                  font="Inter"
                  fontSize={16}
                  fontWeight="800"
                  textAlign="center"
                  textShadow={false}
                  bgStyle="white-badge"
                  bgOpacity={100}
                  posX={50}
                  posY={19}
                  showcaseStyle="figma-ai"
                  aiModel={activeAiModel}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {gen.showAudioModal && (
        <AudioModal
          audioFiles={gen.audioFiles}
          onSelectAudio={(audioId) => {
            const variation = gen.variations.find(v => v.id === gen.showAudioModal);
            if (variation) gen.saveToScheduler(variation, audioId);
          }}
          onClose={() => gen.setShowAudioModal(null)}
        />
      )}
    </div>
  );
};

export default AiShowcasePage;
