import React from 'react';
import { CtaType, LeadMagnet, LeadMagnetInfo, VideoTemplate } from '../types';
import { toneOptions } from '../constants';
import {
  CloudArrowUpIcon,
  SparklesIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  SwatchIcon,
  FilmIcon,
  LightBulbIcon,
} from '@heroicons/react/24/outline';
import { SparklesIcon as SparklesSolid } from '@heroicons/react/24/solid';

interface GeneratorSidebarProps {
  videoUrl: string | null;
  activeTab: 'topic' | 'reference' | 'auto';
  setActiveTab: (tab: 'topic' | 'reference' | 'auto') => void;
  inputText: string;
  setInputText: (text: string) => void;
  variationCount: number;
  setVariationCount: (count: number) => void;
  tone: string;
  setTone: (tone: string) => void;
  ctaType: CtaType;
  setCtaType: (cta: CtaType) => void;
  isGenerating: boolean;
  isGeneratingTopic: boolean;
  progressMsg: string;
  allLeadMagnets: LeadMagnet[];
  selectedLeadMagnetId: string | null;
  selectedAccountId: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRandomTopic: () => void;
  onGenerate: () => void;
  onSelectLeadMagnet: (id: string) => void;
  getAvailableLeadMagnets: (magnets: LeadMagnet[], accountId: string | null) => LeadMagnet[];
  templates: VideoTemplate[];
  selectedTemplateId: string;
  onTemplateSelect: (templateId: string) => void;
}

const GeneratorSidebar: React.FC<GeneratorSidebarProps> = ({
  videoUrl,
  activeTab, setActiveTab,
  inputText, setInputText,
  variationCount, setVariationCount,
  tone, setTone,
  ctaType, setCtaType,
  isGenerating,
  isGeneratingTopic,
  progressMsg,
  allLeadMagnets,
  selectedLeadMagnetId,
  selectedAccountId,
  fileInputRef,
  onFileChange,
  onRandomTopic,
  onGenerate,
  onSelectLeadMagnet,
  getAvailableLeadMagnets,
  templates,
  selectedTemplateId,
  onTemplateSelect,
}) => {
  return (
    <div className="w-full bg-white border-b border-gray-200 p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">Генератор контента</h2>
        <p className="text-sm text-gray-500">Создавайте вирусные хуки с помощью ИИ</p>
      </div>

      <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 mb-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Фоновое видео</h3>
        {videoUrl ? (
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <video src={videoUrl} className="w-full h-36 object-contain bg-gray-900 rounded-xl" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-xl">
              <span className="text-xs font-medium bg-white px-3 py-1.5 rounded-full text-gray-900">Изменить видео</span>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 hover:border-teal-500 rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-gray-100"
          >
            <CloudArrowUpIcon className="w-10 h-10 text-gray-400 mb-2" />
            <span className="text-sm text-gray-600 font-medium">Загрузить видео</span>
            <span className="text-xs text-gray-400 mt-1">Рекомендуется формат 9:16</span>
          </div>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={onFileChange}
          accept="video/*"
          className="hidden"
        />

        {/* Template selector */}
        <div className="mt-3">
          <label className="block text-xs text-gray-500 mb-1.5 font-medium">Или выберите из подложек</label>
          <select
            value={selectedTemplateId}
            onChange={e => onTemplateSelect(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500/50 bg-white"
          >
            <option value="">— Не выбрано —</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {templates.length === 0 && (
            <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
              Нет подложек. Загрузите в разделе «Подложки».
            </p>
          )}
        </div>
      </div>

      {videoUrl && (
        <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200 flex flex-col gap-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Стратегия контента</h3>

          <div className="flex bg-white rounded-xl p-1 border border-gray-200 shadow-sm">
            <button
              onClick={() => setActiveTab('topic')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all ${activeTab === 'topic' ? 'bg-teal-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <SwatchIcon className="w-3.5 h-3.5" />
              Тема
            </button>
            <button
              onClick={() => setActiveTab('reference')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all ${activeTab === 'reference' ? 'bg-teal-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <DocumentDuplicateIcon className="w-3.5 h-3.5" />
              Референс
            </button>
            <button
              onClick={() => setActiveTab('auto')}
              className={`flex-1 py-2 text-xs font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all ${activeTab === 'auto' ? 'bg-teal-600 text-white shadow-lg' : 'text-gray-500 hover:text-gray-900'}`}
            >
              <FilmIcon className="w-3.5 h-3.5" />
              Авто
            </button>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">
                {activeTab === 'topic' && 'О чем видео?'}
                {activeTab === 'reference' && 'Вставьте заголовок'}
                {activeTab === 'auto' && 'Контекст (опционально)'}
              </label>
              {activeTab === 'topic' && (
                <button
                  onClick={onRandomTopic}
                  disabled={isGeneratingTopic}
                  className="text-xs flex items-center gap-1 text-amber-600 hover:text-amber-500 transition-colors disabled:opacity-50"
                >
                  <LightBulbIcon className={`w-4 h-4 ${isGeneratingTopic ? 'animate-pulse' : ''}`} />
                  {isGeneratingTopic ? 'Думаю...' : 'Идея'}
                </button>
              )}
            </div>

            {activeTab !== 'auto' ? (
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={activeTab === 'topic' ? "Оставьте пустым — ИИ подберёт тему сам" : 'Вставьте заголовок сюда...'}
                className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 outline-none resize-none h-28 placeholder:text-gray-400"
              />
            ) : (
              <div className="w-full bg-white border border-gray-200 rounded-xl p-4 text-sm">
                <p className="flex items-center gap-2 text-teal-600 font-semibold mb-2">
                  <SparklesSolid className="w-4 h-4" />
                  ИИ Анализ видео
                </p>
                <p className="text-xs text-gray-500 mb-3">
                  Автоматический анализ видео и генерация идей.
                </p>
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Добавить контекст..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-900 outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5 text-gray-500">Вариации</label>
              <select
                value={variationCount}
                onChange={(e) => setVariationCount(Number(e.target.value))}
                className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-teal-500 outline-none"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map(num => (
                  <option key={num} value={num}>{num}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5 text-gray-500">Тон</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-teal-500 outline-none"
              >
                {toneOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5 text-gray-500">Призыв</label>
              <select
                value={ctaType}
                onChange={(e) => setCtaType(e.target.value as CtaType)}
                className="w-full bg-white border border-gray-200 rounded-xl p-2.5 text-sm focus:ring-teal-500 outline-none"
              >
                <option value="telegram">ТГ канал</option>
                <option value="instagram">Подписка на Инсту</option>
                <option value="codeword">Кодовое слово</option>
              </select>
              {ctaType === 'codeword' && (() => {
                const available = getAvailableLeadMagnets(allLeadMagnets, selectedAccountId);
                if (available.length === 0) {
                  return (
                    <p className="text-xs text-amber-600 mt-1.5">
                      Нет лид-магнитов. Добавьте в настройках.
                    </p>
                  );
                }
                if (available.length === 1) {
                  return (
                    <p className="text-xs text-gray-400 mt-1.5">
                      «{available[0].codeword}» — {available[0].title}
                    </p>
                  );
                }
                return (
                  <select
                    value={selectedLeadMagnetId ?? ''}
                    onChange={(e) => onSelectLeadMagnet(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2 text-sm mt-1.5 focus:ring-teal-500 outline-none"
                  >
                    {available.map(lm => (
                      <option key={lm.id} value={lm.id}>
                        «{lm.codeword}» — {lm.title}
                      </option>
                    ))}
                  </select>
                );
              })()}
            </div>
          </div>

          <div className="flex items-center justify-between bg-teal-50 border border-teal-200/60 rounded-xl p-2.5 text-xs text-teal-800 mt-2">
            <span className="flex items-center gap-1.5 font-medium">
              <SparklesIcon className="w-4 h-4 text-teal-600" />
              ⚡ Авто-уникализация видео
            </span>
            <span className="bg-teal-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Активна
            </span>
          </div>

          <button
            onClick={onGenerate}
            disabled={isGenerating || (activeTab === 'reference' && !inputText)}
            className={`w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all mt-2 ${
              isGenerating
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-600/20'
            }`}
          >
            {isGenerating ? (
              <>
                <ArrowPathIcon className="w-5 h-5 animate-spin" />
                {progressMsg || 'Думаю...'}
              </>
            ) : (
              <>
                <SparklesIcon className="w-5 h-5" />
                Сгенерировать
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default GeneratorSidebar;
