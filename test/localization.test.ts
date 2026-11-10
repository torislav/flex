import { t } from 'azot';
import { invoke, packedManifest, setLocale } from 'azot/vitest';
import { expect, test, vi } from 'vitest';
import extension from '../flex';
import { API_ROUTES, fetchUsers } from '../src/flex.api';
import { signIn } from '../src/flex.auth';
import { messages } from '../src/messages';
import * as azot from 'azot';

const placeholders = (text: string) =>
  [...text.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]).toSorted();

test('packs a v3 provider without adding description or icon metadata', () => {
  const manifest = packedManifest(extension);
  expect(manifest).toEqual({
    title: 'FLEX',
    modules: {
      flex: {
        kind: 'provider',
        shortName: 'FLEX',
        matches: ['https://*.kinoflex.ru/*'],
        authMethods: ['interactive'],
      },
    },
  });
});

test('existing messages have English and Russian translations with matching placeholders', () => {
  for (const message of Object.values(messages)) {
    expect(message.en).toBeTruthy();
    expect(message.ru).toBeTruthy();
    expect(placeholders(message.ru!)).toEqual(placeholders(message.en!));
  }
  setLocale('ru-RU');
  expect(t(messages.enterLogin)).toBe('Введите e-mail или телефон');
  setLocale('en');
  expect(t(messages.enterLogin)).toBe('Enter your email or phone number');
  setLocale('de');
  expect(t(messages.enterLogin)).toBe('Enter your email or phone number');
});

test.each([
  { locale: 'en', message: 'Sign in to your FLEX account and try again.' },
  {
    locale: 'ru',
    message: 'Требуется вход в аккаунт FLEX. Войдите в аккаунт и повторите попытку.',
  },
])('API auth errors use the current $locale language', async ({ locale, message }) => {
  setLocale(locale);
  const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }));
  try {
    await expect(invoke(fetchUsers)).rejects.toMatchObject({ code: 'AUTH_REQUIRED', message });
  } finally {
    fetch.mockRestore();
  }
});

test.each([
  {
    locale: 'en',
    title: 'Sign in to FLEX',
    field: 'Enter your email or phone number',
    confirmation: 'Confirm sign-in',
  },
  {
    locale: 'ru',
    title: 'Вход в аккаунт FLEX',
    field: 'Введите e-mail или телефон',
    confirmation: 'Подтверждение входа',
  },
])(
  'sign-in dialogs use the current $locale language',
  async ({ locale, title, field, confirmation }) => {
    setLocale(locale);
    const prompt = vi
      .spyOn(azot, 'prompt')
      .mockResolvedValueOnce({ login: 'user@example.com' })
      .mockResolvedValueOnce({ code: '123456' });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({}))
      .mockResolvedValueOnce(Response.json({ token: 'token', user: { uuid: 'device-uuid' } }));
    try {
      await expect(invoke(signIn)).resolves.toEqual({ token: 'token', uuid: 'device-uuid' });
      expect(prompt).toHaveBeenNthCalledWith(
        1,
        title,
        expect.objectContaining({ form: { login: expect.objectContaining({ title: field }) } }),
      );
      expect(prompt).toHaveBeenNthCalledWith(2, confirmation, expect.anything());
      const request = fetch.mock.calls[1]?.[0];
      expect(request).toBeInstanceOf(Request);
      if (!(request instanceof Request)) throw new Error('Expected a request');
      expect(request.url).toBe(API_ROUTES.signIn);
      expect(await request.json()).toEqual({ email: 'user@example.com', code: '123456' });
    } finally {
      prompt.mockRestore();
      fetch.mockRestore();
    }
  },
);
