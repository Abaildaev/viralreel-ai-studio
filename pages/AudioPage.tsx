import React, { useState, useEffect, useRef } from 'react';
import { supabase, getSignedUrl } from '../lib/supabase';
import { AudioFile } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useConfirm } from '../contexts/ModalContext';
import { useSignedUrls } from '../hooks/useSignedUrl';
import AudioWaveformPicker from '../components/AudioWaveformPicker';
import {
  MusicalNoteIcon,
  PlusIcon,
  TrashIcon,
  PlayIcon,
  PauseIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  PencilIcon,
  SparklesIcon,
  SpeakerWaveIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline';

const AudioPage: React.FC = () => {
  const { user } = useAuth();
  const { confirm, alert } = useConfirm();
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [expandedWaveformId, setExpandedWaveformId] = useState<string | null>(null);
  const [audioOffsets, setAudioOffsets] = useState<Record<string, number>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const audioUrls = useSignedUrls('audio', audioFiles.map(a => a.file_path));

  const getAudioUrl = (path: string) => audioUrls[path] || '';

  useEffect(() => {
    if (user) {
      loadAudioFiles();
    }
  }, [user]);

  const loadAudioFiles = async () => {
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('audio_files')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAudioFiles(data);
    }
    setLoading(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploading(true);

    try {
      // Sanitize filename: remove non-ASCII chars, keep only safe characters
      // Sanitize extension: handle Cyrillic lookalikes (МР3 -> mp3) and fallback to MIME
      const rawExt = (file.name.split('.').pop() || '').toLowerCase()
        .replace(/м/g, 'm').replace(/р/g, 'r').replace(/з/g, '3')
        .replace(/а/g, 'a').replace(/в/g, 'v').replace(/е/g, 'e')
        .replace(/[^a-z0-9]/g, '');
      const mimeExt = file.type.split('/').pop()?.replace('mpeg', 'mp3')?.replace('x-', '') || '';
      const ext = rawExt || mimeExt || 'mp3';
      const safeName = file.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 50) || 'audio';
      const fileName = `${user.id}/${Date.now()}_${safeName}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const duration = await getAudioDuration(file);

      const { error: insertError } = await supabase
        .from('audio_files')
        .insert({
          user_id: user.id,
          name: file.name.replace(/\.[^/.]+$/, ''),
          file_path: fileName,
          duration: Math.round(duration),
          file_size: file.size,
        });

      if (insertError) throw insertError;

      await loadAudioFiles();
    } catch (error: any) {
      await alert({
        title: 'Ошибка загрузки',
        message: error.message,
        variant: 'error',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getAudioDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const audio = document.createElement('audio');
      audio.src = URL.createObjectURL(file);
      audio.onloadedmetadata = () => {
        resolve(audio.duration);
        URL.revokeObjectURL(audio.src);
      };
      audio.onerror = () => resolve(0);
    });
  };

  const handleDelete = async (audioFile: AudioFile) => {
    const ok = await confirm({
      title: 'Удалить аудиозапись?',
      message: `Вы действительно хотите удалить «${audioFile.name}»?`,
      confirmText: 'Удалить',
      variant: 'danger',
      icon: 'trash',
    });
    if (!ok) return;

    try {
      await supabase.storage.from('audio').remove([audioFile.file_path]);
      await supabase.from('audio_files').delete().eq('id', audioFile.id);
      await loadAudioFiles();
    } catch (error: any) {
      await alert({
        title: 'Ошибка удаления',
        message: error.message,
        variant: 'error',
      });
    }
  };

  const savingRef = useRef(false);

  const handleStartRename = (audioFile: AudioFile) => {
    setEditingId(audioFile.id);
    setEditingName(audioFile.name);
  };

  const handleSaveRename = async (id: string) => {
    if (savingRef.current) return; // prevent double-fire from Enter + onBlur
    const trimmed = editingName.trim();
    if (!trimmed) { setEditingId(null); return; }
    savingRef.current = true;
    setEditingId(null);
    const { error } = await supabase.from('audio_files').update({ name: trimmed }).eq('id', id);
    if (error) {
      console.error('Rename error:', error);
      await alert({
        title: 'Ошибка переименования',
        message: error.message,
        variant: 'error',
      });
    } else {
      setAudioFiles(prev => prev.map(a => a.id === id ? { ...a, name: trimmed } : a));
    }
    savingRef.current = false;
  };

  const togglePlay = async (audioFile: AudioFile) => {
    if (playingId === audioFile.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const url = audioUrls[audioFile.file_path] || (await getSignedUrl('audio', audioFile.file_path).catch(() => ''));
      if (!url) return;
      const audio = new Audio(url);
      audio.onended = () => setPlayingId(null);
      audio.play();
      audioRef.current = audio;
      setPlayingId(audioFile.id);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const filteredAudioFiles = audioFiles.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Аудио библиотека</h1>
        <p className="text-sm text-gray-500 mt-1">
          Загрузите аудио для добавления к видео
        </p>
      </div>

      <div className="mb-6 flex items-center gap-3">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors shadow-lg disabled:shadow-none flex-shrink-0"
        >
          {uploading ? (
            <>
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              Загрузка...
            </>
          ) : (
            <>
              <PlusIcon className="w-5 h-5" />
              Загрузить аудио
            </>
          )}
        </button>
        {audioFiles.length > 0 && (
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по названию..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <XMarkIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : audioFiles.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 border border-gray-200 rounded-xl">
          <MusicalNoteIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">Нет аудио файлов</h3>
          <p className="text-sm text-gray-400">Загрузите аудио для использования в видео</p>
        </div>
      ) : filteredAudioFiles.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 border border-gray-200 rounded-xl">
          <MagnifyingGlassIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-base font-medium text-gray-500 mb-1">Ничего не найдено</h3>
          <p className="text-sm text-gray-400">Попробуйте другой запрос</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAudioFiles.map((audioFile) => {
            const isWaveformOpen = expandedWaveformId === audioFile.id;
            const currentOffset = audioOffsets[audioFile.id] || 0;

            return (
              <div
                key={audioFile.id}
                className={`bg-white border rounded-2xl overflow-hidden transition-all shadow-sm ${
                  isWaveformOpen ? 'border-teal-500 ring-2 ring-teal-500/20 shadow-md' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="p-4 flex items-center gap-4">
                  <button
                    onClick={() => togglePlay(audioFile)}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors flex-shrink-0 ${
                      playingId === audioFile.id
                        ? 'bg-teal-500 text-white shadow-md'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {playingId === audioFile.id ? (
                      <PauseIcon className="w-5 h-5" />
                    ) : (
                      <PlayIcon className="w-5 h-5" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    {editingId === audioFile.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => handleSaveRename(audioFile.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingId(null); }}
                        className="font-medium text-gray-900 bg-gray-50 border border-teal-500 rounded-lg px-2 py-1 w-full outline-none text-sm"
                      />
                    ) : (
                      <h3
                        className="font-bold text-gray-900 truncate cursor-pointer group flex items-center gap-1.5 hover:text-teal-600 transition-colors text-sm"
                        onClick={() => handleStartRename(audioFile)}
                        title="Нажмите для редактирования"
                      >
                        {audioFile.name}
                        <PencilIcon className="w-3.5 h-3.5 text-gray-300 group-hover:text-teal-700 flex-shrink-0" />
                      </h3>
                    )}
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      <span>{formatDuration(audioFile.duration)}</span>
                      <span className="w-1 h-1 bg-gray-300 rounded-full" />
                      <span>{formatFileSize(audioFile.file_size)}</span>
                      {currentOffset > 0 && (
                        <>
                          <span className="w-1 h-1 bg-gray-300 rounded-full" />
                          <span className="text-teal-600 font-semibold flex items-center gap-1">
                            <SpeakerWaveIcon className="w-3 h-3" /> Старт: {currentOffset}с
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Waveform Drawer Toggle */}
                  <button
                    onClick={() => setExpandedWaveformId(isWaveformOpen ? null : audioFile.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                      isWaveformOpen
                        ? 'bg-teal-50 text-teal-700 border border-teal-200'
                        : 'bg-gray-100 hover:bg-teal-50 hover:text-teal-700 text-gray-700'
                    }`}
                  >
                    <SpeakerWaveIcon className="w-4 h-4" />
                    <span>Волноформа</span>
                    {isWaveformOpen ? <ChevronUpIcon className="w-3.5 h-3.5" /> : <ChevronDownIcon className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={() => handleDelete(audioFile)}
                    className="p-2.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>

                {/* Expanded Audio Waveform Section */}
                {isWaveformOpen && (
                  <div className="p-4 bg-gray-950 border-t border-gray-800 animate-in fade-in duration-150">
                    <AudioWaveformPicker
                      audioUrl={getAudioUrl(audioFile.file_path)}
                      audioName={audioFile.name}
                      duration={audioFile.duration}
                      startOffset={currentOffset}
                      onChangeOffset={(offset) => {
                        setAudioOffsets(prev => ({ ...prev, [audioFile.id]: offset }));
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AudioPage;
