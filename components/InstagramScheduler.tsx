import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthenticatedHeaders, supabase } from '../lib/supabase';
import { ScheduledPost } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import {
  CalendarDaysIcon,
  TrashIcon,
  ClockIcon,
  ArrowPathIcon,
  PlayIcon,
  XMarkIcon,
  EyeIcon,
  QueueListIcon,
  PaperAirplaneIcon,
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
  RocketLaunchIcon,
} from '@heroicons/react/24/outline';

interface TelegramSettings {
  bot_token: string;
  chat_id: string;
  is_active: boolean;
}

/** Format Date as "YYYY-MM-DDTHH:MM" in LOCAL timezone (for datetime-local input) */
function toLocalDateTimeString(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const InstagramScheduler: React.FC = () => {
  const { user } = useAuth();
  const { selectedAccount, accounts } = useAccount();
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sendingPostId, setSendingPostId] = useState<string | null>(null);
  const [previewPost, setPreviewPost] = useState<ScheduledPost | null>(null);
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings | null>(null);

  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [isScheduling, setIsScheduling] = useState(false);
  const [startDateTime, setStartDateTime] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 5);
    d.setSeconds(0, 0);
    return toLocalDateTimeString(d);
  });

  const [actionPanel, setActionPanel] = useState<'schedule' | 'move' | null>(null);
  const [editingCaption, setEditingCaption] = useState<string | null>(null);
  const [moveTargetAccountId, setMoveTargetAccountId] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);
  const [publishStatus, setPublishStatus] = useState<{type: 'success' | 'error' | 'loading', msg: string} | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchPosts();
    fetchTelegramSettings();

    const channel = supabase
      .channel('scheduler-posts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'scheduled_posts',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchPosts();
        }
      )
      .subscribe();

    const interval = setInterval(fetchPosts, 30000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [user, selectedAccount]);



  const fetchTelegramSettings = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('telegram_settings')
      .select('bot_token, chat_id, is_active')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data && data.is_active) setTelegramSettings(data);
  };

  const fetchPosts = async () => {
    if (!user) return;
    let query = supabase
      .from('scheduled_posts')
      .select('*, instagram_accounts(*)')
      .eq('user_id', user.id);
    if (selectedAccount) {
      query = query.eq('instagram_account_id', selectedAccount.id);
    }
    query = query.in('status', ['draft', 'pending']);
    const { data, error } = await query.order('sort_order', { ascending: true });
    if (!error && data) setPosts(data as ScheduledPost[]);
    setIsLoading(false);
  };



  const handleDeleteSelected = async () => {
    if (selectedPostIds.length === 0) return;
    if (!confirm(`Удалить ${selectedPostIds.length} постов?`)) return;
    for (const id of selectedPostIds) {
      const post = posts.find(p => p.id === id);
      if (post) {
        if (post.video_path) {
          await supabase.storage.from('reels').remove([post.video_path]);
        }
        await supabase.from('scheduled_posts').delete().eq('id', id);
      }
    }
    setSelectedPostIds([]);
    await fetchPosts();
  };

  const handleScheduleSelected = async () => {
    if (selectedPostIds.length === 0 || !selectedAccount || !user) return;
    setIsScheduling(true);
    try {
      const start = new Date(startDateTime);
      const intervalMs = intervalMinutes * 60 * 1000;

      let successCount = 0;
      for (let i = 0; i < selectedPostIds.length; i++) {
        const scheduledAt = new Date(start.getTime() + i * intervalMs);
        const { error } = await supabase
          .from('scheduled_posts')
          .update({ scheduled_at: scheduledAt.toISOString(), status: 'pending' })
          .eq('id', selectedPostIds[i]);
        if (!error) successCount++;
      }

      setSelectedPostIds([]);
      setActionPanel(null);
      await fetchPosts();
    } catch (error: any) {
      alert(`Ошибка: ${error.message}`);
    } finally {
      setIsScheduling(false);
    }
  };



  const handleMoveSelected = async () => {
    if (!moveTargetAccountId || selectedPostIds.length === 0 || !user) return;
    setIsMoving(true);
    const { error } = await supabase
      .from('scheduled_posts')
      .update({ instagram_account_id: moveTargetAccountId })
      .in('id', selectedPostIds);
    setIsMoving(false);
    if (error) {
      alert(`Ошибка переноса: ${error.message}`);
    } else {
      setSelectedPostIds([]);
      setActionPanel(null);
      await fetchPosts();
    }
  };

  const handleShuffleQueue = async () => {
    if (allQueuePosts.length < 2) return;
    if (!confirm(`Перемешать ${allQueuePosts.length} постов в случайном порядке?`)) return;

    setIsShuffling(true);

    const ids = allQueuePosts.map(p => p.id);
    const shuffledIds = [...ids];
    for (let i = shuffledIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledIds[i], shuffledIds[j]] = [shuffledIds[j], shuffledIds[i]];
    }

    for (let i = 0; i < shuffledIds.length; i++) {
      await supabase
        .from('scheduled_posts')
        .update({ sort_order: i + 1 })
        .eq('id', shuffledIds[i]);
    }

    setIsShuffling(false);
    await fetchPosts();
  };

  const handlePublishNow = async (post: ScheduledPost) => {
    const account = (post as any).instagram_accounts || selectedAccount;
    if (!account) {
      setPublishStatus({ type: 'error', msg: 'Аккаунт не привязан к этому посту.' });
      setTimeout(() => setPublishStatus(null), 5000);
      return;
    }

    setSendingPostId(post.id);
    setPublishStatus({ type: 'loading', msg: `Публикую в @${account.username}...` });

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/publish-reels`,
        {
          method: 'POST',
          headers: await getAuthenticatedHeaders(),
          body: JSON.stringify({ post_id: post.id }),
        }
      );
      const result = await response.json();
      if (result.error) {
        setPublishStatus({ type: 'error', msg: `Ошибка: ${result.error}` });
      } else {
        setPublishStatus({ type: 'success', msg: '✅ Reels опубликован!' });
        await fetchPosts();
      }
    } catch (err: any) {
      setPublishStatus({ type: 'error', msg: `Ошибка: ${err.message}` });
    } finally {
      setSendingPostId(null);
      setTimeout(() => setPublishStatus(null), 6000);
    }
  };

  const appendZ = (dateStr: string) => {
    let s = dateStr.replace(' ', 'T');
    return s.endsWith('Z') || s.includes('+') ? s : `${s}Z`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(appendZ(dateStr)).toLocaleString('ru-RU', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const formatTimeOnly = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('ru-RU', {
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatDayLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return 'Сегодня';
    if (d.toDateString() === tomorrow.toDateString()) return 'Завтра';
    return d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">Черновик</span>;
      case 'pending':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700">Запланирован</span>;
      case 'publishing':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Публикуется</span>;
      case 'published':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">Опубликован</span>;
      case 'failed':
        return <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">Ошибка</span>;
      default:
        return null;
    }
  };

  const draftPosts = posts.filter(p => p.status === 'draft');
  const scheduledPosts = posts.filter(p => p.status === 'pending');

  const allQueuePosts = posts;

  const getVideoUrl = (path: string | null) => {
    if (!path) return '';
    const { data } = supabase.storage.from('reels').getPublicUrl(path);
    return data.publicUrl;
  };

  const VideoThumb: React.FC<{ path: string | null; isActive: boolean }> = ({ path, isActive }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [loaded, setLoaded] = useState(false);
    const url = getVideoUrl(path);

    const handleMouseEnter = () => {
      if (!path) return;
      if (!loaded && videoRef.current) {
        videoRef.current.src = url;
        setLoaded(true);
      }
      videoRef.current?.play().catch(() => {});
    };

    const handleMouseLeave = () => {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    };

    return (
      <div
        className="w-full h-36 bg-gray-800 relative overflow-hidden"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            {path ? <PlayIcon className="w-8 h-8 text-white/30" /> : <span className="text-xs text-white/40">Файл очищен</span>}
          </div>
        )}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          loop
          playsInline
          preload="none"
        />
        {isActive && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <ArrowPathIcon className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
      </div>
    );
  };

  const togglePostSelection = (id: string) => {
    setSelectedPostIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedPostIds.length === allQueuePosts.length) {
      setSelectedPostIds([]);
    } else {
      setSelectedPostIds(allQueuePosts.map(p => p.id));
    }
  };

  const isOverdue = (dateStr: string | null) => dateStr ? new Date(appendZ(dateStr)) <= new Date() : false;

  const getTotalTime = () => {
    if (selectedPostIds.length <= 1) return '';
    const totalMin = (selectedPostIds.length - 1) * intervalMinutes;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `~${m}м`;
    if (m === 0) return `~${h}ч`;
    return `~${h}ч ${m}м`;
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {publishStatus && (
        <div className={`mb-4 px-4 py-3 rounded-xl flex items-center justify-between text-sm font-medium animate-in transition-all ${
          publishStatus.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
          publishStatus.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          <div className="flex items-center gap-2">
            {publishStatus.type === 'loading' && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
            {publishStatus.msg}
          </div>
          <button onClick={() => setPublishStatus(null)} className="ml-4 opacity-60 hover:opacity-100">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Планировщик
            {selectedAccount && (
              <span className="text-lg font-normal text-gray-400 ml-2">@{selectedAccount.username}</span>
            )}
          </h1>
          <p className="text-gray-500">
            {selectedAccount
              ? `${draftPosts.length} черновиков, ${scheduledPosts.length} запланировано`
              : 'Выберите аккаунт для просмотра постов'}
          </p>
        </div>
      </div>

      <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-emerald-800">Авто-публикация активна</p>
          <p className="text-xs text-emerald-600 mt-0.5">
            Запланированные посты публикуются автоматически по расписанию (серверный cron каждую минуту)
          </p>
        </div>
        <CalendarDaysIcon className="w-5 h-5 text-emerald-500" />
      </div>



      {previewPost && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setPreviewPost(null); setEditingCaption(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full max-h-[95vh] overflow-y-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-semibold text-gray-900">Предпросмотр</h3>
                {previewPost.hook_text && <p className="text-xs text-teal-600 mt-0.5 line-clamp-1">{previewPost.hook_text}</p>}
              </div>
              <button onClick={() => { setPreviewPost(null); setEditingCaption(null); }} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
                <XMarkIcon className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 bg-gray-900">
              <video src={getVideoUrl(previewPost.video_path)} className="w-full max-h-[70vh] object-contain" controls autoPlay />
            </div>
            <div className="p-4 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                {getStatusBadge(previewPost.status)}
                {previewPost.scheduled_at && <span className="text-xs text-gray-500">{formatDate(previewPost.scheduled_at)}</span>}
              </div>
              {editingCaption !== null ? (
                <div>
                  <textarea
                    value={editingCaption}
                    onChange={(e) => setEditingCaption(e.target.value)}
                    maxLength={2200}
                    rows={6}
                    className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-teal-500/40 focus:border-teal-500 resize-none"
                  />
                  <div className="flex items-center justify-between mt-1.5">
                    <span className={`text-xs ${editingCaption.length > 2100 ? 'text-red-500 font-medium' : editingCaption.length > 1800 ? 'text-amber-500' : 'text-gray-400'}`}>
                      {editingCaption.length} / 2200
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingCaption(null)}
                        className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        Отмена
                      </button>
                      <button
                        onClick={async () => {
                          if (editingCaption.length > 2200) return;
                          await supabase.from('scheduled_posts').update({ caption: editingCaption }).eq('id', previewPost.id);
                          setPreviewPost({ ...previewPost, caption: editingCaption });
                          setPosts(prev => prev.map(p => p.id === previewPost.id ? { ...p, caption: editingCaption } : p));
                          setEditingCaption(null);
                        }}
                        disabled={editingCaption.length > 2200}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-500 disabled:bg-gray-300 rounded-lg transition-colors"
                      >
                        Сохранить
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{previewPost.caption || 'Без описания'}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-xs ${(previewPost.caption?.length || 0) > 2100 ? 'text-red-500 font-medium' : (previewPost.caption?.length || 0) > 1800 ? 'text-amber-500' : 'text-gray-400'}`}>
                      {previewPost.caption?.length || 0} / 2200
                    </span>
                    <button
                      onClick={() => setEditingCaption(previewPost.caption || '')}
                      className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                    >
                      Редактировать
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {allQueuePosts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <QueueListIcon className="w-5 h-5 text-teal-600" />
              Очередь
              <span className="ml-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">{allQueuePosts.length}</span>
            </h3>

            <div className="flex items-center gap-2">
              {selectedPostIds.length > 0 && (
                <button onClick={handleDeleteSelected} className="px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 border border-red-200 transition-colors">
                  <TrashIcon className="w-3.5 h-3.5 inline mr-1" />
                  Удалить {selectedPostIds.length}
                </button>
              )}
              {allQueuePosts.length >= 2 && (
                <button
                  onClick={handleShuffleQueue}
                  disabled={isShuffling}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-50 border border-blue-200 transition-colors disabled:opacity-50"
                >
                  {isShuffling ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <ArrowsUpDownIcon className="w-3.5 h-3.5" />}
                  Перемешать
                </button>
              )}
              <button onClick={selectAll} className="text-sm text-teal-600 hover:text-teal-700 font-medium">
                {selectedPostIds.length === allQueuePosts.length ? 'Снять' : 'Выбрать все'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
            {allQueuePosts.map((post) => (
              <div
                key={post.id}
                onClick={() => togglePostSelection(post.id)}
                className={`relative cursor-pointer rounded-xl overflow-hidden border-2 transition-all group ${
                  selectedPostIds.includes(post.id)
                    ? 'border-teal-500 ring-2 ring-teal-500/20'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <VideoThumb
                  path={post.video_path}
                  isActive={false}
                />

                {selectedPostIds.includes(post.id) && (
                  <div className="absolute top-2 left-2 w-6 h-6 bg-teal-500 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md">
                    {selectedPostIds.indexOf(post.id) + 1}
                  </div>
                )}

                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => handlePublishNow(post)}
                    disabled={sendingPostId === post.id}
                    className="p-1.5 bg-teal-600/80 hover:bg-teal-600 backdrop-blur-sm rounded-lg text-white transition-colors disabled:opacity-50"
                    title="Опубликовать сейчас"
                  >
                    {sendingPostId === post.id ? (
                      <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RocketLaunchIcon className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button onClick={() => setPreviewPost(post)} className="p-1.5 bg-black/50 hover:bg-black/70 backdrop-blur-sm rounded-lg text-white transition-colors">
                    <EyeIcon className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <p className="text-white text-[11px] line-clamp-1">{post.hook_text || 'Без хука'}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {post.status === 'draft' ? (
                      <span className="text-[10px] text-gray-300">Не запланирован</span>
                    ) : (
                      <>
                        <ClockIcon className="w-3 h-3 text-white/60" />
                        <span className={`text-[10px] ${isOverdue(post.scheduled_at) ? 'text-amber-300' : 'text-white/60'}`}>
                          {formatDate(post.scheduled_at!)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {selectedPostIds.length > 0 && (
            <div className="border-t border-gray-100 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium text-gray-800">
                  Выбрано: {selectedPostIds.length}
                </span>
                <div className="flex-1" />
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => setActionPanel(actionPanel === 'schedule' ? null : 'schedule')}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                      actionPanel === 'schedule'
                        ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/20'
                        : 'bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200'
                    }`}
                  >
                    <CalendarDaysIcon className="w-4 h-4" />
                    Запланировать
                  </button>
                  {accounts.filter(a => a.id !== selectedAccount?.id).length > 0 && (
                    <button
                      onClick={() => {
                        const others = accounts.filter(a => a.id !== selectedAccount?.id);
                        if (others.length > 0 && !moveTargetAccountId) setMoveTargetAccountId(others[0].id);
                        setActionPanel(actionPanel === 'move' ? null : 'move');
                      }}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                        actionPanel === 'move'
                          ? 'bg-gray-700 text-white shadow-lg shadow-gray-700/20'
                          : 'bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      <ArrowsRightLeftIcon className="w-4 h-4" />
                      Перенести
                    </button>
                  )}
                </div>
              </div>


              {actionPanel === 'schedule' && (
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Первый пост выходит</label>
                    <input
                      type="datetime-local"
                      value={startDateTime}
                      onChange={(e) => setStartDateTime(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Интервал между постами</label>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {[
                        { label: '30м', value: 30 },
                        { label: '1ч', value: 60 },
                        { label: '2ч', value: 120 },
                        { label: '4ч', value: 240 },
                        { label: '8ч', value: 480 },
                        { label: '12ч', value: 720 },
                        { label: '24ч', value: 1440 },
                      ].map(preset => (
                        <button
                          key={preset.value}
                          onClick={() => setIntervalMinutes(preset.value)}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            intervalMinutes === preset.value
                              ? 'bg-teal-600 text-white shadow-md'
                              : 'bg-white text-gray-600 border border-gray-200 hover:border-teal-300 hover:text-teal-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={intervalMinutes}
                        onChange={(e) => setIntervalMinutes(Math.max(1, Number(e.target.value)))}
                        min={1}
                        className="w-20 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
                      />
                      <span className="text-xs text-gray-400">минут (свое значение)</span>
                    </div>
                  </div>

                  {selectedPostIds.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Расписание ({selectedPostIds.length} постов)</label>
                      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-48 overflow-y-auto">
                        {selectedPostIds.map((id, i) => {
                          const post = posts.find(p => p.id === id);
                          const time = new Date(new Date(startDateTime).getTime() + i * intervalMinutes * 60000);
                          return (
                            <div key={id} className="flex items-center gap-3 px-3 py-2">
                              <div className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {i + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-700 truncate">{post?.hook_text || 'Без хука'}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-xs font-medium text-gray-900">
                                  {time.toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                                <p className="text-[10px] text-gray-400">
                                  {time.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between mt-2 px-1">
                        <span className="text-[11px] text-gray-400">
                          Первый: {new Date(startDateTime).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-[11px] text-gray-400">
                          Последний: {new Date(new Date(startDateTime).getTime() + (selectedPostIds.length - 1) * intervalMinutes * 60000).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleScheduleSelected}
                    disabled={isScheduling || !selectedAccount}
                    className="w-full px-5 py-3 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:bg-gray-300 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20 disabled:shadow-none"
                  >
                    {isScheduling ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CalendarDaysIcon className="w-4 h-4" />}
                    Запланировать {selectedPostIds.length} постов
                  </button>
                </div>
              )}

              {actionPanel === 'move' && (
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                  <p className="text-sm text-gray-600">
                    Перенести <strong>{selectedPostIds.length}</strong> постов на другой аккаунт:
                  </p>
                  <div className="space-y-2">
                    {accounts.filter(a => a.id !== selectedAccount?.id).map((account) => (
                      <label
                        key={account.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                          moveTargetAccountId === account.id
                            ? 'border-gray-600 bg-gray-100 ring-1 ring-gray-400/40'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="moveTarget"
                          value={account.id}
                          checked={moveTargetAccountId === account.id}
                          onChange={() => setMoveTargetAccountId(account.id)}
                          className="accent-gray-700"
                        />
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">
                            {(account.account_name || account.username).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{account.account_name || account.username}</p>
                          <p className="text-xs text-gray-500">@{account.username}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                  <button
                    onClick={handleMoveSelected}
                    disabled={isMoving || !moveTargetAccountId}
                    className="w-full px-5 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:bg-gray-300 text-white text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg shadow-gray-700/20 disabled:shadow-none"
                  >
                    {isMoving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <ArrowsRightLeftIcon className="w-4 h-4" />}
                    {isMoving ? 'Переносим...' : `Перенести ${selectedPostIds.length} постов`}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <span className="text-gray-500 text-sm">Загрузка...</span>
        </div>
      )}

      {!isLoading && allQueuePosts.length === 0 && (
        <div className="text-center py-20 bg-gray-50 border border-gray-200 rounded-2xl">
          <CalendarDaysIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">Нет постов</h3>
          <p className="text-sm text-gray-400">
            {selectedAccount ? 'Сгенерируйте контент в Автогенераторе' : 'Выберите аккаунт в боковом меню'}
          </p>
        </div>
      )}

    </div>
  );
};

export default InstagramScheduler;
