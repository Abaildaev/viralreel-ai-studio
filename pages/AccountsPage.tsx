import React, { useState, useEffect } from 'react';
import { getAuthenticatedHeaders, supabase } from '../lib/supabase';
import { InstagramAccount } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAccount } from '../contexts/AccountContext';
import {
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserCircleIcon,
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface AccountPreview {
  ig_user_id: string;
  username: string;
  name: string;
  profile_picture_url: string;
  followers_count?: number;
  media_count?: number;
}

const AccountsPage: React.FC = () => {
  const { user } = useAuth();
  const { refreshAccounts } = useAccount();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTokenId, setShowTokenId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verificationResults, setVerificationResults] = useState<Record<string, { valid: boolean; error?: string; info?: any }>>({});

  const [accessToken, setAccessToken] = useState('');
  const [connectError, setConnectError] = useState('');
  const [connectStep, setConnectStep] = useState('');
  const [accountPreview, setAccountPreview] = useState<AccountPreview | null>(null);

  useEffect(() => {
    if (user) {
      loadAccounts();
    }
  }, [user]);

  const loadAccounts = async () => {
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('instagram_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAccounts(data);
    }
    setLoading(false);
    refreshAccounts();
  };

  const fetchAccountInfo = async (token: string): Promise<AccountPreview | null> => {
    // Try Instagram token (IGAA...)
    if (token.startsWith('IGAA')) {
      const res = await fetch(
        `https://graph.instagram.com/me?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${token}`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      return {
        ig_user_id: data.id,
        username: data.username || data.name || data.id,
        name: data.name || data.username || '',
        profile_picture_url: data.profile_picture_url || '',
        followers_count: data.followers_count,
        media_count: data.media_count,
      };
    }

    // Try Facebook token (EAA...) — get linked Instagram account
    const pagesRes = await fetch(
      `https://graph.facebook.com/v25.0/me/accounts?fields=id,name,instagram_business_account&access_token=${token}`
    );
    const pagesData = await pagesRes.json();
    if (pagesData.error) throw new Error(pagesData.error.message);

    const pages = pagesData.data || [];
    for (const page of pages) {
      if (page.instagram_business_account) {
        const igRes = await fetch(
          `https://graph.facebook.com/v25.0/${page.instagram_business_account.id}?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${token}`
        );
        const igData = await igRes.json();
        if (igData.error) throw new Error(igData.error.message);
        return {
          ig_user_id: igData.id,
          username: igData.username || igData.name || igData.id,
          name: igData.name || igData.username || '',
          profile_picture_url: igData.profile_picture_url || '',
          followers_count: igData.followers_count,
          media_count: igData.media_count,
        };
      }
    }

    throw new Error('Не найден привязанный Instagram аккаунт. Убедитесь что Facebook Page связана с Instagram Business/Creator аккаунтом.');
  };

  const handleCheckToken = async () => {
    if (!accessToken.trim()) return;

    setSaving(true);
    setConnectError('');
    setConnectStep('Проверяю токен...');
    setAccountPreview(null);

    try {
      const info = await fetchAccountInfo(accessToken.trim());
      if (!info) throw new Error('Не удалось получить данные аккаунта');
      setAccountPreview(info);
      setConnectStep('');
    } catch (err: any) {
      setConnectError(err.message || 'Невалидный токен');
      setConnectStep('');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmConnect = async () => {
    if (!user || !accountPreview) return;

    setSaving(true);
    setConnectStep('Сохраняю аккаунт...');

    try {
      const { error } = await supabase
        .from('instagram_accounts')
        .insert({
          user_id: user.id,
          account_name: accountPreview.name || `@${accountPreview.username}`,
          username: accountPreview.username,
          ig_user_id: accountPreview.ig_user_id,
          access_token: accessToken.trim(),
          profile_picture_url: accountPreview.profile_picture_url,
        });

      if (error) throw error;

      setAccessToken('');
      setShowAddForm(false);
      setConnectStep('');
      setAccountPreview(null);
      loadAccounts();
    } catch (err: any) {
      setConnectError(err.message || 'Ошибка сохранения');
      setConnectStep('');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Удалить этот аккаунт?')) return;

    const { error } = await supabase
      .from('instagram_accounts')
      .delete()
      .eq('id', id);

    if (!error) {
      loadAccounts();
    }
  };

  const toggleAccountStatus = async (account: InstagramAccount) => {
    const { error } = await supabase
      .from('instagram_accounts')
      .update({ is_active: !account.is_active })
      .eq('id', account.id);

    if (!error) {
      loadAccounts();
    }
  };

  const verifyToken = async (account: InstagramAccount) => {
    setVerifyingId(account.id);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-instagram-token`,
        {
          method: 'POST',
          headers: await getAuthenticatedHeaders(),
          body: JSON.stringify({
            ig_user_id: account.ig_user_id,
            access_token: account.access_token,
          }),
        }
      );

      const result = await response.json();

      // Update profile picture if available and different
      if (result.valid && result.account_info?.profile_picture_url) {
        await supabase
          .from('instagram_accounts')
          .update({ profile_picture_url: result.account_info.profile_picture_url })
          .eq('id', account.id);
        loadAccounts();
      }

      setVerificationResults(prev => ({
        ...prev,
        [account.id]: result
      }));
    } catch (error: any) {
      setVerificationResults(prev => ({
        ...prev,
        [account.id]: { valid: false, error: error.message }
      }));
    } finally {
      setVerifyingId(null);
    }
  };

  const resetForm = () => {
    setShowAddForm(false);
    setConnectError('');
    setAccessToken('');
    setAccountPreview(null);
    setConnectStep('');
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Instagram аккаунты</h1>
        <p className="text-gray-500">
          Подключите аккаунты для автоматической публикации Reels
        </p>
      </div>

      <div className="mb-6">
        <button
          onClick={() => { setShowAddForm(!showAddForm); setAccountPreview(null); setConnectError(''); }}
          className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-medium transition-colors shadow-lg shadow-teal-600/20"
        >
          <PlusIcon className="w-5 h-5" />
          Добавить аккаунт
        </button>
      </div>

      {showAddForm && (
        <div className="mb-8 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          {!accountPreview ? (
            <>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Подключить Instagram</h3>
              <p className="text-sm text-gray-500 mb-5">Вставьте Access Token — проверим подключение</p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Access Token</label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => { setAccessToken(e.target.value); setConnectError(''); }}
                  placeholder="EAAx... или IGAA..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 font-mono text-sm"
                />
              </div>

              {connectError && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                  <XCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-800">Ошибка подключения</p>
                    <p className="text-sm text-red-600 mt-0.5">{connectError}</p>
                  </div>
                </div>
              )}

              {connectStep && (
                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-center gap-2">
                  <ArrowPathIcon className="w-4 h-4 text-blue-500 animate-spin" />
                  <p className="text-sm text-blue-700">{connectStep}</p>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <p className="text-sm font-medium text-gray-700 mb-2">Как получить токен:</p>
                <ol className="text-sm text-gray-500 space-y-1 list-decimal list-inside">
                  <li>Зайдите в <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:text-teal-500">Meta for Developers</a></li>
                  <li>Создайте приложение → Instagram Graph API</li>
                  <li>Скопируйте Long-Lived Access Token</li>
                </ol>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleCheckToken}
                  disabled={saving || !accessToken.trim()}
                  className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      Проверяю...
                    </>
                  ) : (
                    <>
                      <ShieldCheckIcon className="w-4 h-4" />
                      Проверить токен
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                >
                  Отмена
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-5">
                <CheckCircleIcon className="w-6 h-6 text-green-500" />
                <h3 className="text-lg font-semibold text-green-800">Аккаунт найден!</h3>
              </div>

              <div className="bg-gradient-to-r from-gray-50 to-green-50 border border-green-200 rounded-xl p-5 mb-5">
                <div className="flex items-center gap-4">
                  {accountPreview.profile_picture_url ? (
                    <img
                      src={accountPreview.profile_picture_url}
                      alt={accountPreview.username}
                      className="w-20 h-20 rounded-2xl object-cover shadow-lg border-2 border-white"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 flex items-center justify-center text-white font-bold text-3xl shadow-lg">
                      {accountPreview.username.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="flex-1">
                    <h4 className="text-xl font-bold text-gray-900">{accountPreview.name || `@${accountPreview.username}`}</h4>
                    <p className="text-sm text-gray-500">@{accountPreview.username}</p>
                    <div className="flex items-center gap-4 mt-2">
                      {accountPreview.followers_count !== undefined && (
                        <div className="text-center">
                          <p className="text-lg font-bold text-gray-900">{accountPreview.followers_count.toLocaleString()}</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">подписчиков</p>
                        </div>
                      )}
                      {accountPreview.media_count !== undefined && (
                        <div className="text-center">
                          <p className="text-lg font-bold text-gray-900">{accountPreview.media_count.toLocaleString()}</p>
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">публикаций</p>
                        </div>
                      )}
                      <div className="text-center">
                        <p className="text-sm font-mono text-gray-500">{accountPreview.ig_user_id}</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider">Instagram ID</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleConfirmConnect}
                  disabled={saving}
                  className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-300 text-white rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-green-600/20"
                >
                  {saving ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      Сохраняю...
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-5 h-5" />
                      Подключить этот аккаунт
                    </>
                  )}
                </button>
                <button
                  onClick={() => { setAccountPreview(null); setAccessToken(''); }}
                  className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                >
                  Другой
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 border border-gray-200 rounded-2xl">
          <UserCircleIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-500 mb-2">Нет подключенных аккаунтов</h3>
          <p className="text-sm text-gray-400">Добавьте Instagram аккаунт для начала публикации</p>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className={`bg-white border rounded-2xl p-5 transition-all shadow-sm ${
                account.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'
              }`}
            >
              <div className="flex items-center gap-4">
                {account.profile_picture_url ? (
                  <img
                    src={account.profile_picture_url}
                    alt={account.username}
                    className="w-14 h-14 rounded-xl object-cover shadow-lg"
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      img.style.display = 'none';
                      const fallback = img.parentElement?.querySelector('.avatar-fallback') as HTMLElement;
                      if (fallback) fallback.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div
                  className="avatar-fallback w-14 h-14 rounded-xl bg-gradient-to-br from-pink-500 via-red-500 to-yellow-500 items-center justify-center text-white font-bold text-xl shadow-lg"
                  style={{ display: account.profile_picture_url ? 'none' : 'flex' }}
                >
                  {account.username.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">{account.account_name}</h3>
                    {account.is_active ? (
                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">
                        Активен
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full font-medium">
                        Отключен
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">@{account.username}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                    <span>ID: {account.ig_user_id}</span>
                    <button
                      onClick={() => setShowTokenId(showTokenId === account.id ? null : account.id)}
                      className="flex items-center gap-1 hover:text-gray-600 transition-colors"
                    >
                      {showTokenId === account.id ? (
                        <>
                          <EyeSlashIcon className="w-3.5 h-3.5" />
                          Скрыть токен
                        </>
                      ) : (
                        <>
                          <EyeIcon className="w-3.5 h-3.5" />
                          Показать токен
                        </>
                      )}
                    </button>
                  </div>
                  {showTokenId === account.id && (
                    <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                      <code className="text-xs text-gray-500 break-all">
                        {account.access_token.slice(0, 50)}...
                      </code>
                    </div>
                  )}
                  {verificationResults[account.id] && (
                    <div className={`mt-2 p-3 rounded-lg border ${
                      verificationResults[account.id].valid
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}>
                      {verificationResults[account.id].valid ? (
                        <div>
                          <p className="text-sm font-medium text-green-800 mb-1">✓ Токен валидный — публикация будет работать</p>
                          {verificationResults[account.id].info && (
                            <div className="text-xs text-green-700 space-y-0.5">
                              <p>Username: @{verificationResults[account.id].info.account_info?.username}</p>
                              <p>Подписчики: {verificationResults[account.id].info.account_info?.followers_count?.toLocaleString()}</p>
                              <p>Публикации: {verificationResults[account.id].info.account_info?.media_count?.toLocaleString()}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-medium text-red-800 mb-1">✗ Токен невалидный — публикация не будет работать</p>
                          <p className="text-xs text-red-700">{verificationResults[account.id].error}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => verifyToken(account)}
                    disabled={verifyingId === account.id}
                    className="p-2.5 rounded-xl bg-blue-100 text-blue-600 hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
                    title="Проверить токен"
                  >
                    {verifyingId === account.id ? (
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <ShieldCheckIcon className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={() => toggleAccountStatus(account)}
                    className={`p-2.5 rounded-xl transition-colors ${
                      account.is_active
                        ? 'bg-green-100 text-green-600 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                    title={account.is_active ? 'Отключить' : 'Включить'}
                  >
                    {account.is_active ? (
                      <CheckCircleIcon className="w-5 h-5" />
                    ) : (
                      <XCircleIcon className="w-5 h-5" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteAccount(account.id)}
                    className="p-2.5 rounded-xl bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-500 transition-colors"
                    title="Удалить"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AccountsPage;
