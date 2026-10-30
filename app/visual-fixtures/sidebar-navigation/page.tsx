"use client";

import { useState } from "react";
import { BookOpen, Home, Library } from "lucide-react";
import { NavCollapsible, NavItem } from "@/components/sidebar-shell";
import { Button } from "@/components/ui/button";

export default function SidebarNavigationFixture() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <nav aria-label="Navigasi" className={collapsed ? "w-16 border-r border-border p-2" : "w-60 border-r border-border p-2"}>
        <Button size="sm" variant="outline" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? "Buka" : "Tutup"}
        </Button>
        <div className="mt-4 space-y-1">
          <NavItem href="#dashboard" icon={Home} label="Beranda" active collapsed={collapsed} />
          <NavItem href="#courses" icon={BookOpen} label="Mata kuliah" collapsed={collapsed} />
          <NavCollapsible icon={Library} label="Materi" collapsed={collapsed}>
            <NavItem href="#articles" icon={BookOpen} label="Artikel" collapsed={collapsed} />
          </NavCollapsible>
        </div>
      </nav>
      <div className="p-4"><h1 className="font-heading text-h5">Navigasi</h1></div>
    </main>
  );
}
