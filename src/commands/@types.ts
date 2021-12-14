import { RangeArgument } from 'common/@types';
import { PERMISSION, SOURCE } from 'common/constants';
import { ContextClient, ContextCommandInteraction, ServerState } from 'framework/@types';

export interface BaseCommand {
  name: string;
  permission: PERMISSION;
  patterns?: Pattern<unknown>[];
  dmAllowed?: boolean;
  noDefaultReply?: boolean;
  execute(context: CommandContext, options: CommandOptions): Promise<void>;
}

export interface Command extends BaseCommand {
  shortDetails?: string;
  details: string;
  category: CommandCategory;
  // If using keyword parsing
  keywords?: Keyword[];
  new?: boolean;
  usage: CommandUsage[];
}

export type MessageCommand = BaseCommand;

export interface CommandUsage {
  title?: string;
  example: ArgumentExample[] | string;
}

export interface CommandCategory {
  name: string;
  details: string;
  permission: PERMISSION;
}

export interface CommandParsingStrategy {
  messageInvokesBot(message: string, prefix?: string): boolean;
  parseCommand(message: string, permission: PERMISSION, type?: SyntaxType): ParsedCommand;
}

export type CommandOptionsParsingStrategy = (text: string, permission: PERMISSION, keywords?: string[], patterns?: string[]) => CommandOptions;

export interface ParsedCommand {
  command: BaseCommand;
  options: CommandOptions;
}

export interface CommandContext {
  client: ContextClient;
  interaction: ContextCommandInteraction;
  server?: ServerState;
}

export interface CommandOptions {
  [key: string]: any;
  ENABLE?: boolean;
  DISABLE?: boolean;
  CLEAR?: boolean;
  MORE?: boolean;
  LESS?: boolean;
  MY?: boolean;
  SOUNDCLOUD?: boolean;
  SPOTIFY?: boolean;
  YOUTUBE?: boolean;
  PLAYLIST?: boolean;
  ALBUM?: boolean;
  ARTIST?: boolean;
  NEXT?: boolean;
  SHUFFLE?: boolean;
  LIKES?: boolean;
  TRACKS?: boolean;
  TOP?: RangeArgument;
  BOTTOM?: RangeArgument;
  SEARCH?: string;
  IDENTIFIER?: string;
  NUMBER?: number[];
  URL?: UrlArgument;
  ARG?: string[];
}

export interface UrlArgument {
  value: string;
  source: SOURCE;
}

export interface KeywordMatchResult<T> {
  matches: boolean;
  newText: string;
  args?: T;
}

export const enum KeywordGroup {
  Source = 'source',
  Type = 'type',
  Switch = 'switch',
  Increment = 'increment',
}

export interface KeywordGroupProperties {
  details: string;
}

export type KeywordGroups = {
  [key in KeywordGroup]: KeywordGroupProperties;
};

export const enum PatternGroup {
  Input = 'input'
}

export interface PatternGroupProperties {
  details: string;
}

export type PatternGroups = {
  [key in PatternGroup]: PatternGroupProperties;
}

export interface Keyword extends ArgumentExample {
  readonly name: string;
  readonly details: string;
  readonly permission: PERMISSION;
  readonly group?: KeywordGroup;
}

export interface Pattern<T> {
  readonly name: string;
  readonly details: string;
  readonly permission: PERMISSION;
  // Higher priority means that this keyword should be parsed and removed from the text before others.
  readonly priority: number;
  readonly usage: string[];
  readonly group?: PatternGroup;

  ex(text: string): ArgumentExample;

  /**
   * Check that the given text contains the keyword.
   * Removes the keyword information from the text and returns a new string.
   *
   * @param text
   */
  matchText(text: string, type: SyntaxType): KeywordMatchResult<T>;
}

export interface Keywords {
  [key:string]: Keyword | undefined;
  ENABLE: Keyword;
  DISABLE: Keyword;
  CLEAR: Keyword;
  MORE: Keyword;
  LESS: Keyword;
  MY: Keyword;
  SOUNDCLOUD: Keyword;
  SPOTIFY: Keyword;
  YOUTUBE: Keyword;
  PLAYLIST: Keyword;
  ALBUM: Keyword;
  ARTIST: Keyword;
  NEXT: Keyword;
  SHUFFLE: Keyword;
  LIKES: Keyword;
  TRACKS: Keyword;
}

export interface Patterns {
  [key:string]: Pattern<unknown> | undefined;
  TOP: Pattern<RangeArgument>;
  BOTTOM: Pattern<RangeArgument>;
  SEARCH: Pattern<string>;
  IDENTIFIER: Pattern<string>;
  URL: Pattern<UrlArgument>;
  NUMBER: Pattern<number[]>;
  ARG: Pattern<string[]>;
}

export const enum SyntaxType {
  KEYWORD = 0,
  TRADITIONAL = 1,
  SLASH = 2
}

export interface ArgumentExample {
  text(type: SyntaxType): string;
}