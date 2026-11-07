import { createClient } from "@supabase/supabase-js";
import { loopback } from "../../config.js";
import { FileIssue, limits } from "./extraction/model.js";

const bucketName = "cargawise-imports-f3";
export interface ImportStorage {
  put(id: string, bytes: Buffer): Promise<void>;
  get(id: string): Promise<Buffer>;
  remove(id: string): Promise<void>;
}

export async function privateImportStorage(
  url: string,
  key: string,
): Promise<ImportStorage> {
  if (!loopback(url)) throw new Error("Storage F3 solo admite Supabase local.");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)])
            : AbortSignal.timeout(8000),
        }),
    },
  });
  let info = await client.storage.getBucket(bucketName);
  if (info.error) {
    await client.storage.createBucket(bucketName, {
      public: false,
      fileSizeLimit: limits.bytes,
      allowedMimeTypes: ["application/octet-stream"],
    });
    info = await client.storage.getBucket(bucketName);
  }
  if (info.error || info.data.public)
    throw new Error("El bucket F3 debe ser privado.");
  const bucket = client.storage.from(bucketName);
  const keyFor = (id: string) => {
    if (!/^[a-f0-9-]{36}$/.test(id))
      throw new Error("Invalid Storage object ID");
    return id;
  };
  return {
    async put(id, bytes) {
      // The committed staging row uniquely binds this object ID to the same digest.
      const { error } = await bucket.upload(keyFor(id), new Uint8Array(bytes), {
        contentType: "application/octet-stream",
        upsert: true,
      });
      if (error) throw new FileIssue("STORAGE_UNAVAILABLE");
    },
    async get(id) {
      const { data, error } = await bucket.download(keyFor(id));
      if (error || !data) throw new FileIssue("STORAGE_UNAVAILABLE");
      if (data.size > limits.bytes) throw new FileIssue("FILE_BYTES_LIMIT");
      return Buffer.from(await data.arrayBuffer());
    },
    async remove(id) {
      const { error } = await bucket.remove([keyFor(id)]);
      if (error) throw new FileIssue("STORAGE_UNAVAILABLE");
    },
  };
}
