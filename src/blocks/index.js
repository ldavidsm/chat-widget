import { quickReplies } from './quickReplies.js';
import { cards } from './cards.js';
import { calendar } from './calendar.js';

export { quickReplies, cards, calendar };

// What the widget registers unless you override it. `calendar()` with no
// options reads its slots from the block payload; pass your own
// `calendar({ loadSlots })` to fetch a month at a time instead.
export const defaultBlocks = {
  quickReplies,
  cards,
  calendar: calendar(),
};
