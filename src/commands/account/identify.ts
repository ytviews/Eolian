import { Command, CommandContext, CommandOptions } from 'commands/@types';
import { ACCOUNT_CATEGORY } from 'commands/category';
import { KEYWORDS, PATTERNS } from 'commands/keywords';
import { PERMISSION } from 'common/constants';
import { EolianUserError } from 'common/errors';
import { getSourceResolver } from 'resolvers';

const IDENTIFIER_MAX_KEY_LENGTH = 32;

async function execute(context: CommandContext, options: CommandOptions): Promise<void> {
  if (!options.IDENTIFIER) {
    throw new EolianUserError(`You forgot to specify the key for your identifer.`);
  }

  if (options.CLEAR) {
    const success = await context.interaction.user.removeIdentifier(options.IDENTIFIER);
    if (!success) {
      throw new EolianUserError(`You don't have an identifier for \`${options.IDENTIFIER}\``);
    }
    await context.interaction.reply(`💨 I have removed your identifier \`${options.IDENTIFIER}\`!`);
    return;
  }

  if (options.IDENTIFIER.length > IDENTIFIER_MAX_KEY_LENGTH) {
    throw new EolianUserError(`The identifier must be less than ${IDENTIFIER_MAX_KEY_LENGTH} characters! Try again.`);
  }

  if (options.URL && options.SEARCH) {
    throw new EolianUserError(`You specified both URL and SEARCH pattern! Please try again with only one of those.`);
  }

  await context.interaction.defer(false);

  const resource = await getSourceResolver(context, options).resolve();
  if (!resource) {
    throw new EolianUserError(`You must provide me something to identify! Please try again with a URL or query.`);
  }

  await context.interaction.user.setIdentifier(options.IDENTIFIER, resource.identifier);
  const response = `Awesome! The resource \`${resource.name}\` by \`${resource.authors.join(',')}\``
      + ` can now be identified with \`${options.IDENTIFIER}\`.`;
  if (resource.selectionMessage) {
    await resource.selectionMessage.edit(response);
  } else {
    await context.interaction.reply(response);
  }
}

export const IDENTIFY_COMMAND: Command = {
  name: 'identify',
  category: ACCOUNT_CATEGORY,
  shortDetails: 'Set a shortcut identifier for any song, playlist, album or artist.',
  details: 'Set a shortcut identifier for any song, playlist, album or artist from Spotify, SoundCloud, or YouTube.',
  permission: PERMISSION.USER,
  dmAllowed: true,
  keywords: [
    KEYWORDS.MY, KEYWORDS.SOUNDCLOUD, KEYWORDS.SPOTIFY, KEYWORDS.YOUTUBE,
    KEYWORDS.PLAYLIST, KEYWORDS.ALBUM, KEYWORDS.ARTIST, KEYWORDS.LIKES, KEYWORDS.TRACKS, KEYWORDS.CLEAR
  ],
  patterns: [
    PATTERNS.SEARCH, PATTERNS.IDENTIFIER, PATTERNS.URL,
  ],
  usage: [
    {
      title: `Search playlist from Spotify and assign it to identifier`,
      example: [KEYWORDS.SPOTIFY, KEYWORDS.PLAYLIST, PATTERNS.SEARCH.ex('retrowave'), PATTERNS.IDENTIFIER.ex('[retro]')]
    },
    {
      title: `Delete an identifier`,
      example: [PATTERNS.IDENTIFIER.ex('[retro]'), KEYWORDS.CLEAR]
    }
  ],
  execute
};