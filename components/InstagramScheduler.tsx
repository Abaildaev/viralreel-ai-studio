import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getAuthenticatedHeaders, supabase, INSTAGRAM_ACCOUNT_COLUMNS } from '../lib/supabase';
import { ScheduledPost } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import VideoThumb from './scheduler/VideoThumb';
import { useSignedUrls } from '../hooks/useSignedUrl';
import { useConfirm } from '../contexts/ModalContext';
import CustomDatePicker from './CustomDatePicker';
import CustomTimePicker from './CustomTimePicker';
import SchedulerCalendarView from './SchedulerCalendarView';
import TimezonePicker from './TimezonePicker';
import {
  dayLabelInTimezone,
  formatInTimezone,
  INSTAGRAM_DAILY_LIMIT,
  loadPublishWindow,
  maxPostsPerDay,
  nextSlotTimes,
  WEEKDAY_OPTIONS,
} from '../utils/scheduleUtils';
import {
  CalendarDaysIcon,
  TrashIcon,
  ClockIcon,
  ArrowPathIcon,
  PlayIcon,
  XMarkIcon,
  EyeIcon,
  QueueListIcon,
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
  ArrowUturnLeftIcon,
  RocketLaunchIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline';
import { Callout, PageHeader, PageShell } from './ui';

interface TelegramSettings {
  bot_token: string;
  chat_id: string;
  is_active: boolean;
}

/** "YYYY-MM-DD" for the date field, in the browser's local calendar. */
function toDateInputValue(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Rounds up to the next half hour, the granularity of the time grid. */
function nextHalfHour(date: Date): string {
  const rounded = new Date(date.getTime());
  rounded.setSeconds(0, 0);
  rounded.setMinutes(rounded.getMinutes() > 30 ? 60 : 30);
  return `${rounded.getHours().toString().padStart(2, '0')}:${rounded.getMinutes().toString().padStart(2, '0')}`;
}

/** Supabase may return a UTC timestamp without the trailing timezone marker. */
function appendZ(dateStr: string): string {
  const normalized = dateStr.replace(' ', 'T');
  return normalized.endsWith('Z') || normalized.includes('+')
    ? normalized
    : `${normalized}Z`;
}

const InstagramScheduler: React.FC = () => {
  const { user } = useAuth();
  const { selectedAccount, accounts } = useAccount();
  const { confirm, alert } = useConfirm();
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sendingPostId, setSendingPostId] = useState<string | null>(null);
  const [previewPost, setPreviewPost] = useState<ScheduledPost | null>(null);
  /*
    Loaded but not read yet, and deliberately kept: Telegram publishing is
    half-built. Settings can be entered and tested on the Settings page, and the
    `publish-telegram` function exists, but nothing calls it — not this
    component and not the cron. Deleting this would erase the last trace of the
    missing wiring; see the note in README.
  */
  const [telegramSettings, setTelegramSettings] = useState<TelegramSettings | null>(null);

  const [viewTab, setViewTab] = useState<'queue' | 'calendar'>('queue');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [isScheduling, setIsScheduling] = useState(false);

  const [scheduleMode, setScheduleMode] = useState<'slots' | 'interval'>('slots');
  const [startDate, setStartDate] = useState(() => toDateInputValue(new Date()));
  const [startTime, setStartTime] = useState(() => nextHalfHour(new Date()));
  const [slotWeekdays, setSlotWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [slotTimes, setSlotTimes] = useState<string[]>(['11:00', '19:00']);
  const [timezone, setTimezone] = useState('Europe/Moscow');

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



  // The publish window lives on the profile; the scheduler used to ignore it.
  useEffect(() => {
    if (!user) return;
    loadPublishWindow(user.id).then(window => setTimezone(window.timezone));
  }, [user]);

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
      .select(`*, instagram_accounts(${INSTAGRAM_ACCOUNT_COLUMNS})`)
      .eq('user_id', user.id);
    if (selectedAccount) {
      query = query.eq('instagram_account_id', selectedAccount.id);
    }
    query = query.in('status', ['draft', 'pending']);
    const { data, error } = await query.order('sort_order', { ascending: true });
    if (!error && data) setPosts(data as ScheduledPost[]);
    setIsLoading(false);
  };

  const allQueuePosts = posts;
  /* Selection is a set in the UI; scheduling must always follow the visible
     queue order, never the order in which cards were clicked. */
  const orderedSelectedPostIds = useMemo(
    () => allQueuePosts
      .filter(post => selectedPostIds.includes(post.id))
      .map(post => post.id),
    [allQueuePosts, selectedPostIds],
  );



  /* Selected posts that are actually on the schedule. A draft has nothing to
     be taken off, and a post already being published is past recall. */
  const scheduledSelection = useMemo(
    () => allQueuePosts.filter(
      (post) => selectedPostIds.includes(post.id)
        && post.scheduled_at
        && post.status === 'pending',
    ),
    [allQueuePosts, selectedPostIds],
  );

  /*
    Takes posts off the schedule without destroying them.

    Deleting was the only way to stop a publication, and it removes the video
    from storage with the row — an hour of rendering gone because the time was
    wrong. This returns them to drafts instead: same queue, same files, no
    date, and the publisher only ever looks at `pending`.

    The update is conditional on the status it expects. Between drawing the
    queue and clicking the button the worker may have claimed a post, and a
    plain update by id would pull it out from under a publication already on
    its way to Instagram. Written this way the cancel simply loses that race,
    and says how many it got.
  */
  const handleUnscheduleSelected = async () => {
    if (scheduledSelection.length === 0) return;

    const ok = await confirm({
      title: 'Снять с публикации?',
      message: `${scheduledSelection.length} постов вернутся в черновики. Видео и тексты останутся на месте — можно будет запланировать заново.`,
      confirmText: 'Снять',
      variant: 'warning',
      icon: 'arrows',
    });
    if (!ok) return;

    const { data, error } = await supabase
      .from('scheduled_posts')
      .update({ status: 'draft', scheduled_at: null, error_message: null })
      .in('id', scheduledSelection.map((post) => post.id))
      .eq('status', 'pending')
      .select('id');

    if (error) {
      setPublishStatus({ type: 'error', msg: `Не удалось снять с публикации: ${error.message}` });
      return;
    }

    const removed = data?.length ?? 0;
    const missed = scheduledSelection.length - removed;
    setPublishStatus({
      type: missed > 0 ? 'error' : 'success',
      msg: missed > 0
        ? `Снято ${removed} из ${scheduledSelection.length}. Остальные уже публикуются — их не остановить.`
        : `Снято с публикации: ${removed}. Посты ждут в черновиках.`,
    });

    setSelectedPostIds([]);
    await fetchPosts();
  };

  const handleDeleteSelected = async () => {
    if (selectedPostIds.length === 0) return;
    const ok = await confirm({
      title: 'Удалить посты?',
      message: `Вы действительно хотите удалить ${selectedPostIds.length} постов из очереди? Это действие нельзя отменить.`,
      confirmText: 'Удалить',
      variant: 'danger',
      icon: 'trash',
    });
    if (!ok) return;

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
    if (plannedTimes.length !== orderedSelectedPostIds.length || !selectedAccount || !user) return;
    setIsScheduling(true);
    try {
      // One round trip's worth of latency instead of one request per post.
      const results = await Promise.all(
        orderedSelectedPostIds.map((id, index) =>
          supabase
            .from('scheduled_posts')
            .update({
              scheduled_at: plannedTimes[index].toISOString(),
              status: 'pending',
              error_message: null,
              publish_attempts: 0,
            })
            .eq('id', id),
        ),
      );

      const failed = results.filter(result => result.error);
      if (failed.length) {
        setPublishStatus({ type: 'error', msg: `Не удалось запланировать ${failed.length} из ${results.length}: ${failed[0].error?.message}` });
      } else {
        setPublishStatus({ type: 'success', msg: `Запланировано ${results.length} — первый ${formatInTimezone(plannedTimes[0], timezone)}` });
      }

      setSelectedPostIds([]);
      setActionPanel(null);
      await fetchPosts();
    } catch (error: any) {
      setPublishStatus({ type: 'error', msg: `Ошибка: ${error.message}` });
    } finally {
      setIsScheduling(false);
      setTimeout(() => setPublishStatus(null), 6000);
    }
  };

  /** Minutes already occupied by posts that are not part of this batch. */
  const busyTimes = useMemo(
    () => posts
      .filter(post => post.status === 'pending' && post.scheduled_at && !selectedPostIds.includes(post.id))
      .map(post => new Date(appendZ(post.scheduled_at!))),
    [posts, selectedPostIds],
  );

  const plannedTimes = useMemo(() => {
    const count = selectedPostIds.length;
    if (count === 0) return [];

    if (scheduleMode === 'slots') {
      const from = new Date(Math.max(new Date(`${startDate}T00:00`).getTime(), Date.now()));
      return nextSlotTimes({ weekdays: slotWeekdays, times: slotTimes, timezone }, count, from, busyTimes);
    }

    const start = new Date(`${startDate}T${startTime}`);
    return Array.from({ length: count }, (_, index) =>
      new Date(start.getTime() + index * intervalMinutes * 60000));
  }, [selectedPostIds, scheduleMode, startDate, startTime, slotWeekdays, slotTimes, timezone, intervalMinutes, busyTimes]);

  const planWarnings = useMemo(() => {
    const warnings: string[] = [];
    if (selectedPostIds.length === 0) return warnings;

    if (plannedTimes.length < selectedPostIds.length) {
      warnings.push('Выбранных слотов не хватает на все посты — добавьте день недели или время.');
    }
    if (plannedTimes[0] && plannedTimes[0].getTime() <= Date.now()) {
      warnings.push('Первый пост назначен в прошлом — он опубликуется сразу при ближайшей проверке.');
    }
    const perDay = maxPostsPerDay(plannedTimes);
    if (perDay > INSTAGRAM_DAILY_LIMIT) {
      warnings.push(`${perDay} публикаций за сутки — Instagram разрешает не больше ${INSTAGRAM_DAILY_LIMIT}, лишние вернут ошибку.`);
    }
    return warnings;
  }, [plannedTimes, selectedPostIds]);

  const toggleWeekday = (value: number) =>
    setSlotWeekdays(current => current.includes(value)
      ? current.filter(day => day !== value)
      : [...current, value]);

  const toggleSlotTime = (value: string) =>
    setSlotTimes(current => current.includes(value)
      ? current.filter(time => time !== value)
      : [...current, value].sort());

  const changeTimezone = async (value: string) => {
    setTimezone(value);
    if (user) await supabase.from('profiles').update({ timezone: value }).eq('id', user.id);
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
      await alert({
        title: 'Ошибка переноса',
        message: error.message,
        variant: 'error',
      });
    } else {
      setSelectedPostIds([]);
      setActionPanel(null);
      await fetchPosts();
    }
  };

  const handleShuffleQueue = async () => {
    if (allQueuePosts.length < 2) return;
    const ok = await confirm({
      title: 'Перемешать очередь?',
      message: `Перемешать ${allQueuePosts.length} постов в случайном порядке?`,
      confirmText: 'Перемешать',
      variant: 'primary',
      icon: 'shuffle',
    });
    if (!ok) return;

    setIsShuffling(true);

    const shuffledQueue = [...allQueuePosts];
    for (let i = shuffledQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledQueue[i], shuffledQueue[j]] = [shuffledQueue[j], shuffledQueue[i]];
    }

    /* Existing scheduled posts need their actual publication slots swapped;
       changing sort_order alone only changes the cards in the UI because the
       worker publishes by scheduled_at. */
    const scheduled = allQueuePosts
      .filter(post => post.status === 'pending' && post.scheduled_at)
      .sort((left, right) => Date.parse(appendZ(left.scheduled_at!)) - Date.parse(appendZ(right.scheduled_at!)));
    const scheduledTimes = scheduled.map(post => post.scheduled_at!);
    const shuffledScheduled = shuffledQueue.filter(post =>
      post.status === 'pending' && post.scheduled_at,
    );
    const scheduledTimeById = new Map(
      shuffledScheduled.map((post, index) => [post.id, scheduledTimes[index]]),
    );

    const updates = await Promise.all(shuffledQueue.map((post, index) =>
      supabase
        .from('scheduled_posts')
        .update({
          sort_order: index + 1,
          ...(scheduledTimeById.has(post.id)
            ? { scheduled_at: scheduledTimeById.get(post.id) }
            : {}),
        })
        .eq('id', post.id),
    ));
    const failedUpdate = updates.find(result => result.error);
    if (failedUpdate?.error) {
      setPublishStatus({ type: 'error', msg: `Не удалось перемешать очередь: ${failedUpdate.error.message}` });
    } else {
      setPosts(shuffledQueue);
      setSelectedPostIds(current => shuffledQueue
        .filter(post => current.includes(post.id))
        .map(post => post.id));
      setPublishStatus({ type: 'success', msg: 'Очередь и порядок публикаций перемешаны' });
    }

    /* Re-read the server order after all updates so a later scheduling action
       uses the same order the worker will see. */
    await fetchPosts();

    /* Keep this guard close to the updates: an empty time list is valid when
       the queue contains only drafts. */
    if (scheduled.length !== shuffledScheduled.length) {
      console.warn('Scheduler queue changed while shuffling scheduled slots');
    }

    setIsShuffling(false);
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

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${index}`);
  };

  const handleDragEnter = (index: number) => {
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null || dragOverIndex === null || draggedIndex === dragOverIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updatedQueue = [...allQueuePosts];
    const [moved] = updatedQueue.splice(draggedIndex, 1);
    updatedQueue.splice(dragOverIndex, 0, moved);

    const queueIds = new Set(updatedQueue.map(p => p.id));
    const nonQueue = posts.filter(p => !queueIds.has(p.id));
    setPosts([...updatedQueue, ...nonQueue]);

    setDraggedIndex(null);
    setDragOverIndex(null);

    try {
      for (let i = 0; i < updatedQueue.length; i++) {
        await supabase
          .from('scheduled_posts')
          .update({ sort_order: i })
          .eq('id', updatedQueue[i].id);
      }
    } catch (err) {
      console.error('Failed to save reordered posts:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(appendZ(dateStr)).toLocaleString('ru-RU', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
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

  // The reels bucket is private — previews need short-lived signed URLs.
  const videoUrls = useSignedUrls('reels', posts.map(post => post.video_path));

  const getVideoUrl = (path: string | null) => (path ? videoUrls[path] : undefined);

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


  return (
    <PageShell>
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
      <PageHeader
        title={selectedAccount ? `Планировщик · @${selectedAccount.username}` : 'Планировщик'}
        description={
          selectedAccount
            ? `${draftPosts.length} черновиков, ${scheduledPosts.length} запланировано`
            : 'Выберите аккаунт для просмотра постов'
        }
      />

      <Callout tone="success" icon={<CalendarDaysIcon className="h-4 w-4" />} className="mb-5">
        <p className="font-medium">Авто-публикация активна</p>
        <p className="mt-0.5 text-xs leading-relaxed">
          Запланированные посты публикуются автоматически по расписанию (серверный cron каждую
          минуту)
        </p>
      </Callout>



      {previewPost && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => { setPreviewPost(null); setEditingCaption(null); }}>
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full max-h-[95vh] overflow-y-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-semibold text-gray-900">Предпросмотр</h3>
                {previewPost.hook_text && <p className="text-xs text-brand-600 mt-0.5 line-clamp-1">{previewPost.hook_text}</p>}
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
                    className="w-full text-sm text-gray-700 border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 resize-none"
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
                        className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 rounded-lg transition-colors"
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
                      className="text-xs text-brand-600 hover:text-brand-700 font-medium"
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

      {posts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
          {/* View Mode Switcher Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5 border-b border-gray-100 pb-4">
            <div className="flex items-center gap-2">
              <div className="bg-gray-100 p-1 rounded-xl flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setViewTab('queue')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    viewTab === 'queue'
                      ? 'bg-white text-brand-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <QueueListIcon className="w-4 h-4 text-brand-600" />
                  <span>Очередь постов</span>
                  <span className="px-1.5 py-0.2 text-[10px] bg-brand-50 text-brand-700 rounded-full font-bold">
                    {allQueuePosts.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewTab('calendar')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    viewTab === 'calendar'
                      ? 'bg-white text-brand-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <CalendarDaysIcon className="w-4 h-4 text-brand-600" />
                  <span>Календарь на месяц</span>
                  <span className="px-1.5 py-0.2 text-[10px] bg-brand-50 text-brand-700 rounded-full font-bold">
                    {posts.filter(p => p.scheduled_at).length}
                  </span>
                </button>
              </div>
            </div>

            {viewTab === 'queue' && (
              <div className="flex items-center gap-2 flex-wrap">
                {scheduledSelection.length > 0 && (
                  <button
                    onClick={handleUnscheduleSelected}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-amber-700 hover:bg-amber-50 border border-amber-200 transition-colors"
                  >
                    <ArrowUturnLeftIcon className="w-3.5 h-3.5 inline mr-1" />
                    Снять с публикации {scheduledSelection.length}
                  </button>
                )}
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
                <button onClick={selectAll} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                  {selectedPostIds.length === allQueuePosts.length ? 'Снять' : 'Выбрать все'}
                </button>
              </div>
            )}
          </div>

          {viewTab === 'calendar' ? (
            <SchedulerCalendarView
              posts={posts}
              onPreviewPost={setPreviewPost}
              timezone={timezone}
            />
          ) : (
            <>
              {allQueuePosts.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  Очередь постов пуста. Создайте видео в Генераторе.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-4">
                  {allQueuePosts.map((post, index) => {
                    const isDragged = draggedIndex === index;
                    const isOver = dragOverIndex === index;

                    return (
                      <div
                        key={post.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragEnter={() => handleDragEnter(index)}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnd={handleDragEnd}
                        onClick={() => togglePostSelection(post.id)}
                        className={`relative cursor-grab active:cursor-grabbing rounded-xl overflow-hidden border-2 transition-all group ${
                          isOver
                            ? 'border-brand-500 ring-4 ring-brand-400/30 scale-105 shadow-xl bg-brand-50/20'
                            : isDragged
                            ? 'opacity-40 border-dashed border-brand-400'
                            : selectedPostIds.includes(post.id)
                            ? 'border-brand-500 ring-2 ring-brand-500/20'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        title="Кликните для выбора, перетащите мышкой для смены порядка в очереди"
                      >
                        <VideoThumb post={post} url={getVideoUrl(post.video_path)} isActive={false} />

                        {/* Drag Handle Indicator */}
                        <div
                          className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded-md text-white text-[10px] font-bold opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none"
                        >
                          <Bars3Icon className="w-3 h-3 text-brand-300" />
                          <span>#{index + 1}</span>
                        </div>

                        {selectedPostIds.includes(post.id) && (
                          <div className="absolute top-2 left-12 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-md">
                            ✓
                          </div>
                        )}

                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handlePublishNow(post)}
                            disabled={sendingPostId === post.id}
                            className="p-1.5 bg-brand-600/80 hover:bg-brand-600 backdrop-blur-sm rounded-lg text-white transition-colors disabled:opacity-50"
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
                    );
                  })}
                </div>
              )}
            </>
          )}

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
                        ? 'bg-brand-600 text-white shadow-lg'
                        : 'bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200'
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
                          ? 'bg-gray-700 text-white shadow-lg'
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setScheduleMode('slots')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          scheduleMode === 'slots'
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        По слотам (дни и время)
                      </button>
                      <button
                        onClick={() => setScheduleMode('interval')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          scheduleMode === 'interval'
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        С интервалом
                      </button>
                    </div>

                    <TimezonePicker
                      value={timezone}
                      onChange={changeTimezone}
                    />
                  </div>

                  {scheduleMode === 'slots' ? (
                    <div className="space-y-4">
                      <CustomDatePicker
                        label="Начиная с даты"
                        value={startDate}
                        onChange={setStartDate}
                      />

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Дни недели</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {WEEKDAY_OPTIONS.map(day => (
                            <button
                              key={day.value}
                              onClick={() => toggleWeekday(day.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                slotWeekdays.includes(day.value)
                                  ? 'bg-brand-600 text-white shadow-sm'
                                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              {day.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Время публикаций (слоты)</label>
                        <div className="flex gap-2 flex-wrap">
                          {['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'].map(t => (
                            <button
                              key={t}
                              onClick={() => toggleSlotTime(t)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                slotTimes.includes(t)
                                  ? 'bg-brand-600 text-white shadow-sm'
                                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <CustomDatePicker
                          label="Дата первого поста"
                          value={startDate}
                          onChange={setStartDate}
                        />
                        <CustomTimePicker
                          label="Время первого поста"
                          value={startTime}
                          onChange={setStartTime}
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
                                  ? 'bg-brand-600 text-white shadow-md'
                                  : 'bg-white text-gray-600 border border-gray-200 hover:border-brand-300 hover:text-brand-700'
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
                            className="w-20 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500"
                          />
                          <span className="text-xs text-gray-400">минут (свое значение)</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {planWarnings.length > 0 && (
                    <div className="space-y-1">
                      {planWarnings.map((w, idx) => (
                        <p key={idx} className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                          ⚠️ {w}
                        </p>
                      ))}
                    </div>
                  )}

                  {selectedPostIds.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Расписание ({selectedPostIds.length} постов)</label>
                      <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-48 overflow-y-auto">
                        {orderedSelectedPostIds.map((id, i) => {
                          const post = posts.find(p => p.id === id);
                          const time = plannedTimes[i];
                          return (
                            <div key={id} className="flex items-center gap-3 px-3 py-2">
                              <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {i + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-700 truncate">{post?.hook_text || 'Без хука'}</p>
                              </div>
                              <div className="text-right flex-shrink-0">
                                {time ? (
                                  <>
                                    <p className="text-xs font-medium text-gray-900">
                                      {formatInTimezone(time, timezone)}
                                    </p>
                                    <p className="text-[10px] text-gray-400">
                                      {dayLabelInTimezone(time, timezone)}
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-xs text-red-500">Нет слота</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {plannedTimes.length > 0 && (
                        <div className="flex items-center justify-between mt-2 px-1">
                          <span className="text-[11px] text-gray-400">
                            Первый: {formatInTimezone(plannedTimes[0], timezone)}
                          </span>
                          <span className="text-[11px] text-gray-400">
                            Последний: {formatInTimezone(plannedTimes[plannedTimes.length - 1], timezone)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleScheduleSelected}
                    disabled={isScheduling || !selectedAccount || plannedTimes.length !== selectedPostIds.length}
                    className="w-full px-5 py-3 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 text-white text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-lg disabled:shadow-none"
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
                        <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
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
                    className="w-full px-5 py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 disabled:bg-gray-300 text-white text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-lg disabled:shadow-none"
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
          <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <span className="text-gray-500 text-sm">Загрузка...</span>
        </div>
      )}

      {!isLoading && allQueuePosts.length === 0 && (
        <div className="text-center py-20 bg-gray-50 border border-gray-200 rounded-xl">
          <CalendarDaysIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">Нет постов</h3>
          <p className="text-sm text-gray-400">
            {selectedAccount ? 'Сгенерируйте контент в Автогенераторе' : 'Выберите аккаунт в боковом меню'}
          </p>
        </div>
      )}

    </PageShell>
  );
};

export default InstagramScheduler;
