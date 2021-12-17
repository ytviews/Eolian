import { Command, CommandContext, CommandOptions } from 'commands/@types';
import { GENERAL_CATEGORY } from 'commands/category';
import { PATTERNS } from 'commands/patterns';
import { PERMISSION } from 'common/constants';

const PAGE_LENGTH = 10;

async function kickUnused(context: CommandContext) {
  const servers = await context.client.getUnusedServers();
  if (servers.length === 0) {
    await context.interaction.send('No servers!');
    return;
  }
  await context.interaction.send(servers.map((s, i) => `${i}. ${s.id}`).join('\n'));
  const result = await context.interaction.sendSelection('Kick?', [{ name: 'Yes' }, { name: 'No' }], context.interaction.user);
  if (result.selected === 0) {
    await Promise.all(servers.map(s => context.client.leave(s.id)));
    await result.message.edit(`I have left all ${servers.length} servers`);
  } else {
    await result.message.edit(`Cancelled kick`);
  }
}

async function kickOld(days: number, context: CommandContext) {
  const minDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * days);
  const servers = await context.client.getIdleServers(minDate);
  if (servers.length === 0) {
    await context.interaction.send('No servers!');
    return;
  }
  await context.interaction.send(servers.map((s, i) => `${i}. ${s._id} ${s.lastUsage?.toUTCString() ?? ''}`).join('\n'));
  const result = await context.interaction.sendSelection('Kick?', [{ name: 'Yes' }, { name: 'No' }], context.interaction.user);
  if (result.selected === 0) {
    await Promise.all(servers.map(s => context.client.leave(s._id)));
    await result.message.edit(`I have left all ${servers.length} servers`);
  } else {
    await result.message.edit(`Cancelled kick`);
  }
}

async function execute(context: CommandContext, options: CommandOptions): Promise<void> {
  await context.interaction.defer();

  let servers = context.client.getServers().sort((a, b) => b.members - a.members);

  let start = 0;
  if (options.NUMBER && options.NUMBER[0] >= 0) {
    start = options.NUMBER[0] * PAGE_LENGTH;
  }

  if (start >= servers.length) {
    start = Math.max(0, servers.length - PAGE_LENGTH);
  }

  if (options.ARG && options.ARG.length > 0) {
    if (options.ARG.length > 1) {
      switch (options.ARG[0]) {
        case 'sort': {
          const prop = options.ARG[1];
          // @ts-ignore
          if (servers.length && typeof servers[0][prop] === 'number') {
            // @ts-ignore
            servers = servers.sort((a, b) => b[prop] - a[prop]);
          }
          break;
        }
        case 'kick': {
          const id = options.ARG[1];
          const kicked = await context.client.leave(id);
          await context.interaction.send(kicked ? `I have left ${id}` : `I don't recognize that guild!`);
          return;
        }
        case 'kickOld': {
          const days = +options.ARG[1];
          if (!isNaN(days)) {
            await kickOld(days, context);
            return;
          }
        }
      }
    } else {
      switch (options.ARG[0]) {
        case 'kickUnused': {
          await kickUnused(context);
          return;
        }
        case 'updateCommands': {
          const success = await context.client.updateCommands();
          if (success) {
            await context.interaction.send('Request to update commands sent successfully!');
          } else {
            await context.interaction.send('I failed to update commands. Check the logs.');
          }
          return;
        }
        default:
      }
    }
  }

  const members = servers.reduce((sum, server) => sum + server.members, 0);
  const recentlyUsed = context.client.getRecentlyUsedCount();
  let response = `Total Servers: ${servers.length}\nTotal Users: ${members}\nActive Servers: ${recentlyUsed}` + '```'
  response += servers.slice(start, start + PAGE_LENGTH).map((server, i) => `${start + i + 1}. ${JSON.stringify(server)}`).join('\n');
  response += '\n```';

  await context.interaction.send(response);
}

export const SERVERS_COMMAND: Command = {
  name: 'servers',
  details: 'Show all servers this bot is joined to.',
  permission: PERMISSION.OWNER,
  category: GENERAL_CATEGORY,
  patterns: [PATTERNS.NUMBER, PATTERNS.ARG],
  dmAllowed: true,
  usage: [
    {
      title: 'Show servers',
      example: ''
    },
    {
      title: 'Show servers at page',
      example: '2'
    },
    {
      title: 'Sort by bot',
      example: [PATTERNS.ARG.ex('/sort/botCount/')]
    },
    {
      title: 'Kick server',
      example: [PATTERNS.ARG.ex('/kick/<id>/')]
    }
  ],
  args: {
    base: true,
    groups: [
      {
        required: false,
        options: [
          {
            name: 'action',
            details: 'The custom action to do',
            getChoices() {
              return ['sort', 'kick', 'kickOld', 'kickUnused', 'updateCommands']
            }
          }
        ],
      },
      {
        required: false,
        options: [
          {
            name: 'arg',
            details: 'Argument for the action'
          }
        ]
      }
    ]
  },
  execute
}
