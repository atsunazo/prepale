import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { writeFileSync } from "node:fs";

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
  });
}

const db = getFirestore();
const COLLECTION = "profiles";

function escapeCsv(value: unknown) {
  const text = Array.isArray(value)
    ? value.join("|")
    : value == null
    ? ""
    : String(value);

  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

async function main() {
  const snap = await db.collection(COLLECTION).orderBy("order", "asc").get();

  const headers = [
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
    "loginId",
    "authUid",
    "authEmail",
    "needsPasswordChange",
  ];

  const rows = snap.docs.map((doc) => {
    const data = doc.data();
    return headers.map((key) => escapeCsv(data[key]));
  });

  const csv = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  writeFileSync("profiles-export.csv", csv, "utf-8");
  console.log(`exported: ${snap.size} rows -> profiles-export.csv`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});