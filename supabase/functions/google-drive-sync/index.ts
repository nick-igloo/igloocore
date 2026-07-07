import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

interface DriveListResponse {
  files: DriveFile[];
  nextPageToken?: string;
}

interface ScannedFile extends DriveFile {
  subfolderPath: string;
}

async function getAccessToken(): Promise<string> {
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured");
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Failed to refresh Google token: ${err}`);
  }

  const data = await resp.json();
  return data.access_token;
}

async function listDriveFolder(
  accessToken: string,
  folderId: string
): Promise<DriveFile[]> {
  const allFiles: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,size)",
      pageSize: "100",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Drive API error: ${err}`);
    }

    const data: DriveListResponse = await resp.json();
    allFiles.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

async function listDriveFilesRecursive(
  accessToken: string,
  folderId: string,
  subfolderFilter: string[] | null,
  currentPath: string = "",
  depth: number = 0
): Promise<ScannedFile[]> {
  const items = await listDriveFolder(accessToken, folderId);
  const allFiles: ScannedFile[] = [];

  const folders: DriveFile[] = [];
  const files: DriveFile[] = [];

  for (const item of items) {
    if (item.mimeType === "application/vnd.google-apps.folder") {
      folders.push(item);
    } else {
      files.push(item);
    }
  }

  // Only include files if we're inside an allowed subfolder (or no filter)
  // depth 0 = root (property folders live here, skip loose files)
  // depth 1 = inside a property folder (e.g. "compliance", "photography")
  // depth 2+ = inside a subfolder of a property folder
  if (depth >= 1) {
    for (const f of files) {
      allFiles.push({ ...f, subfolderPath: currentPath });
    }
  }

  for (const folder of folders) {
    // At depth 1, the folder is a category inside a property (e.g. "compliance").
    // If a filter is set, only recurse into matching category folders.
    if (depth === 1 && subfolderFilter && subfolderFilter.length > 0) {
      const folderNameLower = folder.name.toLowerCase();
      const matches = subfolderFilter.some(
        (f) => folderNameLower.includes(f) || f.includes(folderNameLower)
      );
      if (!matches) continue;
    }

    const subPath = currentPath ? `${currentPath}/${folder.name}` : folder.name;
    const subFiles = await listDriveFilesRecursive(
      accessToken,
      folder.id,
      subfolderFilter,
      subPath,
      depth + 1
    );
    allFiles.push(...subFiles);
  }

  return allFiles;
}

async function downloadDriveFile(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<ArrayBuffer> {
  let url: string;

  if (mimeType === "application/vnd.google-apps.document") {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
  } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
  } else {
    url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  }

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    throw new Error(`Failed to download file ${fileId}: ${resp.statusText}`);
  }

  return resp.arrayBuffer();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, folderId, folderName, queueItemId, subfolderFilter, propertyFolderIds } = await req.json();

    if (action === "list_folders") {
      const accessToken = await getAccessToken();
      const items = await listDriveFolder(accessToken, folderId);
      const folders = items
        .filter((i) => i.mimeType === "application/vnd.google-apps.folder")
        .map((f) => ({ id: f.id, name: f.name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return new Response(
        JSON.stringify({ folders }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "browse") {
      const accessToken = await getAccessToken();
      const items = await listDriveFolder(accessToken, folderId);
      const folders = items
        .filter((i) => i.mimeType === "application/vnd.google-apps.folder")
        .map((f) => ({ id: f.id, name: f.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const files = items
        .filter((i) => i.mimeType !== "application/vnd.google-apps.folder")
        .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size || null }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return new Response(
        JSON.stringify({ folders, files }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "queue_files") {
      // Manually queue specific files for a property
      const { files: fileList, propertyName, propertyId, subfolderPath } = await req.json();
      if (!fileList || !Array.isArray(fileList) || fileList.length === 0) {
        return new Response(
          JSON.stringify({ error: "No files provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Get or create folder record
      const fid = folderId || "manual-browse";
      const { data: folder } = await supabase
        .from("drive_sync_folders")
        .select("id")
        .eq("folder_id", fid)
        .maybeSingle();

      let folderDbId: string;
      if (folder) {
        folderDbId = folder.id;
      } else {
        const { data: newFolder } = await supabase
          .from("drive_sync_folders")
          .insert({ folder_id: fid, folder_name: folderName || "Manual Browse" })
          .select("id")
          .maybeSingle();
        if (!newFolder) throw new Error("Failed to create folder record");
        folderDbId = newFolder.id;
      }

      // Check existing
      const { data: existing } = await supabase
        .from("drive_sync_queue")
        .select("drive_file_id")
        .eq("folder_id", folderDbId);
      const existingIds = new Set(
        (existing || []).map((e: { drive_file_id: string }) => e.drive_file_id)
      );

      const newFiles = fileList.filter((f: { id: string }) => !existingIds.has(f.id));

      if (newFiles.length > 0) {
        const rows = newFiles.map((f: { id: string; name: string; mimeType: string }) => ({
          folder_id: folderDbId,
          drive_file_id: f.id,
          file_name: f.name,
          mime_type: f.mimeType,
          status: "pending",
          subfolder_path: subfolderPath || null,
          matched_property_name: propertyName || null,
          matched_property_id: propertyId || null,
        }));
        await supabase.from("drive_sync_queue").insert(rows);
      }

      return new Response(
        JSON.stringify({ queued: newFiles.length, already_exists: fileList.length - newFiles.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "scan") {
      const accessToken = await getAccessToken();

      let files: ScannedFile[];
      if (propertyFolderIds && Array.isArray(propertyFolderIds) && propertyFolderIds.length > 0) {
        // Scan only specific property folders
        files = [];
        for (const pf of propertyFolderIds) {
          const subFiles = await listDriveFilesRecursive(
            accessToken,
            pf.id,
            subfolderFilter || null,
            pf.name,
            1
          );
          files.push(...subFiles);
        }
      } else {
        files = await listDriveFilesRecursive(accessToken, folderId, subfolderFilter || null);
      }
      // Upsert the folder record
      const { data: folder } = await supabase
        .from("drive_sync_folders")
        .upsert(
          { folder_id: folderId, folder_name: folderName || folderId, last_synced_at: new Date().toISOString() },
          { onConflict: "folder_id" }
        )
        .select("id")
        .maybeSingle();

      if (!folder) {
        const { data: newFolder } = await supabase
          .from("drive_sync_folders")
          .insert({ folder_id: folderId, folder_name: folderName || folderId, last_synced_at: new Date().toISOString() })
          .select("id")
          .maybeSingle();

        if (!newFolder) throw new Error("Failed to create folder record");
        var folderDbId = newFolder.id;
      } else {
        var folderDbId = folder.id;
      }

      // Check which files are already in queue
      const { data: existing } = await supabase
        .from("drive_sync_queue")
        .select("drive_file_id")
        .eq("folder_id", folderDbId);

      const existingIds = new Set(
        (existing || []).map((e: { drive_file_id: string }) => e.drive_file_id)
      );

      // Filter to supported document types only
      const supportedMimes = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/vnd.google-apps.document",
        "application/vnd.google-apps.spreadsheet",
      ];

      const newFiles = files.filter(
        (f) =>
          !existingIds.has(f.id) &&
          (supportedMimes.includes(f.mimeType) ||
            f.name.toLowerCase().endsWith(".pdf") ||
            f.name.toLowerCase().endsWith(".jpg") ||
            f.name.toLowerCase().endsWith(".png"))
      );

      if (newFiles.length > 0) {
        const rows = newFiles.map((f) => ({
          folder_id: folderDbId,
          drive_file_id: f.id,
          file_name: f.name,
          mime_type: f.mimeType,
          status: "pending",
          subfolder_path: f.subfolderPath || null,
        }));

        await supabase.from("drive_sync_queue").insert(rows);
      }

      return new Response(
        JSON.stringify({
          total_files: files.length,
          new_files: newFiles.length,
          already_queued: existingIds.size,
          folder_db_id: folderDbId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "download_and_store") {
      const { data: queueItem } = await supabase
        .from("drive_sync_queue")
        .select("*, drive_sync_folders(folder_id)")
        .eq("id", queueItemId)
        .maybeSingle();

      if (!queueItem) {
        return new Response(
          JSON.stringify({ error: "Queue item not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!queueItem.matched_property_name) {
        return new Response(
          JSON.stringify({ error: "No property matched yet" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await supabase
        .from("drive_sync_queue")
        .update({ status: "processing" })
        .eq("id", queueItemId);

      const accessToken = await getAccessToken();
      const fileBuffer = await downloadDriveFile(
        accessToken,
        queueItem.drive_file_id,
        queueItem.mime_type
      );

      // Determine storage path
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = queueItem.file_name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${queueItem.matched_property_name}/uploads/${timestamp}/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadErr } = await supabase.storage
        .from("reports")
        .upload(storagePath, fileBuffer, {
          contentType: queueItem.mime_type === "application/vnd.google-apps.document"
            ? "application/pdf"
            : queueItem.mime_type,
          upsert: false,
        });

      if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

      // Insert into generated_reports
      await supabase.from("generated_reports").insert({
        property_name: queueItem.matched_property_name,
        file_name: queueItem.file_name,
        file_type: "uploaded",
        storage_path: storagePath,
        is_safety_document: !!queueItem.detected_doc_type && queueItem.detected_doc_type !== "other",
        safety_document_type: queueItem.detected_doc_type || null,
        expiry_date: queueItem.detected_expiry_date || null,
        is_public: !!queueItem.detected_doc_type && queueItem.detected_doc_type !== "other",
      });

      // Mark as filed
      await supabase
        .from("drive_sync_queue")
        .update({
          status: "filed",
          storage_path: storagePath,
          processed_at: new Date().toISOString(),
        })
        .eq("id", queueItemId);

      return new Response(
        JSON.stringify({ success: true, storage_path: storagePath }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use: scan, download_and_store" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
