import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const COLLECTION = "profiles";
const DOMAIN = "profiles.local";
const DRY_RUN = process.argv.includes("--dry-run");

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
  });
}

const adminAuth = getAuth();
const db = getFirestore();

function clean(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

async function listAllAuthUsers() {
  const users = [];
  let nextPageToken: string | undefined = undefined;

  do {
    const result = await adminAuth.listUsers(1000, nextPageToken);
    users.push(...result.users);
    nextPageToken = result.pageToken;
  } while (nextPageToken);

  return users;
}

async function deleteProfilesCollection() {
  const snap = await db.collection(COLLECTION).get();
  let deleted = 0;

  for (let i = 0; i < snap.docs.length; i += 400) {
    const chunk = snap.docs.slice(i, i + 400);
    const batch = db.batch();

    for (const doc of chunk) {
      if (DRY_RUN) {
        console.log(`[DRY-RUN][DOC DELETE] ${doc.id}`);
      } else {
        batch.delete(doc.ref);
      }
      deleted += 1;
    }

    if (!DRY_RUN && chunk.length > 0) {
      await batch.commit();
    }
  }

  return deleted;
}

async function deleteProfilesLocalAuthUsers() {
  const users = await listAllAuthUsers();
  const targets = users.filter((user) => user.email?.endsWith(`@${DOMAIN}`));
  let deleted = 0;

  for (const user of targets) {
    if (DRY_RUN) {
      console.log(`[DRY-RUN][AUTH DELETE] ${user.email} uid=${user.uid}`);
    } else {
      await adminAuth.deleteUser(user.uid);
    }
    deleted += 1;
  }

  return { scanned: users.length, deleted };
}

async function main() {
  const authResult = await deleteProfilesLocalAuthUsers();
  const docDeleted = await deleteProfilesCollection();

  console.log("");
  console.log(`auth scanned : ${authResult.scanned}`);
  console.log(`auth deleted : ${authResult.deleted}`);
  console.log(`docs deleted : ${docDeleted}`);
  console.log(`dryRun       : ${DRY_RUN}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});