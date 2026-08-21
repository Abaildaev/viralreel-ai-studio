import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import { useBatchGeneration } from '../contexts/BatchGenerationContext';
import { useConfirm } from '../contexts/ModalContext';
import {
  BatchPreset,
  VideoTemplate,
  AudioFile,
  LeadMagnet,
} from '../types';
import BatchPresetModal from '../components/BatchPresetModal';
import {
  BoltIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  PlayIcon,
  StopIcon,
  MusicalNoteIcon,
  FilmIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { Button, PageHeader, PageShell, SkeletonList } from '../components/ui';

const BatchGeneratorPage: React.FC = () => {
  const { user } = useAuth();
  const { accounts, selectedAccount } = useAccount();
  const { confirm } = useConfirm();
  const { running, progress, startGeneration, stopGeneration } = useBatchGeneration();
  const [presets, setPresets] = useState<BatchPreset[]>([]);
  const [templates, setTemplates] = useState<VideoTemplate[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [leadMagnets, setLeadMagnets] = useState<LeadMagnet[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingPreset, setEditingPreset] = useState<BatchPreset | null>(null);

  useEffect(() => {
    if (user) loadAll();
  }, [user]);

  const loadAll = async () => {
    if (!user) return;
    setLoading(true);

    const [presetsRes, templatesRes, audioRes, lmRes] = await Promise.all([
      supabase.from('batch_presets').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('video_templates').select('*').eq('user_id', user.id),
      supabase.from('audio_files').select('*').eq('user_id', user.id),
      supabase.from('lead_magnets').select('*').eq('user_id', user.id).eq('is_active', true),
    ]);

    if (presetsRes.data) setPresets(presetsRes.data);
    if (templatesRes.data) setTemplates(templatesRes.data);
    if (audioRes.data) setAudioFiles(audioRes.data);
    if (lmRes.data) setLeadMagnets(lmRes.data as LeadMagnet[]);
    setLoading(false);
  };

  const handleSavePreset = async (data: Partial<BatchPreset>) => {
    if (!user) return;

    if (editingPreset) {
      const { error } = await supabase
        .from('batch_presets')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', editingPreset.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('batch_presets')
        .insert({ ...data, user_id: user.id });
      if (error) throw error;
    }

    setShowModal(false);
    setEditingPreset(null);
    await loadAll();
  };

  const handleDeletePreset = async (id: string) => {
    const ok = await confirm({
      title: 'Удалить пресет?',
      message: 'Вы уверены, что хотите удалить этот пресет пакетной генерации?',
      confirmText: 'Удалить',
      variant: 'danger',
      icon: 'trash',
    });
    if (!ok) return;
    const deletedPreset = presets.find((item) => item.id === id);
    const { error } = await supabase.from('batch_presets').delete().eq('id', id);
    if (error) return;
    const backgroundPath = deletedPreset?.text_style?.ctaOutroBackgroundPath;
    if (backgroundPath) {
      await supabase.storage.from('templates').remove([backgroundPath]);
    }
    await loadAll();
  };

  const handleRunAll = () => {
    if (!user) return;
    const activePresets = presets.filter(p => p.is_active);
    if (activePresets.length === 0) return;
    startGeneration(activePresets, user.id, templates, audioFiles, leadMagnets);
  };

  const handleRunSingle = (preset: BatchPreset) => {
    if (!user) return;
    startGeneration([preset], user.id, templates, audioFiles, leadMagnets);
  };

  const togglePresetActive = async (preset: BatchPreset) => {
    await supabase
      .from('batch_presets')
      .update({ is_active: !preset.is_active })
      .eq('id', preset.id);
    setPresets(prev =>
      prev.map(p => p.id === preset.id ? { ...p, is_active: !p.is_active } : p)
    );
  };

  const activePresetsCount = presets.filter(p => p.is_active).length;
  const totalVideos = presets.filter(p => p.is_active).reduce((s, p) => s + p.variations_count, 0);

  const getAccountTemplateCount = (accountId: string | null) => {
    return templates.filter(t => t.is_active && t.instagram_account_id === accountId).length;
  };

  const getPresetSourceName = (preset: BatchPreset) => {
    if (!preset.text_style?.sourceTemplateId) return '';
    return templates.find((template) => template.id === preset.text_style.sourceTemplateId)?.name || 'Недоступен';
  };

  const audioModeLabel = (mode: string) => {
    if (mode === 'from_video') return 'Из подложки';
    if (mode === 'random') return 'Рандом';
    if (mode === 'specific') return 'Конкретный';
    return mode;
  };

  const toneLabel = (tone: string) => {
    const map: Record<string, string> = {
      Provokacionnyj: 'Провокационный',
      Obrazovatelnyj: 'Образовательный',
      Prodajushchij: 'Продающий',
      Jumoristicheskij: 'Юмористический',
      Vdohnovljajushhij: 'Вдохновляющий',
      Misticheskij: 'Загадочный',
    };
    return map[tone] || tone;
  };

  const accountName = (id: string | null) => {
    if (!id) return 'Без привязки';
    const a = accounts.find(acc => acc.id === id);
    return a ? `@${a.username}` : 'Неизвестный';
  };

  if (loading) {
    // Keep the page frame while loading, so the header does not pop in and
    // shove the content down once the presets arrive.
    return (
      <PageShell>
        <PageHeader title="Автогенератор" description="Загружаем пресеты…" />
        <SkeletonList rows={3} />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Автогенератор"
        description={`${activePresetsCount} пресетов, ${totalVideos} видео за запуск`}
        actions={
          <>
          <Button
            onClick={() => { setEditingPreset(null); setShowModal(true); }}
            icon={<PlusIcon className="h-4 w-4" />}
          >
            Пресет
          </Button>

          {!running ? (
            <Button
              variant="primary"
              onClick={handleRunAll}
              disabled={activePresetsCount === 0}
              icon={<BoltIcon className="h-5 w-5" />}
            >
              Запустить все
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={stopGeneration}
              className="bg-red-600 hover:bg-red-700"
              icon={<StopIcon className="h-5 w-5" />}
            >
              Остановить
            </Button>
          )}
          </>
        }
      />

      {(running
        || (progress && progress.overallProgress >= 100)
        || progress?.currentPreset === 'Остановлено') && progress && (
        <div className="card mb-6 p-5 sm:p-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">{progress.currentPreset}</p>
              <p className="text-xs text-gray-500">{progress.currentStep}</p>
            </div>
            <span className="text-sm font-mono text-brand-600">
              {progress.completed} / {progress.total}
            </span>
          </div>

          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className="bg-brand-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${progress.overallProgress}%` }}
            />
          </div>

          {progress.errors.length > 0 && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-3 max-h-32 overflow-y-auto">
              {progress.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-600 flex items-start gap-1.5 mb-1">
                  <ExclamationTriangleIcon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {err}
                </p>
              ))}
            </div>
          )}

          {progress.overallProgress >= 100 && (
            <div className="mt-4 flex items-center gap-2 text-green-600">
              <CheckCircleIcon className="w-5 h-5" />
              <span className="text-sm font-medium">
                {progress.errors.length > 0
                  ? `Завершено с ${progress.errors.length} ошибками`
                  : 'Все видео готовы! Перейдите в Планировщик.'}
              </span>
            </div>
          )}
        </div>
      )}

      {templates.filter(t => t.is_active).length === 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-700">
            Загрузите подложки для аккаунтов в разделе "Подложки".
          </p>
        </div>
      )}

      {presets.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 border border-gray-200 rounded-xl">
          <BoltIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">Нет пресетов</h3>
          <p className="text-sm text-gray-400 mb-6">
            Создайте пресет для автоматической генерации контента
          </p>
          <button
            onClick={() => { setEditingPreset(null); setShowModal(true); }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors shadow-lg"
          >
            <PlusIcon className="w-5 h-5" />
            Создать пресет
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {presets.map((preset) => (
            <div
              key={preset.id}
              className={`bg-white border rounded-xl p-5 transition-all shadow-sm ${
                preset.is_active
                  ? 'border-gray-200 hover:border-gray-300 hover:shadow-md'
                  : 'border-gray-200 opacity-50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900">{preset.name || 'Без имени'}</h3>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {accountName(preset.instagram_account_id)}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      preset.is_active
                        ? 'bg-green-50 text-green-600'
                        : 'bg-gray-100 text-gray-500'
                    }`}>
                      {preset.is_active ? 'Активен' : 'Отключен'}
                    </span>
                    {preset.text_style?.presetType === 'ai_showcase' && (
                      <span className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full border border-brand-200 font-semibold flex items-center gap-1">
                        ✨ AI Showcase
                      </span>
                    )}
                    {preset.text_style?.ctaOutroEnabled && (
                      <span className="flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                        CTA · {preset.text_style.ctaOutroKeyword || 'ПРОМПТ'}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {(preset.topics || []).map((t, i) => (
                      <span
                        key={i}
                        className="text-xs bg-brand-50 text-brand-700 px-2 py-0.5 rounded-md border border-brand-100"
                      >
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className={`flex items-center gap-1 ${getAccountTemplateCount(preset.instagram_account_id) === 0 ? 'text-red-500' : ''}`}>
                      <FilmIcon className="w-3.5 h-3.5" />
                      {preset.text_style?.sourceTemplateId
                        ? `Reels: ${getPresetSourceName(preset)}`
                        : `${getAccountTemplateCount(preset.instagram_account_id)} подложек`}
                    </span>
                    <span className="flex items-center gap-1">
                      {preset.variations_count} видео
                    </span>
                    <span className="flex items-center gap-1">
                      <ClockIcon className="w-3.5 h-3.5" />
                      каждые {preset.schedule_interval_minutes} мин
                    </span>
                    <span className="flex items-center gap-1">
                      <MusicalNoteIcon className="w-3.5 h-3.5" />
                      {audioModeLabel(preset.audio_mode)}
                    </span>
                    <span>
                      {preset.text_style?.presetType === 'ai_showcase'
                        ? '✨ AI Showcase'
                        : preset.text_style?.presetType === 'cta_outro'
                          ? '🎯 CTA-концовка'
                        : toneLabel(preset.tone)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 ml-4">
                  <button
                    onClick={() => handleRunSingle(preset)}
                    disabled={running || getAccountTemplateCount(preset.instagram_account_id) === 0}
                    className="p-2 rounded-lg text-brand-600 hover:bg-brand-50 disabled:opacity-30 transition-colors"
                    title="Запустить"
                  >
                    <PlayIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => togglePresetActive(preset)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      preset.is_active
                        ? 'border-green-200 text-green-600 hover:bg-green-50'
                        : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {preset.is_active ? 'Вкл' : 'Выкл'}
                  </button>
                  <button
                    onClick={() => { setEditingPreset(preset); setShowModal(true); }}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeletePreset(preset.id)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <BatchPresetModal
          preset={editingPreset}
          userId={user!.id}
          accounts={accounts}
          currentAccountId={selectedAccount?.id}
          templates={templates}
          audioFiles={audioFiles}
          onSave={handleSavePreset}
          onClose={() => { setShowModal(false); setEditingPreset(null); }}
        />
      )}
    </PageShell>
  );
};

export default BatchGeneratorPage;
