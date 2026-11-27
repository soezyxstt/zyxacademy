import { View } from "react-native";
import Svg, { Circle, Line, Polygon } from "react-native-svg";
import type { Geometry2dVisualSpec } from "../../../../lib/materials/visual-contract";
import { geometryHeight, geometryLabels, geometryProjection, geometryWidth } from "../../../../lib/materials/geometry-projection";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { CourseMarkdown } from "../student/CourseMarkdown";

export function SolutionGeometry({ visual, theme, locale, origin }: {
  visual: Geometry2dVisualSpec; theme: keyof typeof nativeColors; locale: "id" | "en"; origin: string;
}) {
  const colors = nativeColors[theme];
  const height = geometryHeight(visual.bounds);
  const { x, y, scale } = geometryProjection(visual.bounds, height);
  const geometry = visual.geometry;
  const points = new Map(geometry.points.map(point => [point.id, point]));
  return <View style={{ aspectRatio: geometryWidth / height, width: "100%" }}>
    <Svg width="100%" height="100%" viewBox={`0 0 ${geometryWidth} ${height}`} accessibilityRole="image" accessibilityLabel={visual.label}>
      {geometry.polygons.map(polygon => <Polygon key={polygon.id}
        points={polygon.pointIds.map(id => { const p = points.get(id)!; return `${x(p.x)},${y(p.y)}`; }).join(" ")}
        fill={colors.primary} fillOpacity={0.12} stroke={colors.primary} strokeWidth={2} />)}
      {geometry.circles.map(circle => {
        const point = points.get(circle.center)!;
        return <Circle key={circle.id} cx={x(point.x)} cy={y(point.y)} r={circle.radius * scale} fill="none" stroke={colors.primary} strokeWidth={2} />;
      })}
      {geometry.segments.map(segment => {
        const a = points.get(segment.from)!;
        const b = points.get(segment.to)!;
        return <Line key={segment.id} x1={x(a.x)} y1={y(a.y)} x2={x(b.x)} y2={y(b.y)} stroke={colors.foreground} strokeWidth={2} />;
      })}
      {geometry.points.map(point => <Circle key={point.id} cx={x(point.x)} cy={y(point.y)} r={4} fill={colors.foreground} />)}
    </Svg>
    {geometryLabels(geometry, { x, y, scale }).map(label => {
      const left = Math.max(0, Math.min(100, label.x / geometryWidth * 100));
      const top = Math.max(0, Math.min(100, label.y / height * 100));
      return <View key={label.id} style={{ position: "absolute", left: `${left}%`, top: `${top}%`, maxWidth: "100%",
        transform: [{ translateX: `${-left}%` }, { translateY: `${-top}%` }], backgroundColor: colors.background }}>
        <CourseMarkdown source={`$${label.latex}$`} theme={theme} services={{ session: { origin, locale } }} allowLinks={false}
          paragraphStyle={{ fontSize: 12, lineHeight: 16 }} />
      </View>;
    })}
  </View>;
}
