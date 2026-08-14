import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  SparklesIcon,
  EnvelopeIcon,
  LockClosedIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import { Button, Callout, Card, Field, Input } from '../components/ui';

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
        } else {
          // Supabase signs the user in only after they confirm the address, so
          // without this the form just goes quiet and looks broken.
          setSuccessMsg(`Письмо со ссылкой для подтверждения отправлено на ${email}.`);
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4 sm:p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900">
            <SparklesIcon className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            {isSignUp ? 'Создать аккаунт' : 'Вход в ViralReel'}
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">AI-студия для Instagram Reels</p>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Callout tone="danger">{error}</Callout>}
            {successMsg && <Callout tone="success">{successMsg}</Callout>}

            <Field label="Email">
              {({ id, describedBy }) => (
                <div className="relative">
                  <EnvelopeIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ваш@email.com"
                    required
                    className="pl-9"
                  />
                </div>
              )}
            </Field>

            <Field label="Пароль" hint={isSignUp ? 'Минимум 6 символов' : undefined}>
              {({ id, describedBy }) => (
                <div className="relative">
                  <LockClosedIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    type="password"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                    required
                    minLength={6}
                    className="pl-9"
                  />
                </div>
              )}
            </Field>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              icon={isSignUp ? <UserPlusIcon className="h-4 w-4" /> : undefined}
            >
              {loading ? 'Обработка…' : isSignUp ? 'Зарегистрироваться' : 'Войти'}
            </Button>

            {import.meta.env.VITE_ENABLE_DEMO_MODE === 'true' && (
              <Button
                size="lg"
                fullWidth
                disabled={loading}
                onClick={() => loginAsDemo('demo@viralreel.io')}
                icon={<SparklesIcon className="h-4 w-4 text-brand-600" />}
              >
                Демо-вход в один клик
              </Button>
            )}
          </form>

          <div className="mt-5 border-t border-gray-100 pt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError('');
                setSuccessMsg('');
              }}
              className="text-sm text-gray-500 transition-colors hover:text-gray-900"
            >
              {isSignUp ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AuthPage;
