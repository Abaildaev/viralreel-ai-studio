import React, { useState } from 'react';
import { AudioFile } from '../types';
import { supabase, getSignedUrl } from '../lib/supabase';
import { useSignedUrls } from '../hooks/useSignedUrl';
import AudioWaveformPicker from './AudioWaveformPicker';
import {
  XMarkIcon,
  MusicalNoteIcon,
  CheckIcon,
  ChevronRightIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';

interface AudioModalProps {
  audioFiles: AudioFile[];
  onSelectAudio: (audioId: string | null, audioStartOffset?: number) => void;
  onClose: () => void;
}

const AudioModal: React.FC<AudioModalProps> = ({
  audioFiles,
  onSelectAudio,
  onClose,
}) => {
  const [selectedAudio, setSelectedAudio] = useState<AudioFile | null>(null);
  const [startOffset, setStartOffset] = useState<number>(0);

  const audioUrls = useSignedUrls('audio', audioFiles.map(a => a.file_path));

  const getAudioUrl = (path: string) => audioUrls[path] || '';

  const handleConfirmSelected = () => {
    if (selectedAudio) {
      onSelectAudio(selectedAudio.id, startOffset);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h3 className="font-bold text-gray-900 text-base">Музыкальное сопровождение</h3>
            <p className="text-xs text-gray-500 mt-0.5">Выберите трек и настройте момент старта музыки</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* No Audio Option */}
          <button
            onClick={() => onSelectAudio(null)}
            className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl border-2 border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-200 transition-colors">
              <XMarkIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 text-sm">Без аудио</p>
              <p className="text-xs text-gray-400">Сохранить ролик с оригинальным звуком видео</p>
            </div>
            <span className="text-xs font-semibold text-gray-400 group-hover:text-gray-600">Выбрать →</span>
          </button>

          {audioFiles.length === 0 ? (
            <div className="text-center py-10 bg-gray-50 rounded-2xl border border-gray-100">
              <MusicalNoteIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-600 mb-1">Нет загруженных аудио</p>
              <p className="text-xs text-gray-400">Загрузите треки в боковом меню в разделе «Аудио»</p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
                Доступные треки ({audioFiles.length})
              </label>

              <div className="space-y-2">
                {audioFiles.map((audio) => {
                  const isSelected = selectedAudio?.id === audio.id;

                  return (
                    <div
                      key={audio.id}
                      className={`rounded-2xl border transition-all overflow-hidden ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50/20 ring-2 ring-brand-500/20 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedAudio(null);
                          } else {
                            setSelectedAudio(audio);
                            setStartOffset(0);
                          }
                        }}
                        className="w-full flex items-center gap-3.5 p-3 text-left transition-colors"
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${
                          isSelected ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600'
                        }`}>
                          <MusicalNoteIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 text-sm truncate">{audio.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Длительность: {Math.floor(audio.duration / 60)}:{(audio.duration % 60).toString().padStart(2, '0')}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {isSelected ? (
                            <span className="text-xs font-bold text-brand-700 bg-brand-100 px-2.5 py-1 rounded-lg flex items-center gap-1">
                              <CheckIcon className="w-3.5 h-3.5" /> Настроен
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-gray-400 hover:text-gray-700">
                              Настроить →
                            </span>
                          )}
                        </div>
                      </button>

                      {/* Interactive Waveform Expanded Picker */}
                      {isSelected && (
                        <div className="p-3 bg-gray-950 rounded-b-2xl border-t border-gray-800 animate-in fade-in duration-150">
                          <AudioWaveformPicker
                            audioUrl={getAudioUrl(audio.file_path)}
                            audioName={audio.name}
                            duration={audio.duration}
                            startOffset={startOffset}
                            onChangeOffset={setStartOffset}
                          />

                          <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between">
                            <span className="text-xs text-gray-400">
                              Музыка начнется с <b className="text-brand-300 font-mono">{startOffset}с</b>
                            </span>
                            <button
                              type="button"
                              onClick={handleConfirmSelected}
                              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-lg active:scale-95"
                            >
                              <CheckIcon className="w-4 h-4" /> Применить и сохранить
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioModal;
