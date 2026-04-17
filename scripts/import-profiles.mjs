import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse } from "csv-parse/sync";

import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const csvPath = process.argv[2] || "./data.csv";
const outputJsonPath = "./seed/profiles.generated.json";
const collectionName = "profiles";
const MAX_TOKEN_COUNT = 8;
const DRY_RUN = process.argv.includes("--dry-run");

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
  });
}

const db = getFirestore();

function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function splitMulti(value, max = MAX_TOKEN_COUNT) {
  const raw = clean(value);
  if (!raw) return [];

  const seen = new Set();

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

function buildSearchText(profile) {
  return [
    profile.name,
    profile.xId,
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

function normalizeRow(row, index) {
  const order = index + 1;
  const slug = `member-${String(order).padStart(3, "0")}`;

  const profile = {
    order,
    slug,
    name: clean(row["名前"]),
    xId: clean(row["XのID (@含む) をご入力ください。"]),
    interests: splitMulti(row["興味のあるものを選んでください。(複数回答可)"], 99),
    favorites: splitMulti(row["好きなこと・もの"], 8),
    foodTokens: splitMulti(row["好きな食べ物・飲み物"], 8),
    placeTokens: splitMulti(row["よく出没する場所(任意)"], 8),
    clubTokens: splitMulti(row["学生時代の部活動(任意)"], 8),
    recentTokens: splitMulti(row["最近ハマっていること(任意)"], 8),
    recommendation: clean(row["オススメしたいコンテンツ(任意)"]),
    topics: clean(row["興味のある話題(任意)"]),
    message: clean(row["何か一言！"]),
  };

  return {
    ...profile,
    searchText: buildSearchText(profile),
  };
}

function validateRow(row, index) {
  const rowNumber = index + 2;
  const errors = [];

  if (!clean(row["名前"])) {
    errors.push("名前が空です");
  }

  const knownHeaders = [
    "名前",
    "XのID (@含む) をご入力ください。",
    "興味のあるものを選んでください。(複数回答可)",
    "好きなこと・もの",
    "好きな食べ物・飲み物",
    "よく出没する場所(任意)",
    "学生時代の部活動(任意)",
    "最近ハマっていること(任意)",
    "オススメしたいコンテンツ(任意)",
    "興味のある話題(任意)",
    "何か一言！",
  ];

  const unknownKeys = Object.keys(row).filter((key) => !knownHeaders.includes(key));
  if (unknownKeys.length > 0) {
    errors.push(`想定外の列があります: ${unknownKeys.join(", ")}`);
  }

  return { rowNumber, errors };
}

async function commitInChunks(items, chunkSize = 400) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const batch = db.batch();

    for (const item of chunk) {
      const ref = db.collection(collectionName).doc(item.slug);
      batch.set(ref, item, { merge: true });
    }

    await batch.commit();
    console.log(`Committed ${Math.min(i + chunk.length, items.length)} / ${items.length}`);
  }
}

async function main() {
  const absoluteCsvPath = path.resolve(csvPath);

  if (!fs.existsSync(absoluteCsvPath)) {
    throw new Error(`CSVが見つかりません: ${absoluteCsvPath}`);
  }

  const csvText = fs.readFileSync(absoluteCsvPath, "utf-8");

  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
    relax_column_count: true,
  });

  console.log(`CSV rows: ${rows.length}`);

  const validations = rows.map((row, index) => validateRow(row, index));
  const invalidRows = validations.filter((v) => v.errors.length > 0);

  if (invalidRows.length > 0) {
    console.log("不正な可能性がある行:");
    for (const item of invalidRows.slice(0, 20)) {
      console.log(`- row ${item.rowNumber}: ${item.errors.join(" / ")}`);
    }
  }

  const profiles = rows.map((row, index) => normalizeRow(row, index));

  fs.mkdirSync(path.dirname(outputJsonPath), { recursive: true });
  fs.writeFileSync(outputJsonPath, JSON.stringify(profiles, null, 2), "utf-8");

  console.log(`整形JSONを保存しました: ${outputJsonPath}`);
  console.log(`投入対象: ${profiles.length}件`);
  console.log("先頭3件サンプル:");
  console.log(JSON.stringify(profiles.slice(0, 3), null, 2));

  if (DRY_RUN) {
    console.log("dry-run のため Firestore には投入していません。");
    return;
  }

  await commitInChunks(profiles);

  console.log("Firestore への投入が完了しました。");
}

main().catch((error) => {
  console.error("エラー:", error);
  process.exit(1);
});