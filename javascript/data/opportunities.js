// Static opportunity data for the portal. Sessions are ISO dates (local time)
// so the date filters can be computed; display strings are derived in lib/format.js.
// When the backend lands, this module is the shape the API should return.

export const CATEGORIES = ['Sport', 'Lifestyle']
export const COLLAB_TYPES = ['Barter', 'Paid']

export const opportunities = [
  {
    id: '1',
    title: 'Tennis Group Class',
    partner: 'Kallang Tennis Centre',
    category: 'Sport',
    sport: 'Tennis',
    collab: 'Barter',
    location: 'Kallang',
    address: 'Stadium Road, Kallang, Singapore 397630',
    image:
      'https://images.unsplash.com/photo-1635842939844-1fbf6bea8e78?w=800&h=500&fit=crop&auto=format',
    heroImage:
      'https://images.unsplash.com/photo-1714840961998-8d6c02ace00b?w=1600&h=800&fit=crop&auto=format',
    dateLabel: 'Saturday, 12 September',
    perk: 'Complimentary tennis class',
    perkDetail: 'Complimentary group tennis class (1 hour)',
    spotsLeft: 2,
    about:
      "Join a group tennis class led by an experienced instructor at Kallang Tennis Centre. The session is designed for beginner to intermediate players and gives creators an authentic on-court experience — perfect for sharing with your audience. Whether you're picking up a racquet for the first time or looking to sharpen your game, this is a fun, relaxed session that makes for great content.",
    audience: [
      { label: 'Playing level', value: 'Beginner to Intermediate' },
      { label: 'Equipment', value: 'Racquets can be provided if needed' },
    ],
    deliverables: [
      'Post 1 × Instagram Reel or TikTok (minimum 30 seconds) featuring the experience',
      { text: 'Tag {0} and {1} in your post and caption', handles: ['@lyfego.sg', '@kallangtennis'] },
      'Content to be posted within 7 days of attending the session',
      'Story or feed post shared to your audience at the time of posting',
    ],
    sessions: [
      { id: '1a', date: '2026-09-12', start: '10:00', end: '11:00', spots: 2 },
      { id: '1b', date: '2026-09-16', start: '19:00', end: '20:00', spots: 1 },
      { id: '1c', date: '2026-09-19', start: '10:00', end: '11:00', spots: 0 },
    ],
  },
  {
    id: '2',
    title: 'Boxing with Lionheart MMA',
    partner: 'Lionheart MMA',
    category: 'Sport',
    sport: 'Boxing',
    collab: 'Barter',
    location: 'Bugis',
    address: '175 Bencoolen Street, #02-01, Singapore 189649',
    image:
      'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=800&h=500&fit=crop&auto=format',
    heroImage:
      'https://images.unsplash.com/photo-1517438322307-e67111335449?w=1600&h=800&fit=crop&auto=format',
    dateLabel: 'Multiple dates available',
    perk: 'Complimentary boxing class',
    perkDetail: 'Complimentary beginner boxing class (1 hour)',
    spotsLeft: 3,
    about:
      "Step into the ring at Lionheart MMA for a high-energy beginner boxing class. Coaches will take you through footwork, pad work and combinations in a small-group setting — no prior experience needed. It's an intense, cinematic session that translates brilliantly to short-form video.",
    audience: [
      { label: 'Fitness level', value: 'All levels welcome' },
      { label: 'Equipment', value: 'Gloves and wraps provided' },
      { label: 'What to bring', value: 'Water bottle and a towel' },
    ],
    deliverables: [
      'Post 1 × Instagram Reel or TikTok (minimum 30 seconds) featuring the class',
      { text: 'Tag {0} and {1} in your post and caption', handles: ['@lyfego.sg', '@lionheartmma'] },
      'Content to be posted within 7 days of attending the session',
      'Share at least 2 Instagram Stories during or after the session',
    ],
    sessions: [
      { id: '2a', date: '2026-09-17', start: '19:30', end: '20:30', spots: 2 },
      { id: '2b', date: '2026-09-20', start: '11:00', end: '12:00', spots: 3 },
      { id: '2c', date: '2026-09-24', start: '19:30', end: '20:30', spots: 1 },
    ],
  },
  {
    id: '3',
    title: 'Café Brunch Experience',
    partner: 'Sunday Social',
    category: 'Lifestyle',
    sport: null,
    collab: 'Barter',
    location: 'Tanjong Pagar',
    address: '48 Duxton Road, Singapore 089514',
    image:
      'https://images.unsplash.com/photo-1613769049987-b31b641f25b1?w=800&h=500&fit=crop&auto=format',
    heroImage:
      'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=1600&h=800&fit=crop&auto=format',
    dateLabel: 'Multiple dates available',
    perk: 'Complimentary dining experience',
    perkDetail: 'Complimentary brunch for two (up to S$80)',
    spotsLeft: 2,
    about:
      'Sunday Social is a neighbourhood café in Tanjong Pagar known for its seasonal brunch plates and specialty coffee. Bring a friend and enjoy a relaxed weekend brunch on the house — the team will plate up their signature dishes so you have plenty to shoot. Ideal for food, lifestyle and city-guide creators.',
    audience: [
      { label: 'Content focus', value: 'Food, lifestyle or local guides' },
      { label: 'Party size', value: 'You plus one guest' },
      { label: 'Dietary', value: 'Vegetarian options available on request' },
    ],
    deliverables: [
      'Post 1 × Instagram Reel or TikTok (minimum 20 seconds) featuring the brunch',
      { text: 'Tag {0} and {1} in your post and caption', handles: ['@lyfego.sg', '@sundaysocial.sg'] },
      'Content to be posted within 10 days of your visit',
      'Include the café location tag on your post',
    ],
    sessions: [
      { id: '3a', date: '2026-09-13', start: '10:30', end: '12:00', spots: 1 },
      { id: '3b', date: '2026-09-20', start: '10:30', end: '12:00', spots: 2 },
      { id: '3c', date: '2026-09-27', start: '10:30', end: '12:00', spots: 0 },
    ],
  },
  {
    id: '4',
    title: 'Wellness Experience',
    partner: 'Refresh Wellness',
    category: 'Lifestyle',
    sport: null,
    collab: 'Barter',
    location: 'Orchard',
    address: '333A Orchard Road, #04-12, Singapore 238897',
    image:
      'https://images.unsplash.com/photo-1767350510090-137a6ce252c0?w=800&h=500&fit=crop&auto=format',
    heroImage:
      'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=1600&h=800&fit=crop&auto=format',
    dateLabel: 'Friday, 18 September',
    perk: 'Complimentary wellness session',
    perkDetail: 'Complimentary 60-minute massage and sauna session',
    spotsLeft: 1,
    about:
      'Unwind at Refresh Wellness with a 60-minute signature massage followed by time in their infrared sauna. The space is calm, minimal and beautifully lit — a natural fit for wellness, self-care and slow-living content. Arrive 15 minutes early to settle in before your treatment.',
    audience: [
      { label: 'Content focus', value: 'Wellness, self-care or lifestyle' },
      { label: 'Duration', value: 'Approximately 90 minutes' },
      { label: 'What to bring', value: 'Nothing — towels and robes provided' },
    ],
    deliverables: [
      'Post 1 × Instagram Reel or TikTok (minimum 30 seconds) featuring the experience',
      { text: 'Tag {0} and {1} in your post and caption', handles: ['@lyfego.sg', '@refreshwellness'] },
      'Content to be posted within 7 days of your visit',
      'Story or feed post shared to your audience at the time of posting',
    ],
    sessions: [{ id: '4a', date: '2026-09-18', start: '14:00', end: '15:30', spots: 1 }],
  },
  {
    id: '5',
    title: 'Running Campaign',
    partner: 'Pace Athletics',
    category: 'Sport',
    sport: 'Running',
    collab: 'Paid',
    location: 'Singapore',
    address: 'Flexible — shoot location of your choice within Singapore',
    image:
      'https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=800&h=500&fit=crop&auto=format',
    heroImage:
      'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1600&h=800&fit=crop&auto=format',
    dateLabel: null,
    perk: 'Paid collaboration',
    perkDetail:
      'Paid collaboration — fee agreed on selection, plus a pair of Pace Athletics running shoes',
    spotsLeft: null,
    deadline: '2026-09-20',
    about:
      "Pace Athletics is launching its new lightweight trainer and is looking for running creators to feature it in authentic training content. You'll receive a pair of the new shoes ahead of launch and shoot on your usual routes — morning runs, track sessions or race-day prep. This is a paid campaign with a fee agreed on selection.",
    audience: [
      { label: 'Content focus', value: 'Running, fitness or endurance sport' },
      { label: 'Audience', value: 'Minimum 5,000 followers on one platform' },
      { label: 'Timeline', value: 'Content due 2 weeks after shoes are received' },
    ],
    deliverables: [
      'Post 2 × Instagram Reels or TikToks (minimum 30 seconds each) featuring the trainer',
      { text: 'Tag {0} and {1} in your post and caption', handles: ['@lyfego.sg', '@paceathletics'] },
      'Include #PaceLaunch in the caption of each post',
      'Grant Pace Athletics usage rights for paid amplification for 3 months',
    ],
    sessions: [],
  },
  {
    id: '6',
    title: 'Yoga Flow with Sublime',
    partner: 'Sublime Yoga Studio',
    category: 'Lifestyle',
    sport: null,
    collab: 'Barter',
    location: 'Dempsey',
    address: '7 Dempsey Road, #01-05, Singapore 249671',
    image:
      'https://images.unsplash.com/photo-1683056255281-e52a141924f0?w=800&h=500&fit=crop&auto=format',
    heroImage:
      'https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=1600&h=800&fit=crop&auto=format',
    dateLabel: 'Sunday, 7 September',
    perk: 'Complimentary yoga session',
    perkDetail: 'Complimentary 75-minute vinyasa flow class',
    spotsLeft: 0,
    about:
      'Sublime Yoga Studio hosts a Sunday morning vinyasa flow in their light-filled Dempsey studio. Suitable for all levels, the class moves at a gentle pace with a focus on breath and mobility — followed by tea in the garden. A calm, aesthetic setting for wellness and lifestyle content.',
    audience: [
      { label: 'Experience level', value: 'All levels welcome' },
      { label: 'Equipment', value: 'Mats and props provided' },
    ],
    deliverables: [
      'Post 1 × Instagram Reel or TikTok (minimum 30 seconds) featuring the class',
      { text: 'Tag {0} and {1} in your post and caption', handles: ['@lyfego.sg', '@sublimeyoga'] },
      'Content to be posted within 7 days of attending the session',
    ],
    sessions: [{ id: '6a', date: '2026-09-07', start: '09:00', end: '10:15', spots: 0 }],
  },
]

export const LOCATIONS = [...new Set(opportunities.map((o) => o.location))].sort()
export const SPORTS = [...new Set(opportunities.map((o) => o.sport).filter(Boolean))]

export function getOpportunity(id) {
  return opportunities.find((o) => o.id === id) ?? null
}

export function getSession(opportunity, sessionId) {
  return opportunity?.sessions.find((s) => s.id === sessionId) ?? null
}

export function isFull(opportunity) {
  return opportunity.spotsLeft === 0
}
