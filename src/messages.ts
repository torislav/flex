import { defineMessages } from 'azot';

export const messages = defineMessages({
  en: {
    unsupportedUrl: 'Only movie and series pages on kinoflex.ru are supported',
    noMovieEpisodes: 'The movie "{title}" has no available episodes',
    noSelectedEpisodes: 'No episodes of "{title}" match the selected filters',
    noStreams:
      'FLEX returned no stream for "{title}". Check availability in your region and your account subscription.',
    authRequired: 'Sign in to your FLEX account and try again.',
    subscriptionRequired:
      'This account cannot watch this video. Check your subscription or movie purchase.',
    requestFailed: 'The FLEX request failed. Status: {status}',
    invalidResponse: 'Could not process the FLEX response from {url}',
    signIn: 'Sign in to FLEX',
    enterLogin: 'Enter your email or phone number',
    confirmLogin: 'Confirm sign-in',
    enterCode: 'Enter the code sent by SMS or email',
    loginFailed:
      'Invalid credentials or too many sign-in attempts. Try again later or use a different IP address.',
  },
  ru: {
    unsupportedUrl: 'Поддерживаются только страницы фильмов и сериалов на kinoflex.ru',
    noMovieEpisodes: 'У фильма «{title}» нет доступных эпизодов',
    noSelectedEpisodes: 'Не найдено эпизодов для «{title}» с выбранными фильтрами',
    noStreams:
      'FLEX не вернул поток для «{title}». Проверьте, что контент доступен в вашем регионе и что аккаунт имеет подписку.',
    authRequired: 'Требуется вход в аккаунт FLEX. Войдите в аккаунт и повторите попытку.',
    subscriptionRequired:
      'На этом аккаунте нет прав для просмотра данного контента. Проверьте наличие подписки или купленного фильма.',
    requestFailed: 'Запрос к FLEX завершился с ошибкой. Статус: {status}',
    invalidResponse: 'Не удалось обработать ответ FLEX от {url}',
    signIn: 'Вход в аккаунт FLEX',
    enterLogin: 'Введите e-mail или телефон',
    confirmLogin: 'Подтверждение входа',
    enterCode: 'Введите код, пришедший вам в СМС или на почту',
    loginFailed:
      'Неверные данные для входа, или превышено количество попыток входа. Попробуйте позже, или смените IP.',
  },
});
