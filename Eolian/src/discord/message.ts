import { Message } from "discord.js";

export class DiscordMessage implements ContextMessage {

  constructor(private readonly message: Message) { }

  async reply(message: string): Promise<void> {
    await this.message.reply(message);
  };

  getButtons() {
    return this.message.reactions.map(reaction => ({
      emoji: reaction.emoji.name,
      count: reaction.me ? reaction.count - 1 : reaction.count
    }));
  }

  async delete(): Promise<void> {
    await this.message.delete();
  }

}