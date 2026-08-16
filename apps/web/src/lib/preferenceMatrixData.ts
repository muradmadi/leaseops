export interface PreferenceFeature {
  id: string;
  name: string;
  description: string;
}

export interface PreferenceCategory {
  id: string;
  title: string;
  description: string;
  features: PreferenceFeature[];
}

/**
 * The weighted preference matrix.
 *
 * Two rules shaped this list:
 *
 * 1. **Anything with a natural unit is not here.** Floor area, bedroom count and
 *    bathroom count are collected as figures on the same screen, because "how
 *    important is square metres, 1-5" cannot express that 40 m² is too small and
 *    120 m² is too much to heat and clean. Only genuinely ordinal preferences —
 *    where more really is always better — belong on a 1-5 scale.
 * 2. **It targets European city renting.** What decides a flat here is usually
 *    the walk to the metro, whether the windows face the street or an interior
 *    light well, and what the heating will cost in January — not a garbage
 *    disposal or a parcel room.
 *
 * Every id here must also exist in `FEATURE_NAMES`
 * (`apps/api/src/services/features.ts`), with the same label — `features.test.ts`
 * fails on any drift, so a renamed feature cannot quietly lose its display name.
 */
export const PREFERENCE_CATEGORIES: PreferenceCategory[] = [
  {
    id: 'category-a',
    title: 'Category A: Space & Light',
    description: 'Size, bedrooms and bathrooms are set as figures above. Rate the qualities of the space itself.',
    features: [
      { id: 'naturalLight', name: 'Natural Light', description: 'Bright rooms and direct sun rather than a permanently dim flat.' },
      { id: 'exteriorFacing', name: 'Exterior-Facing Windows', description: 'Windows onto a street or open view rather than an interior light well.' },
      { id: 'balcony', name: 'Balcony or Terrace', description: 'Private outdoor space you can actually sit on.' },
      { id: 'closetSpace', name: 'Built-In Wardrobes', description: 'Fitted storage, since many flats come with none at all.' },
      { id: 'storageRoom', name: 'Storage Room or Cellar', description: 'A trastero, cave or loft for bikes, cases and seasonal things.' },
    ],
  },
  {
    id: 'category-b',
    title: 'Category B: Transport & Access',
    description: 'How easily you can get out of the front door and across the city.',
    features: [
      { id: 'metroProximity', name: 'Metro or Tram Nearby', description: 'A short walk to a rapid transit stop.' },
      { id: 'busProximity', name: 'Bus Connections', description: 'Useful routes within a couple of minutes on foot.' },
      { id: 'centreCommute', name: 'Commute to the Centre', description: 'Door-to-door time to the city centre or your workplace.' },
      { id: 'walkability', name: 'Walkable Daily Errands', description: 'Everyday needs reachable on foot without transport.' },
      { id: 'cyclingAccess', name: 'Cycling Infrastructure', description: 'Bike lanes and city-bike docks near the building.' },
    ],
  },
  {
    id: 'category-c',
    title: 'Category C: Neighbourhood & Daily Life',
    description: 'What the street around the building is actually like to live on.',
    features: [
      { id: 'groceryProximity', name: 'Supermarket Nearby', description: 'A full grocery shop within a short walk.' },
      { id: 'freshMarket', name: 'Fresh Food Market', description: 'A local produce market or good independent food shops.' },
      { id: 'cafesRestaurants', name: 'Cafés and Restaurants', description: 'Somewhere to eat and meet people close by.' },
      { id: 'greenSpace', name: 'Parks and Green Space', description: 'A usable park or river path within walking distance.' },
      { id: 'streetQuiet', name: 'Quiet Street', description: 'Away from nightlife strips, main roads and delivery routes.' },
      { id: 'neighbourhoodSafety', name: 'Feeling Safe at Night', description: 'Comfortable walking home late.' },
    ],
  },
  {
    id: 'category-d',
    title: 'Category D: Kitchen & Laundry',
    description: 'The fittings you cannot add yourself. A microwave costs an afternoon; a plumbed dishwasher or a full-size fridge does not.',
    features: [
      { id: 'oven', name: 'Full-Size Oven', description: 'A real oven, not a token grill or two rings and nothing else.' },
      { id: 'hobType', name: 'Hob Type & Quality', description: 'Gas, induction or a decent ceramic hob rather than worn electric coils.' },
      { id: 'extractorHood', name: 'Extractor Hood', description: 'Extraction that vents outside, not a recirculating filter over a gas hob.' },
      { id: 'refrigerator', name: 'Full-Size Fridge', description: 'A standard fridge rather than an under-counter unit you outgrow in a week.' },
      { id: 'freezerCapacity', name: 'Freezer Capacity', description: 'A usable freezer, not the token iced-up drawer many flats come with.' },
      { id: 'sinkSize', name: 'Sink Size', description: 'A deep or double sink you can fit a roasting tin in, not a shallow half-bowl.' },
      { id: 'counterSpace', name: 'Worktop Space', description: 'Enough uninterrupted surface to actually prepare food on.' },
      { id: 'kitchenStorage', name: 'Kitchen Cupboards', description: 'Cupboard and drawer space for food, pans and appliances.' },
      { id: 'dishwasher', name: 'Dishwasher', description: 'Built-in dishwasher unit.' },
      { id: 'washer', name: 'Washing Machine', description: 'A machine in the flat rather than a shared or launderette arrangement.' },
      { id: 'dryer', name: 'Dryer or Drying Space', description: 'A dryer, or a balcony and airing space that still works in winter.' },
    ],
  },
  {
    id: 'category-e',
    title: 'Category E: Bathroom',
    description: 'Where a flat quietly becomes unpleasant to live in. Hot water and ventilation matter more than finish.',
    features: [
      { id: 'showerQuality', name: 'Shower Size & Quality', description: 'A shower you can stand in properly, with a fixed head that works.' },
      { id: 'showerPressure', name: 'Water Pressure', description: 'Pressure that holds up on upper floors and when a tap runs elsewhere.' },
      { id: 'hotWaterSystem', name: 'Hot Water Supply', description: 'A boiler or tank that lasts a shower — small electric heaters run cold halfway.' },
      { id: 'bathtub', name: 'Bathtub', description: 'A full bath rather than only a shower.' },
      { id: 'bathroomVentilation', name: 'Bathroom Window or Extraction', description: 'A window or real extraction, or the room will grow mould.' },
      { id: 'bidet', name: 'Bidet', description: 'Standard across much of southern Europe and easily missed on a viewing.' },
    ],
  },
  {
    id: 'category-f',
    title: 'Category F: Comfort, Climate & Running Costs',
    description: 'Whether the flat is bearable in February and August, and what that costs.',
    features: [
      { id: 'heating', name: 'Heating Quality', description: 'Reliable, controllable heating — many southern flats have almost none.' },
      { id: 'airConditioning', name: 'Air Conditioning', description: 'Cooling that makes summer nights survivable.' },
      { id: 'doubleGlazing', name: 'Double-Glazed Windows', description: 'Insulation against both weather and street noise.' },
      { id: 'soundproofing', name: 'Soundproofing', description: 'Thick walls and floors, and quiet neighbours.' },
      { id: 'energyRating', name: 'Energy Rating & Bills', description: 'A decent EPC rating, so the flat is not expensive to run.' },
      { id: 'ventilation', name: 'Cross-Ventilation & Damp', description: 'Air that moves through the whole flat, and no history of mould.' },
      { id: 'highSpeedInternet', name: 'Fibre Internet', description: 'Fibre available at the address, not just copper.' },
    ],
  },
  {
    id: 'category-g',
    title: 'Category G: Building, Rules & Condition',
    description: 'The building itself, what it allows, and the state you receive the flat in.',
    features: [
      { id: 'elevator', name: 'Elevator Access', description: 'Essential above the second floor, and common to lack entirely.' },
      { id: 'buildingSecurity', name: 'Secure Entry', description: 'A solid door, video entry system or concierge.' },
      { id: 'bikeStorage', name: 'Bike Storage', description: 'Somewhere secure at ground level to keep a bike.' },
      { id: 'secureParking', name: 'Parking Space', description: 'A garage space or reliable resident parking.' },
      { id: 'communalOutdoor', name: 'Communal Pool or Courtyard', description: 'Shared outdoor space, common in newer blocks.' },
      { id: 'petFriendliness', name: 'Pets Allowed', description: 'Landlord and building policies that permit animals.' },
      { id: 'furnishedStatus', name: 'Furnished', description: 'Arrives furnished rather than needing a full fit-out.' },
      { id: 'condition', name: 'Condition & Renovation', description: 'Recently refurbished rather than tired or half-finished.' },
    ],
  },
];

/** Every feature id in the matrix, in display order. */
export const ALL_FEATURE_IDS: string[] = PREFERENCE_CATEGORIES.flatMap((c) => c.features.map((f) => f.id));

/**
 * Default weight map: every feature starts at neutral importance (weight = 3),
 * which is below the threshold that puts a feature into scoring.
 */
export function getDefaultFeatureWeights(): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const cat of PREFERENCE_CATEGORIES) {
    for (const feat of cat.features) {
      weights[feat.id] = 3;
    }
  }
  return weights;
}
