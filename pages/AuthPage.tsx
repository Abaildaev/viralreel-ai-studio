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
    <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex w-10 h-10 rounded-xl bg-gray-900 items-center justify-center mb-4">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            {isSignUp ? 'Создать аккаунт' : 'Вход в ViralReel'}
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            AI-студия для Instagram Reels
          </p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex items-start gap-2 text-red-700 text-sm">
                <ExclamationCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            {successMsg && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 flex items-start gap-2 text-green-700 text-sm">
                <SparklesIcon className="w-4 h-4 shrink-0 mt-0.5" />
                {successMsg}
              </div>
            )}

            <div>
              <label className="label">Email</label>
              <div className="relative">
                <EnvelopeIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ваш@email.com"
                  required
                  className="field pl-9"
                />
              </div>
            </div>

            <div>
              <label className="label">Пароль</label>
              <div className="relative">
                <LockClosedIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  required
                  minLength={6}
                  className="field pl-9"
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary btn-lg w-full">
              {loading ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  Обработка…
                </>
              ) : isSignUp ? (
                <>
                  <UserPlusIcon className="w-4 h-4" />
                  Зарегистрироваться
                </>
              ) : (
                'Войти'
              )}
            </button>

            {import.meta.env.VITE_ENABLE_DEMO_MODE === 'true' && (
              <button
                type="button"
                onClick={handleDemoLogin}
                disabled={loading}
                className="btn btn-secondary btn-lg w-full"
              >
                <SparklesIcon className="w-4 h-4 text-teal-600" />
                Демо-вход в один клик
              </button>
            )}
          </form>

          <div className="mt-5 pt-4 border-t border-gray-100 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setSuccessMsg('');
              }}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              {isSignUp ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
