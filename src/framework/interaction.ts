import { ParsedCommand, CommandParsingStrategy, SyntaxType } from '@eolian/commands/@types';
import { UsersDb } from '@eolian/data/@types';
import { SelectionOption } from '@eolian/embed/@types';
import {
  MessageComponentInteraction,
  CommandInteraction,
  BaseMessageOptions,
  Message,
  GuildMember,
  TextChannel,
  DMChannel,
  ButtonInteraction,
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
} from 'discord.js';
import {
  ContextInteraction,
  ContextUser,
  ContextTextChannel,
  ContextInteractionOptions,
  ContextMessage,
  SelectionResult,
  EmbedMessage,
  ContextButtonInteraction,
  ContextCommandInteraction,
  ServerDetails,
  IAuthServiceProvider,
} from './@types';
import { ButtonRegistry } from './button';
import { DiscordMessageSender, DiscordChannelSender, DiscordTextChannel } from './channel';
import { DiscordMessage } from './message';
import { parseSlashCommand, parseMessageCommand } from './slash';
import { getPermissionLevel, DiscordUser } from './user';

class CommandInteractionSender implements DiscordMessageSender {

  constructor(private readonly interaction: MessageComponentInteraction | CommandInteraction) {}

  async send(options: BaseMessageOptions, forceEphemeral?: boolean): Promise<Message> {
    const hasButtons = !!options.components?.length;
    const ephemeral = hasButtons ? false : forceEphemeral ?? true;
    let reply: Message;
    if (!this.interaction.replied) {
      if (!this.interaction.deferred) {
        reply = (await this.interaction.reply({
          ...options,
          ephemeral,
          fetchReply: true,
        })) as Message;
      } else {
        if (this.interaction.ephemeral && hasButtons) {
          throw new Error('Buttons on ephemeral message are not allowed');
        }
        reply = (await this.interaction.editReply(options)) as Message;
      }
    } else {
      reply = (await this.interaction.followUp({
        ...options,
        ephemeral,
        fetchReply: true,
      })) as Message;
    }
    return reply;
  }

}

class DiscordInteraction<T extends MessageComponentInteraction | CommandInteraction>
  implements ContextInteraction
{

  private _user?: ContextUser;
  private _channel?: ContextTextChannel;
  private _sender?: DiscordChannelSender;

  constructor(
    protected readonly interaction: T,
    protected readonly registry: ButtonRegistry,
    private readonly users: UsersDb,
    private readonly auth: IAuthServiceProvider
  ) {}

  get sendable(): boolean {
    return this.sender.sendable;
  }

  get user(): ContextUser {
    if (!this._user) {
      const permission = getPermissionLevel(
        this.interaction.user,
        this.interaction.memberPermissions
      );
      if (this.interaction.member) {
        this._user = new DiscordUser(
          this.interaction.user,
          this.users,
          permission,
          this.auth,
          this.interaction.member as GuildMember
        );
      } else {
        this._user = new DiscordUser(this.interaction.user, this.users, permission, this.auth);
      }
    }
    return this._user;
  }

  get channel(): ContextTextChannel {
    if (!this._channel) {
      this._channel = new DiscordTextChannel(
        <TextChannel | DMChannel>this.interaction.channel,
        this.registry
      );
    }
    return this._channel;
  }

  get hasReplied(): boolean {
    return this.interaction.replied;
  }

  private get sender(): DiscordChannelSender {
    if (!this._sender) {
      this._sender = new DiscordChannelSender(
        new CommandInteractionSender(this.interaction),
        this.registry,
        <TextChannel | DMChannel>this.interaction.channel
      );
    }
    return this._sender;
  }

  async defer(ephemeral = true): Promise<void> {
    await this.interaction.deferReply({ ephemeral });
  }

  send(message: string, options?: ContextInteractionOptions): Promise<ContextMessage | undefined> {
    return this.sender.send(message, options);
  }

  sendSelection(
    question: string,
    options: SelectionOption[],
    user: ContextUser
  ): Promise<SelectionResult> {
    return this.sender.sendSelection(question, options, user);
  }

  async sendEmbed(
    embed: EmbedMessage,
    options?: ContextInteractionOptions
  ): Promise<ContextMessage | undefined> {
    return this.sender.sendEmbed(embed, options);
  }

}

export class DiscordButtonInteraction
  extends DiscordInteraction<ButtonInteraction>
  implements ContextButtonInteraction
{

  private _message?: ContextMessage;

  constructor(
    interaction: ButtonInteraction,
    registry: ButtonRegistry,
    users: UsersDb,
    auth: IAuthServiceProvider
  ) {
    super(interaction, registry, users, auth);
  }

  get message(): ContextMessage {
    if (!this._message) {
      this._message = new DiscordMessage(this.interaction.message as Message, {
        registry: this.registry,
        components: this.interaction.message.components,
        interaction: this.interaction,
      });
    }
    return this._message;
  }

  async deferUpdate(): Promise<void> {
    await this.interaction.deferUpdate();
  }

}

export class DiscordCommandInteraction
  extends DiscordInteraction<ChatInputCommandInteraction>
  implements ContextCommandInteraction
{

  readonly isSlash = true;

  constructor(
    interaction: ChatInputCommandInteraction,
    registry: ButtonRegistry,
    users: UsersDb,
    auth: IAuthServiceProvider
  ) {
    super(interaction, registry, users, auth);
  }

  get content(): string {
    return this.interaction.toString();
  }

  get reactable(): boolean {
    return false;
  }

  async react(): Promise<void> {
    // Do nothing since we can't react to slash commands
  }

  async getCommand(): Promise<ParsedCommand> {
    return parseSlashCommand(this.interaction, this.user.permission);
  }

  toString(): string {
    return this.interaction.toString();
  }

}

export class DiscordMessageCommandInteraction
  extends DiscordInteraction<MessageContextMenuCommandInteraction>
  implements ContextCommandInteraction
{

  readonly isSlash = true;
  readonly reactable = false;
  private _message?: Message;

  constructor(
    interaction: MessageContextMenuCommandInteraction,
    registry: ButtonRegistry,
    users: UsersDb,
    auth: IAuthServiceProvider
  ) {
    super(interaction, registry, users, auth);
  }

  private get message(): Message {
    if (!this._message) {
      this._message = this.interaction.targetMessage as Message;
    }
    return this._message;
  }

  async react(): Promise<void> {
    // Do nothing since we can't react to this command
  }

  async getCommand(): Promise<ParsedCommand> {
    return parseMessageCommand(
      this.interaction.commandName,
      this.message.content,
      this.user.permission
    );
  }

  toString(): string {
    return `(${this.interaction.commandName}) ${this.message.content}`;
  }

}

class MessageInteractionSender implements DiscordMessageSender {

  constructor(private readonly message: Message) {}

  async send(options: BaseMessageOptions): Promise<Message<boolean>> {
    return this.message.reply(options);
  }

}

export class DiscordMessageInteraction implements ContextCommandInteraction {

  private _user?: ContextUser;
  private _channel?: ContextTextChannel;
  private _message?: ContextMessage;
  private _hasReplied = false;
  private _sender?: DiscordChannelSender;

  constructor(
    private readonly discordMessage: Message,
    private readonly parser: CommandParsingStrategy,
    private readonly registry: ButtonRegistry,
    private readonly users: UsersDb,
    private readonly auth: IAuthServiceProvider
  ) {}

  get sendable(): boolean {
    return this.channel.sendable;
  }

  get hasReplied(): boolean {
    return this._hasReplied;
  }

  get user(): ContextUser {
    if (!this._user) {
      const permission = getPermissionLevel(
        this.discordMessage.author,
        this.discordMessage.member?.permissions
      );
      this._user = new DiscordUser(
        this.discordMessage.author,
        this.users,
        permission,
        this.auth,
        this.discordMessage.member ?? undefined
      );
    }
    return this._user;
  }

  get channel(): ContextTextChannel {
    if (!this._channel) {
      this._channel = new DiscordTextChannel(
        <TextChannel | DMChannel>this.discordMessage.channel,
        this.registry
      );
    }
    return this._channel;
  }

  get message(): ContextMessage {
    if (!this._message) {
      this._message = new DiscordMessage(this.discordMessage);
    }
    return this._message;
  }

  get reactable(): boolean {
    return this.channel.reactable;
  }

  private get sender(): DiscordChannelSender {
    if (!this._sender) {
      this._sender = new DiscordChannelSender(
        new MessageInteractionSender(this.discordMessage),
        this.registry,
        <TextChannel | DMChannel>this.discordMessage.channel
      );
    }
    return this._sender;
  }

  react(emoji: string): Promise<void> {
    return this.message.react(emoji);
  }

  send(message: string): Promise<ContextMessage | undefined> {
    return this.sender.send(message);
  }

  sendSelection(
    question: string,
    options: SelectionOption[],
    user: ContextUser
  ): Promise<SelectionResult> {
    return this.sender.sendSelection(question, options, user);
  }

  sendEmbed(embed: EmbedMessage): Promise<ContextMessage | undefined> {
    return this.sender.sendEmbed(embed);
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

  toString(): string {
    return this.discordMessage.content;
  }

}

function removeMentions(text: string): string {
  return text.replace(/<(@[!]?|#)\d+>/g, '').trim();
}
