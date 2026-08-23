import { supabase, getSignedUrl } from '../lib/supabase';
import { assertMp4Video, renderVideoWithOverlay } from '../utils/videoRenderer';
import {
  buildReelsCaptionCtaVariant,
  generateCtaOutroCaptions,
  generateCtaOutroCopyVariants,
  generateViralHooks,
} from './geminiService';
import {
  OUTRO_BACKGROUNDS,
  OUTRO_TEXT_POSITIONS,
  OutroPresetId,
  renderVideoWithCtaOutro,
} from '../utils/outroRenderer';
import { decodeAudio } from '../utils/render/media';
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

async function fetchAsFile(url: string, name: string, signal?: AbortSignal): Promise<File> {
  const res = await fetch(url, { signal });
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || 'video/mp4' });
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/*
  The renderer repeats a track that runs out before the Reel does, so a short
  library still works — but a track that covers the whole thing in one pass
  has no seam to hide, and is worth preferring while the library has one.
*/
function pickMusic(audioFiles: AudioFile[], videoDurationSec: number): AudioFile {
  const covering = audioFiles.filter((item) => item.duration >= videoDurationSec);
  return pickRandom(covering.length > 0 ? covering : audioFiles);
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

function captionWithGeneratedCta(
  caption: string,
  keyword: string,
  fallbackIndex = 0,
): string {
  const lines = caption.replace(/\r\n?/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length >= 4 && lines.at(-1)?.includes('#')) {
    /* Keep the AI rewrite when it contains the required keyword and offer.
       The deterministic variant is only a safety net for malformed output. */
    const ctaIndex = lines.length - 2;
    const existingCta = lines[ctaIndex];
    const normalizedKeyword = keyword.trim().toLowerCase().replace(/ё/g, 'е');
    const normalizedCta = existingCta.toLowerCase().replace(/ё/g, 'е');
    const isUsable = normalizedCta.includes(normalizedKeyword)
      && /1000\s*\+/u.test(normalizedCta)
      && normalizedCta.includes('промпт')
      && normalizedCta.includes('визуал');
    lines[ctaIndex] = isUsable
      ? existingCta
      : buildReelsCaptionCtaVariant(keyword, fallbackIndex);
    return lines.join('\n');
  }
  return `${caption.trim()}\n\n${buildReelsCaptionCtaVariant(keyword, fallbackIndex)}`;
}

/*
  Deliveries run beside the renders instead of between them.

  A finished Reel is 20-50 MB; uploading it inside the render loop left the
  encoder idle for the whole transfer, which on a home uplink was often longer
  than the render that produced it. Three at a time is what the Studio's "save
  all" already uses — enough to keep the link busy, few enough that the
  browser does not start queueing them itself.
*/
const MAX_PARALLEL_UPLOADS = 3;

/*
  A delivery gets three attempts.

  Once a render is handed to the pool its blob is the only copy — the encoder
  has already moved on to the next variation and will not produce that exact
  file again. A dropped connection therefore costs a finished Reel, which is
  far more expensive than waiting a second and asking twice.
*/
const UPLOAD_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 700;

async function withRetries<T>(
  label: string,
  attempt: (tryNumber: number) => Promise<T>,
  abortSignal?: AbortSignal,
): Promise<T> {
  let lastError: unknown;
  for (let tryNumber = 1; tryNumber <= UPLOAD_ATTEMPTS; tryNumber++) {
    if (abortSignal?.aborted) break;
    try {
      return await attempt(tryNumber);
    } catch (e) {
      lastError = e;
      if (tryNumber === UPLOAD_ATTEMPTS || abortSignal?.aborted) break;
      console.warn(`${label}: попытка ${tryNumber} не удалась, повторяю`, e);
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * tryNumber));
    }
  }
  if (abortSignal?.aborted) {
    const stopped = new Error('Генерация остановлена');
    stopped.name = 'AbortError';
    throw stopped;
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function createUploadPool() {
  const inFlight = new Set<Promise<void>>();

  return {
    get size() {
      return inFlight.size;
    },
    /* Blocks the render loop only once three uploads are already running. */
    async waitForSlot(): Promise<void> {
      while (inFlight.size >= MAX_PARALLEL_UPLOADS) {
        await Promise.race(inFlight);
      }
    },
    /* Tasks report their own failures. The guard here is what keeps a
       rejection from surfacing out of the race below and ending the run. */
    add(task: () => Promise<void>): void {
      const running = task().catch(() => undefined);
      inFlight.add(running);
      void running.finally(() => inFlight.delete(running));
    },
    async drain(): Promise<void> {
      while (inFlight.size > 0) {
        await Promise.race(inFlight);
      }
    },
  };
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
  const uploads = createUploadPool();

  /*
    A render reports every twenty frames, on every variation, and each report
    is a setState in a context every page consumes. The bar cannot show more
    than a few updates a second anyway, so only a change of phase gets through
    immediately; the rest is sampled.
  */
  const PROGRESS_INTERVAL_MS = 250;
  let lastReportAt = 0;
  let lastReportedStep = '';

  const report = (preset: string, step: string, currentVariationProgress = 0) => {
    const now = performance.now();
    if (step === lastReportedStep && now - lastReportAt < PROGRESS_INTERVAL_MS) return;
    lastReportAt = now;
    lastReportedStep = step;

    const partial = Math.max(0, Math.min(0.99, currentVariationProgress));
    onProgress({
      currentPreset: preset,
      currentStep: step,
      overallProgress: totalVariations > 0
        ? ((completedVariations + partial) / totalVariations) * 100
        : 0,
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
    const ctaOutroEnabled = !!textStyle.ctaOutroEnabled;
    const ctaOnlyMode = ctaOutroEnabled && (!preset.topics || preset.topics.length === 0);

    report(
      presetName,
      ctaOnlyMode
        ? 'Готовлю CTA-концовки...'
        : isAiShowcase
          ? 'Генерирую ИИ-хуки ✨...'
          : 'Выбираю тему...'
    );

    const accountTemplates = allTemplates.filter(
      t => t.is_active && t.instagram_account_id === preset.instagram_account_id
    );
    const selectedSourceTemplate = textStyle.sourceTemplateId
      ? accountTemplates.find((template) => template.id === textStyle.sourceTemplateId)
      : undefined;

    if (accountTemplates.length === 0) {
      errors.push(`"${presetName}": нет подложек для этого аккаунта`);
      completedVariations += preset.variations_count;
      continue;
    }

    if (textStyle.sourceTemplateId && !selectedSourceTemplate) {
      errors.push(`"${presetName}": выбранный исходный Reels недоступен`);
      completedVariations += preset.variations_count;
      report(presetName, 'Исходный Reels не найден');
      continue;
    }

    // A CTA-only preset intentionally leaves the source Reel untouched and
    // generates only the ending plus its Instagram caption.
    if ((!preset.topics || preset.topics.length === 0) && !ctaOnlyMode) {
      errors.push(`"${presetName}": нет тем`);
      completedVariations += preset.variations_count;
      continue;
    }

    const presetLeadMagnet = preset.cta_type === 'codeword'
      ? resolveLeadMagnetForAccount(leadMagnets, preset.instagram_account_id)
      : undefined;

    let hooksData: { hook: string; caption: string }[];
    if (ctaOnlyMode) {
      hooksData = Array.from({ length: preset.variations_count }, () => ({
        hook: '',
        caption: '',
      }));
    } else {
      const topic = pickRandom(preset.topics);
      report(presetName, `Генерирую хуки: "${topic.substring(0, 40)}..."`);
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
    }

    const ctaKeyword = textStyle.ctaOutroKeyword?.trim()
      || presetLeadMagnet?.codeword?.trim()
      || 'ПРОМПТ';
    const ctaOffer = textStyle.ctaOutroOffer?.trim()
      || presetLeadMagnet?.title?.trim()
      || 'Пак готовых промптов';
    const ctaPresetId = (textStyle.ctaOutroPresetId || 'editorial-grid-blue') as OutroPresetId;
    const ctaPreset = OUTRO_BACKGROUNDS.find((item) => item.id === ctaPresetId)
      || OUTRO_BACKGROUNDS[0];

    let ctaCopy: Awaited<ReturnType<typeof generateCtaOutroCopyVariants>> = [];
    let ctaCaptions: string[] = [];
    let ctaBackgroundUrl = '';
    let ctaAudioUrl = '';
    let ctaAudioBuffer: AudioBuffer | null = null;

    if (ctaOutroEnabled) {
      report(presetName, 'ИИ создаёт уникальные CTA-концовки...');
      try {
        const selectedOutroAudio = audioFiles.find(
          (item) => item.id === textStyle.ctaOutroAudioFileId,
        );
        const [copyVariants, captions, backgroundUrl, audioUrl] = await Promise.all([
          generateCtaOutroCopyVariants({
            keyword: ctaKeyword,
            offer: ctaOffer,
            count: hooksData.length,
          }),
          generateCtaOutroCaptions({
            action: 'Пиши',
            keyword: ctaKeyword,
            subtitle: 'и получи подборку в Direct',
            topic: ctaOffer,
            count: hooksData.length,
          }),
          textStyle.ctaOutroBackgroundPath
            ? getSignedUrl('templates', textStyle.ctaOutroBackgroundPath)
            : Promise.resolve(''),
          selectedOutroAudio
            ? getAudioUrl(selectedOutroAudio.file_path)
            : Promise.resolve(''),
        ]);
        ctaCopy = copyVariants;
        ctaCaptions = captions;
        ctaBackgroundUrl = backgroundUrl;
        ctaAudioUrl = audioUrl;
        ctaAudioBuffer = audioUrl ? await decodeAudio(audioUrl) : null;
      } catch (e: any) {
        if (abortSignal?.aborted || e?.name === 'AbortError') break;
        errors.push(`"${presetName}": не удалось подготовить CTA — ${e.message}`);
        completedVariations += preset.variations_count;
        report(presetName, 'Ошибка подготовки CTA');
        continue;
      }
    }

    if (abortSignal?.aborted) break;

    /* A pinned source is reused by the entire batch. Previously every
       variation downloaded the same Reel again before starting its render. */
    let pinnedVideoFile: File | null = null;
    let pinnedSourceAudioBuffer: AudioBuffer | null | undefined;
    if (selectedSourceTemplate) {
      try {
        report(presetName, 'Загружаю исходный Reels один раз...');
        const templateUrl = await getTemplateUrl(selectedSourceTemplate.file_path);
        pinnedVideoFile = await fetchAsFile(templateUrl, 'batch-source.mp4', abortSignal);
        /* Decoded once for the whole batch. Library music is mixed under the
           reference rather than swapped for it, so its own audio — the
           voiceover — is needed whichever audio mode the preset is in. */
        if (ctaOutroEnabled) {
          report(presetName, 'Подготавливаю звук исходного Reels...');
          pinnedSourceAudioBuffer = await decodeAudio(pinnedVideoFile);
        }
      } catch (e: any) {
        if (abortSignal?.aborted || e?.name === 'AbortError') break;
        errors.push(`"${presetName}": не удалось загрузить исходный Reels — ${e.message}`);
        completedVariations += preset.variations_count;
        report(presetName, 'Ошибка загрузки исходного Reels');
        continue;
      }
    }

    if (abortSignal?.aborted) break;

    const presetCompletedStart = completedVariations;
    let nextVariationIndex = 0;
    const renderWorker = async () => {
      while (!abortSignal?.aborted) {
        const i = nextVariationIndex++;
        if (i >= hooksData.length) return;

        const hookData = hooksData[i];
        report(presetName, `Рендерю ${i + 1} из ${hooksData.length}...`);

      try {
        /* New presets pin one source Reel. Random choice remains only as a
           compatibility path for presets saved before this field existed. */
        const template = selectedSourceTemplate || pickRandom(accountTemplates);
        const videoFile = pinnedVideoFile || await (async () => {
          const templateUrl = await getTemplateUrl(template.file_path);
          return fetchAsFile(templateUrl, 'template.mp4', abortSignal);
        })();

        /* Music plays in every mode that asks for it, the card-only one
           included: a reference uploaded with a voiceover and no soundtrack
           is exactly the case that needs a track laid under it. */
        let audioUrl: string | null = null;
        if (preset.audio_mode === 'random' && audioFiles.length > 0) {
          const track = pickMusic(audioFiles, selectedSourceTemplate?.duration || 0);
          audioUrl = await getAudioUrl(track.file_path);
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
          showCarouselBait: ctaOnlyMode ? false : isAiShowcase ? true : textStyle.showCarouselBait,
          carouselBaitPosY: isAiShowcase ? 90 : textStyle.carouselBaitPosY,
        };

        const generatedCta = ctaCopy[i];

        /* One progress line per variation: every path below is a single
           encoder pass now. */
        const reportRenderProgress = (percent: number, status: string) =>
          report(
            presetName,
            `${status} · ролик ${i + 1} из ${hooksData.length}`,
            Math.max(0, Math.min(100, percent)) / 100,
          );

        let renderedBlob: Blob;
        if (generatedCta) {
          /*
            The hook overlay and the card come out of one encode. The old path
            rendered the whole Reel, then fed the finished MP4 back in just to
            append the card — twice the encoding time, and a second generation
            of compression on every frame the viewer actually watches.
          */
          report(
            presetName,
            ctaOnlyMode
              ? `Собираю CTA-концовку ${i + 1} из ${hooksData.length}...`
              : `Рендерю ${i + 1} из ${hooksData.length} вместе с CTA-концовкой...`,
          );
          renderedBlob = await renderVideoWithCtaOutro(videoFile, {
            actionText: generatedCta.actionText,
            keywordText: ctaKeyword,
            subtitleText: generatedCta.subtitleText,
            backgroundStyle: ctaPreset.id,
            customBgUrl: ctaBackgroundUrl || undefined,
            outroDurationSec: textStyle.ctaOutroDurationSec || ctaPreset.defaultDuration,
            keywordFontType: ctaPreset.defaultFontType,
            actionColor: ctaPreset.defaultActionColor,
            keywordColor: ctaPreset.defaultKeywordColor,
            subtitleColor: ctaPreset.defaultSubtitleColor,
            badgeText: ctaPreset.defaultBadgeText,
            showQuotes: ctaPreset.defaultShowQuotes,
            showGrid: ctaPreset.defaultShowGrid,
            showSparkles: ctaPreset.defaultShowSparkles,
            textPosition: OUTRO_TEXT_POSITIONS[i % OUTRO_TEXT_POSITIONS.length],
            /* A CTA-only preset leaves the source Reel untouched; anything
               else draws its hook onto the same frames. */
            overlayVariation: ctaOnlyMode ? undefined : variation,
            mainAudioUrl: audioUrl || undefined,
            sourceAudioBuffer: pinnedSourceAudioBuffer,
            outroSoundUrl: ctaAudioUrl || undefined,
            outroSoundBuffer: ctaAudioBuffer,
            outroSoundVolume: textStyle.ctaOutroSoundVolume ?? 0.9,
            mainAudioVolume: textStyle.musicVolume,
            uniquifierEnabled: textStyle.uniquifierEnabled !== false,
            uniquifierIntensity: textStyle.uniquifierIntensity || 'medium',
            abortSignal,
            onProgress: reportRenderProgress,
          });
          assertMp4Video(renderedBlob);
        } else {
          renderedBlob = await renderVideoWithOverlay(
            videoFile,
            variation,
            audioUrl,
            abortSignal,
            reportRenderProgress,
          );
          assertMp4Video(renderedBlob);
        }

        const finalCaption = ctaOutroEnabled && generatedCta
          ? captionWithGeneratedCta(
              ctaCaptions[i] || hookData.caption,
              ctaKeyword,
              i,
            )
          : hookData.caption;

        if (abortSignal?.aborted) return;

        const finishedBlob = renderedBlob;
        /* The random tail keeps two deliveries that land in the same
           millisecond from claiming one name now that they overlap. */
        const fileName = `${userId}/${Date.now()}_batch_${i}_${Math.random().toString(36).slice(2, 8)}.mp4`;

        await uploads.waitForSlot();
        uploads.add(async () => {
          try {
            await withRetries('Загрузка видео', async () => {
              /* Upsert so a retry after a half-finished upload overwrites its
                 own leftovers instead of colliding with them. The name carries
                 a random tail, so it can collide with nothing else. */
              const { error: uploadErr } = await supabase.storage
                .from('reels')
                .upload(fileName, finishedBlob, {
                  contentType: finishedBlob.type,
                  upsert: true,
                });
              if (uploadErr) throw uploadErr;
            }, abortSignal);

            if (abortSignal?.aborted) {
              await supabase.storage.from('reels').remove([fileName]);
              return;
            }

            await withRetries('Запись в планировщик', async (tryNumber) => {
              /* A retry must not leave two drafts behind: the row may have
                 landed even though the response never came back. The first
                 attempt cannot have, so it skips the lookup. */
              if (tryNumber > 1) {
                const { data: existing } = await supabase
                  .from('scheduled_posts')
                  .select('id')
                  .eq('video_path', fileName)
                  .limit(1);
                if (existing && existing.length > 0) return;
              }

              const { error: insertErr } = await supabase
                .from('scheduled_posts')
                .insert({
                  user_id: userId,
                  instagram_account_id: preset.instagram_account_id,
                  video_path: fileName,
                  caption: finalCaption,
                  hook_text: hookData.hook,
                  font_settings: {
                    font: textStyle.font,
                    fontSize: textStyle.fontSize,
                    fontWeight: textStyle.fontWeight,
                    textAlign: textStyle.textAlign,
                    ...(generatedCta ? {
                      ctaOutro: {
                        actionText: generatedCta.actionText,
                        keywordText: ctaKeyword,
                        subtitleText: generatedCta.subtitleText,
                        presetId: ctaPreset.id,
                        textPosition: OUTRO_TEXT_POSITIONS[i % OUTRO_TEXT_POSITIONS.length],
                      },
                    } : {}),
                  },
                  status: 'draft',
                });
              if (insertErr) throw insertErr;
            }, abortSignal);
          } catch (e: any) {
            /* The render itself succeeded, so this is reported as a delivery
               failure rather than losing the variation silently. */
            if (abortSignal?.aborted || e?.name === 'AbortError') return;
            errors.push(`"${presetName}" #${i + 1}: не удалось сохранить — ${e.message}`);
          }
        });
      } catch (e: any) {
        if (abortSignal?.aborted || e?.name === 'AbortError') return;
        errors.push(`"${presetName}" #${i + 1}: ${e.message}`);
      }

        completedVariations++;
        report(
          presetName,
          `Готово ${completedVariations - presetCompletedStart} из ${hooksData.length}`,
        );
      }
    };

    /* Browser H.264 encoders are not reliably concurrent. A second encoder
       made both jobs slower and could drop frames near the end of the source. */
    await renderWorker();
  }

  /* Rendering is done; the last few deliveries may still be in the air. A
     stopped run waits here too, so its cleanup finishes before the caller
     treats the batch as closed. */
  if (uploads.size > 0) {
    report(
      abortSignal?.aborted ? 'Остановлено' : 'Завершение',
      'Догружаю готовые ролики в планировщик...',
    );
    await uploads.drain();
  }

  if (abortSignal?.aborted) {
    onProgress({
      currentPreset: 'Остановлено',
      currentStep: 'Генерация остановлена',
      overallProgress: totalVariations > 0
        ? (completedVariations / totalVariations) * 100
        : 0,
      completed: completedVariations,
      total: totalVariations,
      errors: [...errors],
    });
    return;
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
