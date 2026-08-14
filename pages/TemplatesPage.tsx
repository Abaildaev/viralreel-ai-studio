import React, { useState, useEffect, useRef } from 'react';
import { supabase, getSignedUrl } from '../lib/supabase';
import { VideoTemplate } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import { useConfirm } from '../contexts/ModalContext';
import { useSignedUrls } from '../hooks/useSignedUrl';
import {
  FilmIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  MusicalNoteIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import {
  Button,
  Callout,
  EmptyState,
  PageHeader,
  PageShell,
  Skeleton,
} from '../components/ui';

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/__+/g, '_');
}

const TemplatesPage: React.FC = () => {
  const { user } = useAuth();
  const { selectedAccount } = useAccount();
  const { confirm, alert } = useConfirm();
  const [templates, setTemplates] = useState<VideoTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const templateUrls = useSignedUrls('templates', templates.map(t => t.file_path));

  useEffect(() => {
    if (user) loadTemplates();
  }, [user, selectedAccount]);

  const loadTemplates = async () => {
    if (!user) return;
    setLoading(true);

    let query = supabase
      .from('video_templates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (selectedAccount) {
      query = query.eq('instagram_account_id', selectedAccount.id);
    }

    const { data } = await query;
    if (data) setTemplates(data);
    setLoading(false);
  };

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = URL.createObjectURL(file);
      video.onloadedmetadata = () => {
        resolve(video.duration);
        URL.revokeObjectURL(video.src);
      };
      video.onerror = () => resolve(0);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user) return;

    if (!selectedAccount) {
      await alert({
        title: 'Внимание',
        message: 'Сначала выберите аккаунт в боковом меню',
        variant: 'warning',
      });
      return;
    }

    setUploading(true);
    const total = files.length;

    for (let i = 0; i < total; i++) {
      const file = files[i];
      setUploadProgress(`${i + 1} / ${total}: ${file.name}`);

      try {
        const safeName = sanitizeFileName(file.name);
        const fileName = `${user.id}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('templates')
          .upload(fileName, file, { contentType: file.type || 'video/mp4' });

        if (uploadError) throw uploadError;

        const duration = await getVideoDuration(file);

        const { error: insertError } = await supabase
          .from('video_templates')
          .insert({
            user_id: user.id,
            instagram_account_id: selectedAccount.id,
            name: file.name.replace(/\.[^/.]+$/, ''),
            file_path: fileName,
            duration: Math.round(duration),
            file_size: file.size,
            has_audio: false,
            is_active: true,
          });

        if (insertError) throw insertError;
      } catch (error: any) {
        await alert({
          title: 'Ошибка загрузки файла',
          message: `${file.name}: ${error.message}`,
          variant: 'error',
        });
      }
    }

    await loadTemplates();
    setUploading(false);
    setUploadProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (template: VideoTemplate) => {
    const ok = await confirm({
      title: 'Удалить видео-шаблон?',
      message: `Вы действительно хотите удалить «${template.name}»?`,
      confirmText: 'Удалить',
      variant: 'danger',
      icon: 'trash',
    });
    if (!ok) return;

    try {
      await supabase.storage.from('templates').remove([template.file_path]);
      await supabase.from('video_templates').delete().eq('id', template.id);
      await loadTemplates();
    } catch (error: any) {
      await alert({
        title: 'Ошибка удаления',
        message: error.message,
        variant: 'error',
      });
    }
  };

  const toggleHasAudio = async (template: VideoTemplate) => {
    await supabase
      .from('video_templates')
      .update({ has_audio: !template.has_audio })
      .eq('id', template.id);
    setTemplates(prev =>
      prev.map(t => t.id === template.id ? { ...t, has_audio: !t.has_audio } : t)
    );
  };

  const toggleActive = async (template: VideoTemplate) => {
    await supabase
      .from('video_templates')
      .update({ is_active: !template.is_active })
      .eq('id', template.id);
    setTemplates(prev =>
      prev.map(t => t.id === template.id ? { ...t, is_active: !t.is_active } : t)
    );
  };

  const getVideoUrl = (path: string) => templateUrls[path] || '';

  const savingRef = useRef(false);

  const handleStartRename = (template: VideoTemplate) => {
    setEditingId(template.id);
    setEditingName(template.name);
  };

  const handleSaveRename = async (id: string) => {
    if (savingRef.current) return;
    const trimmed = editingName.trim();
    if (!trimmed) { setEditingId(null); return; }
    savingRef.current = true;
    setEditingId(null);
    const { error } = await supabase.from('video_templates').update({ name: trimmed }).eq('id', id);
    if (error) {
      console.error('Rename error:', error);
      await alert({
        title: 'Ошибка переименования',
        message: error.message,
        variant: 'error',
      });
    } else {
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, name: trimmed } : t));
    }
    savingRef.current = false;
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const activeCount = templates.filter(t => t.is_active).length;

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      activeFilter === 'all' ||
      (activeFilter === 'active' && t.is_active) ||
      (activeFilter === 'inactive' && !t.is_active);
    return matchesSearch && matchesFilter;
  });

  return (
    <PageShell width="wide">
      <PageHeader
        title={selectedAccount ? `Подложки · @${selectedAccount.username}` : 'Подложки'}
        description={`Фоновые видео для автогенерации. Активных: ${activeCount} из ${templates.length}`}
      />

      {!selectedAccount && (
        <Callout tone="warning" className="mb-5">
          Выберите аккаунт в боковом меню, чтобы загружать и просматривать подложки.
        </Callout>
      )}

      {selectedAccount && (
        <div className="mb-6 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors shadow-lg disabled:shadow-none flex-shrink-0"
            >
              {uploading ? (
                <>
                  <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  {uploadProgress}
                </>
              ) : (
                <>
                  <PlusIcon className="w-5 h-5" />
                  Загрузить видео
                </>
              )}
            </button>
            {templates.length > 0 && (
              <>
                <div className="relative flex-1 max-w-xs">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Поиск по названию..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500"
                  />
                  {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                  {(['all', 'active', 'inactive'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setActiveFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        activeFilter === f
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {f === 'all' ? 'Все' : f === 'active' ? 'Активные' : 'Отключённые'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="aspect-[9/16] w-full" />
          ))}
        </div>
      ) : templates.length === 0 ? (
        <EmptyState
          icon={<FilmIcon className="h-6 w-6" />}
          title="Нет подложек"
          description={
            selectedAccount
              ? 'Загрузите фоновые видео — автогенератор берёт их как подложку для роликов.'
              : 'Выберите аккаунт в боковом меню, чтобы начать работу.'
          }
          action={
            selectedAccount ? (
              <Button
                variant="primary"
                onClick={() => fileInputRef.current?.click()}
                icon={<PlusIcon className="h-5 w-5" />}
              >
                Загрузить видео
              </Button>
            ) : undefined
          }
        />
      ) : filteredTemplates.length === 0 ? (
        <EmptyState
          icon={<MagnifyingGlassIcon className="h-6 w-6" />}
          title="Ничего не найдено"
          description="Ни одна подложка не подходит под текущий запрос или фильтр."
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              className={`bg-white border rounded-xl overflow-hidden transition-all shadow-sm hover:shadow-md ${
                template.is_active ? 'border-gray-200' : 'border-gray-200 opacity-50'
              }`}
            >
              <div className="relative aspect-[9/16] bg-gray-900">
                <video
                  src={getVideoUrl(template.file_path)}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                  preload="metadata"
                  onMouseEnter={(e) => (e.target as HTMLVideoElement).play().catch(() => {})}
                  onMouseLeave={(e) => {
                    const v = e.target as HTMLVideoElement;
                    v.pause();
                    v.currentTime = 0;
                  }}
                />
                <div className="absolute top-2 right-2 flex gap-1">
                  {template.has_audio && (
                    <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                      <MusicalNoteIcon className="w-3 h-3" />
                    </span>
                  )}
                  <span className="bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full">
                    {formatDuration(template.duration)}
                  </span>
                </div>
                {!template.is_active && (
                  <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                    <span className="text-sm font-medium text-gray-500">Отключена</span>
                  </div>
                )}
              </div>

              <div className="p-3">
                {editingId === template.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => handleSaveRename(template.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingId(null); }}
                    className="text-sm font-medium text-gray-900 bg-gray-50 border border-brand-500 rounded-lg px-2 py-1 w-full outline-none mb-1"
                  />
                ) : (
                  <p
                    className="text-sm font-medium text-gray-900 truncate mb-1 cursor-pointer group flex items-center gap-1 hover:text-brand-600 transition-colors"
                    onClick={() => handleStartRename(template)}
                    title="Нажмите для редактирования"
                  >
                    {template.name}
                    <PencilIcon className="w-3 h-3 text-gray-300 group-hover:text-brand-700 flex-shrink-0" />
                  </p>
                )}
                <p className="text-xs text-gray-400 mb-3">{formatSize(template.file_size)}</p>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggleHasAudio(template)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center justify-center gap-1 ${
                      template.has_audio
                        ? 'bg-brand-50 text-brand-700 border-brand-200'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                    }`}
                    title="Есть музыка в видео"
                  >
                    <MusicalNoteIcon className="w-3.5 h-3.5" />
                    {template.has_audio ? 'С музыкой' : 'Без'}
                  </button>

                  <button
                    onClick={() => toggleActive(template)}
                    className={`p-1.5 rounded-lg border transition-colors ${
                      template.is_active
                        ? 'bg-green-50 text-green-600 border-green-200'
                        : 'bg-gray-50 text-gray-400 border-gray-200'
                    }`}
                    title={template.is_active ? 'Активна' : 'Отключена'}
                  >
                    {template.is_active ? <CheckIcon className="w-4 h-4" /> : <XMarkIcon className="w-4 h-4" />}
                  </button>

                  <button
                    onClick={() => handleDelete(template)}
                    className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-200 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
};

export default TemplatesPage;
