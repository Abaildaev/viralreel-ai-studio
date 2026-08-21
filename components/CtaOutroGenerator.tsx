import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  SparklesIcon,
  CloudArrowUpIcon,
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  FilmIcon,
  CheckCircleIcon,
  PlayIcon,
  PauseIcon,
  MusicalNoteIcon,
  ArrowPathIcon,
  SquaresPlusIcon,
} from '@heroicons/react/24/outline';
import { Button, Card, Input, Badge } from './ui';
import { useAccount } from '../contexts/AccountContext';
import {
  buildCtaOutroCaption,
  CTA_OUTRO_SUBTITLE,
  generateCtaOutroCaptions,
  REELS_PROMPT_PACK_OFFER,
} from '../services/geminiService';
import { supabase } from '../lib/supabase';
import {
  OUTRO_BACKGROUNDS,
  OUTRO_SOUNDS,
  OUTRO_TEXT_POSITIONS,
  OutroPresetId,
  OutroRenderOptions,
  OutroTextPosition,
  drawOutroFrame,
  outroBackgroundUrl,
  renderVideoWithCtaOutro,
  isOutroTimedToSound,
  resolveOutroDuration,
} from '../utils/outroRenderer';
import { decodeAudio } from '../utils/render/media';
import { ensureRenderFontsLoaded } from '../utils/renderFonts';

/* Preview backgrounds are the same handful of files over and over; loading
   them once keeps a tweak of the keyword from re-decoding a jpg. */
const previewImageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadPreviewImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  const cached = previewImageCache.get(url);
  if (cached) return cached;

  const pending = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
  previewImageCache.set(url, pending);
  return pending;
}

/*
  Preset thumbnails are drawn by the renderer itself, at the settled frame.
  A stored jpg drifts away from what the card actually looks like — the first
  version of this picker showed a screenshot with a grid baked into it.
*/
/* One finished MP4 plus the caption the AI wrote for it. Each render reseeds
   the uniquifier, so a batch of ten is ten different files. */
interface OutroResult {
  id: string;
  blob: Blob;
  url: string;
  caption: string;
  textPosition: OutroTextPosition;
  savedPath?: string;
}

interface AutomationRuleOption {
  id: string;
  title: string;
  description: string;
  codeword: string;
  keywords: string[];
}

const BATCH_OPTIONS = [1, 2, 4, 6, 8, 10];

const PresetThumb: React.FC<{ preset: (typeof OUTRO_BACKGROUNDS)[number] }> = ({ preset }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    (async () => {
      await ensureRenderFontsLoaded().catch(() => undefined);
      if (cancelled) return;
      drawOutroFrame(
        ctx,
        {
          actionText: preset.defaultActionText,
          keywordText: preset.id === 'modern-violet' ? 'промпт' : 'стиль',
          subtitleText: preset.defaultSubtitleText,
          badgeText: preset.defaultBadgeText,
          backgroundStyle: preset.id,
          outroDurationSec: preset.defaultDuration,
          keywordFontType: preset.defaultFontType,
          actionColor: preset.defaultActionColor,
          keywordColor: preset.defaultKeywordColor,
          subtitleColor: preset.defaultSubtitleColor,
          showQuotes: preset.defaultShowQuotes,
          showGrid: preset.defaultShowGrid,
          showSparkles: preset.defaultShowSparkles,
        },
        null,
        canvas.width,
        canvas.height,
      );
    })();

    return () => { cancelled = true; };
  }, [preset]);

  return (
    <canvas
      ref={ref}
      width={216}
      height={384}
      className="h-24 w-full object-cover"
      style={{ backgroundColor: preset.previewColor }}
    />
  );
};

export const CtaOutroGenerator: React.FC = () => {
  const { selectedAccount } = useAccount();

  // Video State
  const [sourceVideoFile, setSourceVideoFile] = useState<File | null>(null);
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const customBgInputRef = useRef<HTMLInputElement>(null);

  // The user chooses the message and a complete style. Typography, palette,
  // decorative elements and timing belong to the preset; the three copy
  // fields below stay editable so the CTA can match the actual offer.
  const [keywordText, setKeywordText] = useState('стиль');
  const [actionText, setActionText] = useState<string>(OUTRO_BACKGROUNDS[0].defaultActionText);
  const [subtitleText, setSubtitleText] = useState<string>(CTA_OUTRO_SUBTITLE);
  const [backgroundStyle, setBackgroundStyle] = useState<OutroPresetId>('editorial-grid-blue');
  const [customBgUrl, setCustomBgUrl] = useState<string>('');

  // Outro Sound State
  const [outroSoundUrl, setOutroSoundUrl] = useState('');
  const [outroSoundDuration, setOutroSoundDuration] = useState(0);
  const [outroSoundName, setOutroSoundName] = useState('');
  const outroSoundVolume = 0.9;
  const [isAuditioning, setIsAuditioning] = useState(false);
  const [soundError, setSoundError] = useState<string | null>(null);
  const outroSoundInputRef = useRef<HTMLInputElement>(null);
  const uploadedSoundUrlRef = useRef<string>('');
  const auditionRef = useRef<HTMLAudioElement | null>(null);
  const customBgUrlRef = useRef('');

  // Preview & Render state
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [previewTab, setPreviewTab] = useState<'outro' | 'video'>('outro');
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatus, setRenderStatus] = useState('');
  const [results, setResults] = useState<OutroResult[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const resultsRef = useRef<OutroResult[]>([]);

  // Batch & AI captions
  const [batchCount, setBatchCount] = useState(1);
  const [aiTopic, setAiTopic] = useState(REELS_PROMPT_PACK_OFFER);
  const [brandTag, setBrandTag] = useState('');
  const [automationRules, setAutomationRules] = useState<AutomationRuleOption[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState('');
  const [isWritingCaptions, setIsWritingCaptions] = useState(false);
  /* The AI runs on the user's own DeepSeek key; without one the generator
     silently returns a template, which is worth saying out loud. */
  const hasAiKey =
    typeof window !== 'undefined' && !!localStorage.getItem('deepseek_api_key');

  const primaryResult = results[0] || null;
  const renderedVideoUrl = primaryResult?.url ?? null;

  const applyAutomationRule = (rule: AutomationRuleOption) => {
    setSelectedRuleId(rule.id);
    const keywords = Array.isArray(rule.keywords) ? rule.keywords : [];
    const primaryKeyword = keywords.find((keyword) => keyword.trim()) || rule.codeword;
    if (primaryKeyword.trim()) setKeywordText(primaryKeyword.trim());
    const funnelOffer = [rule.title, rule.description].filter(Boolean).join(' — ');
    const promptOffer = /промпт|промт/i.test(`${primaryKeyword} ${funnelOffer}`)
      ? REELS_PROMPT_PACK_OFFER
      : funnelOffer || REELS_PROMPT_PACK_OFFER;
    setAiTopic(promptOffer);
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let query = supabase
        .from('lead_magnets')
        .select('id,title,description,codeword,keywords')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      query = selectedAccount
        ? query.or(`instagram_account_id.eq.${selectedAccount.id},instagram_account_id.is.null`)
        : query.is('instagram_account_id', null);

      const { data, error } = await query;
      if (cancelled || error) return;

      const rules = (data ?? []).map((row) => {
        const item = row as unknown as AutomationRuleOption;
        return {
          ...item,
          keywords: Array.isArray(item.keywords) && item.keywords.length
            ? item.keywords
            : [item.codeword],
        };
      });
      setAutomationRules(rules);
      const first = rules[0];
      if (first) applyAutomationRule(first);
      else setSelectedRuleId('');
    })();

    return () => { cancelled = true; };
  }, [selectedAccount?.id]);

  // Switch Preset Handler
  const handlePresetSelect = (bg: (typeof OUTRO_BACKGROUNDS)[number]) => {
    setBackgroundStyle(bg.id);
    setActionText(bg.defaultActionText);
    setSubtitleText(CTA_OUTRO_SUBTITLE);
  };

  // Typography and palette belong to the selected preset. They are deliberately
  // not exposed as per-video controls: changing them would break the visual
  // identity of the style card. Copy remains user-editable below.
  const activePreset = OUTRO_BACKGROUNDS.find((preset) => preset.id === backgroundStyle)
    ?? OUTRO_BACKGROUNDS[0];
  const selectedAutomationRule = automationRules.find((rule) => rule.id === selectedRuleId);
  const selectedAutomationKeywords = selectedAutomationRule
    ? (Array.isArray(selectedAutomationRule.keywords) && selectedAutomationRule.keywords.length
      ? selectedAutomationRule.keywords
      : [selectedAutomationRule.codeword])
    : [];
  /* The card lasts as long as its sting, so the number shown next to the
     preset has to follow the track rather than the preset default. */
  const outroTimedToSound = isOutroTimedToSound(outroSoundDuration);
  const outroDurationSec = resolveOutroDuration(
    activePreset.defaultDuration,
    outroSoundDuration,
  );
  const badgeText = brandTag.trim()
    ? `#${brandTag.trim().replace(/^#+/, '').replace(/\s+/g, '')}`
    : activePreset.defaultBadgeText;

  const acceptSourceVideo = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setErrorMsg('Выберите видеофайл MP4, MOV или WEBM.');
      return;
    }

    setSourceVideoFile(file);
    if (sourceVideoUrl) URL.revokeObjectURL(sourceVideoUrl);
    const url = URL.createObjectURL(file);
    setSourceVideoUrl(url);
    clearResults();

    const tempVideo = document.createElement('video');
    tempVideo.src = url;
    tempVideo.onloadedmetadata = () => {
      setVideoDuration(tempVideo.duration || 0);
    };
  };

  // Video File upload handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptSourceVideo(e.target.files?.[0]);
  };

  // Custom Outro Background Upload
  const handleCustomBgSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (customBgUrlRef.current) URL.revokeObjectURL(customBgUrlRef.current);
    const url = URL.createObjectURL(file);
    customBgUrlRef.current = url;
    setCustomBgUrl(url);
    setBackgroundStyle('custom');
  };

  // Outro sound: preset from the library, or a file the user drops in
  const handleOutroSoundSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const looksLikeAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|oga|webm)$/i.test(file.name);
    if (!looksLikeAudio) {
      setSoundError('Выберите аудиофайл MP3, WAV, M4A, AAC или OGG.');
      return;
    }
    if (uploadedSoundUrlRef.current) URL.revokeObjectURL(uploadedSoundUrlRef.current);
    const url = URL.createObjectURL(file);
    uploadedSoundUrlRef.current = url;
        setOutroSoundUrl(url);
        setOutroSoundName(file.name);
        setSoundError(null);
    setIsAuditioning(false);
    auditionRef.current?.pause();
  };

  const handleAudition = () => {
    if (!outroSoundUrl) return;
    if (!auditionRef.current || auditionRef.current.src !== outroSoundUrl) {
      auditionRef.current?.pause();
      auditionRef.current = new Audio(outroSoundUrl);
      auditionRef.current.onended = () => setIsAuditioning(false);
    }
    const audio = auditionRef.current;
    audio.volume = outroSoundVolume;
    if (audio.paused) {
      audio.currentTime = 0;
      audio.play()
        .then(() => {
          setSoundError(null);
          setIsAuditioning(true);
        })
        .catch(() => {
          setIsAuditioning(false);
          setSoundError('Не удалось прослушать файл. Используйте MP3 или WAV.');
        });
    } else {
      audio.pause();
      setIsAuditioning(false);
    }
  };

  const outroOptions = useMemo<OutroRenderOptions>(() => ({
    actionText,
    keywordText,
    subtitleText,
    backgroundStyle,
    customBgUrl,
    outroDurationSec,
    keywordFontType: activePreset.defaultFontType,
    actionColor: activePreset.defaultActionColor,
    keywordColor: activePreset.defaultKeywordColor,
    subtitleColor: activePreset.defaultSubtitleColor,
    showQuotes: activePreset.defaultShowQuotes,
    showGrid: activePreset.defaultShowGrid,
    showSparkles: activePreset.defaultShowSparkles,
    badgeText,
  }), [
    actionText,
    keywordText,
    subtitleText,
    backgroundStyle,
    customBgUrl,
    outroDurationSec,
    activePreset,
    badgeText,
  ]);

  /* The loop reads the settings through a ref so that typing in the keyword
     field updates the frame instead of restarting the animation. */
  const outroOptionsRef = useRef(outroOptions);
  outroOptionsRef.current = outroOptions;

  const previewStartRef = useRef(0);
  const replayPreview = () => {
    previewStartRef.current = performance.now();
  };

  const previewBgUrl = outroBackgroundUrl(outroOptions);

  // Play the outro card on a loop so its animation, not just its layout, is visible
  useEffect(() => {
    if (previewTab !== 'outro') return;

    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    let raf = 0;
    let bgImage: HTMLImageElement | null = null;

    const loop = () => {
      if (cancelled) return;
      const options = outroOptionsRef.current;
      const cycle = options.outroDurationSec + 1.2;
      const elapsed = ((performance.now() - previewStartRef.current) / 1000) % cycle;
      drawOutroFrame(ctx, options, bgImage, canvas.width, canvas.height, elapsed);
      raf = requestAnimationFrame(loop);
    };

    (async () => {
      // Without this the preview draws the fallback face and never redraws
      await ensureRenderFontsLoaded().catch(() => undefined);
      bgImage = await loadPreviewImage(previewBgUrl);
      if (cancelled) return;
      previewStartRef.current = performance.now();
      loop();
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [previewTab, previewBgUrl]);

  /* Reading the track's length is what lets the card end on its last beat.
     Metadata is enough — the samples are decoded once, at render time. */
  useEffect(() => {
    if (!outroSoundUrl) {
      setOutroSoundDuration(0);
      return;
    }

    let cancelled = false;
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      if (cancelled) return;
      setOutroSoundDuration(Number.isFinite(probe.duration) ? probe.duration : 0);
    };
    probe.onerror = () => {
      if (!cancelled) setOutroSoundDuration(0);
    };
    probe.src = outroSoundUrl;

    return () => {
      cancelled = true;
      probe.src = '';
    };
  }, [outroSoundUrl]);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  // Revoke only the previous source URL when a new source is selected. Result
  // URLs belong to the result cards and must stay alive until they are cleared.
  useEffect(() => () => {
    if (sourceVideoUrl) URL.revokeObjectURL(sourceVideoUrl);
  }, [sourceVideoUrl]);

  // Object URLs outlive the component unless they are handed back.
  useEffect(() => () => {
    resultsRef.current.forEach((result) => URL.revokeObjectURL(result.url));
    if (customBgUrlRef.current) URL.revokeObjectURL(customBgUrlRef.current);
    if (uploadedSoundUrlRef.current) URL.revokeObjectURL(uploadedSoundUrlRef.current);
    auditionRef.current?.pause();
  }, []);

  const clearResults = () => {
    results.forEach((r) => URL.revokeObjectURL(r.url));
    setResults([]);
    setNotice(null);
    setErrorMsg(null);
  };

  /* The caption is the card, written out: same call to action, same code word,
     then a hashtag line. The model only varies the wording — the shape is
     fixed, so a batch never comes back as ten essays. */
  const captionRequest = {
    action: actionText,
    keyword: keywordText,
    subtitle: subtitleText,
    brandTag,
    topic: aiTopic,
    count: 1,
  };

  const fallbackCaption = buildCtaOutroCaption(captionRequest, 0);

  const writeCaptions = async (count: number): Promise<string[]> =>
    generateCtaOutroCaptions({ ...captionRequest, count });

  // Start Render — one pass per requested video, each with its own uniquifier
  const handleStartRender = async () => {
    if (!sourceVideoFile) {
      setErrorMsg('Сначала загрузите исходное видео.');
      return;
    }
    if (!keywordText.trim()) {
      setErrorMsg('Укажите кодовое слово для призыва.');
      return;
    }

    const total = batchCount;
    setIsRendering(true);
    setErrorMsg(null);
    setNotice(null);
    setRenderProgress(0);
    clearResults();

    let captions: string[] = [];
    setRenderStatus(hasAiKey ? 'ИИ пишет описания...' : 'Собираю описания...');
    setIsWritingCaptions(true);
    try {
      captions = await writeCaptions(total);
    } catch (err) {
      console.warn('Caption generation failed, using the built-in pattern', err);
    } finally {
      setIsWritingCaptions(false);
    }

    try {
      setRenderStatus('Подготавливаю видео и звук один раз для всей пачки...');
      const [sourceAudioBuffer, outroSoundBuffer] = await Promise.all([
        decodeAudio(sourceVideoFile),
        outroSoundUrl ? decodeAudio(outroSoundUrl) : Promise.resolve(null),
      ]);
      if (outroSoundUrl && !outroSoundBuffer) {
        throw new Error('Не удалось прочитать дополнительный звук. Попробуйте MP3 или WAV.');
      }

      const layoutStartIndex = Math.floor(Math.random() * OUTRO_TEXT_POSITIONS.length);
      for (let i = 0; i < total; i++) {
        const textPosition = OUTRO_TEXT_POSITIONS[(layoutStartIndex + i) % OUTRO_TEXT_POSITIONS.length];
        const options: OutroRenderOptions = {
          ...outroOptions,
          textPosition,
          outroSoundUrl: outroSoundUrl || undefined,
          outroSoundVolume,
          sourceAudioBuffer,
          outroSoundBuffer,
          uniquifierEnabled: true,
          uniquifierIntensity: total > 1 ? 'high' : 'medium',
          onProgress: (pct, msg) => {
            setRenderProgress(Math.round(((i + pct / 100) / total) * 100));
            setRenderStatus(total > 1 ? `Видео ${i + 1} из ${total}: ${msg}` : msg);
          },
        };

        const blob = await renderVideoWithCtaOutro(sourceVideoFile, options);
        const result: OutroResult = {
          id: `${Date.now()}_${i}`,
          blob,
          url: URL.createObjectURL(blob),
          caption: captions[i] || buildCtaOutroCaption(captionRequest, i) || fallbackCaption,
          textPosition,
        };
        // Appended as they land, so a batch of ten is watchable rather than a wait
        setResults((prev) => [...prev, result]);
        setPreviewTab('video');
      }

      setRenderProgress(100);
      setRenderStatus(total > 1 ? `Готово: ${total} уникальных видео` : 'Видео готово');
    } catch (err: any) {
      console.error('Render error:', err);
      setErrorMsg('Ошибка при рендере: ' + (err?.message || err));
    } finally {
      setIsRendering(false);
    }
  };

  const downloadResult = (result: OutroResult, index: number) => {
    const slug = keywordText.toLowerCase().replace(/[^a-z0-9а-яё]/gi, '_') || 'outro';
    const a = document.createElement('a');
    a.href = result.url;
    a.download = `reels_cta_${slug}${results.length > 1 ? `_${index + 1}` : ''}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const persistResultToScheduler = async (result: OutroResult, userId: string) => {
    const safeKeyword = keywordText.trim().replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30) || 'outro';
    /* Include the result id so parallel uploads can never overwrite one another. */
    const fileName = `${userId}/${Date.now()}_${result.id}_cta_${safeKeyword}.mp4`;
    const { error: uploadError } = await supabase.storage
      .from('reels')
      .upload(fileName, result.blob, { contentType: 'video/mp4' });
    if (uploadError) throw uploadError;

    const { error: insertError } = await supabase.from('scheduled_posts').insert({
      user_id: userId,
      instagram_account_id: selectedAccount?.id || null,
      /* The storage path, not a public URL: everything downstream signs it
         and deletes by it. */
      video_path: fileName,
      caption: result.caption,
      hook_text: `${actionText} "${keywordText}"`,
      font_settings: {
        actionText,
        keywordText,
        backgroundStyle,
        outroDurationSec,
        textPosition: result.textPosition,
      },
      status: 'draft',
      scheduled_at: null,
    });
    if (insertError) throw insertError;
    return fileName;
  };

  const saveResultToScheduler = async (result: OutroResult) => {
    if (result.savedPath) return;
    setSavingId(result.id);
    setErrorMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Пожалуйста, авторизуйтесь');

      const fileName = await persistResultToScheduler(result, user.id);
      setResults((prev) =>
        prev.map((r) => (r.id === result.id ? { ...r, savedPath: fileName } : r)),
      );
      setNotice('Сохранено в Планировщик постов (Черновики).');
    } catch (err: any) {
      console.error('Save to scheduler error:', err);
      setErrorMsg('Не удалось сохранить в планировщик: ' + (err?.message || err));
    } finally {
      setSavingId(null);
    }
  };

  const saveAllToScheduler = async () => {
    const pending = results.filter((result) => !result.savedPath);
    if (pending.length === 0) return;

    setSavingId('all');
    setErrorMsg(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Пожалуйста, авторизуйтесь');

      /* Three uploads at once is noticeably faster for a batch while avoiding
         a burst that makes the browser or Supabase throttle large MP4 files. */
      let cursor = 0;
      const worker = async () => {
        while (cursor < pending.length) {
          const result = pending[cursor++];
          const fileName = await persistResultToScheduler(result, user.id);
          setResults((prev) =>
            prev.map((item) => (item.id === result.id ? { ...item, savedPath: fileName } : item)),
          );
        }
      };

      const workerCount = Math.min(3, pending.length);
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
      setNotice(`${pending.length} роликов сохранено в Планировщик постов (Черновики).`);
    } catch (err: any) {
      console.error('Batch save to scheduler error:', err);
      setErrorMsg('Не удалось сохранить пачку: ' + (err?.message || err));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                <SparklesIcon className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                Умная CTA-концовка
              </h1>
            </div>
            <p className="mt-2 text-sm text-gray-600">
              Загрузите ролик и укажите кодовое слово. Стиль, анимация, длительность,
              уникализация и описание для Instagram соберутся автоматически.
            </p>
          </div>

          <Badge tone="accent" className="px-3 py-1.5 text-xs font-semibold">
            Comment-to-DM
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left Column: Form & Configuration (7 cols) */}
        <div className="space-y-6 lg:col-span-7">
          {/* Step 1: Upload Source Video */}
          <Card className="border border-gray-200 shadow-sm">
            <div className="p-6">
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  1
                </span>
                Исходное видео
              </h2>

              <div className="mt-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {!sourceVideoFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      acceptSourceVideo(event.dataTransfer.files?.[0]);
                    }}
                    className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50/50 p-8 text-center transition-colors hover:border-brand-500 hover:bg-brand-50/20"
                  >
                    <CloudArrowUpIcon className="h-12 w-12 text-gray-400" />
                    <p className="mt-3 text-sm font-semibold text-gray-900">
                      Нажмите для загрузки видео или перетащите файл
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Поддерживаются MP4, MOV, WEBM (вертикальный формат 9:16)
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
                        <FilmIcon className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="truncate text-sm font-medium text-gray-900 max-w-[240px] sm:max-w-xs">
                          {sourceVideoFile.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(sourceVideoFile.size / (1024 * 1024)).toFixed(1)} МБ •{' '}
                          {videoDuration > 0 ? `${videoDuration.toFixed(1)} сек.` : 'Загрузка...'}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Заменить
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Step 2: Background Style Preset */}
          <Card className="border border-gray-200 shadow-sm">
            <div className="p-6">
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  2
                </span>
                Выберите готовый стиль
              </h2>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {OUTRO_BACKGROUNDS.map((bg) => {
                  const isSelected = backgroundStyle === bg.id;
                  return (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => handlePresetSelect(bg)}
                      className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-brand-600 ring-2 ring-brand-600/30 shadow-sm'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <PresetThumb preset={bg} />
                      <div className="p-2.5">
                        <p className="text-xs font-semibold text-gray-900 truncate">
                          {bg.name}
                        </p>
                        <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">
                          {bg.description}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="absolute right-2 top-2 rounded-full bg-brand-600 p-0.5 text-white shadow">
                          <CheckCircleIcon className="h-4 w-4" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                  {outroDurationSec.toFixed(1)} сек.
                  {outroTimedToSound && ' · по музыке'}
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                  Шрифт и цвета из стиля
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
                  Декор настроен
                </span>
              </div>

              <details className="mt-3 border-t border-gray-100 pt-3">
                <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-900">
                  Свой фон вместо пресета
                </summary>
                <div className="mt-3">
                  <input
                    ref={customBgInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleCustomBgSelect}
                    className="hidden"
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<CloudArrowUpIcon className="h-4 w-4" />}
                    onClick={() => customBgInputRef.current?.click()}
                  >
                    {customBgUrl ? 'Заменить свой фон' : 'Загрузить изображение'}
                  </Button>
                </div>
              </details>
            </div>
          </Card>

          {/* Step 3: Campaign intent */}
          <Card className="border border-gray-200 shadow-sm">
            <div className="p-6">
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                  3
                </span>
                Что получит зритель
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                Кодовое слово появится на карточке и в описании. Остальной текст подберётся под выбранный стиль.
              </p>

              {automationRules.length > 0 && (
                <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/50 p-3">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                    Автоворонка Comment-to-DM
                  </label>
                  <select
                    value={selectedRuleId}
                    onChange={(event) => {
                      const rule = automationRules.find((item) => item.id === event.target.value);
                      if (rule) applyAutomationRule(rule);
                    }}
                    className="mt-2 h-10 w-full rounded-lg border border-brand-200 bg-white px-3 text-sm text-gray-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  >
                    <option value="">Своё кодовое слово</option>
                    {automationRules.map((rule) => {
                      const keywords = Array.isArray(rule.keywords) && rule.keywords.length
                        ? rule.keywords
                        : [rule.codeword];
                      return (
                        <option key={rule.id} value={rule.id}>
                          {rule.title} — {keywords.join(' / ')}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-1.5 text-[11px] text-brand-700/80">
                    На карточке показывается первое слово, а автоматизация принимает все слова из сценария.
                  </p>
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Кодовое слово
                  </label>
                  <Input
                    value={keywordText}
                    onChange={(e) => {
                      setKeywordText(e.target.value);
                      setSelectedRuleId('');
                    }}
                    placeholder="ПРОМПТ / ГАЙД / СТАРТ"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {['ПРОМПТ', 'ГАЙД', 'УРОК', 'СТАРТ', 'МАТЕРИАЛ'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          setKeywordText(chip);
                          setSelectedRuleId('');
                        }}
                        className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                          keywordText === chip
                            ? 'bg-brand-100 text-brand-800 font-semibold'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                  {selectedRuleId && selectedAutomationKeywords.length > 1 && (
                    <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                      Все слова этой автоворонки:{' '}
                      <span className="font-medium text-gray-700">
                        {selectedAutomationKeywords.join(' · ')}
                      </span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Что отправит воронка
                  </label>
                  <Input
                    value={aiTopic}
                    onChange={(e) => setAiTopic(e.target.value)}
                    placeholder={REELS_PROMPT_PACK_OFFER}
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                    ИИ будет писать уникальные описания Reels и завершать их коротким призывом про пак из 1000+ промптов.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Текст сверху
                  </label>
                  <Input
                    value={actionText}
                    onChange={(e) => setActionText(e.target.value)}
                    placeholder="Пиши"
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                    Например: «Напиши» или «Оставь комментарий».
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Текст снизу
                  </label>
                  <Input
                    value={subtitleText}
                    readOnly
                    aria-readonly="true"
                    placeholder={CTA_OUTRO_SUBTITLE}
                  />
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                    Фиксированный оффер для карточки и описания Reels.
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Брендовый хэштег <span className="font-normal text-gray-400">— необязательно</span>
                </label>
                <Input
                  value={brandTag}
                  onChange={(e) => setBrandTag(e.target.value)}
                  placeholder="hancybox"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-2 rounded-xl bg-brand-50/70 p-3">
                <span className="text-[11px] font-semibold text-brand-800">Автоматически:</span>
                <span className="text-[11px] text-brand-700">текст карточки</span>
                <span className="text-[11px] text-brand-400">•</span>
                <span className="text-[11px] text-brand-700">описание Instagram</span>
                <span className="text-[11px] text-brand-400">•</span>
                <span className="text-[11px] text-brand-700">варианты для пачки</span>
              </div>
            </div>
          </Card>

          <Card className="border border-gray-200 shadow-sm">
            <details className="p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <MusicalNoteIcon className="h-4 w-4 text-gray-500" />
                  Дополнительный звук
                </span>
                <span className="text-[11px] text-gray-400">
                  {outroSoundUrl ? outroSoundName || 'Выбран' : 'Необязательно'}
                </span>
              </summary>

              <input
                ref={outroSoundInputRef}
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/aac,audio/mp4,audio/*"
                onClick={(e) => { e.currentTarget.value = ''; }}
                onChange={handleOutroSoundSelect}
                className="hidden"
              />

              {OUTRO_SOUNDS.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {OUTRO_SOUNDS.map((sound) => (
                    <button
                      key={sound.id}
                      type="button"
                      onClick={() => {
                        setOutroSoundUrl(sound.url);
                        setOutroSoundName(sound.name);
                        setSoundError(null);
                        auditionRef.current?.pause();
                        setIsAuditioning(false);
                      }}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
                        outroSoundUrl === sound.url
                          ? 'border-brand-600 bg-brand-50 text-brand-700'
                          : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {sound.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<MusicalNoteIcon className="h-4 w-4" />}
                  onClick={() => outroSoundInputRef.current?.click()}
                >
                  {outroSoundUrl ? 'Заменить трек' : 'Загрузить трек'}
                </Button>
                {outroSoundUrl && (
                  <>
                    <audio
                      key={outroSoundUrl}
                      src={outroSoundUrl}
                      controls
                      preload="metadata"
                      className="mt-3 h-9 w-full"
                      onCanPlay={() => setSoundError(null)}
                      onError={() => setSoundError('Файл не читается браузером. Попробуйте MP3 или WAV.')}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={isAuditioning ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                      onClick={handleAudition}
                    >
                      {isAuditioning ? 'Стоп' : 'Прослушать'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (uploadedSoundUrlRef.current === outroSoundUrl) {
                          URL.revokeObjectURL(uploadedSoundUrlRef.current);
                          uploadedSoundUrlRef.current = '';
                        }
                        setOutroSoundUrl('');
                        setOutroSoundName('');
                        setSoundError(null);
                        auditionRef.current?.pause();
                        setIsAuditioning(false);
                      }}
                    >
                      Убрать
                    </Button>
                  </>
                )}
                {soundError && (
                  <p className="mt-2 text-[11px] text-red-600">{soundError}</p>
                )}
              </div>
            </details>
          </Card>
        </div>

        {/* Right Column: Live 9:16 Preview Player & Actions (5 cols) */}
        <div className="space-y-6 lg:col-span-5">
          <div className="sticky top-6">
              <Card className="border border-brand-900/40 bg-brand-950 text-white shadow-xl overflow-hidden">
              {/* Preview Tabs */}
              <div className="flex items-center justify-between border-b border-brand-900/70 bg-brand-950/80 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Живое превью (9:16)
                </span>
                <div className="flex gap-1 rounded-lg bg-brand-900/70 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewTab('outro');
                      setIsPlayingVideo(false);
                    }}
                    className={`rounded-md px-2.5 py-1 transition-colors ${
                      previewTab === 'outro'
                        ? 'bg-brand-600 font-semibold text-white'
                        : 'text-brand-200 hover:text-white'
                    }`}
                  >
                    CTA Концовка
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!sourceVideoUrl && !renderedVideoUrl) {
                        alert('Сначала загрузите исходное видео');
                        return;
                      }
                      setPreviewTab('video');
                    }}
                    className={`rounded-md px-2.5 py-1 transition-colors ${
                      previewTab === 'video'
                        ? 'bg-brand-600 font-semibold text-white'
                        : 'text-brand-200 hover:text-white'
                    }`}
                  >
                    Видео
                  </button>
                </div>
              </div>

              {/* 9:16 Screen Frame */}
              <div className="flex justify-center p-4">
                <div className="relative aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-2xl bg-brand-900 shadow-2xl ring-1 ring-brand-300/30">
                  {previewTab === 'outro' ? (
                    <canvas
                      ref={previewCanvasRef}
                      width={720}
                      height={1280}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="relative h-full w-full">
                      <video
                        ref={previewVideoRef}
                        src={renderedVideoUrl || sourceVideoUrl || ''}
                        playsInline
                        loop
                        className="h-full w-full object-cover"
                        onPlay={() => setIsPlayingVideo(true)}
                        onPause={() => setIsPlayingVideo(false)}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const v = previewVideoRef.current;
                          if (!v) return;
                          if (v.paused) v.play();
                          else v.pause();
                        }}
                        className="absolute inset-0 flex items-center justify-center bg-black/20 text-white transition-opacity hover:bg-black/40"
                      >
                        {!isPlayingVideo && (
                          <div className="rounded-full bg-black/60 p-3.5 backdrop-blur">
                            <PlayIcon className="h-8 w-8" />
                          </div>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Top Bar overlay simulation */}
                  <div className="pointer-events-none absolute left-0 right-0 top-0 flex items-center justify-between p-3">
                    <span className="text-[10px] font-bold text-white/70">Reels</span>
                    <span className="rounded bg-brand-950/50 px-1.5 py-0.5 text-[9px] font-mono text-white/80 backdrop-blur">
                      {previewTab === 'outro' ? `${outroDurationSec.toFixed(1)}s` : 'Full'}
                    </span>
                  </div>
                </div>
              </div>

              {previewTab === 'outro' && (
                <div className="-mt-1 flex justify-center pb-3">
                  <button
                    type="button"
                    onClick={replayPreview}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium text-gray-400 transition-colors hover:text-white"
                  >
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                    Повторить анимацию
                  </button>
                </div>
              )}

            </Card>

            {/* Render controls */}
            <Card className="mt-4 border border-gray-200 shadow-sm">
              <div className="space-y-4 p-5">
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-700">
                      Сколько версий подготовить
                    </label>
                    <span className="text-xs font-semibold text-brand-600">{batchCount} шт.</span>
                  </div>
                  <div className="mt-2 grid grid-cols-6 gap-1.5">
                    {BATCH_OPTIONS.map((count) => (
                      <button
                        key={count}
                        type="button"
                        disabled={isRendering}
                        onClick={() => setBatchCount(count)}
                        className={`h-9 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 ${
                          batchCount === count
                            ? 'border-brand-600 bg-brand-50 text-brand-700'
                            : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                    Для пачки CTA остаётся в центре или немного выше; технический рисунок видео и описание меняются.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-2 rounded-xl bg-gray-50 p-3 text-[11px] sm:grid-cols-3">
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <CheckCircleIcon className="h-3.5 w-3.5 text-green-600" />
                    Стиль: {activePreset.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <CheckCircleIcon className="h-3.5 w-3.5 text-green-600" />
                    Уникализация включена
                  </span>
                  <span className="flex items-center gap-1.5 text-gray-600">
                    <CheckCircleIcon className={`h-3.5 w-3.5 ${hasAiKey ? 'text-green-600' : 'text-amber-500'}`} />
                    {hasAiKey ? 'Описание напишет DeepSeek' : 'Нужен ключ DeepSeek для AI-описаний'}
                  </span>
                </div>

                {(isRendering || renderProgress > 0) && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-gray-600">
                      <span className="truncate pr-2">{renderStatus}</span>
                      <span className="font-mono font-semibold text-gray-900">{renderProgress}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-brand-600 transition-all duration-300"
                        style={{ width: `${renderProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  loading={isRendering}
                  disabled={isRendering || !sourceVideoFile || !keywordText.trim()}
                  icon={<SparklesIcon className="h-5 w-5" />}
                  onClick={handleStartRender}
                >
                  {isRendering
                    ? isWritingCaptions
                      ? 'ИИ пишет описания...'
                      : 'Идёт обработка...'
                    : batchCount > 1
                      ? `Собрать ${batchCount} готовых роликов`
                      : 'Собрать готовый ролик'}
                </Button>

                {!sourceVideoFile && (
                  <p className="text-center text-[11px] text-gray-400">
                    Сначала загрузите исходное видео в шаге 1
                  </p>
                )}

                {errorMsg && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    {errorMsg}
                  </div>
                )}

                {notice && !errorMsg && (
                  <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-700">
                    <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />
                    <span>{notice}</span>
                  </div>
                )}
              </div>
            </Card>

          </div>
        </div>
      </div>

      {/* Finished videos live below the full editor, like the regular Reels
          generator: every result gets a readable card instead of a cramped
          row inside the preview column. */}
      {results.length > 0 && (
        <section className="mt-10 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                <SquaresPlusIcon className="h-5 w-5 text-brand-600" />
                Готовые Reels ({results.length})
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Просмотрите ролики, скачайте отдельные файлы или отправьте всю пачку в черновики.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {results.some((result) => result.savedPath) && (
                <span className="text-xs font-medium text-green-600">
                  {results.filter((result) => result.savedPath).length} в черновиках
                </span>
              )}
              {results.length > 1 && (
                <Button
                  variant="primary"
                  size="sm"
                  loading={savingId === 'all'}
                  disabled={!!savingId || results.every((result) => result.savedPath)}
                  onClick={saveAllToScheduler}
                  icon={<CalendarDaysIcon className="h-4 w-4" />}
                >
                  Сохранить все в планировщик
                </Button>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {results.map((result, index) => (
              <article key={result.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/50">
                <div className="relative bg-gray-950">
                  <video
                    src={result.url}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-[9/16] max-h-[32rem] w-full object-contain"
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
                    Reels {index + 1}
                  </span>
                  {result.savedPath && (
                    <span className="absolute right-3 top-3 rounded-full bg-emerald-500/90 px-2.5 py-1 text-xs font-semibold text-white">
                      В черновиках
                    </span>
                  )}
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-gray-400">Описание Reels</span>
                      <span className="text-[11px] text-gray-400">{result.caption.length} символов</span>
                    </div>
                    <textarea
                      value={result.caption}
                      onChange={(event) => {
                        const value = event.target.value;
                        setResults((current) => current.map((item) => (
                          item.id === result.id ? { ...item, caption: value } : item
                        )));
                      }}
                      rows={6}
                      className="w-full resize-y rounded-xl border border-gray-200 bg-white p-3 text-xs leading-relaxed text-gray-700 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      aria-label={`Описание Reels ${index + 1}`}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      title="Скачать MP4"
                      icon={<ArrowDownTrayIcon className="h-4 w-4" />}
                      onClick={() => downloadResult(result, index)}
                    >
                      Скачать
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      fullWidth
                      title="В планировщик постов"
                      loading={savingId === result.id}
                      disabled={!!result.savedPath || !!savingId}
                      icon={<CalendarDaysIcon className="h-4 w-4" />}
                      onClick={() => saveResultToScheduler(result)}
                    >
                      {result.savedPath ? 'Сохранено' : 'В планировщик'}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <button
            type="button"
            onClick={clearResults}
            className="mt-5 w-full rounded-xl py-2 text-center text-sm font-medium text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700"
          >
            Очистить и собрать заново
          </button>
        </section>
      )}
    </div>
  );
};

export default CtaOutroGenerator;
