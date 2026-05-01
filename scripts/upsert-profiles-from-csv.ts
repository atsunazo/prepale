import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const COLLECTION = "profiles";
const CSV_PATH = process.argv[2] ?? "profiles-master.csv";
const LIST_SEPARATOR = "|";
const DRY_RUN = process.argv.includes("--dry-run");

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
  });
}

const db = getFirestore();

const REQUIRED_HEADERS = [
  "order",
  "slug",
  "name",
  "xId",
  "team",
  "interests",
  "favorites",
  "foodTokens",
  "placeTokens",
  "clubTokens",
  "recentTokens",
  "recommendation",
  "topics",
  "message",
] as const;

type CsvHeader = (typeof REQUIRED_HEADERS)[number];

type CsvRow = Record<CsvHeader, string>;

function clean(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeXIdKey(value: string): string {
  return clean(value).replace(/^@+/, "").toLowerCase();
}

function normalizeSlugKey(value: string): string {
  return clean(value).toLowerCase();
}

function normalizeList(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items.map((v) => clean(v)).filter(Boolean)) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

function splitListCell(value: string): string[] {
  if (!clean(value)) return [];
  return normalizeList(value.split(LIST_SEPARATOR));
}

function buildSearchText(profile: {
  name: string;
  xId: string;
  team?: string;
  interests: string[];
  favorites: string[];
  foodTokens: string[];
  placeTokens: string[];
  clubTokens: string[];
  recentTokens: string[];
  recommendation?: string;
  topics?: string;
  message: string;
}): string {
  return [
    profile.name,
    profile.xId,
    profile.team,
    ...profile.interests,
    ...profile.favorites,
    ...profile.foodTokens,
    ...profile.placeTokens,
    ...profile.clubTokens,
    ...profile.recentTokens,
    profile.recommendation,
    profile.topics,
    profile.message,
  ]
    .filter(Boolean)
    .join(" ");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  const src = text.replace(/^\uFEFF/, "");

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }

    if (ch === "\r") {
      i += 1;
      continue;
    }

    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }

    cell += ch;
    i += 1;
  }

  row.push(cell);
  if (row.length > 1 || row[0] !== "") {
    rows.push(row);
  }

  return rows;
}

function rowsToObjects(rows: string[][]): CsvRow[] {
  if (rows.length < 2) {
    throw new Error("CSVにデータ行がありません。");
  }

  const [headerRow, ...dataRows] = rows;
  const headerMap = new Map<string, number>();

  headerRow.forEach((header, index) => {
    headerMap.set(clean(header), index);
  });

  for (const header of REQUIRED_HEADERS) {
    if (!headerMap.has(header)) {
      throw new Error(`必須ヘッダーがありません: ${header}`);
    }
  }

  const records: CsvRow[] = [];

  for (const row of dataRows) {
    if (!row.some((cell) => clean(cell))) continue;

    const record = {} as CsvRow;
    for (const header of REQUIRED_HEADERS) {
      const index = headerMap.get(header)!;
      record[header] = clean(row[index] ?? "");
    }
    records.push(record);
  }

  return records;
}

function assertNoDuplicateKeys(records: CsvRow[]) {
  const xIds = new Map<string, number>();
  const slugs = new Map<string, number>();

  records.forEach((record, index) => {
    const lineNo = index + 2;
    const xIdKey = normalizeXIdKey(record.xId);
    const slugKey = normalizeSlugKey(record.slug);

    if (!record.slug) {
      throw new Error(`slug が空です: CSV ${lineNo}行目`);
    }
    if (!record.name) {
      throw new Error(`name が空です: CSV ${lineNo}行目`);
    }
    if (!record.xId) {
      throw new Error(`xId が空です: CSV ${lineNo}行目`);
    }
    if (!record.message) {
      throw new Error(`message が空です: CSV ${lineNo}行目`);
    }

    if (xIds.has(xIdKey)) {
      throw new Error(
        `CSV内で xId が重複しています: ${record.xId}（${xIds.get(xIdKey)}行目 と ${lineNo}行目）`
      );
    }
    xIds.set(xIdKey, lineNo);

    if (slugs.has(slugKey)) {
      throw new Error(
        `CSV内で slug が重複しています: ${record.slug}（${slugs.get(slugKey)}行目 と ${lineNo}行目）`
      );
    }
    slugs.set(slugKey, lineNo);
  });
}

async function main() {
  const rawCsv = readFileSync(CSV_PATH, "utf-8");
  const parsed = parseCsv(rawCsv);
  const csvRows = rowsToObjects(parsed);

  assertNoDuplicateKeys(csvRows);

  const snap = await db.collection(COLLECTION).get();

  const existingByXId = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  const existingBySlug = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();

  for (const doc of snap.docs) {
    const data = doc.data();
    const xIdKey = normalizeXIdKey(clean(data.xId));
    const slugKey = normalizeSlugKey(clean(data.slug));

    if (xIdKey) {
      if (existingByXId.has(xIdKey)) {
        throw new Error(`Firestore内で xId 重複: ${data.xId}`);
      }
      existingByXId.set(xIdKey, doc);
    }

    if (slugKey) {
      if (existingBySlug.has(slugKey)) {
        throw new Error(`Firestore内で slug 重複: ${data.slug}`);
      }
      existingBySlug.set(slugKey, doc);
    }
  }

  let updated = 0;
  let created = 0;
  const matchedDocIds = new Set<string>();

  for (let i = 0; i < csvRows.length; i++) {
    const row = csvRows[i];

    const interests = splitListCell(row.interests);
    const favorites = splitListCell(row.favorites);
    const foodTokens = splitListCell(row.foodTokens);
    const placeTokens = splitListCell(row.placeTokens);
    const clubTokens = splitListCell(row.clubTokens);
    const recentTokens = splitListCell(row.recentTokens);

    const payload: Record<string, unknown> = {
      order: i + 1,
      slug: row.slug,
      name: row.name,
      xId: row.xId,
      interests,
      favorites,
      foodTokens,
      placeTokens,
      clubTokens,
      recentTokens,
      recommendation: clean(row.recommendation),
      topics: clean(row.topics),
      message: row.message,
      searchText: buildSearchText({
        name: row.name,
        xId: row.xId,
        team: clean(row.team) || undefined,
        interests,
        favorites,
        foodTokens,
        placeTokens,
        clubTokens,
        recentTokens,
        recommendation: clean(row.recommendation),
        topics: clean(row.topics),
        message: row.message,
      }),
      updatedAt: new Date(),
    };

    if (clean(row.team)) {
      payload.team = clean(row.team);
    } else {
      payload.team = FieldValue.delete();
    }

    const existing =
      existingByXId.get(normalizeXIdKey(row.xId)) ??
      existingBySlug.get(normalizeSlugKey(row.slug));

    if (existing) {
      matchedDocIds.add(existing.id);

      if (DRY_RUN) {
        console.log(`[DRY-RUN][UPDATE] ${existing.id} ${row.name} order=${i + 1}`);
      } else {
        await existing.ref.set(payload, { merge: true });
      }

      updated += 1;
    } else {
      const ref = db.collection(COLLECTION).doc();

      if (DRY_RUN) {
        console.log(`[DRY-RUN][CREATE] ${ref.id} ${row.name} order=${i + 1}`);
      } else {
        await ref.set({
          ...payload,
          createdAt: new Date(),
        });
      }

      created += 1;
    }
  }

  const missingExisting = snap.docs.filter((doc) => !matchedDocIds.has(doc.id));

  console.log("");
  console.log(`CSV rows   : ${csvRows.length}`);
  console.log(`Updated    : ${updated}`);
  console.log(`Created    : ${created}`);
  console.log(`Unmatched existing docs: ${missingExisting.length}`);

  if (missingExisting.length > 0) {
    console.log("");
    console.log("CSVに含まれていない既存doc:");
    for (const doc of missingExisting) {
      const data = doc.data();
      console.log(
        `- ${doc.id} | name=${clean(data.name)} | xId=${clean(data.xId)} | slug=${clean(data.slug)}`
      );
    }
    console.log("");
    console.log("※ 完成版CSVが全メンバー分なら、この件数は 0 になる想定です。");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});