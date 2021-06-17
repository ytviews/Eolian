import { bing } from 'api';
import { SOURCE } from 'common/constants';
import { logger } from 'common/logger';
import { fuzzyMatch } from 'common/util';
import { google, youtube_v3 } from 'googleapis';
import { decode } from 'html-entities';
import querystring from 'querystring';
import ytdl from 'ytdl-core';
import { BingVideo, StreamData, Track, YouTubeApi, YoutubePlaylist, YouTubeUrlDetails, YoutubeVideo } from './@types';

// const MUSIC_CATEGORY_ID = 10;
// const MUSIC_TOPIC = '/m/04rlf';

const YOUTUBE_PATTERN = /youtube\.com\/(watch|playlist)|youtu\.be\/(?<video>[^/]+)\s*$/
// eslint-disable-next-line no-useless-escape
const MUSIC_VIDEO_PATTERN = /[\(\[]\s*((official\s+(music\s+)?video)|(music\s+video))\s*[\])]\s*$/i;

export class YouTubeApiImpl implements YouTubeApi {

  private readonly youtube: youtube_v3.Youtube;

  constructor(token: string) {
    this.youtube = google.youtube({ version: 'v3', auth: token });
  }

  getResourceType(url: string): YouTubeUrlDetails | undefined {
    const [path, query] = url.split('?');

    const match = path.match(YOUTUBE_PATTERN);
    if (match) {
      if (match.groups?.video) {
        return {
          video: match.groups['video']
        }
      } else {
        const parsed = querystring.parse(query);
        return {
          playlist: parsed['list'] as string,
          video: parsed['v'] as string
        };
      }
    }

    return undefined;
  }

  async getVideo(id: string): Promise<YoutubeVideo> {
    try {
      logger.info(`YouTube HTTP: videos.list ${id}`);
      // @ts-ignore Typescript is dumb
      const response = await this.youtube.videos.list({ id, maxResults: 1, part: 'id,snippet,contentDetails' });
      if (!response.data.items) throw new Error('No results from YouTube');

      const video = response.data.items[0];
      return mapVideoResponse(video);
    } catch (e) {
      logger.warn(`Failed to fetch YouTube playlist: id: %s`, id);
      throw e;
    }
  }

  async getPlaylist(id: string): Promise<YoutubePlaylist> {
    try {
      logger.info(`YouTube HTTP: playlists.list ${id}`);
      // @ts-ignore Typescript is dumb
      const response = await this.youtube.playlists.list({ id, maxResults: 1, part: 'id,snippet,contentDetails' });
      if (!response.data.items) throw new Error('No results from YouTube');

      const playlist = response.data.items[0];
      return mapPlaylistResponse(playlist);
    } catch (e) {
      logger.warn(`Failed to fetch YouTube playlist: id: %s`, id);
      throw e;
    }
  }

  async getPlaylistVideos(id: string): Promise<YoutubeVideo[]> {
    let items: youtube_v3.Schema$PlaylistItem[] = [];

    try {
      logger.info(`YouTube HTTP: playlistItems.list ${id}`);
      // @ts-ignore Typescript is dumb
      let response = await this.youtube.playlistItems.list({ playlistId: id, part: 'id,snippet,contentDetails' });
      items = response.data.items || [];
      while (response.data.nextPageToken) {
        const params = { playlistId: id, part: 'id,snippet,contentDetails', pageToken: response.data.nextPageToken };
        // @ts-ignore Typescript is dumb
        response = await this.youtube.playlistItems.list(params);
        items = items.concat(response.data.items || []);
      }
    } catch (e) {
      logger.warn(`Failed to fetch YouTube playlist: id: %s`, id);
      throw e;
    }

    return items.filter(item => item.status?.privacyStatus !== 'private' && !!item.snippet?.thumbnails?.default?.url)
      .map(mapVideoResponse);
  }

  async searchPlaylists(query: string): Promise<YoutubePlaylist[]> {
    try {
      logger.info(`YouTube HTTP: search.list type:playlist ${query}`);
      // @ts-ignore Typescript is dumb
      const response = await this.youtube.search.list({ q: query, maxResults: 5, type: 'playlist', part: 'id,snippet' });
      if (!response.data.items) return [];

      return response.data.items.map(mapPlaylistResponse);
    } catch (e) {
      logger.warn(`Failed to search YouTube playlists: query: %s`, query);
      throw e;
    }
  }

  async searchVideos(query: string): Promise<YoutubeVideo[]> {
    try {
      logger.info(`YouTube HTTP: search.list ${query}`);
      // @ts-ignore Typescript is dumb
      const response = await this.youtube.search.list({
        q: query,
        maxResults: 7,
        // We should not provide the video type. It yields entirely different results for some videos for some reason.
        // type: 'video',
        part: 'id,snippet',
        // These should also be removed for the same reason as type: 'video' until this bug is no longer present
        // topicId: MUSIC_TOPIC,
        // videoCategoryId: MUSIC_CATEGORY_ID
      });
      const videoResponse = response.data.items?.filter(item => item.id?.kind === 'youtube#video') ?? [];
      if (!videoResponse.length) return [];

      const videos = videoResponse.filter(video => !!video.snippet?.thumbnails?.default?.url)
        .map(mapVideoResponse);

      return videos.slice(0, 5);
    } catch (e) {
      logger.warn(`Failed to search YouTube videos: query: %s`, query);
      throw e;
    }
  }

  async searchBing(name: string, artist: string): Promise<BingVideo[]> {
    const query = `${artist} ${name}`;
    let videos = await bing.searchVideos(query, 'YouTube', 15);
    if (videos.length) {
      const sorted = await fuzzyMatch(query, videos.map(mapVideoToName));
      videos = sorted.map(scored => videos[scored.key]);
    } else {
      logger.warn(`Failed to fetch YouTube track for query: %s`, query);
    }
    return videos;
  }

  async searchStream(track: Track): Promise<StreamData | undefined> {
    const videos = await this.searchBing(track.title, track.poster);
    if (videos.length > 0) {
      const video = videos.find(v =>  !MUSIC_VIDEO_PATTERN.test(v.name)) ?? videos[0];
      logger.info(`Searched stream '${track.poster} ${track.title}' selected '${video.contentUrl}'`);
      const youtubeTrack = mapBingToTrack(video);
      return this.getStream(youtubeTrack);
    }
    return undefined;
  }

  async getStream(track: Track): Promise<StreamData | undefined> {
    if (track.src !== SOURCE.YOUTUBE) {
      throw new Error(`Tried to get youtube readable from non-youtube resource: ${JSON.stringify(track)}`);
    }

    logger.info('Getting youtube stream %s', track.url);

    const stream = ytdl(track.url, { filter: 'audioonly', quality: 'highestaudio' });
    return { readable: stream, details: track };
  }

}

function mapVideoResponse(video: youtube_v3.Schema$Video | youtube_v3.Schema$PlaylistItem | youtube_v3.Schema$SearchResult): YoutubeVideo {
  const thumbnails = video.snippet!.thumbnails!;
  const id = typeof video.id! === 'string' ? video.id! : video.id!.videoId!;
  return {
    id,
    name: decode(video.snippet!.title!),
    channelName: decode(video.snippet!.channelTitle!),
    url: `https://www.youtube.com/watch?v=${id}`,
    artwork: thumbnails.maxres?.url ?? thumbnails.standard?.url ?? thumbnails.medium?.url ?? thumbnails.default!.url!
  };
}

function mapPlaylistResponse(playlist: youtube_v3.Schema$Playlist | youtube_v3.Schema$SearchResult): YoutubePlaylist {
  const id = typeof playlist.id! === 'string' ? playlist.id! : playlist.id!.playlistId!;
  return {
    id,
    name: decode(playlist.snippet!.title!),
    channelName: decode(playlist.snippet!.channelTitle!),
    videos: (playlist as youtube_v3.Schema$Playlist).contentDetails?.itemCount ?? undefined,
    url: `https://www.youtube.com/playlist?list=${id}`
  };
}

function mapVideoToName(video: BingVideo) {
  return `${video.creator.name} ${video.name}`;
}

export function mapYouTubeVideo(video: YoutubeVideo): Track {
  return {
    id: video.id,
    poster: video.channelName,
    src: SOURCE.YOUTUBE,
    url: video.url,
    title: video.name,
    stream: video.url,
    artwork: video.artwork
  };
}

export function mapBingToTrack(video: BingVideo): Track {
  return {
    id: video.id,
    poster: video.creator.name,
    src: SOURCE.YOUTUBE,
    url: video.contentUrl,
    title: video.name,
    stream: video.contentUrl
  }
}