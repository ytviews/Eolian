import { COMMAND_MAP } from 'commands';
import { CommandParsingStrategy, ParsedCommand, SyntaxType } from 'commands/@types';
import { EMOJI_TO_NUMBER, NUMBER_TO_EMOJI } from 'common/constants';
import { logger } from 'common/logger';
import { UsersDb } from 'data/@types';
import { ButtonInteraction, CommandInteraction, DMChannel, GuildMember, InteractionReplyOptions, Message, TextChannel } from 'discord.js';
import { createSelectionEmbed } from 'embed';
import { SelectionOption } from 'embed/@types';
import { ContextButtonInteraction, ContextCommandInteraction, ContextInteraction, ContextInteractionOptions, ContextMessage, ContextTextChannel, ContextUser, EmbedMessage, EmbedMessageButton, MessageButtonOnClickHandler, ServerDetails } from './@types';
import { DiscordTextChannel, STOP_EMOJI } from './channel';
import { DiscordButtonMapping, DiscordMessage, DiscordMessageButtons, mapDiscordEmbed, mapDiscordEmbedButtons } from './message';
import { DiscordUser, getPermissionLevel } from './user';

export class ButtonRegistry {

  private readonly registry = new Map<string, Map<string, EmbedMessageButton>>();

  register(messageId: string, buttons: Map<string, EmbedMessageButton>): void {
    if (!this.registry.has(messageId)) {
      logger.info('Registered buttons for message %s', messageId);
    }
    this.registry.set(messageId, buttons);
  }

  getButton(messageId: string, buttonId: string): EmbedMessageButton | undefined {
    return this.registry.get(messageId)?.get(buttonId);
  }

  unregister(messageId: string): void {
    logger.info('Unregistering buttons for message %s', messageId);
    this.registry.delete(messageId);
  }

}

class DiscordInteraction<T extends ButtonInteraction | CommandInteraction> implements ContextInteraction {

  private _user?: ContextUser;
  private _channel?: ContextTextChannel;

  constructor(protected readonly interaction: T,
    private readonly registry: ButtonRegistry,
    private readonly users: UsersDb) {
  }

  get sendable(): boolean {
    return true;
  }

  get user(): ContextUser {
    if (!this._user) {
      this.interaction.memberPermissions
      const permission = getPermissionLevel(this.interaction.user, this.interaction.memberPermissions);
      if (typeof this.interaction.member.permissions !== 'string') {
        this._user = new DiscordUser(this.interaction.user, this.users, permission, this.interaction.member as GuildMember);
      } else {
        this._user = new DiscordUser(this.interaction.user, this.users, permission);
      }
    }
    return this._user;
  }

  get channel(): ContextTextChannel {
    if (!this._channel) {
      this._channel = new DiscordTextChannel(<TextChannel | DMChannel>this.interaction.channel, this.registry);
    }
    return this._channel;
  }

  get hasReplied(): boolean {
    return this.interaction.replied;
  }

  async reply(message: string, options?: ContextInteractionOptions): Promise<void> {
    const ephemeral = options?.ephemeral ?? true;
    if (!this.hasReplied) {
      await this.interaction.reply({ content: message, ephemeral });
    } else {
      await this.interaction.followUp({ content: message, ephemeral });
    }
  }

  async defer(ephemeral?: boolean): Promise<void> {
    await this.interaction.deferReply({ ephemeral });
  }

  async send(message: string): Promise<ContextMessage | undefined> {
    try {
      const reply = await this.sendMessage({ content: message });
      return new DiscordMessage(reply);
    } catch (e) {
      logger.warn('Failed to send message: %s', e);
    }
    return undefined;
  }

  sendSelection(question: string, options: SelectionOption[], user: ContextUser): Promise<number> {
    return new Promise((resolve, reject) => {
      let resolved = false;

      const onClick: MessageButtonOnClickHandler = async (interaction, emoji) => {
        if (!resolved) {
          resolved = true;
          await interaction.message.delete();
          resolve(emoji === STOP_EMOJI ? -1 : EMOJI_TO_NUMBER[emoji] - 1);
        }
        return true;
      };

      const selectEmbed = createSelectionEmbed(question, options, user.name, user.avatar);
      if (options.length < NUMBER_TO_EMOJI.length) {
        selectEmbed.buttons = options.map((o, i) => ({ emoji: NUMBER_TO_EMOJI[i + 1], onClick }));
        selectEmbed.buttons.push({ emoji: STOP_EMOJI , onClick });
        selectEmbed.buttonUserId = user.id;
      }

      const sentEmbedPromise = this.sendEmbed(selectEmbed);
      sentEmbedPromise.catch(reject);
    });
  }

  async sendEmbed(embed: EmbedMessage): Promise<ContextMessage | undefined> {
    try {
      const rich = mapDiscordEmbed(embed);

      const messageOptions: InteractionReplyOptions = { embeds: [rich] };

      let buttonMapping: DiscordButtonMapping | undefined;
      if (embed.buttons) {
        buttonMapping = mapDiscordEmbedButtons(embed.buttons);
        messageOptions.components = buttonMapping.rows;
      }

      const message = await this.sendMessage(messageOptions);
      if (embed.reactions) {
        logger.warn('No adding reactions for slash command messages');
      }

      let msgButtons: DiscordMessageButtons | undefined;
      if (buttonMapping) {
        this.registry.register(message.id, buttonMapping.mapping);
        msgButtons = { registry: this.registry, components: buttonMapping.rows };
      }

      return new DiscordMessage(message, msgButtons);
    } catch (e) {
      logger.warn('Failed to send embed message: %s', e);
    }
    return undefined;
  }

  private async sendMessage(options: InteractionReplyOptions): Promise<Message> {
    let reply: Message;
    if (!this.hasReplied) {
      reply = await this.interaction.reply({ ...options, ephemeral: true, fetchReply: true }) as Message;
    } else {
      reply = await this.interaction.followUp({ ...options, ephemeral: true, fetchReply: true }) as Message;
    }
    return reply;
  }

}

export class DiscordButtonInteraction extends DiscordInteraction<ButtonInteraction> implements ContextButtonInteraction {

  private _message?: ContextMessage;

  constructor(interaction: ButtonInteraction, registry: ButtonRegistry, users: UsersDb) {
    super(interaction, registry, users);
  }

  get message(): ContextMessage {
    if (!this._message) {
      this._message = new DiscordMessage(this.interaction.message as Message);
    }
    return this._message;
  }

}

export class DiscordCommandInteraction extends DiscordInteraction<CommandInteraction> implements ContextCommandInteraction {

  constructor(interaction: CommandInteraction, private readonly parser: CommandParsingStrategy, registry: ButtonRegistry, users: UsersDb) {
    super(interaction, registry, users);
  }

  get content(): string {
    return this.interaction.commandName;
  }

  async react(): Promise<void> {
    // Do nothing since we can't react to slash commands
  }

  async delete(): Promise<void> {
    // Do nothing since slash command messages are ephemeral
  }

  async getCommand(config?: ServerDetails): Promise<ParsedCommand> {
    const command = COMMAND_MAP[this.interaction.commandName];
    if (!command) {
      throw new Error('Unrecognized command!');
    }
    const args = this.interaction.options.getString('args', false) ?? '';
    const text = `${this.interaction.commandName} ${args}`;
    let type: SyntaxType | undefined;
    if (config) {
      const dto = await config.get();
      type = dto.syntax;
    }
    return this.parser.parseCommand(removeMentions(text), this.user.permission, type);
  }

}


export class DiscordMessageInteraction implements ContextCommandInteraction {

  private _user?: ContextUser;
  private _channel?: ContextTextChannel;
  private _message?: ContextMessage;
  private _hasReplied = false;

  constructor(private readonly discordMessage: Message,
    private readonly parser: CommandParsingStrategy,
    private readonly registry: ButtonRegistry,
    private readonly users: UsersDb) {
  }

  get sendable(): boolean {
    return this.channel.sendable;
  }

  get content(): string {
    return this.discordMessage.content;
  }

  get hasReplied(): boolean {
    return this._hasReplied;
  }

  get user(): ContextUser {
    if (!this._user) {
      const permission = getPermissionLevel(this.discordMessage.author, this.discordMessage.member?.permissions);
      this._user = new DiscordUser(this.discordMessage.author, this.users, permission, this.discordMessage.member ?? undefined);
    }
    return this._user;
  }

  get channel(): ContextTextChannel {
    if (!this._channel) {
      this._channel = new DiscordTextChannel(<TextChannel | DMChannel>this.discordMessage.channel, this.registry);
    }
    return this._channel;
  }

  get message(): ContextMessage {
    if (!this._message) {
      this._message = new DiscordMessage(this.discordMessage);
    }
    return this._message;
  }

  react(emoji: string): Promise<void> {
    return this.message.react(emoji);
  }

  delete(): Promise<void> {
    return this.message.delete();
  }

  async reply(message: string): Promise<void> {
    if (this.sendable) {
      try {
        this._hasReplied = true;
        await this.discordMessage.reply(message);
      } catch (e) {
        logger.warn('Failed to reply to message: %s', e);
      }
    }
  }

  send(message: string): Promise<ContextMessage | undefined> {
    return this.channel.send(message);
  }

  sendSelection(question: string, options: SelectionOption[], user: ContextUser): Promise<number> {
    return this.channel.sendSelection(question, options, user);
  }

  sendEmbed(embed: EmbedMessage): Promise<ContextMessage | undefined> {
    return this.channel.sendEmbed(embed);
  }

  async defer(): Promise<void> {
    // Do nothing since it doesn't matter here
  }

  async getCommand(config?: ServerDetails): Promise<ParsedCommand> {
    let type: SyntaxType | undefined;
    if (config) {
      const dto = await config.get();
      type = dto.syntax;
    }
    return this.parser.parseCommand(removeMentions(this.message.text), this.user.permission, type);
  }

}

function removeMentions(text: string): string {
  return text.replace(/<(@[!&]?|#)\d+>/g, '').trim();
}