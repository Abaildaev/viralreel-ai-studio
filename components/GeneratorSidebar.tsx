import React, { useEffect, useState } from 'react';
import { LeadMagnet, ReelOutputMode, VideoTemplate } from '../types';
import { ArrowPathIcon, CloudArrowUpIcon, SparklesIcon } from '@heroicons/react/24/outline';
import AppSelect from './ui/AppSelect';
import { useSignedUrls } from '../hooks/useSignedUrl';

interface GeneratorSidebarProps {
  videoUrl: string | null;
  inputText: string;
  setInputText: (text: string) => void;
  variationCount: number;
  setVariationCount: (count: number) => void;
  outputMode: ReelOutputMode;
  setOutputMode: (mode: ReelOutputMode) => void;
  isGenerating: boolean;
  progressMsg: string;
  allLeadMagnets: LeadMagnet[];
  selectedLeadMagnetId: string | null;
  selectedAccountId: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onGenerate: () => void;
  onSelectLeadMagnet: (id: string) => void;
  getAvailableLeadMagnets: (magnets: LeadMagnet[], accountId: string | null) => LeadMagnet[];
  templates: VideoTemplate[];
  selectedTemplateId: string;
  onTemplateSelect: (templateId: string) => void;
}

const ideaPresets = [
  'Seedance 2 + 1 промпт',
  'Reels на миллион одним промптом',
  'AI-мини-фильм без камеры',
];

const GeneratorSidebar: React.FC<GeneratorSidebarProps> = ({
  videoUrl,
  inputText,
  setInputText,
  variationCount,
  setVariationCount,
  outputMode,
  setOutputMode,
  isGenerating,
  progressMsg,
  allLeadMagnets,
  selectedLeadMagnetId,
  selectedAccountId,
  fileInputRef,
  onFileChange,
  onGenerate,
  onSelectLeadMagnet,
  getAvailableLeadMagnets,
  templates,
  selectedTemplateId,
  onTemplateSelect,
}) => {
  const [sourceAspect, setSourceAspect] = useState<number | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const activeTemplates = templates.filter((template) => template.is_active);
  const templateUrls = useSignedUrls('templates', activeTemplates.map((template) => template.file_path));
  const availableLeadMagnets = getAvailableLeadMagnets(allLeadMagnets, selectedAccountId);
  const selectedLeadMagnet = availableLeadMagnets.find((magnet) => magnet.id === selectedLeadMagnetId)
    ?? availableLeadMagnets[0];
  const selectedTemplate = activeTemplates.find((template) => template.id === selectedTemplateId);
  const outputCount = variationCount * (outputMode === 'both' ? 2 : 1);
  const countLabel = outputMode === 'both' ? 'Комплектов' : 'Роликов';
  const previewWidth = Math.round(224 * (sourceAspect ?? 16 / 9));

  useEffect(() => {
    setSourceAspect(null);
  }, [videoUrl]);

  return (
    <div className="w-full border-b border-gray-200 bg-white p-6">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-900">AI Reels-генератор</h2>
        <p className="text-sm text-gray-500">Мини-истории с кодовым словом и двумя версиями ролика</p>
      </div>

      <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-500">Исходное AI-видео</h3>
        {videoUrl ? (
          <div
            className="group relative mx-auto cursor-pointer overflow-hidden rounded-xl bg-gray-900"
            style={{
              aspectRatio: sourceAspect ?? 16 / 9,
              width: `min(100%, ${previewWidth}px)`,
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <video
              src={videoUrl}
              className="h-full w-full object-contain"
              onLoadedMetadata={(event) => {
                const { videoWidth, videoHeight } = event.currentTarget;
                if (videoWidth && videoHeight) setSourceAspect(videoWidth / videoHeight);
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-gray-900">Изменить видео</span>
            </div>
          </div>
        ) : (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 p-8 transition-all hover:border-brand-500 hover:bg-gray-100"
          >
            <CloudArrowUpIcon className="mb-2 h-10 w-10 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">Загрузить AI-видео</span>
            <span className="mt-1 text-xs text-gray-400">16:9 или 9:16, MP4</span>
          </div>
        )}
        <input type="file" ref={fileInputRef} onChange={onFileChange} accept="video/*" className="hidden" />

        {activeTemplates.length > 0 && (
          <div className="mt-3 border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-600">Подложка</p>
                <p className="mt-0.5 truncate text-[11px] text-gray-400">
                  {selectedTemplate ? selectedTemplate.name : 'Можно выбрать готовое видео из библиотеки'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTemplatePickerOpen((open) => !open)}
                className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50"
              >
                {templatePickerOpen ? 'Скрыть' : selectedTemplate ? 'Изменить' : 'Выбрать'}
              </button>
            </div>

            {templatePickerOpen && (
              <div className="mt-3 grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
              {activeTemplates.map((template) => {
                const selected = template.id === selectedTemplateId;
                const src = templateUrls[template.file_path];
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      onTemplateSelect(template.id);
                      setTemplatePickerOpen(false);
                    }}
                    className={`group relative overflow-hidden rounded-xl border text-left transition-all ${selected ? 'border-brand-600 ring-2 ring-brand-600/20' : 'border-gray-200 hover:border-gray-400'}`}
                    title={`Выбрать: ${template.name}`}
                  >
                    <div className="aspect-video bg-gray-900">
                      {src ? (
                        <video
                          src={src}
                          muted
                          loop
                          playsInline
                          preload="metadata"
                          className="h-full w-full object-contain"
                          onMouseEnter={(event) => event.currentTarget.play().catch(() => {})}
                          onMouseLeave={(event) => {
                            event.currentTarget.pause();
                            event.currentTarget.currentTime = 0;
                          }}
                        />
                      ) : (
                        <div className="h-full w-full animate-pulse bg-gray-800" />
                      )}
                    </div>
                    <span className="block truncate bg-white px-2 py-1.5 text-[10px] font-medium text-gray-700">
                      {template.name}
                    </span>
                    {selected && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-xs text-white shadow-sm">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
              </div>
            )}
          </div>
        )}
      </div>

      {videoUrl && (
        <div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-base font-medium tracking-tight text-gray-900">Какие версии генерировать?</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { id: 'both' as const, title: 'Оба', detail: 'С и без заголовка' },
                { id: 'headline' as const, title: 'С заголовком', detail: 'X 50% / Y 20%' },
                { id: 'clean' as const, title: 'Без заголовка', detail: 'Исходное разрешение' },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setOutputMode(option.id)}
                  className={`rounded-xl border p-3 text-left transition-all ${outputMode === option.id ? 'border-[#2563EB] bg-[#2563EB] text-white shadow-sm' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50'}`}
                >
                  <span className="block text-[13px] font-medium leading-tight">{option.title}</span>
                  <span className={`mt-1.5 block text-[11px] leading-snug ${outputMode === option.id ? 'text-white/75' : 'text-gray-500'}`}>{option.detail}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-gray-500">
              {outputMode === 'both'
                ? 'Каждая идея даст два Reels с одним продающим описанием и CTA.'
                : outputMode === 'headline'
                  ? 'Будут созданы только вертикальные Reels с заголовком.'
                  : 'Будут созданы только чистые версии в исходном соотношении сторон.'}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Тема или акцент ролика</label>
            <textarea
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              placeholder="Например: Seedance 2, один промпт и AI-мини-фильм…"
              className="h-24 w-full resize-none rounded-xl border border-gray-200 bg-white p-3 text-sm outline-none placeholder:text-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              {ideaPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setInputText(preset)}
                  className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-600 transition-colors hover:border-brand-300 hover:text-brand-700"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500">{countLabel}</label>
              <AppSelect
                value={variationCount}
                onChange={(event) => setVariationCount(Number(event.target.value))}
                className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-sm outline-none focus:ring-brand-500"
              >
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>{count} → {count * (outputMode === 'both' ? 2 : 1)} Reels</option>
                ))}
              </AppSelect>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500">Лид-магнит и кодовое слово</label>
              {availableLeadMagnets.length > 0 ? (
                <AppSelect
                  value={selectedLeadMagnet?.id ?? ''}
                  onChange={(event) => onSelectLeadMagnet(event.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white p-2.5 text-sm outline-none focus:ring-brand-500"
                >
                  {availableLeadMagnets.map((magnet) => (
                    <option key={magnet.id} value={magnet.id}>
                      «{magnet.codeword}» — {magnet.title}
                    </option>
                  ))}
                </AppSelect>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Нет активных лид-магнитов. В описании будет слово «ИИ», но для автоответа создайте правило.
                </div>
              )}
            </div>
          </div>

          {selectedLeadMagnet && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800">
              В описание автоматически попадёт CTA: «Напиши {selectedLeadMagnet.codeword.toUpperCase()}».
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl border border-brand-200/60 bg-brand-50 p-2.5 text-xs text-brand-800">
            <span className="flex items-center gap-1.5 font-medium">
              <SparklesIcon className="h-4 w-4 text-brand-600" />
              Новый цифровой отпечаток для каждого из {outputCount} Reels
            </span>
            <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Всегда</span>
          </div>

          <button
            onClick={onGenerate}
            disabled={isGenerating}
            className={`mt-2 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-semibold transition-all ${
              isGenerating
                ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                : 'bg-brand-600 text-white shadow-lg hover:bg-brand-700'
            }`}
          >
            {isGenerating ? (
              <>
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                {progressMsg || 'Создаю комплекты…'}
              </>
            ) : (
              <>
                <SparklesIcon className="h-5 w-5" />
                Создать {outputCount} Reels
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default GeneratorSidebar;
