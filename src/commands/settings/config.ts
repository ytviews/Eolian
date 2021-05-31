import { Command, CommandContext, CommandOptions } from 'commands/@types';
import { SETTINGS_CATEGORY } from 'commands/category';
import { PERMISSION } from 'common/constants';
import { EolianUserError } from 'common/errors';
import { createServerDetailsEmbed } from 'embed';

const enum CONFIG_OPTIONS {
  PREFIX = 'prefix',
  VOLUME = 'volume'
}

async function execute(context: CommandContext, options: CommandOptions): Promise<void> {
  if (!options.ARG) {
    const server = await context.server!.details.get();
    const details = createServerDetailsEmbed(context.server!.details, server);
    await context.channel.sendEmbed(details);
    return;
  }

  if (options.ARG.length !== 2) {
    throw new EolianUserError('To set a config, I require two arguments: `<name> <value>`')
  }

  const name = options.ARG[0].toLowerCase();
  const value = options.ARG[1].toLowerCase();

  switch (name) {
    case CONFIG_OPTIONS.PREFIX:
      await setPrefix(context, value);
      break;
    case CONFIG_OPTIONS.VOLUME:
      await setVolume(context, value);
      break;
    default:
      throw new EolianUserError(`There is no config for \`${name}\``);
  }
}

async function setPrefix(context: CommandContext, prefix: string) {
  if (prefix.length !== 1) {
    throw new EolianUserError('Please specify a prefix that is only 1 character in length!');
  }

  await context.server?.details.setPrefix(prefix);
  await context.channel.send(`✨ The prefix is now \`${prefix}\`!`);
}

async function setVolume(context: CommandContext, volume: string) {
  let value = +volume;
  if (isNaN(value) || value < 0 || value > 100) {
    throw new EolianUserError('Volume must be a number between 0 and 100!');
  }

  value = value / 100;

  await context.server!.details.setVolume(value);
  await context.channel.send(`✨ The default volume is now \`${volume}%\`!`);

  if (!context.server!.player.isStreaming) {
    context.server!.player.setVolume(value);
  }
}

export const CONFIG_COMMAND: Command = {
  name: 'config',
  details: 'Show configuration or change configurations for server',
  category: SETTINGS_CATEGORY,
  permission: PERMISSION.ADMIN,
  usage: [
    {
      title: 'Show server configs',
      example: '',
    },
    {
      title: 'Set prefix config',
      example: 'prefix $'
    },
    {
      title: 'Set default volume config',
      example: 'volume 50'
    }
  ],
  execute
};