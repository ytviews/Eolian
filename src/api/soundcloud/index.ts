import { Track, TrackSource } from 'api/@types';
import { SoundCloudTrack } from './@types';

export * from './request';
export * from './client';

export function mapSoundCloudTrack(track: SoundCloudTrack): Track {
  return {
    id: track.id.toString(),
    poster: track.user.username,
    src: TrackSource.SoundCloud,
    url: track.permalink_url,
    stream: track.streamable && track.access === 'playable' ? track.stream_url : undefined,
    title: track.title,
    artwork: track.artwork_url && track.artwork_url.replace('large', 't500x500'),
    duration: track.duration,
  };
}
