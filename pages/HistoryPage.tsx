import React, { useState, useEffect, useCallback } from 'react';
import { getAuthenticatedHeaders, supabase, INSTAGRAM_ACCOUNT_COLUMNS } from '../lib/supabase';
import { ScheduledPost } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import { useSignedUrls } from '../hooks/useSignedUrl';
import { useConfirm } from '../contexts/ModalContext';
import {
  ArrowPathIcon,
  TrashIcon,
  VideoCameraIcon,
  ClockIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  XMarkIcon,
  EyeIcon,
  ChatBubbleLeftEllipsisIcon,
  CalendarIcon,
  SignalIcon,
  ArrowUturnRightIcon,
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
} from '@heroicons/react/24/outline';

type StatusFilter = 'all' | 'published' | 'publishing' | 'pending' | 'failed' | 'draft';

const HistoryPage: React.FC = () => {
  const { user } = useAuth();
  const { selectedAccount, accounts } = useAccount();
  const { confirm, alert } = useConfirm();
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [previewPost, setPreviewPost] = useState<ScheduledPost | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [retryingPostId, setRetryingPostId] = useState<string | null>(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetAccountId, setMoveTargetAccountId] = useState<string>('');
  const [isMoving, setIsMoving] = useState(false);
  const [isShuffling, setIsShuffling] = useState(false);

  const fetchPosts = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    let query = supabase
      .from('scheduled_posts')
      .select(`*, instagram_accounts(${INSTAGRAM_ACCOUNT_COLUMNS})`)
      .eq('user_id', user.id);
    if (selectedAccount) {
      query = query.eq('instagram_account_id', selectedAccount.id);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (!error && data) setPosts(data as ScheduledPost[]);
    setIsLoading(false);
  }, [user, selectedAccount]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleClearOld = async () => {
    if (!user) return;
    const count = posts.filter(p => p.status === 'published' || p.status === 'failed').length;
    if (count === 0) return;
    const ok = await confirm({
      title: 'Очистить историю?',
      message: `Удалить ${count} опубликованных и ошибочных постов из истории?`,
      confirmText: 'Очистить',
      variant: 'danger',
      icon: 'trash',
    });
    if (!ok) return;

    setIsClearing(true);
    const toDelete = posts.filter(p => p.status === 'published' || p.status === 'failed');
    for (const post of toDelete) {
      if (post.status === 'failed' && post.video_path) {
        await supabase.storage.from('reels').remove([post.video_path]);
      }
      await supabase.from('scheduled_posts').delete().eq('id', post.id);
    }
    await fetchPosts();
    setIsClearing(false);
  };

  const handleRetry = async (post: ScheduledPost) => {
    if (!selectedAccount) {
      await alert({
        title: 'Внимание',
        message: 'Выберите аккаунт в боковом меню',
        variant: 'warning',
      });
      return;
    }
    if (!selectedAccount.ig_user_id) {
      await alert({
        title: 'Ошибка аккаунта',
        message: 'Проверьте настройки аккаунта: не найден Instagram User ID.',
        variant: 'error',
      });
      return;
    }
    setRetryingPostId(post.id);
    try {
      await supabase
        .from('scheduled_posts')
        .update({ status: 'pending', error_message: null })
        .eq('id', post.id);

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
        const err: string = result.error;
        if (err.includes('access token') || err.includes('OAuthException') || err.includes('token')) {
          await alert({
            title: 'Ошибка токена',
            message: 'Невалидный или истёкший Access Token. Перейдите в раздел "Аккаунты" и обновите токен.',
            variant: 'error',
          });
        } else if (err.includes('rate limit') || err.includes('spam')) {
          await alert({
            title: 'Лимит Instagram',
            message: 'Превышен лимит публикаций Instagram. Подождите несколько минут и попробуйте снова.',
            variant: 'warning',
          });
        } else {
          await alert({
            title: 'Ошибка публикации',
            message: `Ошибка публикации: ${err}`,
            variant: 'error',
          });
        }
      }
    } catch (e: any) {
      await alert({
        title: 'Ошибка',
        message: `Ошибка: ${e.message}`,
        variant: 'error',
      });
    } finally {
      setRetryingPostId(null);
      await fetchPosts();
    }
  };

  const handleOpenMoveModal = async () => {
    const otherAccounts = accounts.filter(a => a.id !== selectedAccount?.id);
    if (otherAccounts.length === 0) {
      await alert({
        title: 'Нет аккаунтов',
        message: 'Нет других аккаунтов для переноса. Добавьте аккаунт в разделе "Аккаунты".',
        variant: 'info',
      });
      return;
    }
    setMoveTargetAccountId(otherAccounts[0].id);
    setShowMoveModal(true);
  };

  const handleMoveAllPosts = async () => {
    if (!moveTargetAccountId || !user) return;
    const movablePosts = posts.filter(p => p.status === 'pending' || p.status === 'draft');
    if (movablePosts.length === 0) {
      await alert({
        title: 'Нет постов',
        message: 'Нет постов для переноса (только черновики и посты в очереди можно переносить).',
        variant: 'info',
      });
      setShowMoveModal(false);
      return;
    }
    const targetAccount = accounts.find(a => a.id === moveTargetAccountId);
    const ok = await confirm({
      title: 'Перенести посты?',
      message: `Перенести ${movablePosts.length} постов (черновики + в очереди) на аккаунт @${targetAccount?.username}?`,
      confirmText: 'Перенести',
      variant: 'primary',
      icon: 'arrows',
    });
    if (!ok) return;

    setIsMoving(true);
    const { error } = await supabase
      .from('scheduled_posts')
      .update({ instagram_account_id: moveTargetAccountId })
      .in('id', movablePosts.map(p => p.id));

    setIsMoving(false);
    setShowMoveModal(false);

    if (error) {
      await alert({
        title: 'Ошибка переноса',
        message: `Ошибка переноса: ${error.message}`,
        variant: 'error',
      });
    } else {
      await fetchPosts();
    }
  };

  const handleShuffleQueue = async () => {
    if (!user) return;
    const queuedPosts = posts.filter(p => p.status === 'pending' || p.status === 'draft');
    if (queuedPosts.length < 2) {
      await alert({
        title: 'Недостаточно постов',
        message: 'Нужно минимум 2 поста в очереди для перемешивания.',
        variant: 'info',
      });
      return;
    }
    const ok = await confirm({
      title: 'Перемешать очередь?',
      message: `Перемешать ${queuedPosts.length} постов в очереди в случайном порядке?`,
      confirmText: 'Перемешать',
      variant: 'primary',
      icon: 'shuffle',
    });
    if (!ok) return;

    setIsShuffling(true);

    const scheduledTimes = queuedPosts
      .map(p => p.scheduled_at)
      .sort((a, b) => {
        if (!a && !b) return 0;
        if (!a) return 1;
        if (!b) return -1;
        return new Date(a).getTime() - new Date(b).getTime();
      });

    const shuffled = [...queuedPosts];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const updates = shuffled.map((post, idx) => ({
      id: post.id,
      scheduled_at: scheduledTimes[idx] ?? null,
    }));

    for (const update of updates) {
      await supabase
        .from('scheduled_posts')
        .update({ scheduled_at: update.scheduled_at })
        .eq('id', update.id);
    }

    setIsShuffling(false);
    await fetchPosts();
  };

  const stats = {
    total: posts.length,
    published: posts.filter(p => p.status === 'published').length,
    publishing: posts.filter(p => p.status === 'publishing').length,
    pending: posts.filter(p => p.status === 'pending').length,
    failed: posts.filter(p => p.status === 'failed').length,
    draft: posts.filter(p => p.status === 'draft').length,
  };

  const filteredPosts = filter === 'all' ? posts : posts.filter(p => p.status === filter);

  // The reels bucket is private — previews need short-lived signed URLs.
  const videoUrls = useSignedUrls('reels', posts.map(post => post.video_path));

  const getVideoUrl = (path: string | null) => (path ? videoUrls[path] : undefined);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'published':
        return { label: 'Опубликован', bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' };
      case 'publishing':
        return { label: 'В процессе', bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200' };
      case 'pending':
        return { label: 'В очереди', bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200' };
      case 'failed':
        return { label: 'Ошибка', bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
      case 'draft':
        return { label: 'Черновик', bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' };
      default:
        return { label: status, bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' };
    }
  };

  const statCards: { key: StatusFilter; label: string; value: number; color: string; valueColor: string }[] = [
    { key: 'all', label: 'Всего', value: stats.total, color: 'bg-white border-gray-200', valueColor: 'text-gray-900' },
    { key: 'published', label: 'Опубликовано', value: stats.published, color: 'bg-white border-green-200', valueColor: 'text-green-600' },
    { key: 'publishing', label: 'В процессе', value: stats.publishing, color: 'bg-white border-blue-200', valueColor: 'text-blue-600' },
    { key: 'pending', label: 'В очереди', value: stats.pending, color: 'bg-white border-amber-200', valueColor: 'text-amber-600' },
    { key: 'failed', label: 'Ошибки', value: stats.failed, color: 'bg-white border-red-200', valueColor: 'text-red-600' },
  ];

  const movableCount = posts.filter(p => p.status === 'pending' || p.status === 'draft').length;
  const otherAccounts = accounts.filter(a => a.id !== selectedAccount?.id);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-teal-600 flex items-center justify-center shadow-lg">
            <VideoCameraIcon className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              История публикаций
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Все автоматические публикации с их статусами
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={fetchPosts}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors shadow-sm"
          >
            <ArrowPathIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
          {movableCount >= 2 && (
            <button
              onClick={handleShuffleQueue}
              disabled={isShuffling}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white border border-blue-200 hover:bg-blue-50 text-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isShuffling ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowsUpDownIcon className="w-4 h-4" />
              )}
              Перемешать очередь
              <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                {movableCount}
              </span>
            </button>
          )}
          {selectedAccount && otherAccounts.length > 0 && movableCount > 0 && (
            <button
              onClick={handleOpenMoveModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white border border-teal-200 hover:bg-teal-50 text-teal-700 transition-colors shadow-sm"
            >
              <ArrowsRightLeftIcon className="w-4 h-4" />
              Перенести посты
              <span className="bg-teal-100 text-teal-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                {movableCount}
              </span>
            </button>
          )}
          <button
            onClick={handleClearOld}
            disabled={isClearing || (stats.published + stats.failed) === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white border border-red-200 hover:bg-red-50 text-red-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <TrashIcon className="w-4 h-4" />
            Очистить старые
          </button>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-6">
        {statCards.map((card) => (
          <button
            key={card.key}
            onClick={() => setFilter(card.key)}
            className={`relative p-4 rounded-xl border transition-all text-left ${card.color} ${
              filter === card.key
                ? 'ring-2 ring-teal-500/40 border-teal-400 shadow-md'
                : 'hover:shadow-sm'
            }`}
          >
            <p className="text-xs font-medium text-gray-500 mb-1">{card.label}</p>
            <p className={`text-2xl font-bold ${card.valueColor}`}>{card.value}</p>
          </button>
        ))}
      </div>

      <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <SignalIcon className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-800">О будущих публикациях</p>
          <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
            Публикации создаются автоматически <strong>точно в назначенное время</strong> согласно вашему расписанию.
            Они не создаются заранее -- система запускается каждую минуту и проверяет, есть ли расписания на текущую минуту.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <span className="text-gray-500 text-sm">Загрузка...</span>
        </div>
      )}

      {!isLoading && filteredPosts.length === 0 && (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-xl">
          <VideoCameraIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">
            {filter === 'all' ? 'Нет публикаций' : 'Нет постов с таким статусом'}
          </h3>
          <p className="text-sm text-gray-400">
            {filter === 'all'
              ? 'Здесь будут отображаться все ваши публикации'
              : 'Попробуйте выбрать другой фильтр'}
          </p>
        </div>
      )}

      {!isLoading && filteredPosts.length > 0 && (
        <div className="space-y-3">
          {filteredPosts.map((post) => {
            const statusConfig = getStatusConfig(post.status);
            const account = post.instagram_accounts;
            return (
              <div
                key={post.id}
                className={`bg-white border rounded-xl overflow-hidden transition-all hover:shadow-md ${
                  post.status === 'failed' ? 'border-red-200' : 'border-gray-200'
                }`}
              >
                <div className="flex">
                  {post.status === 'published' || !post.video_path ? (
                    <div className="w-32 h-32 flex-shrink-0 bg-green-50 flex items-center justify-center">
                      <CheckCircleIcon className="w-10 h-10 text-green-400" />
                    </div>
                  ) : (
                    <div className="w-32 h-32 flex-shrink-0 relative bg-gray-100 group cursor-pointer" onClick={() => setPreviewPost(post)}>
                      <video
                        src={getVideoUrl(post.video_path)}
                        className="w-full h-full object-cover"
                        muted
                        preload="metadata"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        <EyeIcon className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      {post.status === 'failed' && (
                        <div className="absolute inset-0 bg-red-100/60 flex items-center justify-center">
                          <ExclamationCircleIcon className="w-10 h-10 text-red-500" />
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex-1 p-4 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusConfig.bg} ${statusConfig.text}`}>
                        {statusConfig.label}
                      </span>
                      {account && (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600 flex items-center gap-1">
                          @{account.username}
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-gray-700 line-clamp-2 mb-3">
                      {post.caption || 'Без описания'}
                    </p>

                    {post.status === 'failed' && (
                      <div className="mb-3">
                        {post.error_message && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 mb-2">
                            <p className="text-xs text-red-700 flex items-start gap-1.5">
                              <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                              <span>{post.error_message}</span>
                            </p>
                          </div>
                        )}
                        <button
                          onClick={() => handleRetry(post)}
                          disabled={retryingPostId === post.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 rounded-lg transition-colors"
                        >
                          {retryingPostId === post.id ? (
                            <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <ArrowUturnRightIcon className="w-3.5 h-3.5" />
                          )}
                          Повторить публикацию
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <ClockIcon className="w-3.5 h-3.5" />
                        Создано: {formatDate(post.created_at)}
                      </span>
                      {post.scheduled_at && (
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-3.5 h-3.5" />
                          Запланировано: {formatDate(post.scheduled_at)}
                        </span>
                      )}
                      {post.published_at && (
                        <span className="flex items-center gap-1 text-green-500">
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                          Опубликовано: {formatDate(post.published_at)}
                        </span>
                      )}
                      {post.hook_text && (
                        <span className="flex items-center gap-1">
                          <ChatBubbleLeftEllipsisIcon className="w-3.5 h-3.5" />
                          {post.hook_text.length > 40 ? post.hook_text.substring(0, 40) + '...' : post.hook_text}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {previewPost && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewPost(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-sm w-full max-h-[95vh] overflow-y-auto flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="font-semibold text-gray-900">Предпросмотр</h3>
                {previewPost.hook_text && (
                  <p className="text-xs text-teal-600 mt-0.5 line-clamp-1">{previewPost.hook_text}</p>
                )}
              </div>
              <button
                onClick={() => setPreviewPost(null)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="flex-1 bg-gray-900">
              <video
                src={getVideoUrl(previewPost.video_path)}
                className="w-full max-h-[70vh] object-contain"
                controls
                autoPlay
              />
            </div>
            <div className="p-4 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${getStatusConfig(previewPost.status).bg} ${getStatusConfig(previewPost.status).text}`}>
                  {getStatusConfig(previewPost.status).label}
                </span>
                {previewPost.scheduled_at && (
                  <span className="text-xs text-gray-500">{formatDate(previewPost.scheduled_at)}</span>
                )}
              </div>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {previewPost.caption || 'Без описания'}
              </p>
              {previewPost.error_message && (
                <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-2.5">
                  <p className="text-xs text-red-700">{previewPost.error_message}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showMoveModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowMoveModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                  <ArrowsRightLeftIcon className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Перенести посты на другой аккаунт</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Переносятся только черновики и посты в очереди
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMoveModal(false)}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-5">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-5">
                <p className="text-sm text-amber-800">
                  Будет перенесено <strong>{movableCount}</strong> постов (черновики + в очереди) с аккаунта{' '}
                  <strong>@{selectedAccount?.username}</strong>
                </p>
              </div>

              <label className="block text-sm font-medium text-gray-700 mb-2">
                Перенести на аккаунт:
              </label>
              <div className="space-y-2 mb-5">
                {otherAccounts.map((account) => (
                  <label
                    key={account.id}
                    className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                      moveTargetAccountId === account.id
                        ? 'border-teal-400 bg-teal-50 ring-1 ring-teal-400/40'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="targetAccount"
                      value={account.id}
                      checked={moveTargetAccountId === account.id}
                      onChange={() => setMoveTargetAccountId(account.id)}
                      className="accent-teal-500"
                    />
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">
                          {(account.account_name || account.username).charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{account.account_name || account.username}</p>
                        <p className="text-xs text-gray-500">@{account.username}</p>
                      </div>
                    </div>
                    {!account.is_active && (
                      <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                        Отключен
                      </span>
                    )}
                  </label>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowMoveModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={handleMoveAllPosts}
                  disabled={isMoving || !moveTargetAccountId}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white transition-colors"
                >
                  {isMoving ? (
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <ArrowsRightLeftIcon className="w-4 h-4" />
                  )}
                  {isMoving ? 'Переносим...' : `Перенести ${movableCount} постов`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryPage;
