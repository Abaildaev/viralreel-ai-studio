/**
 * Modular AI Service Facade
 * All implementations have been refactored into services/ai/ for improved maintainability.
 * Re-exports everything for 100% backward compatibility.
 */

export * from './ai/types';
export * from './ai/prompts';
export * from './ai/geminiClient';
export * from './ai/mockGenerators';
export * from './ai/viralContentGenerator';
