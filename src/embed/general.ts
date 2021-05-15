import { SoundCloudUser, SpotifyUser } from 'api/@types';
import { COLOR } from 'common/constants';
import { Identifier } from 'data/@types';
import { ContextUser, EmbedMessage } from 'eolian/@types';
import { SelectionOption } from './@types';

export function createInviteEmbed(link: string, username: string, pic?: string): EmbedMessage {
  return {
    title: `**Invite: ${username}**`,
    description: 'Click to invite bot to server',
    url: link,
    thumbnail: pic,
    color: COLOR.INVITE
  }
}

const mapOption = (option: SelectionOption, i: number): string => {
  let text = `${i + 1}: `;
  if (typeof option === 'string') {
    text += option;
  } else {
    let name = option.name;
    if (option.subname) {
      name += ` - ${option.subname}`;
    }
    if (option.url) {
      name = `[${name}](${option.url})`;
    }
    text += name;
  }
  return text;
}

export function createSelectionEmbed(question: string, options: SelectionOption[], username: string, pic?: string): EmbedMessage {
  return {
    header: {
      text: '👈🏻 Select one 👉🏻'
    },
    title: `*${question}*`,
    color: COLOR.SELECTION,
    description: options.map(mapOption).join('\n') + '\n0: Cancel',
    footer: {
      icon: pic,
      text: `${username}, enter the number of your selection in chat or click emoji`
    }
  };
}

export function createUserDetailsEmbed(contextUser: ContextUser, spotify?: SpotifyUser, soundcloud?: SoundCloudUser,
    identifiers?: { [key: string]: Identifier }): EmbedMessage {

  let description = `**Spotify:** ${spotify ? spotify.external_urls.spotify : 'N/A'}\n`
    + `**SoundCloud:** ${soundcloud ? soundcloud.permalink_url : 'N/A'}\n`
    + `**Identifiers:** `;
  if (identifiers && Object.keys(identifiers).length > 0) {
    description += Object.keys(identifiers).map((key, i) => `[${key}](${identifiers[key].url})`).join(', ');
  } else {
    description += 'N/A';
  }

  return {
    header: {
      icon: contextUser.avatar,
      text: `🎫 Profile Details 🎫`
    },
    title: `Here's what I know about you ${contextUser.name}!`,
    color: COLOR.PROFILE,
    description,
    footer: {
      text: `See 'help' for the 'Account' category to configure your profile.`
    }
  }
}