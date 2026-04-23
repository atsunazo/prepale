export type TeamKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export type ProfileDoc = {
  order: number;
  slug: string;
  name: string;
  xId: string;
  team?: TeamKey;
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
  loginId?: string;
  authUid?: string;
  authEmail?: string;
  needsPasswordChange?: boolean;
};

export type Profile = ProfileDoc & {
  id: string;
};
