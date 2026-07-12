"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QRCodeSVG } from "qrcode.react";
import { Link as LinkIcon, QrCode, Copy } from "lucide-react";


type ShortLink = {
  id: string;
  slug: string;
  url: string;
  title: string | null;
  clicks: number;
  createdAt: string;
};

export default function ShortLinksPage() {
  const [links, setLinks] = useState<ShortLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");

  const fetchLinks = async () => {
    try {
      const res = await fetch("/api/admin/short-links");
      if (res.ok) {
        const data = await res.json();
        setLinks(data);
      }
    } catch (error) {
      console.error("Failed to fetch links", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/short-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, slug, title: title.trim() || null }),
      });
      
      if (res.ok) {
        const newLink = await res.json();
        setLinks([newLink, ...links]);
        setUrl("");
        setTitle("");
        setSlug("");
      } else {
        const err = await res.text();
        alert(`Error: ${err}`);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to create short link");
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  const getFullUrl = (slug: string) => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/s/${slug}`;
    }
    return `/s/${slug}`;
  };

  return (
    <div className="space-y-8 p-0 sm:p-2">
      <div>
        <h1 className="font-heading text-h3">Short Links</h1>
        <p className="text-muted-foreground text-body-base">
          Create and manage custom short URLs (zyxacademy.com/s/[slug]) and generate QR codes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>Create Link</CardTitle>
              <CardDescription>Generate a new short URL</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="url">Destination URL</Label>
                  <Input
                    id="url"
                    type="url"
                    placeholder="https://example.com/some/long/path"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">Title (Optional)</Label>
                  <Input
                    id="title"
                    type="text"
                    placeholder="e.g. Spring Sale Campaign"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug">Custom Slug (Optional)</Label>
                  <Input
                    id="slug"
                    type="text"
                    placeholder="e.g. spring-sale"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                  />
                  <p className="text-body-sm text-muted-foreground">
                    Leave blank to generate a random slug.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Creating..." : "Create Link"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-card">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Loading...</div>
            ) : links.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No short links created yet.</div>
            ) : (
              <div className="divide-y divide-border">
                {links.map((link) => (
                  <div key={link.id} className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                    <div className="space-y-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <LinkIcon className="size-4 text-primary" />
                        <span className="font-medium">{link.title || `/s/${link.slug}`}</span>
                        {link.title && <span className="text-body-sm text-muted-foreground">(/s/{link.slug})</span>}
                      </div>
                      <p className="text-body-sm text-muted-foreground truncate max-w-[300px]" title={link.url}>
                        {link.url}
                      </p>
                      <p className="text-body-sm text-muted-foreground">
                        {link.clicks} clicks • {new Date(link.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => copyToClipboard(getFullUrl(link.slug))}>
                        <Copy className="size-4 mr-2" />
                        Copy
                      </Button>
                      
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm">
                            <QrCode className="size-4 mr-2" />
                            QR Code
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-md">
                          <DialogHeader>
                            <DialogTitle>QR Code for /s/{link.slug}</DialogTitle>
                          </DialogHeader>
                          <div className="flex flex-col items-center justify-center p-6 space-y-6">
                            <div className="bg-white p-4 rounded-xl border border-border shadow-sm">
                              <QRCodeSVG
                                id={`qr-${link.slug}`}
                                value={getFullUrl(link.slug)}
                                size={200}
                                level={"H"}
                                includeMargin={true}
                              />
                            </div>
                            <Button 
                              variant="secondary" 
                              className="w-full"
                              onClick={() => {
                                const svg = document.getElementById(`qr-${link.slug}`);
                                if (!svg) return;
                                const svgData = new XMLSerializer().serializeToString(svg);
                                const canvas = document.createElement("canvas");
                                const ctx = canvas.getContext("2d");
                                const img = new Image();
                                img.onload = () => {
                                  canvas.width = img.width;
                                  canvas.height = img.height;
                                  ctx?.drawImage(img, 0, 0);
                                  const pngFile = canvas.toDataURL("image/png");
                                  const downloadLink = document.createElement("a");
                                  downloadLink.download = `qrcode-${link.slug}.png`;
                                  downloadLink.href = `${pngFile}`;
                                  downloadLink.click();
                                };
                                img.src = "data:image/svg+xml;base64," + btoa(svgData);
                              }}
                            >
                              Download PNG
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
