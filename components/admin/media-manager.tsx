"use client";

import { CloudUpload, Images } from "lucide-react";

import { AdminTabs, AdminTabsList, AdminTabsTrigger, AdminTabsContent } from "@/components/admin/tabs";
import { MediaLibrary } from "@/components/admin/media-library";
import { StorageBrowser } from "@/components/admin/storage-browser";

export function MediaManager() {
  return (
    <AdminTabs defaultValue="media">
      <AdminTabsList>
        <AdminTabsTrigger value="media">
          <Images className="size-4" aria-hidden />
          Media
        </AdminTabsTrigger>
        <AdminTabsTrigger value="storage">
          <CloudUpload className="size-4" aria-hidden />
          Storage R2
        </AdminTabsTrigger>
      </AdminTabsList>
      <AdminTabsContent value="media">
        <MediaLibrary />
      </AdminTabsContent>
      <AdminTabsContent value="storage">
        <StorageBrowser />
      </AdminTabsContent>
    </AdminTabs>
  );
}
