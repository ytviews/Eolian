import { CommandParsingStrategy } from 'commands/@types';
import { environment } from 'common/env';
import { EolianUserError } from 'common/errors';
import { logger } from 'common/logger';
import { LockManager } from 'data';
import { AppDatabase } from 'data/@types';
import {
  ButtonInteraction,
  Client,
  ClientOptions,
  CommandInteraction,
  ContextMenuInteraction,
  Guild,
  Intents,
  Interaction,
  Message,
} from 'discord.js';
import { ContextClient, ContextCommandInteraction, EolianBot, ServerState } from './@types';
import { ButtonRegistry } from './button';
import {
  DiscordClient,
  DiscordGuildClient,
  DISCORD_INVITE_PERMISSIONS,
  INVITE_SCOPES,
} from './client';
import {
  DiscordButtonInteraction,
  DiscordCommandInteraction,
  DiscordMessageCommandInteraction,
  DiscordMessageInteraction,
} from './interaction';
import { registerGuildSlashCommands } from './register_commands';
import { DiscordGuildStore } from './state';

const enum DiscordEvents {
  READY = 'ready',
  MESSAGE_CREATE = 'messageCreate',
  ERROR = 'error',
  RECONNECTING = 'shardReconnecting',
  RESUME = 'shardResume',
  DEBUG = 'debug',
  WARN = 'warn',
  GUILD_CREATE = 'guildCreate',
  INTERACTION_CREATE = 'interactionCreate',
}

// https://discord.com/developers/docs/topics/gateway#list-of-intents
const DISCORD_ENABLED_INTENTS = new Intents();
DISCORD_ENABLED_INTENTS.add(
  'GUILDS',
  // 'GUILD_MEMBERS',
  // 'GUILD_EMOJIS',
  // 'GUILD_INTEGRATIONS',
  // 'GUILD_WEBHOOKS',
  'GUILD_INVITES',
  'GUILD_VOICE_STATES',
  // 'GUILD_PRESENCES',
  'GUILD_MESSAGES',
  'GUILD_MESSAGE_REACTIONS',
  // 'GUILD_MESSAGE_TYPING',
  // 'DIRECT_MESSAGE_TYPING',
  'DIRECT_MESSAGES',
  'DIRECT_MESSAGE_REACTIONS'
);

const USER_COMMAND_LOCK_TIMEOUT = 60;

export interface DiscordEolianBotArgs {
  db: AppDatabase;
  parser: CommandParsingStrategy;
}

const DISCORD_CLIENT_OPTIONS: ClientOptions = {
  intents: DISCORD_ENABLED_INTENTS,
  partials: ['CHANNEL'],
};

export class DiscordEolianBot implements EolianBot {

  private readonly client: Client;
  private readonly parser: CommandParsingStrategy;
  private readonly guildStore: DiscordGuildStore;
  private readonly registry = new ButtonRegistry();
  private oldClient?: Client;
  private invite?: string;

  private readonly db: AppDatabase;
  private readonly lockManager: LockManager = new LockManager(USER_COMMAND_LOCK_TIMEOUT);

  constructor({ parser, db }: DiscordEolianBotArgs) {
    this.parser = parser;
    this.db = db;

    this.client = new Client(DISCORD_CLIENT_OPTIONS);

    this.client.once(DiscordEvents.READY, this.onReadyHandler);
    this.client.on(DiscordEvents.RECONNECTING, () => {
      logger.info('RECONNECTING TO WEBSOCKET');
    });
    this.client.on(DiscordEvents.RESUME, replayed => {
      logger.info(`CONNECTION RESUMED - REPLAYED: %s`, replayed);
    });
    this.client.on(DiscordEvents.WARN, info => {
      logger.warn(`Warn event emitted: %s`, info);
    });
    this.client.on(DiscordEvents.ERROR, err => {
      logger.warn(`An error event was emitted %s`, err);
    });
    this.client.on(DiscordEvents.MESSAGE_CREATE, this.onMessageHandler);
    this.client.on(DiscordEvents.INTERACTION_CREATE, this.onInteractionHandler);
    if (logger.isDebugEnabled()) {
      this.client.on(DiscordEvents.DEBUG, info => {
        logger.debug(`A debug event was emitted: %s`, info);
      });
    }

    if (environment.tokens.discord.old) {
      this.client.on(DiscordEvents.GUILD_CREATE, this.onGuildCreateHandler);
      this.oldClient = new Client(DISCORD_CLIENT_OPTIONS);
      this.oldClient.once(DiscordEvents.READY, this.setPresence);
      this.oldClient.on(DiscordEvents.MESSAGE_CREATE, this.onMessageHandlerOld);
    }

    this.guildStore = new DiscordGuildStore(this.client, this.db.servers);
  }

  async start(): Promise<void> {
    if (!this.client.readyTimestamp) {
      if (!environment.prod) {
        if (environment.ownerGuild) {
          await registerGuildSlashCommands(environment.ownerGuild);
        } else {
          logger.warn('Missing dev guild. Not registering slash commands for dev environment');
        }
      }
      await this.client.login(environment.tokens.discord.main);
      await this.oldClient?.login(environment.tokens.discord.old);
    }
  }

  async close(): Promise<void> {
    await this.guildStore.close();
    this.client.destroy();
  }

  /**
   * Executed when the connection has been established
   * and operations may begin to be performed
   */
  private onReadyHandler = async () => {
    try {
      logger.info('Discord bot is ready!');
      this.invite = this.client.generateInvite({
        scopes: INVITE_SCOPES,
        permissions: DISCORD_INVITE_PERMISSIONS,
      });
      logger.info(`Bot invite link: %s`, this.invite);
      await this.setPresence();
    } catch (e) {
      logger.warn(`Ready handler failed: %s`, e);
    }
  };

  private setPresence = async () => {
    try {
      this.client.user!.setPresence({
        activities: [
          {
            name: `${environment.cmdToken}help or /help`,
            type: 'LISTENING',
          },
        ],
      });
    } catch (e) {
      logger.warn(`Failed to set presence: %s`, e);
    }
  };

  private onGuildCreateHandler = async (guild: Guild) => {
    await this.oldClient?.guilds.cache.get(guild.id)?.leave();
  };

  private onInteractionHandler = async (interaction: Interaction) => {
    try {
      if (interaction.guildId && !interaction.inCachedGuild()) {
        logger.warn('Ignoring interaction from guild not cached: %s', interaction);
        return;
      }
      if (interaction.isButton()) {
        await this.onButtonClickHandler(interaction);
      } else if (
        interaction.isCommand()
        || (interaction.isContextMenu() && interaction.targetType === 'MESSAGE')
      ) {
        await this.onCommandHandler(interaction);
      } else {
        logger.warn('Received unknown interaction type: %s', interaction.type);
      }
    } catch (e) {
      logger.warn('Unhandled occured executing interaction event: %s', e);
    }
  };

  private onButtonClickHandler = async (interaction: ButtonInteraction) => {
    const embedButton = this.registry.getButton(interaction.message.id, interaction.customId);
    if (embedButton) {
      const contextInteraction = new DiscordButtonInteraction(
        interaction,
        this.registry,
        this.db.users
      );
      if (!embedButton.userId || embedButton.userId === interaction.user.id) {
        let state: ServerState | undefined;
        if (interaction.guild) {
          state = await this.guildStore.getState(interaction.guild);
        }
        await contextInteraction.user.updatePermissions(state?.details);

        if (embedButton.permission && contextInteraction.user.permission < embedButton.permission) {
          await contextInteraction.send(`Sorry, you do not have permission to use this button!`);
        } else {
          const destroy = await embedButton.onClick(contextInteraction, embedButton.emoji);
          if (destroy) {
            contextInteraction.message.releaseButtons();
          }
        }
      } else {
        await contextInteraction.send(`Only <@${embedButton.userId}> may click this button`);
      }
    } else {
      logger.warn(
        'Unknown button click received: %s %s',
        interaction.message.id,
        interaction.customId
      );
      await interaction.update({ content: `***Expired Message***`, components: [] });
      await interaction.followUp({ content: 'Sorry, this button has expired.', ephemeral: true });
    }
  };

  private onCommandHandler = async (interaction: CommandInteraction | ContextMenuInteraction) => {
    const locked = await this.lockManager.isLocked(interaction.user.id);
    if (!locked) {
      try {
        await this.lockManager.lock(interaction.user.id);
        const contextInteraction = interaction.isCommand()
          ? new DiscordCommandInteraction(interaction, this.registry, this.db.users)
          : new DiscordMessageCommandInteraction(interaction, this.registry, this.db.users);

        const noDefault = await this.onBotInvoked(
          contextInteraction,
          interaction.guild ?? undefined
        );

        if (!contextInteraction.hasReplied && !noDefault) {
          await contextInteraction.send('👌', { ephemeral: true });
        }
      } finally {
        await this.lockManager.unlock(interaction.user.id);
      }
    } else {
      await interaction.reply({ content: 'One command at a time please!', ephemeral: true });
    }
  };

  private onMessageHandler = async (message: Message): Promise<void> => {
    if (message.author.bot || !this.isTextOrDm(message)) {
      return;
    }

    try {
      if (await this.isBotInvoked(message)) {
        const locked = await this.lockManager.isLocked(message.author.id);
        if (!locked) {
          try {
            await this.lockManager.lock(message.author.id);
            const interaction = new DiscordMessageInteraction(
              message,
              this.parser,
              this.registry,
              this.db.users
            );
            await this.onBotInvoked(interaction, message.guild ?? undefined);
          } finally {
            await this.lockManager.unlock(message.author.id);
          }
        } else {
          await message.reply({ content: 'One command at a time please!' });
        }
      }
    } catch (e) {
      logger.warn(`Unhandled error occured during request: %s`, e);
    }
  };

  private onMessageHandlerOld = async (message: Message): Promise<void> => {
    if (message.author.bot || !this.isTextOrDm(message)) {
      return;
    }

    try {
      if (this.invite && (await this.isBotInvoked(message))) {
        message.reply(
          `This bot is being migrated to a new token! Invite the new bot \n${this.invite}`
        );
      }
    } catch (e) {
      logger.warn(`Unhandled error occured during request: %s`, e);
    }
  };

  private async isBotInvoked(message: Message) {
    let invoked = message.mentions.has(this.client.user!, { ignoreEveryone: true });
    if (!invoked) {
      let prefix: string | undefined;
      if (message.guild) {
        const details = this.guildStore.getDetails(message.guild);
        const config = await details.get();
        prefix = config.prefix;
      }
      invoked = this.parser.messageInvokesBot(message.content, prefix);
      if (invoked) {
        message.content = message.content.slice(1);
      }
    }
    return invoked;
  }

  private async onBotInvoked(
    interaction: ContextCommandInteraction,
    guild?: Guild
  ): Promise<boolean> {
    const start = Date.now();
    let noDefaultReply = false;
    try {
      logger.info(`[%s] Message event received: '%s'`, interaction.user.id, interaction);

      if (!interaction.sendable) {
        if (!interaction.channel.visible) {
          await interaction.send(
            `I can't execute commands in this channel. I require \`View Channel\`, \`Send Messages\`, \`Embed Links\`, and \`Read Message History\` permissions.`,
            { force: true }
          );
        } else {
          await interaction.user.send(
            `I can't execute commands in that channel. I require \`View Channel\`, \`Send Messages\`, \`Embed Links\`, and \`Read Message History\` permissions.`
          );
        }
        return noDefaultReply;
      }

      let server: ServerState | undefined;
      let client: ContextClient;
      if (guild) {
        server = await this.guildStore.getState(guild);
        client = new DiscordGuildClient(this.client, guild.id, this.guildStore, this.db.servers);
      } else {
        client = new DiscordClient(this.client, this.guildStore, this.db.servers);
      }
      await interaction.user.updatePermissions(server?.details);

      const { command, options } = await interaction.getCommand(server?.details);
      if (interaction.channel.isDm && !command.dmAllowed) {
        await interaction.send(
          `Sorry, this command is not allowed via DM. Try again in a guild channel.`
        );
        return false;
      }

      await command.execute({ interaction, server, client }, options);

      await server?.details.updateUsage();

      noDefaultReply = !!command.noDefaultReply;
    } catch (e) {
      const userError = e instanceof EolianUserError;

      if (interaction.sendable) {
        if (userError) {
          if (e.context) {
            await e.context.edit(e.message);
          } else {
            await interaction.send(e.message);
          }
        } else {
          await interaction.send(
            `Hmm.. I tried to do that but something in my internals is broken. Try again later.`
          );
        }
      } else {
        await interaction.user.send(
          `Hmm.. something went wrong and I can't send to that channel anymore. Try again and fix permissions if needed.`
        );
      }

      if (!userError) {
        throw e;
      }
    } finally {
      logger.info(`[%s] Message event finished (%d ms)`, interaction.user.id, Date.now() - start);
    }
    return noDefaultReply;
  }

  private isTextOrDm(message: Message): boolean {
    switch (message.channel.type) {
      case 'DM':
      case 'GUILD_TEXT':
        return true;
      default:
        return false;
    }
  }

}
