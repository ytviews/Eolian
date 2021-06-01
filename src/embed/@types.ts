
export interface PollOption {
  text: string;
  emoji: string;
}

export interface PollOptionResult {
  option: string;
  count: number;
}

export type SelectionOption = {
  name: string;
  subname?: string;
  url?: string;
} | string;
