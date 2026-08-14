import React, { useState } from 'react';
import { ViralVariation } from '../types';
import { fontOptions, fontSizeOptions, fontWeightOptions, bgOptions } from '../constants';
import VideoPlayer from './VideoPlayer';
import VideoTrimmer from './VideoTrimmer';
import {
  CheckCircleIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  Bars3BottomLeftIcon,
  Bars3Icon,
  Bars3BottomRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
  VideoCameraIcon,
  BookmarkIcon,
  TrashIcon,
  ScissorsIcon,
} from '@heroicons/react/24/outline';

interface VariationCardProps {
  variation: ViralVariation;
  videoUrl: string;
  audioSrc?: string;
  activeEditorTab?: 'text' | 'video' | 'trim';
  setActiveEditorTab?: (tab: any) => void;
  savingId: string | null;
  onUpdateStyle: (id: string, field: keyof ViralVariation, value: any) => void;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onSave: (id: string) => void;
}

const VariationCard: React.FC<VariationCardProps> = ({
  variation,
  videoUrl,
  audioSrc,
  activeEditorTab,
  setActiveEditorTab,
  savingId,
  onUpdateStyle,
  onUpdatePosition,
  onRemove,
  onSave,
}) => {
  const [tab, setTab] = useState<'text' | 'video' | 'trim'>(activeEditorTab || 'text');
  const currentTab = activeEditorTab !== undefined ? activeEditorTab : tab;
  const switchTab = (t: 'text' | 'video' | 'trim') => {
    setTab(t);
    if (setActiveEditorTab) setActiveEditorTab(t);
  };

  return (
    <div
      className={`bg-white border rounded-xl overflow-hidden transition-all duration-300 flex flex-col shadow-sm
        ${variation.status === 'sent' ? 'border-green-300 opacity-60' : 'border-gray-200 hover:border-gray-300 hover:shadow-md'}`}
    >
      <div className="relative">
        <VideoPlayer
          src={videoUrl}
          audioSrc={audioSrc}
          hookText={variation.hookText}
          font={variation.font}
          fontSize={variation.fontSize}
          fontWeight={variation.fontWeight}
          textAlign={variation.textAlign}
          textShadow={variation.textShadow}
          bgStyle={variation.bgStyle}
          bgOpacity={variation.bgOpacity}
          posX={variation.posX}
          posY={variation.posY}
          videoScale={variation.videoScale}
          videoPanX={variation.videoPanX}
          videoPanY={variation.videoPanY}
          showCarouselBait={variation.showCarouselBait}
          carouselBaitPosY={variation.carouselBaitPosY}
          bankAmount={variation.bankAmount}
          aiModel={variation.aiModel}
          showcaseStyle={variation.showcaseStyle}
          showcaseEmoji={variation.showcaseEmoji}
          textRotation={variation.textRotation || 0}
          onPositionChange={(x, y) => onUpdatePosition(variation.id, x, y)}
          onCarouselBaitPositionChange={(y) => onUpdateStyle(variation.id, 'carouselBaitPosY', y)}
        />

        <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/60 backdrop-blur-md rounded-full px-3 py-1 text-white text-xs font-medium">
          {variation.status === 'sent' ? (
            <>
              <CheckCircleIcon className="w-4 h-4 text-green-400" />
              Отправлено
            </>
          ) : (
            <>Вариант</>
          )}
        </div>
      </div>

      {variation.status !== 'sent' && (
        <div className="p-3 bg-gray-50 border-b border-gray-200 space-y-3">
          <div className="flex rounded-xl bg-gray-200/60 p-1 gap-1">
            <button
              onClick={() => switchTab('text')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1 ${
                currentTab === 'text'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <DocumentTextIcon className="w-3.5 h-3.5" />
              Текст
            </button>
            <button
              onClick={() => switchTab('video')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1 ${
                currentTab === 'video'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <VideoCameraIcon className="w-3.5 h-3.5" />
              Видео
            </button>
            <button
              onClick={() => switchTab('trim')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1 ${
                currentTab === 'trim'
                  ? 'bg-white text-teal-700 shadow-sm font-bold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <ScissorsIcon className="w-3.5 h-3.5" />
              Обрезка
            </button>
          </div>

          {currentTab === 'text' && (
            <div className="space-y-2.5">
              <textarea
                value={variation.hookText}
                onChange={(e) => onUpdateStyle(variation.id, 'hookText', e.target.value)}
                rows={2}
                className="w-full bg-white text-gray-900 text-xs rounded-xl p-2.5 outline-none border border-gray-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 resize-none font-medium"
                placeholder="Заголовок на видео..."
              />

              <div className="flex items-center gap-1 bg-gray-200/50 p-1 rounded-xl">
                <button
                  onClick={() => {
                    onUpdateStyle(variation.id, 'bgStyle', 'none');
                    onUpdateStyle(variation.id, 'aiModel', 'none');
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${variation.bgStyle === 'none' ? 'bg-teal-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Обычный
                </button>
                <button
                  onClick={() => {
                    onUpdateStyle(variation.id, 'bgStyle', 'quote-white');
                    onUpdateStyle(variation.id, 'font', 'Georgia');
                    onUpdateStyle(variation.id, 'showCarouselBait', false);
                    onUpdateStyle(variation.id, 'posY', 35);
                    onUpdateStyle(variation.id, 'textAlign', 'center');
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${variation.bgStyle === 'quote-white' ? 'bg-teal-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Цитата
                </button>
                <button
                  onClick={() => {
                    onUpdateStyle(variation.id, 'bgStyle', 'bank-transfer');
                    onUpdateStyle(variation.id, 'font', 'Inter');
                    onUpdateStyle(variation.id, 'showCarouselBait', false);
                    onUpdateStyle(variation.id, 'posY', 35);
                    onUpdateStyle(variation.id, 'textAlign', 'center');
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${variation.bgStyle === 'bank-transfer' ? 'bg-teal-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Банк
                </button>
                <button
                  onClick={() => {
                    onUpdateStyle(variation.id, 'bgStyle', 'ai-showcase');
                    onUpdateStyle(variation.id, 'font', 'GenShinGothic');
                    onUpdateStyle(variation.id, 'posY', 18);
                    onUpdateStyle(variation.id, 'textAlign', 'center');
                    if (!variation.aiModel || variation.aiModel === 'none') {
                      onUpdateStyle(variation.id, 'aiModel', 'claude');
                    }
                  }}
                  className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${variation.bgStyle === 'ai-showcase' ? 'bg-teal-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  AI
                </button>
              </div>

              {variation.bgStyle !== 'quote-white' && variation.bgStyle !== 'bank-transfer' && (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex bg-white rounded-lg p-0.5 border border-gray-200">
                      {bgOptions.filter(o => o.id !== 'quote-white').map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => onUpdateStyle(variation.id, 'bgStyle', opt.id)}
                          className={`p-1.5 rounded transition-all ${variation.bgStyle === opt.id ? 'bg-teal-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
                          title={opt.label}
                        >
                          {opt.icon}
                        </button>
                      ))}
                    </div>

                    {variation.bgStyle !== 'none' && variation.bgStyle !== 'ai-showcase' && (
                      <div className="flex-1 flex items-center gap-2 px-2">
                        <span className="text-[10px] text-gray-400 font-medium">OP</span>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={variation.bgOpacity}
                          onChange={(e) => onUpdateStyle(variation.id, 'bgOpacity', Number(e.target.value))}
                          className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 justify-between">
                    <div className="flex gap-1">
                      <button
                        onClick={() => onUpdateStyle(variation.id, 'textShadow', !variation.textShadow)}
                        className={`px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                          variation.textShadow
                            ? 'bg-gray-200 text-gray-700 border-gray-300'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        Тень
                      </button>
                      <button
                        onClick={() => onUpdateStyle(variation.id, 'showCarouselBait', !variation.showCarouselBait)}
                        className={`px-2 py-1.5 rounded text-xs font-medium border transition-colors ${
                          variation.showCarouselBait
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        Байт
                      </button>
                    </div>

                    <select
                      value={variation.font}
                      onChange={(e) => onUpdateStyle(variation.id, 'font', e.target.value)}
                      className="bg-white text-gray-700 text-xs rounded px-2 py-1.5 outline-none border border-gray-200 focus:border-teal-500 flex-1 min-w-[90px]"
                    >
                      {fontOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 justify-between">
                    <select
                      value={variation.fontWeight}
                      onChange={(e) => onUpdateStyle(variation.id, 'fontWeight', e.target.value)}
                      className="bg-white text-gray-700 text-xs rounded px-2 py-1.5 outline-none border border-gray-200 focus:border-teal-500 flex-1"
                    >
                      {fontWeightOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <select
                      value={variation.fontSize}
                      onChange={(e) => onUpdateStyle(variation.id, 'fontSize', Number(e.target.value))}
                      className="bg-white text-gray-700 text-xs rounded px-2 py-1.5 outline-none border border-gray-200 focus:border-teal-500 w-16 text-center"
                    >
                      {fontSizeOptions.map(size => <option key={size} value={size}>{size}px</option>)}
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-2">
                    <div className="flex bg-white rounded-lg p-0.5 border border-gray-200">
                      <button onClick={() => onUpdateStyle(variation.id, 'textAlign', 'left')} className={`p-1.5 rounded ${variation.textAlign === 'left' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                        <Bars3BottomLeftIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onUpdateStyle(variation.id, 'textAlign', 'center')} className={`p-1.5 rounded ${variation.textAlign === 'center' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                        <Bars3Icon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onUpdateStyle(variation.id, 'textAlign', 'right')} className={`p-1.5 rounded ${variation.textAlign === 'right' ? 'bg-teal-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                        <Bars3BottomRightIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex bg-white rounded-lg p-0.5 border border-gray-200">
                      <button onClick={() => onUpdatePosition(variation.id, 50, 18)} className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100" title="Вверх">
                        <ArrowUpIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onUpdatePosition(variation.id, 50, 50)} className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100" title="Центр">
                        <MinusIcon className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onUpdatePosition(variation.id, 50, 80)} className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100" title="Вниз">
                        <ArrowDownIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {variation.bgStyle === 'ai-showcase' && (
                    <div className="flex items-center gap-2 border-t border-gray-200 pt-2">
                      <span className="text-xs text-gray-500 font-medium whitespace-nowrap">🤖 Нейросеть</span>
                      <select
                        value={variation.aiModel || 'claude'}
                        onChange={(e) => onUpdateStyle(variation.id, 'aiModel', e.target.value)}
                        className="flex-1 bg-white text-gray-700 text-xs rounded px-2 py-1.5 outline-none border border-gray-200 focus:border-teal-500 font-medium"
                      >
                        <option value="claude">Claude (Anthropic) 🟠</option>
                        <option value="chatgpt">ChatGPT (OpenAI) 🟢</option>
                        <option value="gemini">Gemini (Google) 🔵</option>
                        <option value="none">Без логотипа</option>
                      </select>
                    </div>
                  )}

                  <div className="flex items-center gap-2 border-t border-gray-200 pt-2">
                    <span className="text-xs text-gray-500 font-medium whitespace-nowrap">📐 Наклон ({variation.textRotation || 0}°)</span>
                    <input
                      type="range"
                      min="-15"
                      max="15"
                      value={variation.textRotation || 0}
                      onChange={(e) => onUpdateStyle(variation.id, 'textRotation', Number(e.target.value))}
                      className="flex-1 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500"
                    />
                  </div>
                </>
              )}

              {(variation.bgStyle === 'quote-white' || variation.bgStyle === 'bank-transfer') && (
                <>
                  {variation.bgStyle === 'bank-transfer' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-medium whitespace-nowrap">💰 Сумма</span>
                      <input
                        type="text"
                        value={variation.bankAmount || '1 777 807,23 ₽'}
                        onChange={(e) => onUpdateStyle(variation.id, 'bankAmount', e.target.value)}
                        placeholder="1 777 807,23 ₽"
                        className="flex-1 bg-white text-gray-700 text-xs rounded px-2 py-1.5 outline-none border border-gray-200 focus:border-teal-500"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2 justify-between">
                    <select
                      value={variation.font}
                      onChange={(e) => onUpdateStyle(variation.id, 'font', e.target.value)}
                      className="bg-white text-gray-700 text-xs rounded px-2 py-1.5 outline-none border border-gray-200 focus:border-teal-500 flex-1 min-w-[90px]"
                    >
                      {fontOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>

                  <div className="flex items-center gap-2 justify-between">
                    <select
                      value={variation.fontWeight}
                      onChange={(e) => onUpdateStyle(variation.id, 'fontWeight', e.target.value)}
                      className="bg-white text-gray-700 text-xs rounded px-2 py-1.5 outline-none border border-gray-200 focus:border-teal-500 flex-1"
                    >
                      {fontWeightOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <select
                      value={variation.fontSize}
                      onChange={(e) => onUpdateStyle(variation.id, 'fontSize', Number(e.target.value))}
                      className="bg-white text-gray-700 text-xs rounded px-2 py-1.5 outline-none border border-gray-200 focus:border-teal-500 w-16 text-center"
                    >
                      {fontSizeOptions.map(size => <option key={size} value={size}>{size}px</option>)}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {currentTab === 'video' && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Масштаб</span>
                  <span>{Math.round(variation.videoScale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.05"
                  value={variation.videoScale}
                  onChange={(e) => onUpdateStyle(variation.id, 'videoScale', Number(e.target.value))}
                  className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Сдвиг по X</span>
                  <span>{variation.videoPanX}%</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={variation.videoPanX}
                  onChange={(e) => onUpdateStyle(variation.id, 'videoPanX', Number(e.target.value))}
                  className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Сдвиг по Y</span>
                  <span>{variation.videoPanY}%</span>
                </div>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={variation.videoPanY}
                  onChange={(e) => onUpdateStyle(variation.id, 'videoPanY', Number(e.target.value))}
                  className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500"
                />
              </div>

              <button
                onClick={() => {
                  onUpdateStyle(variation.id, 'videoScale', 1);
                  onUpdateStyle(variation.id, 'videoPanX', 0);
                  onUpdateStyle(variation.id, 'videoPanY', 0);
                }}
                className="w-full py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
              >
                Сбросить
              </button>
            </div>
          )}

          {currentTab === 'trim' && (
            <div className="space-y-2">
              <VideoTrimmer
                videoFile={null}
                videoUrl={videoUrl}
                trimStart={variation.trimStart || 0}
                trimEnd={variation.trimEnd || 10}
                onChange={(start, end) => {
                  onUpdateStyle(variation.id, 'trimStart', start);
                  onUpdateStyle(variation.id, 'trimEnd', end);
                }}
              />
            </div>
          )}
        </div>
      )}

      <div className="p-4 flex-1 flex flex-col">
        <div className="mb-3">
          <p className="text-xs text-gray-400 mb-2">
            {variation.captionText.length} символов
          </p>
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 max-h-32 overflow-y-auto border border-gray-200">
            <p className="whitespace-pre-wrap text-xs leading-relaxed">{variation.captionText}</p>
          </div>
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2">
          {variation.status !== 'sent' && (
            <>
              <button
                onClick={() => onRemove(variation.id)}
                className="py-2.5 rounded-xl border border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-500 text-gray-500 transition-colors flex items-center justify-center gap-1.5 text-sm"
              >
                <TrashIcon className="w-4 h-4" />
                Удалить
              </button>

              <button
                onClick={() => onSave(variation.id)}
                disabled={savingId === variation.id}
                className="py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-gray-200 text-white font-medium shadow-lg disabled:shadow-none transition-all flex items-center justify-center gap-1.5 text-sm"
              >
                {savingId === variation.id ? (
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                ) : (
                  <BookmarkIcon className="w-4 h-4" />
                )}
                Запланировать
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VariationCard;
