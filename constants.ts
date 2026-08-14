import React from 'react';
import { FontFamily, FontWeight, BgStyle } from './types';
import {
  NoSymbolIcon,
  Square2StackIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';

export const fontOptions: { label: string; value: FontFamily }[] = [
  { label: 'Roboto', value: 'Roboto' },
  { label: 'Gen Shin Gothic', value: 'GenShinGothic' },
  { label: 'Open Serif', value: 'OpenSerif' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Inter', value: 'Inter' },
  { label: 'Merriweather', value: 'Merriweather' },
];

export const fontSizeOptions = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36];

export const fontWeightOptions: { label: string; value: FontWeight }[] = [
  { label: 'Тонкий', value: '100' },
  { label: 'Легкий', value: '300' },
  { label: 'Обычный', value: '400' },
  { label: 'Средний', value: '500' },
  { label: 'Полужирный', value: '600' },
  { label: 'Жирный', value: '700' },
  { label: 'Очень жирный', value: '800' },
  { label: 'Черный', value: '900' },
];

export const bgOptions: { id: BgStyle; icon: React.ReactNode; label: string }[] = [
  { id: 'none', icon: React.createElement(NoSymbolIcon, { className: 'w-4 h-4' }), label: 'Нет' },
  { id: 'ai-showcase', icon: React.createElement('span', { style: { fontSize: '14px', lineHeight: 1 } }, '🤖'), label: 'AI Темный' },
  { id: 'white-badge', icon: React.createElement('span', { style: { fontSize: '14px', lineHeight: 1 } }, '⚪'), label: 'Белая плашка' },
  { id: 'glass', icon: React.createElement(Square2StackIcon, { className: 'w-4 h-4' }), label: 'Стекло' },
  { id: 'solid-black', icon: React.createElement(MoonIcon, { className: 'w-4 h-4' }), label: 'Темный' },
  { id: 'solid-white', icon: React.createElement(SunIcon, { className: 'w-4 h-4' }), label: 'Светлый' },
  { id: 'quote-white', icon: React.createElement('span', { style: { fontSize: '14px', fontWeight: 800, lineHeight: 1 } }, '"'), label: 'Цитата' },
];

export const toneOptions = [
  { value: 'Provokacionnyj', label: 'Провокационный' },
  { value: 'Obrazovatelnyj', label: 'Образовательный' },
  { value: 'Prodajushchij', label: 'Продающий' },
];
