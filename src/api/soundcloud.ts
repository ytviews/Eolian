import { SOURCE } from 'common/constants';
import { EolianUserError } from 'common/errors';
import { logger } from 'common/logger';
import { EolianCache } from 'data/@types';
import { InMemoryCache } from 'data/cache';
import { StreamData, Track } from 'music/@types';
import querystring from 'querystring';
import request from 'request';
import requestp from 'request-promise-native';
import { Readable } from 'stream';

export interface SoundCloudApi {
  searchSongs(query: string, limit?: number): Promise<SoundCloudTrack[]>;
  searchUser(query: string, limit?: number): Promise<SoundCloudUser[]>;
  searchPlaylists(query: string, userId?: number): Promise<SoundCloudPlaylist[]>;
  resolve(url: string): Promise<SoundCloudResource>;
  resolveUser(url: string): Promise<SoundCloudUser>;
  resolvePlaylist(url: string): Promise<SoundCloudPlaylist>;
  getUser(id: number): Promise<SoundCloudUser>;
  getTrack(id: number): Promise<SoundCloudTrack>;
  getPlaylist(id: number): Promise<SoundCloudPlaylist>;
  getUserTracks(id: number): Promise<SoundCloudTrack[]>;
  getStream(track: Track): Promise<StreamData>;
}

export const enum SoundCloudResourceType {
  USER = 'user',
  PLAYLIST = 'playlist',
  TRACK = 'track',
}

export interface SoundCloudResource {
  id: number;
  kind: SoundCloudResourceType;
  permalink_url: string;
}

export interface SoundCloudUser extends SoundCloudResource {
  username: string;
  avatar_url: string;
}

export interface SoundCloudPlaylist extends SoundCloudResource {
  artwork_url: string;
  tracks?: SoundCloudTrack[];
  track_count: number;
  title: string;
  user: SoundCloudUser;
}

export interface SoundCloudTrack extends SoundCloudResource {
  streamable: boolean;
  duration: number;
  stream_url: string;
  artwork_url: string;
  user: SoundCloudUser;
  title: string;
}

const URL = 'https://api.soundcloud.com';

export class SoundCloudApiImpl implements SoundCloudApi {

  constructor(private readonly token: string) {}

  async searchSongs(query: string, limit = 5): Promise<SoundCloudTrack[]> {
    try {
      const tracks: SoundCloudTrack[] = await this.get('tracks', { q: query });
      return tracks.slice(0, limit);
    } catch (e) {
      logger.warn(`Failed to search SoundCloud songs: '${query}' limit: '${limit}'`);
      throw e;
    }
  }

  async searchUser(query: string, limit = 5): Promise<SoundCloudUser[]> {
    try {
      const users: SoundCloudUser[] = await this.get('users', { q: query });
      return users.slice(0, limit);
    } catch (e) {
      logger.warn(`Failed to search SoundCloud users: query: '${query}' limit: '${limit}'`);
      throw e;
    }
  }

  async searchPlaylists(query: string, userId?: number): Promise<SoundCloudPlaylist[]> {
    try {
      const playlists: SoundCloudPlaylist[] = await this.get(userId ? `users/${userId}/playlists` : 'playlists',
        { q: query, representation: 'compact' });
      return playlists.slice(0, 5);
    } catch (e) {
      logger.warn(`Failed to search SoundCloud playlists: query: '${query}', userId: '${userId}'`);
      throw e;
    }
  }

  private async _resolve(url: string, options = {}): Promise<SoundCloudResource> {
    let resource: SoundCloudResource | SoundCloudResource[];
    try {
      resource = await this.get('resolve', { url, ...options });
    } catch (e) {
      logger.warn(`Failed to resolve URL from SoundCloud: url: ${url} options: ${JSON.stringify(options)}`);
      throw e;
    }
    if (resource instanceof Array) {
      throw new EolianUserError('The url provided does not resolve to a specific resource');
    }
    return resource;
  }

  resolve(url: string): Promise<SoundCloudResource> {
    return this._resolve(url);
  }

  async resolveUser(url: string): Promise<SoundCloudUser> {
    const resource = await this._resolve(url);
    if (resource.kind !== 'user') {
      throw new EolianUserError('The url provided is not a SoundCloud user');
    }
    return resource as SoundCloudUser;
  }

  async resolvePlaylist(url: string): Promise<SoundCloudPlaylist> {
    const resource = await this._resolve(url, { representation: 'compact '});
    if (resource.kind !== 'playlist') {
      throw new EolianUserError('The url provided is not a SoundCloud playlist');
    }
    return resource as SoundCloudPlaylist;
  }

  async getUser(id: number): Promise<SoundCloudUser> {
    try {
      const user: SoundCloudUser = await this.get(`users/${id}`);
      return user;
    } catch (e) {
      logger.warn(`Failed to fetch SoundCloud user profile: id: ${id}`);
      throw e;
    }
  }


  async getTrack(id: number): Promise<SoundCloudTrack> {
    try {
      return await this.get<SoundCloudTrack>(`tracks/${id}`);
    } catch (e) {
      logger.warn(`Failed to fetch SoundCloud track: id: ${id}`);
      throw e;
    }
  }

  async getPlaylist(id: number): Promise<SoundCloudPlaylist> {
    try {
      return await this.get<SoundCloudPlaylist>(`playlists/${id}`);
    } catch (e) {
      logger.warn(`Failed to fetch SoundCloud playlist: id: ${id}`);
      throw e;
    }
  }

  async getUserTracks(id: number): Promise<SoundCloudTrack[]> {
    try {
      return await this.get<SoundCloudTrack[]>(`users/${id}/tracks`);
    } catch (e) {
      logger.warn(`Failed to fetch SoundCloud user's track: id: ${id}`);
      throw e;
    }
  }

  getStream(track: Track): Promise<StreamData> {
    if (track.src !== SOURCE.SOUNDCLOUD) {
      throw new Error(`Tried to get soundcloud readable from non-soundcloud resource: ${JSON.stringify(track)}`);
    }
    return new Promise<StreamData>((resolve, reject) => {
      const stream = request(`${track.stream}?client_id=${this.token}`);
      stream.on('response', resp => {
        if (resp.statusCode < 200 || resp.statusCode >= 400) {
          logger.error(`Error occured on request: ${track.stream}`);
          return reject(resp.statusMessage);
        }

        const contentLength = Number(resp.headers["content-length"]);
        if (isNaN(contentLength)) return reject('Could not parse content-length from SoundCloud stream');

        const streamData: StreamData = { readable: stream as unknown as Readable, size: contentLength, details: track };
        resolve(streamData);
      });
    });
  }

  private async get<T>(endpoint: string, params: { [key: string]: string } = {}): Promise<T> {
    params.client_id = this.token;
    const data = await requestp(`${URL}/${endpoint}?${querystring.stringify(params)}`);
    return JSON.parse(data);
  }

}

export class CachedSoundCloudApi implements SoundCloudApi {

  private readonly api: SoundCloudApi;
  private readonly cache: EolianCache;

  constructor(token: string, ttl: number) {
    this.api = new SoundCloudApiImpl(token);
    this.cache = new InMemoryCache(ttl);
  }

  async searchSongs(query: string, limit = 5): Promise<SoundCloudTrack[]> {
    const [tracks, found] = await this.cache.getOrSet(`searchSongs:${query}:${limit}`, () => this.api.searchSongs(query, limit));
    if (!found) {
      await Promise.all(tracks.map(track => this.cache.set(`song:${track.id}`, track)));
    }
    return tracks;
  }

  async searchUser(query: string, limit = 5): Promise<SoundCloudUser[]> {
    const [users, found] = await this.cache.getOrSet(`searchUser:${query}:${limit}`, () => this.api.searchUser(query, limit));
    if (!found) {
      await Promise.all(users.map(user => this.cache.set(`user:${user.id}`, user)));
    }
    return users;
  }

  async searchPlaylists(query: string, userId?: number): Promise<SoundCloudPlaylist[]> {
    let key = `searchPlaylists:${query}`;
    if (userId) key = `${key}:${userId}`;
    const [playlists, found] = await this.cache.getOrSet(key, () => this.api.searchPlaylists(query, userId));
    if (!found) {
      this.cache.mset(playlists.map(playlist => ({ id: `playlist:${playlist.id}`, val: playlist })));
    }
    return playlists;
  }

  async resolve(url: string): Promise<SoundCloudResource> {
    return (await this.cache.getOrSet(`resolve:${url}`, () => this.api.resolve(url)))[0];
  }

  async resolveUser(url: string): Promise<SoundCloudUser> {
    return (await this.cache.getOrSet(`resolveUser:${url}`, () => this.api.resolveUser(url)))[0];
  }

  async resolvePlaylist(url: string): Promise<SoundCloudPlaylist> {
    return (await this.cache.getOrSet(`resolvePlaylist:${url}`, () => this.api.resolvePlaylist(url)))[0];
  }

  async getUser(id: number): Promise<SoundCloudUser> {
    return (await this.cache.getOrSet(`getUser:${id}`, () => this.api.getUser(id)))[0];
  }

  async getTrack(id: number): Promise<SoundCloudTrack> {
    return (await this.cache.getOrSet(`song:${id}`, () => this.api.getTrack(id)))[0];
  }

  async getPlaylist(id: number): Promise<SoundCloudPlaylist> {
    return (await this.cache.getOrSet(`playlist:${id}`, () => this.api.getPlaylist(id)))[0];
  }

  async getUserTracks(id: number): Promise<SoundCloudTrack[]> {
    const [tracks, found] = await this.cache.getOrSet(`getUserTracks:${id}`, () => this.api.getUserTracks(id));
    if (found) {
      this.cache.mset(tracks.map(track => ({ id: `song:${track.id}`, val: track })));
    }
    return tracks;
  }

  getStream(track: Track): Promise<StreamData> {
    return this.api.getStream(track);
  }

}
