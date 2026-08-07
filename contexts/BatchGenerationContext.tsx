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

  const startGeneration = useCallback(
    async (
      presets: BatchPreset[],
      userId: string,
      templates: VideoTemplate[],
      audioFiles: AudioFile[],
      leadMagnets: LeadMagnet[],
    ) => {
      if (running) return;

      setRunning(true);
      setProgress(null);
      abortRef.current = new AbortController();

      try {
        await runBatchGeneration(
          presets,
          userId,
          templates,
          audioFiles,
          leadMagnets,
          (p) => setProgress(p),
          abortRef.current.signal,
        );
      } catch (e: any) {
        console.error(e);
      } finally {
        setRunning(false);
      }
    },
    [running],
  );

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <BatchGenerationContext.Provider value={{ running, progress, startGeneration, stopGeneration }}>
      {children}
    </BatchGenerationContext.Provider>
  );
};
