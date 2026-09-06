"use client";

import { CloudUpload, Images } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MediaLibrary } from "@/components/admin/media-library";
import { StorageBrowser } from "@/components/admin/storage-browser";

export function MediaManager() {
  return (
    <Tabs defaultValue="media">
      <TabsList>
        <TabsTrigger value="media">
          <Images className="size-4" aria-hidden />
          Media
        </TabsTrigger>
        <TabsTrigger value="storage">
          <CloudUpload className="size-4" aria-hidden />
          Storage R2
        </TabsTrigger>
      </TabsList>
      <TabsContent value="media">
        <MediaLibrary />
      </TabsContent>
      <TabsContent value="storage">
        <StorageBrowser />
      </TabsContent>
    </Tabs>
  );
}
