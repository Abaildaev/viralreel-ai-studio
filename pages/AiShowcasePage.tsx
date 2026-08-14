import React, { useState } from 'react';
import { useGenerator } from '../hooks/useGenerator';
import { AiModelType, AiShowcaseStyle, AppState, ViralVariation } from '../types';
import VideoPlayer from '../components/VideoPlayer';
import VariationsGrid from '../components/VariationsGrid';
import AudioModal from '../components/AudioModal';
import { generateAiShowcaseContent } from '../services/geminiService';
import Section from '../components/Section';
import {
  SparklesIcon,
  CloudArrowUpIcon,
  ArrowPathIcon,
  BoltIcon,
  NoSymbolIcon,
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
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">AI Showcase</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          Каждый запуск создаёт уникальные тексты через DeepSeek и раскладывает их по белым плашкам,
          тексту с эмодзи, Figma + AI-композициям и тёмным карточкам.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Control Panel */}
        <div className="lg:col-span-6 space-y-4">
          <Section step={1} title="Тема или ниша" hint="DeepSeek использует её, чтобы подготовить уникальные заголовки и описания.">
            <textarea
              id="showcase-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Например: как дизайнеру создавать лендинги с ИИ"
              rows={3}
              className="field resize-y"
            />
          </Section>

          <Section step={2} title="Нейросеть" hint="Определяет, чей логотип появится в кадре.">
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
                    ? 'border-gray-700 bg-gray-100 text-gray-900 font-semibold shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 text-gray-600'
                }`}
              >
                <NoSymbolIcon className="w-5 h-5" />
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
                <BoltIcon className="w-5 h-5" />
                <span className="text-[11px]">Авто ИИ</span>
              </button>
            </div>
          </Section>

          <Section step={3} title="Кодовое слово" hint="Слово, которое зритель напишет в комментарии. Выбирайте естественные — они не попадают под спам-фильтры.">
            <div className="flex flex-wrap gap-2 mb-3">
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

            <input
              type="text"
              value={codeword}
              onChange={(e) => setCodeword(e.target.value.toUpperCase())}
              placeholder="Своё слово, например ГАЙД"
              className="field font-semibold tracking-wider uppercase"
            />
          </Section>

          <Section step={4} title="Видео-футаж" hint="Нужен только для сохранения финального MP4. До загрузки предпросмотр идёт на демо-футаже.">
            <input
              type="file"
              ref={gen.fileInputRef}
              onChange={gen.handleFileChange}
              accept="video/*"
              className="hidden"
            />
            <button
              onClick={() => gen.fileInputRef.current?.click()}
              className="w-full border border-dashed border-gray-300 hover:border-teal-500 py-5 rounded-xl flex flex-col items-center justify-center gap-1.5 text-gray-500 hover:text-teal-700 transition-colors"
            >
              <CloudArrowUpIcon className="w-6 h-6" />
              <span className="text-sm font-medium">Загрузить футаж 9:16</span>
            </button>
          </Section>

          <Section step={5} title="Количество роликов">
            <div className="flex gap-2">
              <select
                value={gen.variationCount}
                onChange={(e) => gen.setVariationCount(Number(e.target.value))}
                className="field max-w-40"
              >
                {[1, 2, 3, 4, 5, 6, 8, 10].map(num => (
                  <option key={num} value={num}>{num} {num === 1 ? 'ролик' : num < 5 ? 'ролика' : 'роликов'}</option>
                ))}
              </select>
              <button
                onClick={handleGenerateAiHooks}
                disabled={gen.isGenerating}
                className="btn btn-primary btn-lg flex-1"
              >
                {gen.isGenerating ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    DeepSeek генерирует…
                  </>
                ) : (
                  <>
                    <SparklesIcon className="w-4 h-4" />
                    Сгенерировать
                  </>
                )}
              </button>
            </div>
            {generationError && (
              <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {generationError}
              </p>
            )}
          </Section>
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
            <Section
              title="Предпросмотр формата"
              hint="Логотип подбирается по смыслу заголовка."
              action={<span className="badge badge-accent">Демо-футаж</span>}
            >
              <div className="w-full max-w-xs mx-auto aspect-[9/16] rounded-xl overflow-hidden shadow-lg">
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
            </Section>
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
