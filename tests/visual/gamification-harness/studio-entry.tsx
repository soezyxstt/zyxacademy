"use client";
import React from "react";
import { Palette } from "lucide-react";
import { ApplicationPage } from "@/components/application-page";
import { PageHeader } from "@/components/page-header";
import { CosmeticsStudio } from "@/components/gamification/cosmetics-studio";
import { COSMETIC_CATALOG } from "@/lib/gamification/catalog";
import { portrait } from "./data";

export default function StudioFixture() {
  return <div className="min-h-screen bg-background text-foreground"><ApplicationPage maxWidth="7xl"><PageHeader title="Studio koleksi" icon={Palette}/><CosmeticsStudio prices={Object.fromEntries(COSMETIC_CATALOG.map(item => [item.id, item.priceLp]))} appearance={{ name: "Alya Putri", image: portrait }}/></ApplicationPage></div>;
}
