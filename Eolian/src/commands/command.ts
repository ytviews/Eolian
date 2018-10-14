export abstract class CommandAction {

  constructor(protected readonly services: CommandActionServices) {
  }

  public abstract execute(context: CommandActionContext, params: CommandActionParams): Promise<any>;
}

export const AccountCategory: CommandCategory = {
  name: 'Account',
  details: 'This category contains commands for configuring third-party accounts and aliases'
};

export const GeneralCategory: CommandCategory = {
  name: 'General',
  details: 'This category contains commands of varying utility'
};

export const MusicCategory: CommandCategory = {
  name: 'Music',
  details: 'This category contains commands for manipulating the player'
};

export const QueueCategory: CommandCategory = {
  name: 'Queue',
  details: 'This category contains commands for manipulating the queue'
};

export const COMMAND_CATEGORIES: CommandCategory[] = [
  GeneralCategory,
  MusicCategory,
  QueueCategory,
  AccountCategory
];