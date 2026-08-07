import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  SparklesIcon,
  EnvelopeIcon,
  LockClosedIcon,
  ArrowPathIcon,
  ExclamationCircleIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';

const AuthPage: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const { signIn, signUp, loginAsDemo } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (isSignUp) {
        const { error } = await signUp(email, password);
        if (error) {
          setError(error.message);
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) {
          setError(error.message);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка при аутентификации');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = () => {
    loginAsDemo('demo@viralreel.io');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-teal-500/30">
              <SparklesIcon className="w-7 h-7 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">ViralReel</h1>
          <p className="text-gray-500">
            {isSignUp ? 'Создание аккаунта' : 'С возвращением'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 shadow-xl shadow-gray-200/50">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2 text-red-600 text-sm">
                <ExclamationCircleIcon className="w-5 h-5 shrink-0" />
                {error}
              </div>
            )}

            {successMsg && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2 text-emerald-700 text-sm">
                <SparklesIcon className="w-5 h-5 shrink-0" />
                {successMsg}
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Email</label>
              <div className="relative">
                <EnvelopeIcon className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ваш@email.com"
                  required
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3.5 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 outline-none transition-all"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Пароль</label>
              <div className="relative">
                <LockClosedIcon className="w-5 h-5 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  required
                  minLength={6}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 py-3.5 text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500 outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:bg-gray-300 text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-teal-600/20 disabled:shadow-none"
            >
              {loading ? (
                <>
                  <ArrowPathIcon className="w-5 h-5 animate-spin" />
                  Обработка...
                </>
              ) : isSignUp ? (
                <>
                  <UserPlusIcon className="w-5 h-5" />
                  Зарегистрироваться
                </>
              ) : (
                'Войти'
              )}
            </button>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400">или</span>
              </div>
            </div>

            {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_MODE === 'true') && (
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-all flex items-center justify-center gap-2 border border-slate-200"
              >
                <SparklesIcon className="w-4 h-4 text-teal-600" />
                ⚡ Демо-вход в 1 клик
              </button>
            )}
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setSuccessMsg('');
              }}
              className="text-sm font-medium text-teal-600 hover:text-teal-700 transition-colors"
            >
              {isSignUp
                ? 'Уже есть аккаунт? Войти'
                : 'Нет аккаунта? Зарегистрироваться'}
            </button>
          </div>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          AI-студия для создания контента Instagram Reels
        </p>
      </div>
    </div>
  );
};

export default AuthPage;
