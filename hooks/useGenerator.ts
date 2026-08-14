import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { generateAiStoryReels } from '../services/geminiService';
import { ViralVariation, AppState, AudioFile, VideoTemplate, LeadMagnetInfo, LeadMagnet, ReelOutputMode } from '../types';
import { assertMp4Video, renderVideoWithOverlay } from '../utils/videoRenderer';
import { ensureRenderFontsLoaded } from '../utils/renderFonts';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import { useConfirm } from '../contexts/ModalContext';
import { supabase, getSignedUrl } from '../lib/supabase';

export function useGenerator() {
  const { user } = useAuth();
  const { selectedAccount } = useAccount();
  const { alert } = useConfirm();

  const [appState, setAppState] = useState<AppState>(AppState.UPLOAD);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const [inputText, setInputText] = useState('');
  const [variationCount, setVariationCount] = useState(1);
  const [outputMode, setOutputMode] = useState<ReelOutputMode>('both');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [activeEditorTab, setActiveEditorTab] = useState<'text' | 'video'>('text');
  const [variations, setVariations] = useState<ViralVariation[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const [showAudioModal, setShowAudioModal] = useState<string | null>(null);
  const [allLeadMagnets, setAllLeadMagnets] = useState<LeadMagnet[]>([]);
  const [leadMagnet, setLeadMagnet] = useState<LeadMagnetInfo | undefined>(undefined);
  const [selectedLeadMagnetId, setSelectedLeadMagnetId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<VideoTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      loadAudioFiles();
      loadLeadMagnets();
      loadTemplates();
    }
  }, [user]);

  // Warm the render-only webfonts while the user is still picking settings, so
  // the first render does not stall waiting on the font CDN. The renderer awaits
  // this too — calling it here only moves the cost off the critical path.
  useEffect(() => {
    ensureRenderFontsLoaded();
  }, []);

  useEffect(() => {
    resolveLeadMagnet(allLeadMagnets, selectedAccount?.id ?? null);
  }, [allLeadMagnets, selectedAccount]);

  const loadAudioFiles = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('audio_files')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setAudioFiles(data);
  };

  const loadLeadMagnets = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('lead_magnets')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true);
    if (data) setAllLeadMagnets(data as LeadMagnet[]);
  };

  const getAvailableLeadMagnets = (magnets: LeadMagnet[], accountId: string | null): LeadMagnet[] => {
    const forAccount = magnets.filter(m => m.instagram_account_id === accountId);
    const general = magnets.filter(m => m.instagram_account_id === null);
    return [...forAccount, ...general];
  };

  const resolveLeadMagnet = (magnets: LeadMagnet[], accountId: string | null) => {
    const available = getAvailableLeadMagnets(magnets, accountId);
    if (available.length === 0) { setLeadMagnet(undefined); setSelectedLeadMagnetId(null); return; }

    setSelectedLeadMagnetId(prev => {
      const still = available.find(m => m.id === prev);
      const chosen = still ?? available[0];
      setLeadMagnet({ id: chosen.id, title: chosen.title, description: chosen.description, codeword: chosen.codeword });
      return chosen.id;
    });
  };

  const handleSelectLeadMagnet = (id: string) => {
    const m = allLeadMagnets.find(lm => lm.id === id);
    if (!m) return;
    setSelectedLeadMagnetId(id);
    setLeadMagnet({ id: m.id, title: m.title, description: m.description, codeword: m.codeword });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setSelectedTemplateId('');
      setAppState(AppState.CONFIG);
    }
  };

  const loadTemplates = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('video_templates')
      .select('*')
      .eq('user_id', user.id);
    if (data) setTemplates(data);
  };

  const handleTemplateSelect = async (templateId: string) => {
    if (!templateId) return;
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;
    setSelectedTemplateId(templateId);

    // Get signed URL from storage
    const url = await getSignedUrl('templates', tmpl.file_path);
    setVideoUrl(url);

    // Fetch blob and create File object for rendering
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const file = new File([blob], tmpl.name + '.mp4', { type: 'video/mp4' });
      setVideoFile(file);
    } catch {
      // fallback — URL still works for preview
    }

    setAppState(AppState.CONFIG);
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    setProgressMsg('Думаю...');

    try {
      setProgressMsg('Создаю описания и заголовки...');
      const result = await generateAiStoryReels({
        topic: inputText || 'AI-мини-история, созданная одним промптом',
        variationCount,
        leadMagnet,
      });

      const makeVariation = (
        hook: string,
        caption: string,
        variantKind: 'headline' | 'clean',
        id: string,
      ): ViralVariation => ({
        id,
        hookText: variantKind === 'headline' ? hook : '',
        captionText: caption,
        status: 'pending',
        font: 'Inter',
        fontSize: 30,
        fontWeight: '900',
        textAlign: 'center',
        textShadow: true,
        bgStyle: 'none',
        bgOpacity: 80,
        posX: 50,
        posY: 20,
        videoScale: 1.0,
        videoPanX: 0,
        videoPanY: 0,
        showCarouselBait: false,
        carouselBaitPosY: 90,
        aiModel: 'none',
        textRotation: 0,
        uniquifierEnabled: true,
        uniquifierIntensity: 'high',
        reelFormat: 'ai-story',
        variantKind,
      });

      const variantKinds: Array<'headline' | 'clean'> = outputMode === 'both'
        ? ['headline', 'clean']
        : [outputMode];
      const generationId = Date.now().toString();
      const newVariations = result.variations.flatMap((variation, index) =>
        variantKinds.map((variantKind) =>
          makeVariation(variation.hook, variation.caption, variantKind, `${generationId}-${index}-${variantKind}`)
        )
      );
      setVariations(newVariations);
      setAppState(AppState.PREVIEW);
    } catch (e: any) {
      console.error(e);
      await alert({
        title: 'Ошибка генерации',
        message: e.message || 'Неизвестная ошибка генерации. Проверьте консоль или API-ключ.',
        variant: 'error',
      });
    } finally {
      setIsGenerating(false);
      setProgressMsg('');
    }
  };

  const getAudioUrl = async (path: string): Promise<string> => {
    return getSignedUrl('audio', path);
  };

  const saveToScheduler = async (variation: ViralVariation, audioId: string | null, audioStartOffset: number = 0) => {
    if (!user || !videoFile) {
      await alert({
        title: 'Внимание',
        message: 'Загрузите видео перед сохранением.',
        variant: 'warning',
      });
      return;
    }

    setSavingId(variation.id);
    setShowAudioModal(null);

    try {
      const selectedAudio = audioId ? audioFiles.find(a => a.id === audioId) : null;
      const audioUrl = selectedAudio ? await getAudioUrl(selectedAudio.file_path) : null;

      let renderedBlob: Blob;
      try {
        const variationWithAudioOffset: ViralVariation = {
          ...variation,
          audioStartOffset,
        };
        renderedBlob = await renderVideoWithOverlay(videoFile, variationWithAudioOffset, audioUrl);
      } catch (renderErr: any) {
        throw new Error(`Ошибка рендеринга видео: ${renderErr.message}. Попробуйте другой формат видео или уменьшите длительность.`);
      }

      if (!renderedBlob || renderedBlob.size === 0) {
        throw new Error('Рендер завершился, но файл пустой. Попробуйте другое видео.');
      }
      assertMp4Video(renderedBlob);

      const fileName = `${user.id}/${Date.now()}_reel.mp4`;

      const { error: uploadError } = await supabase.storage
        .from('reels')
        .upload(fileName, renderedBlob, {
          contentType: renderedBlob.type,
        });

      if (uploadError) throw new Error(`Ошибка загрузки в хранилище: ${uploadError.message}`);

      const { error: insertError } = await supabase
        .from('scheduled_posts')
        .insert({
          user_id: user.id,
          instagram_account_id: selectedAccount?.id || null,
          video_path: fileName,
          caption: variation.captionText,
          hook_text: variation.hookText,
          font_settings: {
            font: variation.font,
            fontSize: variation.fontSize,
            fontWeight: variation.fontWeight,
            textAlign: variation.textAlign,
            reelFormat: 'ai-story',
            variantKind: variation.variantKind,
            uniquifierEnabled: variation.uniquifierEnabled,
            uniquifierIntensity: variation.uniquifierIntensity,
          },
          status: 'draft',
        });

      if (insertError) throw new Error(`Ошибка сохранения в базу: ${insertError.message}`);

      setVariations(prev => prev.map(v =>
        v.id === variation.id ? { ...v, status: 'sent' } : v
      ));
    } catch (error: any) {
      console.error('Save error:', error);
      await alert({
        title: 'Ошибка сохранения',
        message: `Не удалось сохранить видео:\n\n${error.message}`,
        variant: 'error',
      });
    } finally {
      setSavingId(null);
    }
  };

  const updateStyle = (id: string, field: keyof ViralVariation, value: any) => {
    setVariations(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const updatePosition = (id: string, x: number, y: number) => {
    setVariations(prev => prev.map(v => v.id === id ? { ...v, posX: x, posY: y } : v));
  };

  const handleReset = () => {
    setAppState(AppState.CONFIG);
    setVariations([]);
  };

  const removeVariation = (id: string) => {
    setVariations(prev => prev.filter(v => v.id !== id));
  };

  return {
    // State
    appState,
    videoFile,
    videoUrl,
    inputText, setInputText,
    variationCount, setVariationCount,
    outputMode, setOutputMode,
    isGenerating,
    progressMsg,
    activeEditorTab, setActiveEditorTab,
    variations, setVariations,
    setAppState,
    setIsGenerating,
    setProgressMsg,
    savingId,
    audioFiles,
    selectedAudioId, setSelectedAudioId,
    showAudioModal, setShowAudioModal,
    allLeadMagnets,
    leadMagnet,
    selectedLeadMagnetId,
    fileInputRef,

    // Actions
    handleFileChange,
    handleGenerate,
    saveToScheduler,
    updateStyle,
    updatePosition,
    handleReset,
    removeVariation,
    handleSelectLeadMagnet,
    getAvailableLeadMagnets,
    templates,
    selectedTemplateId,
    handleTemplateSelect,
  };
}
