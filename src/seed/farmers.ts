/** Demo accounts for the “Try a demo farm” buttons. Passwords are only a UI convenience. */

export interface DemoAccount {
  id: string;
  email: string;
  /** Shown on the demo button; Piezas requires 10+ characters. */
  password: string;
  name: string;
  farm: string;
  fields: number;
  location: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: 'sam',
    email: 'sam@willowcreekfarm.ca',
    password: 'farm123-demo',
    name: 'Sam Whitfield',
    farm: 'Willow Creek Farm',
    fields: 6, // scripts/seed-demo.ts: the showcase farm, one field per situation
    location: 'Fraser Valley, BC',
  },
  {
    id: 'jordan',
    email: 'jordan@mapleridge.ca',
    password: 'oats456-demo',
    name: 'Jordan Hale',
    farm: 'Maple Ridge Farm',
    fields: 3,
    location: 'Perth County, ON',
  },
];
