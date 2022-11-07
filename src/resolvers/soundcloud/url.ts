import { soundcloud } from '@eolian/api';
import {
  SoundCloudPlaylist,
  SoundCloudResourceType,
  SoundCloudTrack,
  SoundCloudUser,
} from '@eolian/api/soundcloud/@types';
import { EolianUserError } from '@eolian/common/errors';
import { SourceResolver, ResolvedResource } from '../@types';
import { createSoundCloudUser } from './artist';
import { createSoundCloudPlaylist } from './playlist';
import { createSoundCloudSong } from './song';

export class SoundCloudUrlResolver implements SourceResolver {

  constructor(private readonly url: string) {}

  async resolve(): Promise<ResolvedResource> {
    const resource = await soundcloud.resolve(this.url);
    switch (resource.kind) {
      case SoundCloudResourceType.PLAYLIST:
        return createSoundCloudPlaylist(resource as SoundCloudPlaylist, soundcloud);
      case SoundCloudResourceType.TRACK:
        return createSoundCloudSong(resource as SoundCloudTrack);
      case SoundCloudResourceType.USER:
        return createSoundCloudUser({ value: { user: resource as SoundCloudUser } });
      default:
        throw new EolianUserError('The SoundCloud URL is not valid!');
    }
  }

}
