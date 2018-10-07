const defaultMatch = (text: string, reg: RegExp): { matches: boolean, newText: string, args: { [x: string]: any } } => {
  const regArr = reg.exec(text);
  return { matches: !!regArr, newText: text.replace(reg, ''), args: regArr.groups };
};

export const KEYWORDS: IKeywords = {
  ENABLE: {
    name: 'ENABLE',
    details: 'Indicates to enable a particular feature',
    permission: PERMISSION.OWNER,
    usage: ['enable'],
    matchText: (text: string) => defaultMatch(text, /\benable\b/i),
  },
  DISABLE: {
    name: 'DISABLE',
    details: 'Indicates to disable a particular feature',
    permission: PERMISSION.OWNER,
    usage: ['disable'],
    matchText: (text: string) => defaultMatch(text, /\bdisable\b/i),
  },
  MORE: {
    name: 'MORE',
    details: 'Indicates to increase a value',
    permission: PERMISSION.USER,
    usage: ['more'],
    matchText: (text: string) => defaultMatch(text, /\bmore\b/i),
  },
  LESS: {
    name: 'LESS',
    details: 'Indicates to decrease a value',
    permission: PERMISSION.USER,
    usage: ['less'],
    matchText: (text: string) => defaultMatch(text, /\bless\b/i),
  },
  SOUNDCLOUD: {
    name: 'SOUNDCLOUD',
    details: 'Indicates to fetch a resource from SoundCloud if applicable',
    permission: PERMISSION.USER,
    usage: ['soundcloud'],
    matchText: (text: string) => defaultMatch(text, /\bsoundcloud\b/i),
  },
  SPOTIFY: {
    name: 'SPOTIFY',
    details: 'Indicates to fetch a resource from Spotify if applicable',
    permission: PERMISSION.USER,
    usage: ['spotify'],
    matchText: (text: string) => defaultMatch(text, /\bspotify\b/i),
  },
  YOUTUBE: {
    name: 'YOUTUBE',
    details: 'Indicates to fetch a resource from YouTube if applicable',
    permission: PERMISSION.USER,
    usage: ['youtube'],
    matchText: (text: string) => defaultMatch(text, /\byoutube\b/i),
  },
  PLAYLIST: {
    name: 'PLAYLIST',
    details: 'Indicates to fetch songs from a playlist given a query',
    permission: PERMISSION.USER,
    usage: ['playlist'],
    matchText: (text: string) => defaultMatch(text, /\bplaylist\b/i),
  },
  ALBUM: {
    name: 'ALBUM',
    details: 'Indicates to fetch songs from an album given a query',
    permission: PERMISSION.USER,
    usage: ['album'],
    matchText: (text: string) => defaultMatch(text, /\balbum\b/i),
  },
  ARTIST: {
    name: 'ARTIST',
    details: 'Indicates to fetch songs for an artist given the query',
    permission: PERMISSION.USER,
    usage: ['artist'],
    matchText: (text: string) => defaultMatch(text, /\bartist\b/i),
  },
  NEXT: {
    name: 'NEXT',
    details: 'Indicates to place fetched tracks at the top of the queue',
    permission: PERMISSION.USER,
    usage: ['next'],
    matchText: (text: string) => defaultMatch(text, /\bnext\b/i),
  },
  SHUFFLE: {
    name: 'SHUFFLE',
    details: 'Indicates to shuffle the fetched tracks',
    permission: PERMISSION.USER,
    usage: ['shuffle', 'shuffled'],
    matchText: (text: string) => defaultMatch(text, /\bshuffled\b/i),
  },
  FAVORITES: {
    name: 'FAVORITES',
    details: 'Indicates to fetch SoundCloud favorites',
    permission: PERMISSION.USER,
    usage: ['favorites'],
    matchText: (text: string) => defaultMatch(text, /\bfavorites\b/i),
  },
  TRACKS: {
    name: 'TRACKS',
    details: 'Indicates to fetch SoundCloud tracks',
    permission: PERMISSION.USER,
    usage: ['tracks'],
    matchText: (text: string) => defaultMatch(text, /\btracks\b/i),
  },
  TOP: {
    name: 'TOP',
    details: 'Indicates to fetch the range of tracks starting from the beginning in the list',
    permission: PERMISSION.USER,
    usage: [
      'TOP 100  # Get the first 100 songs',
      'TOP 4:10  # Get the 4th song to the 10th song',
      'TOP 5:-5  # Get the 5th song to the 5th last song'
    ],
    matchText: (text: string) => defaultMatch(text, /\bTOP\s+((?<start>\d+)(:(?<stop>-?\d+))?)\b/i),
  },
  BOTTOM: {
    name: 'BOTTOM',
    details: 'Indicates to fetch the range of tracks starting from the end of the list',
    permission: PERMISSION.USER,
    usage: [
      'BOTTOM 100  # Get the last 100 songs',
      'BOTTOM 4:10  # Get the 4th last song to the 10th last song',
      'BOTTOM 5:-5  # Get the 5th last song to the 5th first song'
    ],
    matchText: (text: string) => defaultMatch(text, /\bBOTTOM\s+((?<start>\d+)(:(?<stop>-?\d+))?)\b/i),
  },
  QUERY: {
    name: 'QUERY',
    details: 'Used for searching',
    permission: PERMISSION.USER,
    usage: ['(what is love)', '(deadmau5)'],
    complex: true,
    matchText: (text: string) => defaultMatch(text, /\B\(\s*(?<query>[^\[\]\(\)]*[^\s])\s*\)\B/i),
  },
  IDENTIFIER: {
    name: 'IDENTIFIER',
    details: 'Used for referring to an identifier (a shortcut) for some resource such as a playlist.',
    permission: PERMISSION.USER,
    usage: ['[my identifier]', '[music playlist #2]'],
    complex: true,
    matchText: (text: string) => defaultMatch(text, /\B\[\s*(?<identifier>[^\[\]\(\)]*[^\s])\s*\]\B/i),
  },
  URL: {
    name: 'URL',
    details: 'Indicates that you may specify a URI to a resource from YouTube, Spotify, or SoundCloud.',
    permission: PERMISSION.USER,
    usage: [
      'https://open.spotify.com/album/3cWA6fj7NEfoGuGRYGxsam?si=cAQnHBD0Q6GO62egKBJmFQ',
      'soundcloud.com/kayfluxx/timbaland-apologize-ft-one-republic-kayfluxx-remix',
      'spotify:album:3cWA6fj7NEfoGuGRYGxsam',
      'https://www.youtube.com/watch?v=FRjOSmc01-M'
    ],
    matchText: (text: string) => defaultMatch(text, /\b(?<url>(https?:\/\/)?[^\s]+\.com\/[^\s]+|spotify:[a-zA-Z]+:[^\s]+)(\b|\B|\$)/),
  },
  ARG: {
    name: 'ARG',
    details: `Used for when keywords just won't cut it.`,
    permission: PERMISSION.USER,
    usage: [
      '{ arg1; arg2; arg3 }'
    ],
    complex: true,
    matchText: (text: string) => {
      const match = defaultMatch(text, /\B\{\s*(?<list>[^\{\}]+(;[^\{\}]+)+)\}\B/i);
      match.args.list = (<string>match.args.list).trim().split(/\s*;\s*/g);
      return match;
    },
  }
};