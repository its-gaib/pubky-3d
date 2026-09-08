/** Official event dates checked on 2026-09-08. Pubky's trip is the developer's stated plan. */
export interface WorldConference {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly country: string;
  readonly dateLabel: string;
  readonly startDate?: string;
  readonly endDate?: string;
  readonly url: string;
  readonly color: string;
  readonly description: string;
}

export const WORLD_CONFERENCES = [
  {
    id: 'dark-prague-2026',
    name: 'DARK Prague 2026',
    city: 'Prague',
    country: 'Czech Republic',
    dateLabel: 'October 2–4, 2026',
    startDate: '2026-10-02',
    endDate: '2026-10-04',
    url: 'https://dark.events/events/prague/',
    color: '#B99CFF',
    description:
      'A gathering about privacy, autonomy and open technology inside Prague’s historic wastewater treatment plant.',
  },
  {
    id: 'planb-lugano-2026',
    name: 'Plan ₿ Forum Lugano',
    city: 'Lugano',
    country: 'Switzerland',
    dateLabel: 'October 23–24, 2026',
    startDate: '2026-10-23',
    endDate: '2026-10-24',
    url: 'https://planb.lugano.ch/',
    color: '#81DACC',
    description:
      'Set a course for Lugano’s annual forum, where Bitcoin builders explore technology, economics and individual freedom.',
    // Date source: https://planb.lugano.ch/planb-forum/
  },
  {
    id: 'planb-el-salvador-2027',
    name: 'Plan ₿ Forum El Salvador',
    city: 'San Salvador',
    country: 'El Salvador',
    dateLabel: 'January 29–30, 2027',
    startDate: '2027-01-29',
    endDate: '2027-01-30',
    url: 'https://planb.sv/',
    color: '#FFB477',
    description:
      'Meet the Bitcoin community in San Salvador for a two-day exchange on adoption, financial independence and free expression.',
  },
] as const satisfies readonly WorldConference[];
