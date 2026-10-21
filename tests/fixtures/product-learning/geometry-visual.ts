import { geometry2dVisualSpecSchema } from "@/lib/materials/visual-contract";

export const geometryVisualFixture = geometry2dVisualSpecSchema.parse({
  id: "triangle-circle", kind: "geometry_2d", label: "Segitiga sama kaki dan lingkaran", description: "Sisi $AB=BC=5$, alas $AC=6$, dan tinggi segitiga $4$. Lingkaran berpusat di $O$ memiliki jari-jari $2$.",
  bounds: { xMin: -4, xMax: 4, yMin: -3, yMax: 5 },
  geometry: {
    points: [{ id: "A", x: 3, y: 0, labelLatex: "A" }, { id: "B", x: 0, y: 4, labelLatex: "B" }, { id: "C", x: -3, y: 0, labelLatex: "C" }, { id: "O", x: 0, y: 0, labelLatex: "O" }],
    segments: [{ id: "height", from: "O", to: "B", labelLatex: "h=4" }],
    circles: [{ id: "circle", center: "O", radius: 2, labelLatex: "r=2" }],
    polygons: [{ id: "triangle", pointIds: ["A", "B", "C"] }],
  },
  staticFallback: { type: "table", summary: "Koordinat menentukan panjang dan luas secara analitis.", headers: ["Besaran", "Nilai"], rows: [["Sisi sama panjang", "$AB=BC=5$"], ["Luas segitiga", "$\\frac12(6)(4)=12$"], ["Jari-jari lingkaran", "$r=2$"]] },
});
