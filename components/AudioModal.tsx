import React from 'react';
import { AudioFile } from '../types';
import {
  XMarkIcon,
  MusicalNoteIcon,
} from '@heroicons/react/24/outline';

interface AudioModalProps {
  audioFiles: AudioFile[];
  onSelectAudio: (audioId: string | null) => void;
  onClose: () => void;
}

const AudioModal: React.FC<AudioModalProps> = ({
  audioFiles,
  onSelectAudio,
  onClose,
}) => {
  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Выберите аудио</h3>
            <p className="text-xs text-gray-500 mt-0.5">Добавьте музыку к видео или сохраните без аудио</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <XMarkIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <button
            onClick={() => onSelectAudio(null)}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors mb-3"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
              <XMarkIcon className="w-5 h-5 text-gray-400" />
            </div>
            <div className="text-left">
              <p className="font-medium text-gray-700">Без аудио</p>
              <p className="text-xs text-gray-400">Сохранить с оригинальным звуком</p>
            </div>
          </button>

          {audioFiles.length === 0 ? (
            <div className="text-center py-8">
              <MusicalNoteIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500 mb-1">Нет загруженных аудио</p>
              <p className="text-xs text-gray-400">Загрузите аудио в разделе "Аудио"</p>
            </div>
          ) : (
            <div className="space-y-2">
              {audioFiles.map((audio) => (
                <button
                  key={audio.id}
                  onClick={() => onSelectAudio(audio.id)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-teal-500 hover:bg-teal-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-teal-100 flex items-center justify-center">
                    <MusicalNoteIcon className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-medium text-gray-700 truncate">{audio.name}</p>
                    <p className="text-xs text-gray-400">
                      {Math.floor(audio.duration / 60)}:{(audio.duration % 60).toString().padStart(2, '0')}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioModal;
