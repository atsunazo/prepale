export type Profile = {
  id: string;
  order: number;
  slug: string;
  name: string;
  xId: string;
  interests: string[];
  favorites: string[];
  foodTokens: string[];
  placeTokens: string[];
  clubTokens: string[];
  recentTokens: string[];
  recommendation?: string;
  topics?: string;
  message: string;
  searchText: string;
};