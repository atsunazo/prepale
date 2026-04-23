export type TeamKey = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export type Profile = {
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

  // 認証用に追加
  loginId?: string;
  authUid?: string;
  authEmail?: string;
  needsPasswordChange?: boolean;
};
