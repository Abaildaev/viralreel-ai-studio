import React from 'react';
import { ViralVariation, AppState } from '../types';
import VariationCard from './VariationCard';
import { CloudArrowUpIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { Button, EmptyState } from './ui';

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
  const availableCount = variations.filter((v) => v.status !== 'sent').length;

  return (
    /*
      The two placeholder states used to centre themselves in a `min-h-[60vh]`
      box, which parked a large grey icon far below the controls with nothing
      between them. They sit directly under the panel now.
    */
    <div className="flex-1 overflow-y-auto bg-gray-50 p-4 sm:p-6 lg:p-8">
      {appState === AppState.UPLOAD && !videoUrl && (
        <EmptyState
          icon={<CloudArrowUpIcon className="h-6 w-6" />}
          title="Начните с видео"
          description="Загрузите фоновое видео или выберите подложку в панели выше — дальше ИИ соберёт хуки."
        />
      )}

      {appState === AppState.CONFIG && videoUrl && variations.length === 0 && (
        <EmptyState
          icon={<DocumentTextIcon className="h-6 w-6" />}
          title="Настройте стратегию"
          description="Задайте тему и тон в панели выше, затем запустите генерацию — вариации появятся здесь."
        />
      )}

      {appState === AppState.PREVIEW && videoUrl && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-gray-200 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Сгенерированные вариации</h2>
              <p className="mt-1 text-sm text-gray-500">
                {availableCount} из {variations.length} доступно
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={onReset}>
              Очистить все
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
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
