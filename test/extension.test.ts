import { ExtensionError, Input, UrlSource, type DownloadOptions } from 'azot';
import { invoke, setLocale } from 'azot/vitest';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { FlexAuth, FlexFilm, FlexStream } from '../src/flex.api';

const mocks = vi.hoisted(() => ({
  ensureAuth: vi.fn<() => Promise<FlexAuth>>(),
  signIn: vi.fn<() => Promise<FlexAuth>>(),
  signOut: vi.fn<() => Promise<void>>(),
  getAuthState: vi.fn<() => Promise<{ authenticated: boolean; user?: string }>>(),
  fetchFilms: vi.fn<() => Promise<FlexFilm>>(),
  fetchPlaybackOptions: vi.fn<() => Promise<FlexStream[]>>(),
}));

vi.mock('../src/flex.auth', () => ({
  ensureAuth: mocks.ensureAuth,
  signIn: mocks.signIn,
  signOut: mocks.signOut,
  getAuthState: mocks.getAuthState,
}));

vi.mock('../src/flex.api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchFilms: mocks.fetchFilms,
  fetchPlaybackOptions: mocks.fetchPlaybackOptions,
}));

import extension from '../flex';
const provider = extension.flex;
const list = (request: Parameters<typeof provider.list>[0]) => invoke(() => provider.list(request));
const resolve = (request: Parameters<typeof provider.resolve>[0]) =>
  invoke(() => provider.resolve(request));

const serialFilm = {
  id: 1467,
  name: '1883',
  slug: '1883',
  is_film: false,
  year: 2021,
  list: [
    {
      id: 3039,
      season_number: 1,
      series: [
        { id: 32845, label: '1 серия ', series: 1 },
        { id: 32846, label: '2 серия ', series: 2 },
      ],
    },
    {
      id: 3040,
      season_number: 2,
      series: [{ id: 32855, label: '1 серия ', series: 1 }],
    },
  ],
};

const movieFilm = {
  id: 999,
  name: '13 жизней',
  slug: 'thirteenlives',
  is_film: true,
  year: 2022,
  list: [{ id: 9991, season_number: 1, series: [{ id: 99911, label: '1 серия ', series: 1 }] }],
};

describe('FLEX list', () => {
  beforeEach(() => {
    setLocale('ru');
    vi.clearAllMocks();
    mocks.ensureAuth.mockResolvedValue({ token: 'token', uuid: 'uuid' });
  });

  test('rejects unsupported URLs', async () => {
    await expect(list({ url: 'https://kinoflex.ru/news/post', options: {} })).rejects.toThrow(
      'Поддерживаются только страницы фильмов и сериалов на kinoflex.ru',
    );
  });

  test('collects all episodes of a serial', async () => {
    mocks.fetchFilms.mockResolvedValue(serialFilm);

    const entries = await list({
      url: 'https://kinoflex.ru/serial/1883',
      options: {},
    });

    expect(mocks.fetchFilms).toHaveBeenCalledWith('1883');
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      kind: 'episode',
      id: '32845',
      title: '1883',
      seasonNumber: 1,
      episodeNumber: 1,
      episodeTitle: undefined,
      data: { slug: '1883', episodeId: 32845 },
    });
  });

  test('filters episodes by the selected range', async () => {
    mocks.fetchFilms.mockResolvedValue(serialFilm);

    const options = {
      episodes: new Map<number, Set<number>>([[1, new Set([2])]]),
    } satisfies DownloadOptions;
    const entries = await list({
      url: 'https://kinoflex.ru/serial/1883',
      options,
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      seasonNumber: 1,
      episodeNumber: 2,
      data: { episodeId: 32846 },
    });
  });

  test('returns a movie entry for films', async () => {
    mocks.fetchFilms.mockResolvedValue(movieFilm);

    const entries = await list({
      url: 'https://kinoflex.ru/movie/thirteenlives',
      options: {},
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'movie',
      title: '13 жизней',
      year: 2022,
      data: { slug: 'thirteenlives', episodeId: 99911 },
    });
  });

  test('retries after signing in again on an auth error', async () => {
    mocks.fetchFilms
      .mockRejectedValueOnce(
        new ExtensionError({
          code: 'AUTH_REQUIRED',
          message: 'expired',
        }),
      )
      .mockResolvedValueOnce(serialFilm);
    mocks.signOut.mockResolvedValue(undefined);
    mocks.signIn.mockResolvedValue({ token: 'fresh', uuid: 'fresh-uuid' });

    const entries = await list({
      url: 'https://kinoflex.ru/serial/1883',
      options: {},
    });

    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.signIn).toHaveBeenCalled();
    expect(entries).toHaveLength(3);
  });
});

describe('FLEX resolve', () => {
  beforeEach(() => {
    setLocale('ru');
    vi.clearAllMocks();
    mocks.ensureAuth.mockResolvedValue({ token: 'token', uuid: 'device-uuid' });
  });

  test('appends the device uuid to the stream URL', async () => {
    mocks.fetchPlaybackOptions.mockResolvedValue([{ src: 'https://cdn.example.test/video.mp4' }]);

    const merge = vi.spyOn(Input, 'merge');
    const { input } = await resolve({
      options: {},
      entry: {
        kind: 'episode',
        title: '1883',
        data: { slug: '1883', episodeId: 32845 },
      },
    });

    expect(mocks.fetchPlaybackOptions).toHaveBeenCalledWith('1883', 32845);
    try {
      expect(merge.mock.calls[0]?.[0][0]?.source).toBeInstanceOf(UrlSource);
      expect(merge.mock.calls[0]?.[0][0]?.source).toMatchObject({
        rootPath: 'https://cdn.example.test/video.mp4?uuid=device-uuid',
      });
    } finally {
      input.dispose();
      merge.mockRestore();
    }
  });

  test('preserves existing query parameters of the stream URL', async () => {
    mocks.fetchPlaybackOptions.mockResolvedValue([
      { src: 'https://cdn.example.test/video.mp4?quality=1080' },
    ]);

    const merge = vi.spyOn(Input, 'merge');
    const { input } = await resolve({
      options: {},
      entry: { title: '1883', data: { slug: '1883', episodeId: 32845 } },
    });
    try {
      expect(merge.mock.calls[0]?.[0][0]?.source).toMatchObject({
        rootPath: 'https://cdn.example.test/video.mp4?quality=1080&uuid=device-uuid',
      });
    } finally {
      input.dispose();
      merge.mockRestore();
    }

    expect(mocks.fetchPlaybackOptions).toHaveBeenCalledWith('1883', 32845);
  });

  test('fails when FLEX provides no playable stream', async () => {
    mocks.fetchPlaybackOptions.mockResolvedValue([]);

    await expect(
      resolve({
        options: {},
        entry: { title: '1883', data: { slug: '1883', episodeId: 32845 } },
      }),
    ).rejects.toThrow('FLEX не вернул поток для «1883»');
  });
});

describe('FLEX auth', () => {
  beforeEach(() => {
    setLocale('ru');
    vi.clearAllMocks();
  });

  test('reports the authenticated state with a user name', async () => {
    mocks.getAuthState.mockResolvedValue({ authenticated: true, user: 'user' });

    const state = await invoke(() => provider.auth.getState());
    expect(state).toEqual({ authenticated: true, user: 'user' });
  });

  test('login and logout delegate to the auth module', async () => {
    mocks.signIn.mockResolvedValue({ token: 'token', uuid: 'uuid' });
    mocks.signOut.mockResolvedValue(undefined);

    await invoke(() => provider.auth.login());
    expect(mocks.signIn).toHaveBeenCalled();

    await invoke(() => provider.auth.logout());
    expect(mocks.signOut).toHaveBeenCalled();
  });
});

test('lists durable entry data and exposes every distinct stream for host selection', async () => {
  mocks.ensureAuth.mockResolvedValue({ token: 'token', uuid: 'device-uuid' });
  mocks.fetchFilms.mockResolvedValue(serialFilm);
  mocks.fetchPlaybackOptions.mockClear();
  const entries = await list({ url: 'https://kinoflex.ru/serial/1883', options: {} });
  expect(mocks.fetchPlaybackOptions).not.toHaveBeenCalled();
  const entry = entries[0];
  if (!entry) throw new Error('Missing episode');
  const persisted = JSON.parse(JSON.stringify(entry));
  mocks.fetchPlaybackOptions.mockResolvedValue([
    { src: 'https://cdn.example.test/avc/manifest.mpd' },
    { src: 'https://cdn.example.test/hevc/manifest.mpd' },
    { src: 'https://cdn.example.test/avc/manifest.mpd' },
  ]);
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.searchParams.get('uuid')).toBe('device-uuid');
    const codec = url.pathname.startsWith('/avc/') ? 'avc1.640028' : 'hvc1.1.6.L120.B0';
    return new Response(`<?xml version="1.0"?>
      <MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT10S" minBufferTime="PT1S">
        <Period duration="PT10S">
          <AdaptationSet contentType="video" mimeType="video/mp4" codecs="${codec}">
            <SegmentTemplate timescale="1" duration="5" initialization="init.mp4" media="video-$Number$.m4s"/>
            <Representation id="video" bandwidth="1000000" width="1920" height="1080"/>
          </AdaptationSet>
        </Period>
      </MPD>`);
  });
  try {
    const resource = await resolve({ entry: persisted, options: { videoCodecs: ['avc'] } });
    try {
      const tracks = await invoke(() => resource.input.getVideoTracks());
      expect(await Promise.all(tracks.map((track) => track.getCodec()))).toEqual(['avc', 'hevc']);
      expect(tracks.map((track) => track.origin.input.source)).toMatchObject([
        { rootPath: 'https://cdn.example.test/avc/manifest.mpd?uuid=device-uuid' },
        { rootPath: 'https://cdn.example.test/hevc/manifest.mpd?uuid=device-uuid' },
      ]);
      expect(persisted.data).toEqual({ slug: '1883', episodeId: 32845 });
      expect(entry).toEqual(persisted);
    } finally {
      resource.input.dispose();
    }
  } finally {
    fetch.mockRestore();
  }
});

test('disposes constructed inputs if composing streams fails', async () => {
  mocks.ensureAuth.mockResolvedValue({ token: 'token', uuid: 'device-uuid' });
  mocks.fetchPlaybackOptions.mockResolvedValue([
    { src: 'https://cdn.example.test/avc/master.m3u8' },
    { src: 'https://cdn.example.test/hevc/master.m3u8' },
  ]);
  const merge = vi.spyOn(Input, 'merge').mockImplementation(() => {
    throw new Error('merge failed');
  });
  const dispose = vi.spyOn(Input.prototype, 'dispose');
  try {
    await expect(
      resolve({ options: {}, entry: { title: '1883', data: { slug: '1883', episodeId: 32845 } } }),
    ).rejects.toThrow('merge failed');
    expect(dispose).toHaveBeenCalledTimes(2);
  } finally {
    dispose.mockRestore();
    merge.mockRestore();
  }
});
