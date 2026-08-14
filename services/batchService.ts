import { supabase, getSignedUrl } from '../lib/supabase';
import { assertMp4Video, renderVideoWithOverlay } from '../utils/videoRenderer';
import { generateViralHooks } from './geminiService';
import {
  VideoTemplate,
  AudioFile,
  BatchPreset,
  ViralVariation,
  LeadMagnet,
  LeadMagnetInfo,
  TextStylePreset,
} from '../types';

export interface BatchProgress {
  currentPreset: string;
  currentStep: string;
  overallProgress: number;
  completed: number;
  total: number;
  errors: string[];
}

type ProgressCallback = (progress: BatchProgress) => void;

const DEFAULT_TEXT_STYLE: TextStylePreset = {
  font: 'GenShinGothic',
  fontSize: 13,
  fontWeight: '300',
  textAlign: 'left',
  textShadow: true,
  bgStyle: 'none',
  bgOpacity: 80,
  posX: 50,
  posY: 20,
  videoScale: 1.0,
  videoPanX: 0,
  videoPanY: 0,
  showCarouselBait: true,
  carouselBaitPosY: 90,
  aiModel: 'none',
};

async function getTemplateUrl(path: string): Promise<string> {
  return getSignedUrl('templates', path);
}

async function getAudioUrl(path: string): Promise<string> {
  return getSignedUrl('audio', path);
}

async function fetchAsFile(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || 'video/mp4' });
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function resolveTextStyle(preset: BatchPreset): TextStylePreset {
  const saved = preset.text_style;
  if (!saved || !saved.font) return DEFAULT_TEXT_STYLE;
  return { ...DEFAULT_TEXT_STYLE, ...saved };
}

function resolveLeadMagnetForAccount(
  magnets: LeadMagnet[],
  accountId: string | null
): LeadMagnetInfo | undefined {
  if (magnets.length === 0) return undefined;
  const forAccount = magnets.find(m => m.instagram_account_id === accountId);
  const fallback = magnets.find(m => m.instagram_account_id === null);
  const chosen = forAccount ?? fallback;
  if (!chosen) return undefined;
  return { id: chosen.id, title: chosen.title, description: chosen.description, codeword: chosen.codeword };
}

export async function runBatchGeneration(
  presets: BatchPreset[],
  userId: string,
  allTemplates: VideoTemplate[],
  audioFiles: AudioFile[],
  leadMagnets: LeadMagnet[],
  onProgress: ProgressCallback,
  abortSignal?: AbortSignal
): Promise<void> {
  const totalVariations = presets.reduce((sum, p) => sum + p.variations_count, 0);
  let completedVariations = 0;
  const errors: string[] = [];

  const report = (preset: string, step: string) => {
    onProgress({
      currentPreset: preset,
      currentStep: step,
      overallProgress: totalVariations > 0 ? (completedVariations / totalVariations) * 100 : 0,
      completed: completedVariations,
      total: totalVariations,
      errors: [...errors],
    });
  };

  for (const preset of presets) {
    if (abortSignal?.aborted) break;

    const presetName = preset.name || 'Без имени';
    const textStyle = resolveTextStyle(preset);
    const isAiShowcase = textStyle.presetType === 'ai_showcase';

    report(
      presetName,
      isAiShowcase ? 'Генерирую ИИ-хуки ✨...' : 'Выбираю тему...'
    );

    const accountTemplates = allTemplates.filter(
      t => t.is_active && t.instagram_account_id === preset.instagram_account_id
    );

    if (accountTemplates.length === 0) {
      errors.push(`"${presetName}": нет подложек для этого аккаунта`);
      completedVariations += preset.variations_count;
      continue;
    }

    // ─── Standard Reels path ───
    if (!preset.topics || preset.topics.length === 0) {
      errors.push(`"${presetName}": нет тем`);
      completedVariations += preset.variations_count;
      continue;
    }

    const topic = pickRandom(preset.topics);
    report(presetName, `Генерирую хуки: "${topic.substring(0, 40)}..."`);

    const presetLeadMagnet = preset.cta_type === 'codeword'
      ? resolveLeadMagnetForAccount(leadMagnets, preset.instagram_account_id)
      : undefined;

    let hooksData: { hook: string; caption: string }[];
    try {
      const lm = presetLeadMagnet;
      const result = await generateViralHooks(
        topic,
        preset.variations_count,
        preset.tone || 'Provokacionnyj',
        preset.cta_type || 'instagram',
        lm
      );
      hooksData = result.variations;
    } catch (e: any) {
      errors.push(`"${presetName}": ${e.message}`);
      completedVariations += preset.variations_count;
      report(presetName, 'Ошибка генерации');
      continue;
    }

    for (let i = 0; i < hooksData.length; i++) {
      if (abortSignal?.aborted) break;

      const hookData = hooksData[i];
      report(presetName, `Рендерю ${i + 1} из ${hooksData.length}...`);

      try {
        const template = pickRandom(accountTemplates);
        const templateUrl = await getTemplateUrl(template.file_path);
        const videoFile = await fetchAsFile(templateUrl, 'template.mp4');

        let audioUrl: string | null = null;
        if (preset.audio_mode === 'random' && audioFiles.length > 0) {
          audioUrl = await getAudioUrl(pickRandom(audioFiles).file_path);
        } else if (preset.audio_mode === 'specific' && preset.audio_file_id) {
          const af = audioFiles.find(a => a.id === preset.audio_file_id);
          if (af) audioUrl = await getAudioUrl(af.file_path);
        }

        const variation: ViralVariation = {
          id: `batch_${Date.now()}_${i}`,
          hookText: hookData.hook,
          captionText: hookData.caption,
          status: 'pending',
          ...textStyle,
          bgStyle: isAiShowcase
            ? 'ai-showcase'
            : textStyle.bgStyle === 'ai-showcase'
              ? 'none'
              : textStyle.bgStyle,
          aiModel: isAiShowcase ? (textStyle.aiModel || 'claude') : 'none',
          font: isAiShowcase ? (textStyle.font || 'GenShinGothic') : textStyle.font,
          fontSize: isAiShowcase ? (textStyle.fontSize || 13) : textStyle.fontSize,
          fontWeight: isAiShowcase ? (textStyle.fontWeight || '300') : textStyle.fontWeight,
          textAlign: isAiShowcase ? 'left' : textStyle.textAlign,
          posY: isAiShowcase ? 18 : textStyle.posY,
          textRotation: isAiShowcase ? (textStyle.textRotation ?? -4) : textStyle.textRotation,
          showCarouselBait: isAiShowcase ? true : textStyle.showCarouselBait,
          carouselBaitPosY: isAiShowcase ? 90 : textStyle.carouselBaitPosY,
        };

        const renderedBlob = await renderVideoWithOverlay(videoFile, variation, audioUrl);
        assertMp4Video(renderedBlob);

        const fileName = `${userId}/${Date.now()}_batch_${i}.mp4`;
        const { error: uploadErr } = await supabase.storage
          .from('reels')
          .upload(fileName, renderedBlob, { contentType: renderedBlob.type });
        if (uploadErr) throw uploadErr;

        const { error: insertErr } = await supabase
          .from('scheduled_posts')
          .insert({
            user_id: userId,
            instagram_account_id: preset.instagram_account_id,
            video_path: fileName,
            caption: hookData.caption,
            hook_text: hookData.hook,
            font_settings: {
              font: textStyle.font,
              fontSize: textStyle.fontSize,
              fontWeight: textStyle.fontWeight,
              textAlign: textStyle.textAlign,
            },
            status: 'draft',
          });
        if (insertErr) throw insertErr;
      } catch (e: any) {
        errors.push(`"${presetName}" #${i + 1}: ${e.message}`);
      }

      completedVariations++;
      report(presetName, `Готово ${i + 1} из ${hooksData.length}`);
    }
  }

  onProgress({
    currentPreset: 'Завершено',
    currentStep: errors.length > 0
      ? `Готово с ${errors.length} ошибками`
      : 'Все видео готовы!',
    overallProgress: 100,
    completed: totalVariations,
    total: totalVariations,
    errors: [...errors],
  });
}
