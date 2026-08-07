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

export const PREFERENCE_CATEGORIES: PreferenceCategory[] = [
  {
    id: 'category-a',
    title: 'Category A: Layout & Core Space',
    description: 'Rate the structural fundamentals and physical dimensions of your ideal space.',
    features: [
      { id: 'totalSqFt', name: 'Total Square Footage', description: 'Overall size and spaciousness of the apartment.' },
      { id: 'bedrooms', name: 'Number of Bedrooms', description: 'Having distinct, separate sleeping spaces.' },
      { id: 'bathrooms', name: 'Number of Bathrooms', description: 'Having more than one bathroom or a dedicated guest bath.' },
      { id: 'naturalLight', name: 'Natural Light', description: 'Large windows and direct sunlight during the day.' },
      { id: 'balcony', name: 'Balcony or Terrace', description: 'Private, accessible outdoor space.' },
      { id: 'closetSpace', name: 'Closet & Storage Space', description: 'Built-in wardrobes and general storage capacity.' },
      { id: 'openFloorPlan', name: 'Open Floor Plan', description: 'Kitchen and living room combined into one large space.' },
    ],
  },
  {
    id: 'category-b',
    title: 'Category B: Kitchen & Appliances',
    description: 'Rate the importance of culinary equipment and laundry conveniences.',
    features: [
      { id: 'refrigerator', name: 'Full-Size Refrigerator', description: 'A standard or large fridge, rather than a mini or under-counter unit.' },
      { id: 'dishwasher', name: 'Dishwasher', description: 'Built-in dishwasher unit.' },
      { id: 'ovenStove', name: 'Oven & Stovetop Quality', description: 'Full-sized oven and modern burners (gas or induction).' },
      { id: 'counterSpace', name: 'Counter Space', description: 'Ample preparation area for cooking.' },
      { id: 'microwave', name: 'Microwave Included', description: 'Built-in or provided microwave.' },
      { id: 'washer', name: 'In-Unit Washer', description: 'Washing machine inside the apartment.' },
      { id: 'dryer', name: 'In-Unit Dryer', description: 'Dedicated tumble dryer inside the apartment.' },
    ],
  },
  {
    id: 'category-c',
    title: 'Category C: Bathroom Details',
    description: 'Rate personal grooming fixtures and water hygiene essentials.',
    features: [
      { id: 'bathtub', name: 'Bathtub', description: 'A full bathtub rather than just a standing shower.' },
      { id: 'showerPressure', name: 'Modern Shower/Water Pressure', description: 'Updated fixtures and strong water flow.' },
      { id: 'ventilation', name: 'Window/Ventilation', description: 'Natural airflow or high-quality extraction fans.' },
    ],
  },
  {
    id: 'category-d',
    title: 'Category D: Climate, Comfort & Connectivity',
    description: 'Rate environmental control, acoustic insulation, and internet readiness.',
    features: [
      { id: 'airConditioning', name: 'Air Conditioning', description: 'Central or robust split-unit cooling.' },
      { id: 'heating', name: 'Heating Quality', description: 'Reliable, controllable winter heating.' },
      { id: 'highSpeedInternet', name: 'High-Speed Internet Readiness', description: 'Fiber optic availability and good signal penetration.' },
      { id: 'soundproofing', name: 'Soundproofing', description: 'Thick walls and minimal noise from neighbors or the street.' },
      { id: 'doubleGlazing', name: 'Double-Glazed Windows', description: 'Insulation against both weather and outside noise.' },
    ],
  },
  {
    id: 'category-e',
    title: 'Category E: Building & Community Amenities',
    description: 'Rate shared building facilities, security systems, and pet policies.',
    features: [
      { id: 'elevator', name: 'Elevator Access', description: 'Essential if looking at upper floors.' },
      { id: 'secureParking', name: 'Secure Parking', description: 'Dedicated, off-street parking space.' },
      { id: 'buildingSecurity', name: 'Building Security', description: 'Doorman, concierge, or secure entry systems.' },
      { id: 'packageReceiving', name: 'Package Receiving', description: 'A safe, designated area for deliveries.' },
      { id: 'petFriendliness', name: 'Pet Friendliness', description: 'Landlord and building policies allowing animals.' },
      { id: 'gymOrPool', name: 'On-Site Gym or Pool', description: 'Access to fitness facilities within the building.' },
      { id: 'bikeStorage', name: 'Bike Storage', description: 'Secure, designated areas to lock up bicycles.' },
    ],
  },
  {
    id: 'category-f',
    title: 'Category F: Aesthetics & Condition',
    description: 'Rate interior styling, furnishing status, and surface materials.',
    features: [
      { id: 'modernFinishes', name: 'Modern/Updated Finishes', description: 'Recently renovated, contemporary design.' },
      { id: 'furnishedStatus', name: 'Furnished Status', description: 'Apartment comes fully or partially furnished.' },
      { id: 'hardwoodFlooring', name: 'Hardwood Flooring', description: 'Wood or hard surfaces rather than wall-to-wall carpet.' },
    ],
  },
];

/**
 * Returns a default weight map where all 32 features start at neutral importance (weight = 3).
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
