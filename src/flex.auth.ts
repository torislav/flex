import { ExtensionError, prompt, t } from 'azot';
import { messages } from './messages';
import {
  API_ROUTES,
  type FlexAuth,
  fetchUsers,
  getAuth,
  parseJsonResponse,
  postJson,
  saveAuth,
} from './flex.api';

const clearCookies = async () => {
  const cookies = await cookieStore.getAll();
  await Promise.all(cookies.map((cookie) => cookieStore.delete(cookie.name)));
};

const createSendCodeBody = (login: string) => {
  const isPhone = /^((\+?7)|8)\d{10}$/.test(login);
  return isPhone ? { phone: login } : { email: login };
};

const signIn = async (): Promise<FlexAuth> => {
  console.debug('Signing in FLEX...');

  const { login } = await prompt(t(messages.signIn), {
    title: 'FLEX',
    form: {
      login: {
        type: 'text',
        title: t(messages.enterLogin),
        placeholder: 'user@example.com',
        required: true,
        autoFocus: true,
      },
    },
  });
  const sendCodeBody = createSendCodeBody(login);

  await clearCookies();
  const codeResponse = await postJson(API_ROUTES.sendCode, sendCodeBody);
  const codeData = await parseJsonResponse<{ detail?: string; send_type?: string }>(codeResponse);
  if (!codeResponse.ok || codeData?.detail) {
    throw new ExtensionError({
      code: 'RATE_LIMITED',
      message: t(messages.loginFailed),
    });
  }

  const { code } = await prompt(t(messages.confirmLogin), {
    title: 'FLEX',
    form: {
      code: {
        type: 'text',
        title: t(messages.enterCode),
        required: true,
        autoFocus: true,
      },
    },
  });

  await clearCookies();
  const response = await postJson(API_ROUTES.signIn, { ...sendCodeBody, code });
  const auth = await parseJsonResponse<{ token?: string; user?: { uuid?: string } }>(response);
  if (!response.ok || !auth?.token || !auth.user?.uuid) {
    throw new ExtensionError({
      code: 'AUTH_REQUIRED',
      message: t(messages.loginFailed),
    });
  }

  const savedAuth: FlexAuth = { token: auth.token, uuid: auth.user.uuid ?? '' };
  saveAuth(savedAuth);
  console.debug('Signed in FLEX');
  return savedAuth;
};

const ensureAuth = async (): Promise<FlexAuth> => {
  const auth = getAuth();
  if (auth?.token && auth.uuid) return auth;
  return signIn();
};

const getAuthState = async () => {
  const auth = getAuth();
  if (!auth?.token || !auth.uuid) return { authenticated: false as const };
  let user: string | undefined = auth.username;
  if (!user) {
    try {
      const profile = await fetchUsers();
      user = profile.username;
      if (user) saveAuth({ ...auth, username: user });
    } catch (error) {
      console.debug(`Failed to fetch FLEX profile: ${error}`);
    }
  }
  return { authenticated: true as const, user };
};

const signOut = async () => {
  saveAuth(null);
  await clearCookies();
};

export { ensureAuth, getAuthState, signIn, signOut };
