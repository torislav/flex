import {
  defineExtension,
  defineProvider,
  t,
  utils,
  ExtensionError,
  Input,
  UrlSource,
  type Entry,
} from 'azot';
import { messages } from './src/messages';
import { ensureAuth, getAuthState, signIn, signOut } from './src/flex.auth';
import {
  fetchFilms,
  fetchPlaybackOptions,
  getAuth,
  getAuthHeaders,
  type FlexFilm,
} from './src/flex.api';
import { parseUrlInfo, buildStreamUrl, createStreamFetchFn } from './src/flex.url';

type EntryData = {
  slug: string;
  episodeId: number;
};

const isAuthError = (error: unknown) =>
  error instanceof ExtensionError && error.code === 'AUTH_REQUIRED';

const normalizeEpisodeTitle = (label: string) => {
  const title = label.replace(/\s*\d+\s*серия\s*/i, '').trim();
  return title || undefined;
};

export default defineExtension({
  title: 'FLEX',
  flex: defineProvider<EntryData>()({
    shortName: 'FLEX',
    matches: ['https://*.kinoflex.ru/*'],
    async list({ url, options }) {
      const urlInfo = parseUrlInfo(url);
      if (!urlInfo) {
        throw new ExtensionError({
          code: 'UNSUPPORTED_INPUT',
          message: t(messages.unsupportedUrl),
        });
      }

      await ensureAuth();

      console.debug(`Fetching film with slug ${urlInfo.slug}...`);
      let film: FlexFilm;
      try {
        film = await fetchFilms(urlInfo.slug);
      } catch (error) {
        if (!isAuthError(error)) throw error;
        console.warn('Fetching film failed. Trying to login again...');
        await signOut();
        await signIn();
        film = await fetchFilms(urlInfo.slug);
      }

      const eps = utils.extendEpisodes(options.episodes);
      const results: Entry<EntryData>[] = [];

      if (film.is_film) {
        const episode = film.list.flatMap((season) => season.series)[0];
        if (!episode) {
          throw new ExtensionError({
            code: 'MEDIA_UNAVAILABLE',
            message: t(messages.noMovieEpisodes, { title: film.name }),
          });
        }
        results.push({
          kind: 'movie',
          id: String(episode.id),
          title: film.name,
          year: film.year,
          artworkUrl: film.poster,
          data: { slug: film.slug, episodeId: episode.id },
        });
        return results;
      }

      for (const season of film.list) {
        if (eps.items.size && !eps.has(undefined, season.season_number)) continue;
        console.debug(`Fetching season ${season.season_number}...`);

        for (const episode of season.series) {
          if (eps.items.size && !eps.has(episode.series, season.season_number)) continue;
          results.push({
            kind: 'episode',
            id: String(episode.id),
            title: film.name,
            seasonNumber: season.season_number,
            episodeNumber: episode.series,
            episodeTitle: normalizeEpisodeTitle(episode.label),
            data: { slug: film.slug, episodeId: episode.id },
          });
        }
      }

      if (!results.length) {
        throw new ExtensionError({
          code: 'MEDIA_UNAVAILABLE',
          message: t(messages.noSelectedEpisodes, { title: film.name }),
        });
      }
      return results;
    },

    async resolve({ entry }) {
      const { slug, episodeId } = entry.data;

      console.debug(`Fetching playback options for episode ${episodeId}...`);
      const auth = await ensureAuth();
      let streams;
      try {
        streams = await fetchPlaybackOptions(slug, episodeId);
      } catch (error) {
        if (!isAuthError(error) || !getAuthHeaders().Authorization) throw error;
        console.warn('Fetching playback options failed. Trying to login again...');
        await signOut();
        await signIn();
        streams = await fetchPlaybackOptions(slug, episodeId);
      }
      if (!streams.length) {
        throw new ExtensionError({
          code: 'MEDIA_UNAVAILABLE',
          message: t(messages.noStreams, { title: entry.title }),
        });
      }

      const uuid = getAuth()?.uuid ?? auth.uuid;
      const inputs: Input[] = [];
      try {
        for (const url of new Set(streams.map((stream) => buildStreamUrl(stream.src, uuid)))) {
          inputs.push(
            new Input({ source: new UrlSource(url, { fetchFn: createStreamFetchFn(uuid) }) }),
          );
        }
        return { input: Input.merge(inputs) };
      } catch (error) {
        for (const input of inputs) input.dispose();
        throw error;
      }
    },

    auth: {
      getState: getAuthState,
      login: async () => {
        await signIn();
      },
      logout: () => signOut(),
    },
  }),
});
