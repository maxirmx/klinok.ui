import { IDBBlockstore } from "blockstore-idb";
import { IDBDatastore } from "datastore-idb";

export async function createBrowserHeliaInit(base = "klinok-p2p-v1") {
  const blockstore = new IDBBlockstore(`${base}-blocks`);
  const datastore = new IDBDatastore(`${base}-data`);
  await Promise.all([blockstore.open(), datastore.open()]);
  return { blockstore, datastore };
}
