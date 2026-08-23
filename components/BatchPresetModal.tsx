import React, { useEffect, useRef, useState } from 'react';
import {
  BatchPreset,
  InstagramAccount,
  AudioFile,
  VideoTemplate,
  AudioMode,
  CtaType,
  FontFamily,
  FontWeight,
  TextStylePreset,
  BgStyle,
  TextAlign,
} from '../types';
import {
  XMarkIcon,
  PlusIcon,
  ChevronDownIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  MinusIcon,
  Bars3BottomLeftIcon,
  Bars3Icon,
  Bars3BottomRightIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import AppSelect from './ui/AppSelect';
import {
  buildMusicPreview,
  MUSIC_PREVIEW_SECONDS,
  playPreview,
  type PreviewPlayback,
} from '../utils/musicPreview';
import { getSignedUrl, supabase } from '../lib/supabase';
import {
  DEFAULT_OUTRO_DURATION_S,
  MUSIC_UNDER_VOICE_GAIN,
  OUTRO_BACKGROUNDS,
  OutroPresetId,
} from '../utils/outroRenderer';

interface Props {
  preset: BatchPreset | null;
  userId: string;
  accounts: InstagramAccount[];
  currentAccountId?: string | null;
  templates: VideoTemplate[];
  audioFiles: AudioFile[];
  onSave: (data: Partial<BatchPreset>) => Promise<void>;
  onClose: () => void;
}

const DEFAULT_STYLE: TextStylePreset = {
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
};

const toneOptions = [
  { value: 'Provokacionnyj', label: 'Провокационный' },
  { value: 'Obrazovatelnyj', label: 'Образовательный' },
  { value: 'Prodajushchij', label: 'Продающий' },
];

const fontOptions: { label: string; value: FontFamily }[] = [
  { label: 'Roboto', value: 'Roboto' },
  { label: 'Gen Shin Gothic', value: 'GenShinGothic' },
  { label: 'Open Serif', value: 'OpenSerif' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Inter', value: 'Inter' },
  { label: 'Merriweather', value: 'Merriweather' },
];

const fontWeightOptions: { label: string; value: FontWeight }[] = [
  { label: 'Легкий', value: '300' },
  { label: 'Обычный', value: '400' },
  { label: 'Средний', value: '500' },
  { label: 'Полужирный', value: '600' },
  { label: 'Жирный', value: '700' },
];

const bgOptions: { id: BgStyle; label: string }[] = [
  { id: 'none', label: 'Нет' },
  { id: 'glass', label: 'Стекло' },
  { id: 'solid-black', label: 'Темный' },
  { id: 'solid-white', label: 'Светлый' },
  { id: 'quote-white', label: 'Цитата' },
  { id: 'bank-transfer', label: 'Банк. счет' },
];

const positionOptions: { label: string; icon: React.ReactNode; posY: number }[] = [
  { label: 'Сверху', icon: <ArrowUpIcon className="w-4 h-4" />, posY: 20 },
  { label: 'Центр', icon: <MinusIcon className="w-4 h-4" />, posY: 50 },
  { label: 'Снизу', icon: <ArrowDownIcon className="w-4 h-4" />, posY: 80 },
];

function getFontFamily(font: FontFamily): string {
  const map: Record<FontFamily, string> = {
    Roboto: '"Roboto", sans-serif',
    GenShinGothic: '"M PLUS 1p", sans-serif',
    OpenSerif: '"Noto Serif", serif',
    Georgia: 'Georgia, serif',
    Inter: 'Inter, sans-serif',
    Merriweather: 'Merriweather, serif',
  };
  return map[font];
}

function getPreviewBg(bgStyle: BgStyle, bgOpacity: number): string {
  if (bgStyle === 'glass') return `rgba(255,255,255,${bgOpacity * 0.007})`;
  if (bgStyle === 'solid-black') return `rgba(0,0,0,${bgOpacity / 100})`;
  if (bgStyle === 'solid-white') return `rgba(255,255,255,${bgOpacity / 100})`;
  if (bgStyle === 'quote-white') return `rgba(255,255,255,${bgOpacity / 100})`;
  return 'transparent';
}

function getPreviewTextColor(bgStyle: BgStyle): string {
  if (bgStyle === 'solid-white' || bgStyle === 'glass' || bgStyle === 'quote-white') return '#1e293b';
  return '#ffffff';
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement('audio');
    const finish = (duration: number) => {
      URL.revokeObjectURL(url);
      audio.remove();
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => finish(audio.duration);
    audio.onerror = () => finish(0);
    audio.src = url;
  });
}

function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const finish = (duration: number) => {
      URL.revokeObjectURL(url);
      video.remove();
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    video.preload = 'metadata';
    video.onloadedmetadata = () => finish(video.duration);
    video.onerror = () => finish(0);
    video.src = url;
  });
}

const StylePreview: React.FC<{ style: TextStylePreset }> = ({ style }) => {
  const textColor = getPreviewTextColor(style.bgStyle);
  const bgColor = getPreviewBg(style.bgStyle, style.bgOpacity);
  const isSerif = style.font === 'Georgia' || style.font === 'Merriweather' || style.font === 'OpenSerif';
  const fontStyle = isSerif ? 'italic' : 'normal';
  const scaledFontSize = style.fontSize * (160 / 300);
  const baitFontSize = 17 * (160 / 300);

  const posMap: Record<number, string> = { 20: '10%', 50: '42%', 80: '70%' };
  const topValue = posMap[style.posY] || '10%';

  return (
    <div
      className="relative rounded-xl overflow-hidden flex-shrink-0"
      style={{
        width: 160,
        height: 284,
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, transparent 50%, rgba(0,0,0,0.6) 100%)',
        }}
      />

      <div
        className="absolute left-[5%] right-[5%] transition-all duration-300"
        style={{ top: topValue }}
      >
        {style.bgStyle === 'bank-transfer' ? (
          <div style={{ textAlign: style.textAlign }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: `${scaledFontSize * 0.4}px ${scaledFontSize * 0.8}px`,
                backgroundColor: '#ffffff',
                borderRadius: `${scaledFontSize * 0.8}px`,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                marginBottom: `${scaledFontSize * 0.5}px`,
                gap: `${scaledFontSize * 0.5}px`,
              }}
            >
              <div
                style={{
                  width: `${scaledFontSize * 1.8}px`,
                  height: `${scaledFontSize * 1.8}px`,
                  backgroundColor: '#3b82f6',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg viewBox="0 0 24 24" fill="white" style={{ width: `${scaledFontSize}px`, height: `${scaledFontSize}px` }}>
                  <path d="M19 7h-1V6a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V10a3 3 0 0 0-3-3Zm-4-2h-3v2h3V5Zm2 12H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1v12a3 3 0 0 0 3 3h8v-2a1 1 0 0 1-1-1Z"/>
                </svg>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span style={{ fontSize: `${scaledFontSize * 0.9}px`, fontWeight: 700, color: '#1e293b', lineHeight: 1.1 }}>{style.bankAmount || '1 777 807,23 ₽'}</span>
                <span style={{ fontSize: `${scaledFontSize * 0.55}px`, fontWeight: 500, color: '#64748b', marginTop: '2px' }}>Счет для бизнеса</span>
              </div>
            </div>
            <div>
              <span
                style={{
                  fontFamily: getFontFamily(style.font),
                  fontSize: `${scaledFontSize}px`,
                  fontWeight: Number(style.fontWeight),
                  color: '#ffffff',
                  display: 'inline',
                  lineHeight: 1.35,
                  WebkitTextStroke: '1px #000000',
                  paintOrder: 'stroke fill',
                  textShadow: 'none',
                } as React.CSSProperties}
              >
                Пример текста хука для видео
              </span>
            </div>
          </div>
        ) : style.bgStyle === 'quote-white' ? (
          <div style={{ textAlign: style.textAlign }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: `${scaledFontSize * 0.2}px ${scaledFontSize * 0.5}px`,
                background: 'linear-gradient(to right, rgba(94, 187, 169, 0.95), rgba(58, 139, 124, 0.95))',
                borderBottom: `${Math.max(1, scaledFontSize * 0.1)}px solid rgba(42, 107, 95, 0.95)`,
                borderRadius: `${scaledFontSize * 0.1}px`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                marginBottom: `${scaledFontSize * 0.3}px`,
              }}
            >
              <svg viewBox="0 0 30 20" fill="white" style={{ width: `${scaledFontSize * 1.0}px`, height: `${scaledFontSize * 0.65}px` }}>
                <path d="M12 20H0V10L4 0H14L9 10H12V20ZM28 20H16V10L20 0H30L25 10H28V20Z" />
              </svg>
            </div>
            <div>
              <span
                style={{
                  fontFamily: getFontFamily(style.font),
                  fontSize: `${scaledFontSize}px`,
                  fontWeight: Number(style.fontWeight),
                  color: '#1a1a1a',
                  backgroundColor: '#ffffff',
                  display: 'inline',
                  lineHeight: 1.5,
                  padding: '0.1em 0.2em',
                  boxDecorationBreak: 'clone' as any,
                  WebkitBoxDecorationBreak: 'clone' as any,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                }}
              >
                Пример текста хука для видео
              </span>
            </div>
          </div>
        ) : (
          <div
            className="inline-block px-2 py-1.5 transition-all duration-200"
            style={{
              background: bgColor,
              borderRadius: style.bgStyle !== 'none' ? '6px' : '0',
              textAlign: style.textAlign,
              width: '100%',
            }}
          >
            <p
              className="leading-tight transition-all duration-200"
              style={{
                fontFamily: getFontFamily(style.font),
                fontSize: `${scaledFontSize}px`,
                fontWeight: Number(style.fontWeight),
                fontStyle,
                color: textColor,
                textAlign: style.textAlign,
                textShadow: style.textShadow
                  ? (style.bgStyle === 'solid-white' || style.bgStyle === 'glass')
                    ? '0 1px 4px rgba(0,0,0,0.3)'
                    : '0 2px 10px rgba(0,0,0,0.9)'
                  : 'none',
                letterSpacing: '0.5px',
              }}
            >
              Пример текста хука для видео
            </p>
          </div>
        )}
      </div>

      {style.showCarouselBait && (
        <div className="absolute bottom-4 left-0 right-0 text-center transition-all duration-200">
          <div className="flex justify-center gap-1.5 mb-1.5">
            {[0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="rounded-full"
                style={{
                  width: 4,
                  height: 4,
                  background: i === 0 ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.5)',
                }}
              />
            ))}
          </div>
          <p
            style={{
              fontFamily: getFontFamily(style.font),
              fontSize: `${baitFontSize}px`,
              fontWeight: Number(style.fontWeight),
              fontStyle,
              color: '#fff',
              textShadow: style.textShadow ? '0 2px 10px rgba(0,0,0,0.9)' : 'none',
              letterSpacing: '0.5px',
            }}
          >
            Читай описание ↓
          </p>
        </div>
      )}

      <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-sm rounded-md px-1.5 py-0.5">
        <span className="text-[8px] text-white/70 font-medium">PREVIEW</span>
      </div>
    </div>
  );
};

const BatchPresetModal: React.FC<Props> = ({
  preset,
  userId,
  accounts,
  currentAccountId,
  templates,
  audioFiles,
  onSave,
  onClose,
}) => {
  const [name, setName] = useState(preset?.name || '');
  const [accountId, setAccountId] = useState(
    preset
      ? preset.instagram_account_id || ''
      : currentAccountId
        || accounts.find((account) => account.is_active)?.id
        || accounts[0]?.id
        || '',
  );
  const [topics, setTopics] = useState<string[]>(preset?.topics || []);
  const [topicInput, setTopicInput] = useState('');
  const [tone, setTone] = useState(preset?.tone || 'Provokacionnyj');
  const [ctaType, setCtaType] = useState<CtaType>(preset?.cta_type || 'instagram');
  const [audioMode, setAudioMode] = useState<AudioMode>(preset?.audio_mode || 'from_video');
  const [audioFileId, setAudioFileId] = useState(preset?.audio_file_id || '');
  const [count, setCount] = useState(preset?.variations_count || 5);
  const [intervalMin, setIntervalMin] = useState(preset?.schedule_interval_minutes || 120);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [sourceVideoFile, setSourceVideoFile] = useState<File | null>(null);
  const [sourceVideoPreview, setSourceVideoPreview] = useState('');
  const [templatePreviewUrls, setTemplatePreviewUrls] = useState<Record<string, string>>({});
  const [showSourceTemplates, setShowSourceTemplates] = useState(false);
  const [ctaBackgroundFile, setCtaBackgroundFile] = useState<File | null>(null);
  const [ctaAudioFile, setCtaAudioFile] = useState<File | null>(null);
  const [ctaBackgroundPreview, setCtaBackgroundPreview] = useState('');
  const [ctaAudioPreview, setCtaAudioPreview] = useState('');
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [previewNote, setPreviewNote] = useState('');
  const [previewError, setPreviewError] = useState('');
  const previewRef = useRef<PreviewPlayback | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [presetType, setPresetType] = useState<'standard' | 'ai_showcase' | 'cta_outro'>(
    preset?.text_style?.ctaOutroEnabled
      ? 'cta_outro'
      : preset?.text_style?.presetType || 'standard'
  );

  const savedStyle = preset?.text_style;
  const [style, setStyle] = useState<TextStylePreset>(
    savedStyle && savedStyle.font ? { ...DEFAULT_STYLE, ...savedStyle } : DEFAULT_STYLE
  );

  const availableTemplates = templates.filter(
    (item) => item.is_active && item.instagram_account_id === (accountId || null),
  );

  useEffect(() => {
    if (preset || accountId || !currentAccountId) return;
    setAccountId(currentAccountId);
  }, [accountId, currentAccountId, preset]);

  useEffect(() => {
    let active = true;
    const loadPreviews = async () => {
      const entries = await Promise.all(
        availableTemplates.map(async (template) => {
          try {
            return [template.id, await getSignedUrl('templates', template.file_path)] as const;
          } catch {
            return [template.id, ''] as const;
          }
        }),
      );
      if (active) setTemplatePreviewUrls(Object.fromEntries(entries));
    };
    setTemplatePreviewUrls({});
    void loadPreviews();
    return () => { active = false; };
  }, [accountId, templates]);

  const getTemplateLabel = (template: VideoTemplate, index: number) => {
    const normalized = template.name?.trim();
    const looksTechnical = !normalized || (normalized.length > 28 && !/\s/.test(normalized));
    return looksTechnical ? `Reels ${index + 1}` : normalized;
  };

  const selectedSourceTemplate = availableTemplates.find(
    (template) => template.id === style.sourceTemplateId,
  );
  const selectedSourceIndex = selectedSourceTemplate
    ? availableTemplates.findIndex((template) => template.id === selectedSourceTemplate.id)
    : -1;
  const selectedSourceLabel = selectedSourceTemplate
    ? getTemplateLabel(selectedSourceTemplate, selectedSourceIndex)
    : '';

  useEffect(() => {
    if (sourceVideoFile) {
      const localUrl = URL.createObjectURL(sourceVideoFile);
      setSourceVideoPreview(localUrl);
      return () => URL.revokeObjectURL(localUrl);
    }
    setSourceVideoPreview('');
  }, [sourceVideoFile]);

  useEffect(() => {
    if (ctaBackgroundFile) {
      const localUrl = URL.createObjectURL(ctaBackgroundFile);
      setCtaBackgroundPreview(localUrl);
      return () => URL.revokeObjectURL(localUrl);
    }
    if (!style.ctaOutroBackgroundPath) {
      setCtaBackgroundPreview('');
      return;
    }
    let active = true;
    getSignedUrl('templates', style.ctaOutroBackgroundPath)
      .then((url) => { if (active) setCtaBackgroundPreview(url); })
      .catch(() => { if (active) setCtaBackgroundPreview(''); });
    return () => { active = false; };
  }, [ctaBackgroundFile, style.ctaOutroBackgroundPath]);

  useEffect(() => {
    if (ctaAudioFile) {
      const localUrl = URL.createObjectURL(ctaAudioFile);
      setCtaAudioPreview(localUrl);
      return () => URL.revokeObjectURL(localUrl);
    }
    const selected = audioFiles.find((item) => item.id === style.ctaOutroAudioFileId);
    if (!selected) {
      setCtaAudioPreview('');
      return;
    }
    let active = true;
    getSignedUrl('audio', selected.file_path)
      .then((url) => { if (active) setCtaAudioPreview(url); })
      .catch(() => { if (active) setCtaAudioPreview(''); });
    return () => { active = false; };
  }, [audioFiles, ctaAudioFile, style.ctaOutroAudioFileId]);

  const addTopic = () => {
    const t = topicInput.trim();
    if (t && !topics.includes(t)) {
      setTopics([...topics, t]);
    }
    setTopicInput('');
  };

  const removeTopic = (index: number) => {
    setTopics(topics.filter((_, i) => i !== index));
  };

  const stopMusicPreview = () => {
    previewRef.current?.stop();
    previewRef.current = null;
    setPreviewState('idle');
  };

  /* Stops the clip when the modal closes, so a preview does not go on playing
     into whatever the author does next. */
  useEffect(() => () => previewRef.current?.stop(), []);

  /*
    Twelve seconds of the real mix rather than an imitation: the same decode,
    the same looping and the same gain rule the render uses. Hearing the
    balance costs a moment here and a whole batch otherwise.
  */
  const handleMusicPreview = async () => {
    if (previewState === 'playing') {
      stopMusicPreview();
      return;
    }

    setPreviewError('');
    setPreviewNote('');
    setPreviewState('loading');

    let localReferenceUrl = '';
    try {
      const track = audioMode === 'specific'
        ? audioFiles.find((item) => item.id === audioFileId)
        : audioFiles[Math.floor(Math.random() * audioFiles.length)];
      if (!track) throw new Error('Сначала выберите трек в библиотеке.');

      const musicUrl = await getSignedUrl('audio', track.file_path);

      /* The reference the music has to sit under: the file being uploaded if
         there is one, otherwise the pinned template. With neither, the
         preview is the track alone and says so. */
      let referenceUrl: string | undefined;
      if (sourceVideoFile) {
        localReferenceUrl = URL.createObjectURL(sourceVideoFile);
        referenceUrl = localReferenceUrl;
      } else if (selectedSourceTemplate) {
        referenceUrl = await getSignedUrl('templates', selectedSourceTemplate.file_path);
      }

      const preview = await buildMusicPreview({
        referenceUrl,
        musicUrl,
        volume: style.musicVolume,
      });
      if (!preview) throw new Error('Не удалось прочитать звук трека.');

      const level = `музыка на ${Math.round(preview.gain * 100)}%`;
      const alone = preview.hasReferenceAudio
        ? ''
        : ' · на подложке нет звука, слышен только трек';
      setPreviewNote(`${track.name} · ${level}${alone}`);

      const playback = playPreview(preview.buffer);
      previewRef.current = playback;
      setPreviewState('playing');
      void playback.finished.then(() => {
        previewRef.current = null;
        setPreviewState('idle');
      });
    } catch (error) {
      setPreviewState('idle');
      setPreviewError(
        error instanceof Error ? error.message : 'Не удалось собрать прослушивание',
      );
    } finally {
      if (localReferenceUrl) URL.revokeObjectURL(localReferenceUrl);
    }
  };

  const handleSave = async () => {
    if (!style.sourceTemplateId && !sourceVideoFile) {
      setSaveError('Выберите или загрузите один исходный Reels.');
      return;
    }
    if (presetType === 'cta_outro' && !style.ctaOutroKeyword?.trim()) {
      setSaveError('Укажите кодовое слово для CTA-концовки.');
      return;
    }

    setIsSaving(true);
    setSaveError('');
    let uploadedBackgroundPath = '';
    let uploadedAudioPath = '';
    let uploadedAudioId = '';
    let uploadedSourcePath = '';
    let uploadedSourceId = '';
    try {
      let nextStyle: TextStylePreset = {
        ...style,
        presetType,
        ctaOutroEnabled: presetType === 'cta_outro',
      };
      if (sourceVideoFile) {
        const extension = sourceVideoFile.name.split('.').pop()?.toLowerCase() || 'mp4';
        const uploadedName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
        uploadedSourcePath = `${userId}/batch-sources/${uploadedName}`;
        const { error: sourceUploadError } = await supabase.storage
          .from('templates')
          .upload(uploadedSourcePath, sourceVideoFile, {
            contentType: sourceVideoFile.type || 'video/mp4',
          });
        if (sourceUploadError) throw sourceUploadError;

        const duration = await readVideoDuration(sourceVideoFile);
        const { data: sourceRecord, error: sourceInsertError } = await supabase
          .from('video_templates')
          .insert({
            user_id: userId,
            instagram_account_id: accountId || null,
            name: sourceVideoFile.name.replace(/\.[^/.]+$/, ''),
            file_path: uploadedSourcePath,
            duration: Math.round(duration),
            file_size: sourceVideoFile.size,
            has_audio: false,
            is_active: true,
          })
          .select('id')
          .single();
        if (sourceInsertError || !sourceRecord?.id) {
          throw sourceInsertError || new Error('Не удалось сохранить исходный Reels.');
        }
        uploadedSourceId = sourceRecord.id;
        nextStyle = { ...nextStyle, sourceTemplateId: uploadedSourceId };
      }
      if (ctaBackgroundFile) {
        const extension = ctaBackgroundFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const uploadedName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
        uploadedBackgroundPath = `${userId}/outro-backgrounds/${uploadedName}`;
        const { error } = await supabase.storage
          .from('templates')
          .upload(uploadedBackgroundPath, ctaBackgroundFile, {
            contentType: ctaBackgroundFile.type || 'image/jpeg',
          });
        if (error) throw error;
        nextStyle = {
          ...nextStyle,
          ctaOutroBackgroundPath: uploadedBackgroundPath,
          ctaOutroBackgroundName: ctaBackgroundFile.name,
        };
      }

      if (ctaAudioFile) {
        const extension = ctaAudioFile.name.split('.').pop()?.toLowerCase() || 'mp3';
        const uploadedName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${extension}`;
        uploadedAudioPath = `${userId}/cta-outro/${uploadedName}`;
        const { error: uploadError } = await supabase.storage
          .from('audio')
          .upload(uploadedAudioPath, ctaAudioFile, {
            contentType: ctaAudioFile.type || 'audio/mpeg',
          });
        if (uploadError) throw uploadError;

        const duration = await readAudioDuration(ctaAudioFile);
        const { data: audioRecord, error: insertAudioError } = await supabase
          .from('audio_files')
          .insert({
            user_id: userId,
            name: ctaAudioFile.name,
            file_path: uploadedAudioPath,
            duration: Math.round(duration),
            file_size: ctaAudioFile.size,
          })
          .select('id')
          .single();
        if (insertAudioError || !audioRecord?.id) {
          throw insertAudioError || new Error('Не удалось сохранить музыку CTA.');
        }
        uploadedAudioId = audioRecord.id;
        nextStyle = { ...nextStyle, ctaOutroAudioFileId: uploadedAudioId };
      }

      await onSave({
        name: name || 'Без имени',
        instagram_account_id: accountId || null,
        topics: presetType === 'cta_outro' ? [] : topics,
        tone,
        cta_type: presetType === 'cta_outro' ? 'codeword' : ctaType,
        audio_mode: audioMode,
        audio_file_id: audioMode === 'specific' ? (audioFileId || null) : null,
        variations_count: count,
        text_style: nextStyle,
        schedule_interval_minutes: intervalMin,
        is_active: true,
      });

      const previousBackgroundPath = preset?.text_style?.ctaOutroBackgroundPath;
      if (
        previousBackgroundPath
        && previousBackgroundPath !== nextStyle.ctaOutroBackgroundPath
      ) {
        await supabase.storage.from('templates').remove([previousBackgroundPath]);
      }
    } catch (error: any) {
      if (uploadedBackgroundPath) {
        await supabase.storage.from('templates').remove([uploadedBackgroundPath]);
      }
      if (uploadedAudioId) {
        await supabase.from('audio_files').delete().eq('id', uploadedAudioId);
      }
      if (uploadedAudioPath) {
        await supabase.storage.from('audio').remove([uploadedAudioPath]);
      }
      if (uploadedSourceId) {
        await supabase.from('video_templates').delete().eq('id', uploadedSourceId);
      }
      if (uploadedSourcePath) {
        await supabase.storage.from('templates').remove([uploadedSourcePath]);
      }
      setSaveError(error?.message || 'Не удалось сохранить пресет.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">
            {preset ? 'Редактировать пресет' : 'Новый пресет'}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <XMarkIcon className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Название</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Психология, аккаунт 1"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Аккаунт</label>
            <AppSelect
              value={accountId}
              onChange={(e) => {
                const nextAccountId = e.target.value;
                setAccountId(nextAccountId);
                setSourceVideoFile(null);
                setShowSourceTemplates(false);
                setStyle((current) => ({ ...current, sourceTemplateId: undefined }));
              }}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50"
            >
              <option value="">Выберите Instagram-аккаунт</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>@{a.username}</option>
              ))}
            </AppSelect>
            {!preset && currentAccountId && accountId === currentAccountId && (
              <p className="mt-1.5 text-xs text-gray-400">
                Автоматически выбран текущий аккаунт.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
            <label className="block text-sm font-semibold text-gray-900">Исходный Reels</label>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Выберите один ролик. Все варианты этого пресета создаются только из него.
            </p>

            {availableTemplates.length > 0 && (
              <button
                type="button"
                onClick={() => setShowSourceTemplates((current) => !current)}
                aria-expanded={showSourceTemplates}
                className="mt-3 flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-brand-300"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-800">
                    {selectedSourceLabel ? `Выбран: ${selectedSourceLabel}` : 'Выбрать Reels'}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-gray-400">
                    Доступно подложек: {availableTemplates.length}
                  </span>
                </span>
                <ChevronDownIcon
                  className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${showSourceTemplates ? 'rotate-180' : ''}`}
                />
              </button>
            )}

            {showSourceTemplates && availableTemplates.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availableTemplates.map((template, index) => {
                  const selected = !sourceVideoFile && style.sourceTemplateId === template.id;
                  const previewUrl = templatePreviewUrls[template.id];
                  return (
                    <div
                      key={template.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      onClick={() => {
                        setSourceVideoFile(null);
                        setStyle((current) => ({ ...current, sourceTemplateId: template.id }));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSourceVideoFile(null);
                          setStyle((current) => ({ ...current, sourceTemplateId: template.id }));
                        }
                      }}
                      className={`group relative overflow-hidden rounded-xl border-2 bg-white text-left transition-all ${
                        selected
                          ? 'border-brand-500 shadow-sm ring-2 ring-brand-500/15'
                          : 'border-transparent hover:border-brand-200'
                      }`}
                    >
                      <div className="relative aspect-[9/16] overflow-hidden bg-gray-100">
                        {previewUrl ? (
                          <video
                            controls
                            muted
                            playsInline
                            preload="metadata"
                            src={`${previewUrl}#t=0.1`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-xs text-gray-400">
                            Загрузка…
                          </div>
                        )}
                        {selected && (
                          <span className="absolute right-2 top-2 rounded-full bg-brand-600 p-1 text-white shadow-md">
                            <CheckCircleIcon className="h-4 w-4" />
                          </span>
                        )}
                        <span className="absolute bottom-2 right-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          {template.duration ? `${template.duration} сек.` : '—'}
                        </span>
                      </div>
                      <div className="px-2.5 py-2">
                        <p className="truncate text-xs font-semibold text-gray-800">
                          {getTemplateLabel(template, index)}
                        </p>
                        <p className={`mt-0.5 text-[10px] font-medium ${selected ? 'text-brand-600' : 'text-gray-400'}`}>
                          {selected ? 'Выбрано' : 'Нажмите, чтобы выбрать'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-2.5 hover:border-brand-400">
              <span className="min-w-0 truncate text-xs text-gray-600">
                {sourceVideoFile?.name || 'Или загрузить MP4, MOV, WEBM'}
              </span>
              <span className="shrink-0 text-xs font-semibold text-brand-600">Загрузить</span>
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] || null;
                  setSourceVideoFile(file);
                  if (file) {
                    setStyle((current) => ({ ...current, sourceTemplateId: undefined }));
                  }
                }}
              />
            </label>

            {availableTemplates.length === 0 && !sourceVideoFile && (
              <p className="mt-2 text-[11px] text-amber-600">
                Для выбранного аккаунта ещё нет подложек — загрузите Reels здесь.
              </p>
            )}

            {sourceVideoFile && sourceVideoPreview && (
              <video
                controls
                preload="metadata"
                src={sourceVideoPreview}
                className="mx-auto mt-3 max-h-64 w-auto max-w-full rounded-xl bg-black"
              />
            )}
          </div>

          {/* Preset Type Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Тип пресета</label>
            <div className="grid grid-cols-3 bg-gray-100 rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => {
                  setPresetType('standard');
                  setStyle(prev => ({
                    ...prev,
                    bgStyle: 'none',
                    aiModel: 'none',
                    presetType: 'standard',
                    ctaOutroEnabled: false,
                  }));
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                  presetType === 'standard'
                    ? 'bg-white text-gray-900 shadow-sm font-semibold'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                📝 Стандартный
              </button>
              <button
                type="button"
                onClick={() => {
                  setPresetType('ai_showcase');
                  setStyle(prev => ({
                    ...prev,
                    bgStyle: 'ai-showcase',
                    aiModel: 'claude',
                    font: 'GenShinGothic',
                    fontSize: 13,
                    fontWeight: '300',
                    textAlign: 'left',
                    posY: 18,
                    textRotation: -4,
                    showCarouselBait: true,
                    carouselBaitPosY: 90,
                    presetType: 'ai_showcase',
                    ctaOutroEnabled: false,
                  }));
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                  presetType === 'ai_showcase'
                    ? 'bg-white text-brand-700 shadow-sm font-semibold'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                ✨ AI Showcase
              </button>
              <button
                type="button"
                onClick={() => {
                  setPresetType('cta_outro');
                  setCtaType('codeword');
                  setStyle((current) => ({
                    ...current,
                    presetType: 'cta_outro',
                    ctaOutroEnabled: true,
                    ctaOutroPresetId: current.ctaOutroPresetId || 'editorial-grid-blue',
                    ctaOutroKeyword: current.ctaOutroKeyword || 'промпт',
                    ctaOutroOffer: current.ctaOutroOffer || 'Пак готовых промптов',
                    ctaOutroDurationSec: current.ctaOutroDurationSec || DEFAULT_OUTRO_DURATION_S,
                    ctaOutroSoundVolume: current.ctaOutroSoundVolume ?? 0.9,
                    showCarouselBait: false,
                  }));
                }}
                className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium transition-all ${
                  presetType === 'cta_outro'
                    ? 'bg-white font-semibold text-brand-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                🎯 CTA-концовка
              </button>
            </div>
            {presetType === 'ai_showcase' && (
              <p className="text-xs text-brand-600 mt-1.5 font-medium">✨ Автогенерация Reels с плашками нейросетей (Claude, ChatGPT, Gemini) и вирусными ИИ-хуками.</p>
            )}
            {presetType === 'cta_outro' && (
              <p className="mt-1.5 text-xs font-medium text-brand-600">
                Один исходный Reels → уникальные CTA-тексты, описание и готовая концовка.
              </p>
            )}
          </div>

          {presetType !== 'cta_outro' && (
          <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Темы ({topics.length})
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={topicInput}
                onChange={(e) => setTopicInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTopic())}
                placeholder="Введите тему и нажмите Enter"
                className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50"
              />
              <button
                onClick={addTopic}
                className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
              >
                <PlusIcon className="w-5 h-5 text-gray-600" />
              </button>
            </div>
            {topics.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {topics.map((t, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 bg-brand-50 text-brand-700 text-xs font-medium px-3 py-1.5 rounded-lg border border-brand-200"
                  >
                    {t}
                    <button onClick={() => removeTopic(i)} className="hover:text-red-500">
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Тон</label>
              <AppSelect
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50"
              >
                {toneOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </AppSelect>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Призыв</label>
              <AppSelect
                value={ctaType}
                onChange={(e) => setCtaType(e.target.value as CtaType)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50"
              >
                <option value="telegram">ТГ канал</option>
                <option value="instagram">Подписка на Инсту</option>
                <option value="codeword">Кодовое слово</option>
              </AppSelect>
            </div>
          </div>

          </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Музыка</label>
            <div className="space-y-2">
              {([
                { value: 'from_video' as AudioMode, label: 'Из подложки', desc: 'Оригинальный звук видео' },
                { value: 'random' as AudioMode, label: 'Случайная из библиотеки', desc: `${audioFiles.length} треков доступно` },
                { value: 'specific' as AudioMode, label: 'Конкретный трек', desc: 'Один трек для всех видео' },
              ]).map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    audioMode === opt.value
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="audioMode"
                    value={opt.value}
                    checked={audioMode === opt.value}
                    onChange={() => setAudioMode(opt.value)}
                    className="accent-brand-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {audioMode === 'specific' && (
              <AppSelect
                value={audioFileId}
                onChange={(e) => setAudioFileId(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50 mt-2"
              >
                <option value="">Выберите трек</option>
                {audioFiles.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </AppSelect>
            )}

            {audioMode !== 'from_video' && (
              <div className="mt-3 rounded-xl border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="music-volume" className="text-sm font-medium text-gray-700">
                    Громкость музыки
                  </label>
                  <span className="text-xs font-semibold text-gray-500">
                    {style.musicVolume === undefined
                      ? 'Авто'
                      : `${Math.round(style.musicVolume * 100)}%`}
                  </span>
                </div>
                <input
                  id="music-volume"
                  type="range"
                  min={0}
                  max={100}
                  /* One per cent: a coarser step cannot land on the automatic
                     level, and a thumb that sits somewhere other than the
                     number beside it reads as a bug. */
                  step={1}
                  value={Math.round((style.musicVolume ?? MUSIC_UNDER_VOICE_GAIN) * 100)}
                  disabled={style.musicVolume === undefined}
                  onChange={(e) => setStyle((current) => ({
                    ...current,
                    musicVolume: Number(e.target.value) / 100,
                  }))}
                  className="mt-2 w-full accent-brand-600 disabled:opacity-40"
                />
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={style.musicVolume === undefined}
                    onChange={(e) => setStyle((current) => ({
                      ...current,
                      musicVolume: e.target.checked ? undefined : MUSIC_UNDER_VOICE_GAIN,
                    }))}
                    className="accent-brand-600"
                  />
                  Авто — подстроить под озвучку
                </label>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">
                  На автомате музыка уходит под голос до {Math.round(MUSIC_UNDER_VOICE_GAIN * 100)}%,
                  а на референсе без звука играет в полную.
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
                  <button
                    type="button"
                    onClick={handleMusicPreview}
                    disabled={previewState === 'loading'}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:border-brand-500 hover:text-brand-700 disabled:opacity-50"
                  >
                    {previewState === 'playing'
                      ? 'Остановить'
                      : previewState === 'loading'
                        ? 'Готовлю…'
                        : `Прослушать ${MUSIC_PREVIEW_SECONDS} секунд`}
                  </button>
                  {previewNote && (
                    <span className="text-[11px] text-gray-500">{previewNote}</span>
                  )}
                </div>
                {previewError && (
                  <p className="mt-1 text-[11px] text-red-600">{previewError}</p>
                )}
              </div>
            )}
          </div>

          {presetType === 'cta_outro' && (
          <div className="rounded-2xl border border-brand-200 bg-brand-50/40 p-4">
            <div className="flex items-start justify-between gap-4">
              <span>
                <span className="block text-sm font-semibold text-gray-900">CTA-концовка для каждого Reels</span>
                <span className="mt-1 block text-xs leading-relaxed text-gray-500">
                  ИИ каждый раз меняет верхний и нижний текст, но обязательно сохраняет «ПИШИ» и выбранное кодовое слово.
                </span>
              </span>
              <span className="rounded-full bg-brand-100 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
                Включено
              </span>
            </div>

              <div className="mt-4 space-y-4 border-t border-brand-100 pt-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-600">
                    Стиль CTA
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {OUTRO_BACKGROUNDS.map((outro) => {
                      const selected = (style.ctaOutroPresetId || 'editorial-grid-blue') === outro.id;
                      return (
                        <button
                          key={outro.id}
                          type="button"
                          onClick={() => setStyle((current) => ({
                            ...current,
                            ctaOutroPresetId: outro.id as OutroPresetId,
                            ctaOutroDurationSec: outro.defaultDuration,
                          }))}
                          className={`rounded-xl border p-3 text-left transition-all ${
                            selected
                              ? 'border-brand-500 bg-white ring-2 ring-brand-500/15'
                              : 'border-gray-200 bg-white/70 hover:border-gray-300'
                          }`}
                        >
                          <span
                            className="mb-2 block h-8 rounded-lg border border-black/5"
                            style={{ backgroundColor: outro.previewColor }}
                          />
                          <span className="block text-xs font-semibold text-gray-900">{outro.name}</span>
                          <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">{outro.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    Своя подложка концовки <span className="font-normal text-gray-400">— необязательно</span>
                  </label>
                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-2.5 hover:border-brand-400">
                    <span className="min-w-0 truncate text-xs text-gray-600">
                      {ctaBackgroundFile?.name || style.ctaOutroBackgroundName || 'Загрузить JPG, PNG или WEBP'}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-brand-600">Выбрать</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(event) => setCtaBackgroundFile(event.target.files?.[0] || null)}
                    />
                  </label>
                  {ctaBackgroundPreview && (
                    <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-900">
                      <img
                        src={ctaBackgroundPreview}
                        alt="Подложка CTA-концовки"
                        className="mx-auto h-32 w-auto object-cover"
                      />
                    </div>
                  )}
                  {(ctaBackgroundFile || style.ctaOutroBackgroundPath) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCtaBackgroundFile(null);
                        setStyle((current) => ({
                          ...current,
                          ctaOutroBackgroundPath: undefined,
                          ctaOutroBackgroundName: undefined,
                        }));
                      }}
                      className="mt-1.5 text-[11px] font-medium text-red-500 hover:text-red-600"
                    >
                      Использовать фон выбранного стиля
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">Кодовое слово</label>
                    <input
                      type="text"
                      value={style.ctaOutroKeyword || ''}
                      onChange={(event) => setStyle((current) => ({
                        ...current,
                        ctaOutroKeyword: event.target.value,
                      }))}
                      placeholder="ПРОМПТ"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-700">Что получит человек</label>
                    <input
                      type="text"
                      value={style.ctaOutroOffer || ''}
                      onChange={(event) => setStyle((current) => ({
                        ...current,
                        ctaOutroOffer: event.target.value,
                      }))}
                      placeholder="Пак готовых промптов"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">Одна музыка для всех CTA-концовок</label>
                  <AppSelect
                    value={style.ctaOutroAudioFileId || ''}
                    onChange={(event) => {
                      setCtaAudioFile(null);
                      setStyle((current) => ({
                        ...current,
                        ctaOutroAudioFileId: event.target.value || null,
                      }));
                    }}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                  >
                    <option value="">Без отдельной музыки</option>
                    {audioFiles.map((audio) => (
                      <option key={audio.id} value={audio.id}>{audio.name}</option>
                    ))}
                  </AppSelect>
                  <label className="mt-2 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-2.5 hover:border-brand-400">
                    <span className="min-w-0 truncate text-xs text-gray-600">
                      {ctaAudioFile?.name || 'Или загрузить MP3, WAV, AAC'}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-brand-600">Загрузить</span>
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp3,audio/wav,audio/aac,audio/mp4,audio/*"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setCtaAudioFile(file);
                        if (file) {
                          setStyle((current) => ({ ...current, ctaOutroAudioFileId: null }));
                        }
                      }}
                    />
                  </label>
                  {ctaAudioPreview && (
                    <audio controls preload="metadata" src={ctaAudioPreview} className="mt-2 h-10 w-full" />
                  )}
                  <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                    Короткий джингл (до 10 сек.) задаёт длину концовки — ролик закончится
                    на последней ноте. Длинный трек просто играет под концовкой обычной
                    длины. У каждого ролика длина чуть своя: ещё один слой уникализации.
                  </p>
                </div>

                <div className="rounded-xl border border-brand-100 bg-white p-3 text-center">
                  <p className="text-xs font-medium text-gray-500">ИИ меняет для каждого ролика</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">Сделай так же — ПИШИ</p>
                  <p className="my-1 text-xl font-black text-brand-600">{style.ctaOutroKeyword || 'ПРОМПТ'}</p>
                  <p className="text-sm text-gray-600">и получи подборку в Direct</p>
                </div>
              </div>
          </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Видео за запуск
              </label>
              <AppSelect
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50"
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </AppSelect>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Интервал (мин)
              </label>
              <input
                type="number"
                value={intervalMin}
                onChange={(e) => setIntervalMin(Number(e.target.value))}
                min={30}
                step={30}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-500/50"
              />
            </div>
          </div>

          {presetType === 'standard' && (
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              <ChevronDownIcon className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              Стиль текста и предпросмотр
            </button>

            {showAdvanced && (
              <div className="mt-3 bg-gray-50 rounded-xl p-4 border border-gray-200 space-y-4">
                <div className="flex gap-4">
                  <StylePreview style={style} />

                  <div className="flex-1 space-y-3 min-w-0">
                      <div className="flex bg-white rounded-lg p-0.5 border border-gray-200 mb-3">
                        <button
                          onClick={() => {
                            if (style.bgStyle === 'quote-white' || style.bgStyle === 'bank-transfer') {
                              setStyle({ ...style, bgStyle: 'none' });
                            }
                          }}
                          className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${style.bgStyle !== 'quote-white' && style.bgStyle !== 'bank-transfer' ? 'bg-brand-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Стандарт
                        </button>
                        <button
                          onClick={() => {
                            setStyle({ ...style, bgStyle: 'quote-white', fontSize: 13, showCarouselBait: false });
                          }}
                          className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${style.bgStyle === 'quote-white' ? 'bg-brand-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Цитата
                        </button>
                        <button
                          onClick={() => {
                            setStyle({ ...style, bgStyle: 'bank-transfer', fontSize: 13, fontWeight: '400', textShadow: false, showCarouselBait: false, posY: 35, textAlign: 'center' });
                          }}
                          className={`flex-1 py-1.5 text-xs font-medium rounded transition-all ${style.bgStyle === 'bank-transfer' ? 'bg-brand-600 text-white shadow' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Банк
                        </button>
                      </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5 font-medium">Позиция текста</label>
                      <div className="flex bg-white rounded-lg p-0.5 border border-gray-200">
                        {positionOptions.map((opt) => (
                          <button
                            key={opt.posY}
                            onClick={() => setStyle({ ...style, posY: opt.posY })}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-all ${
                              style.posY === opt.posY
                                ? 'bg-brand-600 text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            {opt.icon}
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1.5 font-medium">Выравнивание</label>
                      <div className="flex bg-white rounded-lg p-0.5 border border-gray-200">
                        {([
                          { value: 'left' as TextAlign, icon: <Bars3BottomLeftIcon className="w-4 h-4" /> },
                          { value: 'center' as TextAlign, icon: <Bars3Icon className="w-4 h-4" /> },
                          { value: 'right' as TextAlign, icon: <Bars3BottomRightIcon className="w-4 h-4" /> },
                        ]).map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setStyle({ ...style, textAlign: opt.value })}
                            className={`flex-1 flex items-center justify-center py-2 rounded-md transition-all ${
                              style.textAlign === opt.value
                                ? 'bg-brand-600 text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                          >
                            {opt.icon}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Шрифт</label>
                        <AppSelect
                          value={style.font}
                          onChange={(e) => setStyle({ ...style, font: e.target.value as FontFamily })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none bg-white"
                        >
                          {fontOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </AppSelect>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Толщина</label>
                        <AppSelect
                          value={style.fontWeight}
                          onChange={(e) => setStyle({ ...style, fontWeight: e.target.value as FontWeight })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none bg-white"
                        >
                          {fontWeightOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </AppSelect>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Размер хука</label>
                        <AppSelect
                          value={style.fontSize}
                          onChange={(e) => setStyle({ ...style, fontSize: Number(e.target.value) })}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none bg-white"
                        >
                          {[12, 13, 14, 15, 16, 17, 18, 19, 20].map((s) => (
                            <option key={s} value={s}>{s}px</option>
                          ))}
                        </AppSelect>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Фон</label>
                        <AppSelect
                          value={style.bgStyle}
                          onChange={(e) => {
                            const newBg = e.target.value as BgStyle;
                            if (newBg === 'quote-white') {
                              setStyle({ ...style, bgStyle: newBg, fontSize: 13, showCarouselBait: false });
                            } else if (newBg === 'bank-transfer') {
                              setStyle({ ...style, bgStyle: newBg, fontSize: 13, fontWeight: '400', textShadow: false, showCarouselBait: false, posY: 35, textAlign: 'center' });
                            } else {
                              setStyle({ ...style, bgStyle: newBg });
                            }
                          }}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none bg-white"
                        >
                          {bgOptions.map((o) => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                          ))}
                        </AppSelect>
                      </div>
                    </div>

                    {style.bgStyle !== 'none' && style.bgStyle !== 'bank-transfer' && (
                      <div>
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Прозрачность фона</span>
                          <span>{style.bgOpacity}%</span>
                        </div>
                        <input
                          type="range"
                          min="10"
                          max="100"
                          value={style.bgOpacity}
                          onChange={(e) => setStyle({ ...style, bgOpacity: Number(e.target.value) })}
                          className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-brand-500"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-4 pt-1">
                      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={style.textShadow}
                          onChange={(e) => setStyle({ ...style, textShadow: e.target.checked })}
                          className="accent-brand-600 rounded"
                        />
                        Тень текста
                      </label>
                      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={style.showCarouselBait}
                          onChange={(e) => setStyle({ ...style, showCarouselBait: e.target.checked })}
                          className="accent-brand-600 rounded"
                        />
                        Байт (17px)
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </div>

        {saveError && (
          <p className="border-t border-red-100 bg-red-50 px-5 py-2.5 text-xs text-red-600">
            {saveError}
          </p>
        )}
        <div className="p-5 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || (
              presetType === 'standard'
              && topics.length === 0
              && !style.ctaOutroEnabled
            )}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-gray-200 text-white disabled:text-gray-500 text-sm font-medium transition-colors shadow-lg disabled:shadow-none"
          >
            {isSaving ? 'Сохраняю…' : preset ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BatchPresetModal;
