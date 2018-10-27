import { EolianBot } from 'common/bot';
import { PERMISSION } from 'common/constants';
import { logger } from 'common/logger';
import { Client, GuildMember, Permissions, TextChannel } from 'discord.js';
import { DiscordTextChannel } from 'discord/channel';
import { DiscordBotService } from 'discord/client';
import { CHANNEL, EOLIAN_CLIENT_OPTIONS, EVENTS, INVITE_PERMISSIONS } from 'discord/constants';
import { DiscordMessage } from 'discord/message';
import { DiscordUser } from 'discord/user';
import environment from 'environments/env';

export class DiscordEolianBot extends EolianBot {

  private static bot: DiscordEolianBot;

  private constructor(db: Database, parseStrategy: CommandParsingStrategy, private readonly client: Client) {
    super(db, parseStrategy, new DiscordBotService(client));

    this.client.once(EVENTS.READY, this.readyEventHandler);
    this.client.on(EVENTS.RECONNECTING, () => logger.info('RECONNECTING TO WEBSOCKET'));
    this.client.on(EVENTS.RESUME, (replayed) => logger.info(`CONNECTION RESUMED - REPLAYED: ${replayed}`));
    this.client.on(EVENTS.DEBUG, (info) => logger.debug(`A debug event was emitted: ${info}`));
    this.client.on(EVENTS.WARN, (info) => logger.warn(`Warn event emitted: ${info}`));
    this.client.on(EVENTS.ERROR, (err) => logger.warn(`An error event was emitted ${err}`));
  }

  /**
   * Creates a bot instance and connects to discord
   */
  static async connect(db: Database, parseStrategy: CommandParsingStrategy): Promise<EolianBot> {
    if (!this.bot) {
      const client = new Client(EOLIAN_CLIENT_OPTIONS);
      this.bot = new DiscordEolianBot(db, parseStrategy, client);
      await this.bot.start();
    }
    return this.bot;
  }

  protected async _start() {
    if (!this.client.readyTimestamp)
      await this.client.login(environment.tokens.discord);
  }

  async stop() {
    await this.client.destroy();
  }


  protected onMessage(parseStrategy: CommandParsingStrategy) {
    this.client.removeAllListeners(EVENTS.MESSAGE);
    this.client.on(EVENTS.MESSAGE, async (message) => {
      try {
        const { author, content, channel } = message;
        if (author.bot) return;
        else if (!message.isMentioned(this.client.user) && !parseStrategy.messageInvokesBot(content)) return;

        logger.debug(`Message event received: '${content}'`);

        if (channel.type === CHANNEL.TEXT && !this.hasSendPermission(<TextChannel>channel)) {
          return await author.send(`I do not have permission to send messages to the channel \`#${(<TextChannel>channel).name}\``);
        }

        const permission = this.getPermissionLevel(message.member);
        const [params, newText] = parseStrategy.parseParams(content, permission);

        const [action, err] = parseStrategy.parseCommand(newText, permission, this.commands);
        if (err) {
          logger.debug(`Failed to get command action: ${err.message}`);
          return await message.reply(err.response);
        }

        const context: CommandActionContext = {
          user: new DiscordUser(author, permission),
          message: new DiscordMessage(message),
          channel: new DiscordTextChannel(message.channel)
        };
        await action.execute(context, params);
      } catch (e) {
        logger.warn(`Unhandled error occured during request: ${e.stack || e}`);
      }
    });
  }

  /**
   * Executed when the connection has been established
   * and operations may begin to be performed
   */
  private readyEventHandler = () => {
    logger.info('Discord bot is ready!');
    if (this.client.guilds.size === 0 || process.argv.includes('-gi')) {
      this.client.generateInvite(INVITE_PERMISSIONS)
        .then(link => logger.info(`Bot invite link: ${link}`))
        .catch(err => logger.warn(`Failed to generate invite: ${err}`));
    }
    this.client.user.setPresence({ game: { name: `${environment.cmdToken}help` } })
      .catch(err => logger.warn(`Failed to set presence: ${err}`));
  }

  private hasSendPermission(channel: TextChannel) {
    return channel.permissionsFor(this.client.user).has(Permissions.FLAGS.SEND_MESSAGES);
  }

  private getPermissionLevel(member: GuildMember): PERMISSION {
    if (environment.owners.includes(member.id)) return PERMISSION.OWNER;
    else if (member.roles.some(role => role.hasPermission(Permissions.FLAGS.ADMINISTRATOR))) return PERMISSION.ADMIN;
    return PERMISSION.USER;
  }

}