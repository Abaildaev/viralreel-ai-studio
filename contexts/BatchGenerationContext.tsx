import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { BatchProgress, runBatchGeneration } from '../services/batchService';
import {
  BatchPreset,
  VideoTemplate,
  AudioFile,
  LeadMagnet,
} from '../types';

interface BatchGenerationState {
  running: boolean;
  progress: BatchProgress | null;
  startGeneration: (
    presets: BatchPreset[],
    userId: string,
    templates: VideoTemplate[],
    audioFiles: AudioFile[],
    leadMagnets: LeadMagnet[],
  ) => void;
  stopGeneration: () => void;
}

const BatchGenerationContext = createContext<BatchGenerationState | null>(null);

export const useBatchGeneration = () => {
  const ctx = useContext(BatchGenerationContext);
  if (!ctx) throw new Error('useBatchGeneration must be used within BatchGenerationProvider');
  return ctx;
};

export const BatchGenerationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationIdRef = useRef(0);

  const startGeneration = useCallback(
    async (
      presets: BatchPreset[],
      userId: string,
      templates: VideoTemplate[],
      audioFiles: AudioFile[],
      leadMagnets: LeadMagnet[],
    ) => {
      if (running) return;

      const generationId = ++generationIdRef.current;
      const controller = new AbortController();
      setRunning(true);
      setProgress(null);
      abortRef.current = controller;

      try {
        await runBatchGeneration(
          presets,
          userId,
          templates,
          audioFiles,
          leadMagnets,
          (p) => {
            if (generationIdRef.current === generationId) setProgress(p);
          },
          controller.signal,
        );
      } catch (e: any) {
        if (e?.name !== 'AbortError') console.error(e);
      } finally {
        if (generationIdRef.current === generationId) {
          abortRef.current = null;
          setRunning(false);
        }
      }
    },
    [running],
  );

  const stopGeneration = useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    abortRef.current = null;
    generationIdRef.current += 1;
    setRunning(false);
    setProgress((current) => current ? {
      ...current,
      currentPreset: 'Остановлено',
      currentStep: 'Генерация остановлена. Можно запустить заново.',
    } : null);
  }, []);

  return (
    <BatchGenerationContext.Provider value={{ running, progress, startGeneration, stopGeneration }}>
      {children}
    </BatchGenerationContext.Provider>
  );
};
