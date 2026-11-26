import { useContext } from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Polygon, Text as SvgText } from "react-native-svg";
import type { Geometry2dVisualSpec } from "../../../../lib/materials/visual-contract";
import { geometryHeight, geometryProjection, geometryWidth } from "../../../../lib/materials/geometry-projection";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { CourseTheme } from "../academic/courses/ui";

export function SolutionGeometry({ visual, theme }: { visual: Geometry2dVisualSpec; theme?: keyof typeof nativeColors }) {
  const inheritedTheme = useContext(CourseTheme);
  const colors = nativeColors[theme ?? inheritedTheme];
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
      {geometry.points.map(point => <SvgText key={point.id} x={x(point.x)} y={y(point.y) - 10} textAnchor="middle"
        fill={colors.foreground} fontSize={22}>{point.labelLatex ?? ""}</SvgText>)}
      {geometry.segments.filter(segment => segment.labelLatex).map(segment => {
        const a = points.get(segment.from)!;
        const b = points.get(segment.to)!;
        return <SvgText key={segment.id} x={x((a.x + b.x) / 2)} y={y((a.y + b.y) / 2) - 10} textAnchor="middle"
          fill={colors.foreground} fontSize={22}>{segment.labelLatex}</SvgText>;
      })}
    </Svg>
  </View>;
}
