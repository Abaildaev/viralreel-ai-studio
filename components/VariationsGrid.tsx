import React from 'react';
import { ViralVariation, AppState } from '../types';
import VariationCard from './VariationCard';
import {
  CloudArrowUpIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

interface VariationsGridProps {
  appState: AppState;
  videoUrl: string | null;
  variations: ViralVariation[];
  activeEditorTab: 'text' | 'video';
  setActiveEditorTab: (tab: 'text' | 'video') => void;
  savingId: string | null;
  onUpdateStyle: (id: string, field: keyof ViralVariation, value: any) => void;
  onUpdatePosition: (id: string, x: number, y: number) => void;
  onRemove: (id: string) => void;
  onSave: (id: string) => void;
  onReset: () => void;
}

const VariationsGrid: React.FC<VariationsGridProps> = ({
  appState,
  videoUrl,
  variations,
  activeEditorTab,
  setActiveEditorTab,
  savingId,
  onUpdateStyle,
  onUpdatePosition,
  onRemove,
  onSave,
  onReset,
}) => {
  return (
    <div className="flex-1 p-6 lg:p-10 overflow-y-auto bg-gray-50">
      {appState === AppState.UPLOAD && !videoUrl && (
        <div className="h-full flex flex-col items-center justify-center text-center min-h-[60vh]">
          <div className="w-20 h-20 rounded-xl bg-gray-200 flex items-center justify-center mb-4">
            <CloudArrowUpIcon className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-400 mb-2">Начните с видео</h2>
          <p className="text-gray-400 text-sm">Загрузите фоновое видео для начала</p>
        </div>
      )}

      {appState === AppState.CONFIG && videoUrl && variations.length === 0 && (
        <div className="h-full flex flex-col items-center justify-center text-center min-h-[60vh]">
          <div className="w-20 h-20 rounded-xl bg-gray-200 flex items-center justify-center mb-4 animate-pulse">
            <DocumentTextIcon className="w-10 h-10 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-400 mb-2">Настройте стратегию</h2>
          <p className="text-gray-400 text-sm">ИИ создаст вирусные хуки для вас</p>
        </div>
      )}

      {appState === AppState.PREVIEW && videoUrl && (
        <div className="space-y-6">
          <div className="flex justify-between items-end border-b border-gray-200 pb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Сгенерированные вариации</h2>
              <p className="text-gray-500 text-sm mt-1">
                {variations.filter(v => v.status !== 'sent').length} из {variations.length} доступно
              </p>
            </div>
            <button
              onClick={onReset}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              Очистить все
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {variations.map((variation) => (
              <VariationCard
                key={variation.id}
                variation={variation}
                videoUrl={videoUrl}
                activeEditorTab={activeEditorTab}
                setActiveEditorTab={setActiveEditorTab}
                savingId={savingId}
                onUpdateStyle={onUpdateStyle}
                onUpdatePosition={onUpdatePosition}
                onRemove={onRemove}
                onSave={onSave}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VariationsGrid;
