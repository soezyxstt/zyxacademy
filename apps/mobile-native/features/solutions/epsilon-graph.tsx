import { useMemo, useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { sampleEpsilonDeltaCurve } from "../../../../lib/materials/epsilon-delta";
import type { EpsilonDeltaGraphSpec } from "../../../../lib/materials/visual-contract";
import { nativeColors } from "../../../../packages/design-tokens/native-colors";
import { Button } from "../../components/Button";
import { Slider } from "../../components/Slider";
import { nativeTypography } from "../../typography";
import { useProtectedInteraction } from "../../routing/protected-interaction";
import { epsilonProbe } from "./structured-visual-model";

type Theme = keyof typeof nativeColors;
const pad = 18;
const width = 360;
const height = 252;
const display = (value: number) => Number.isFinite(value) ? Number(value.toPrecision(6)).toString() : "?";

export function SolutionEpsilonGraph({ spec, locale, theme }: { spec: EpsilonDeltaGraphSpec; locale: "id" | "en"; theme: Theme }) {
  const { suspended, canInteract } = useProtectedInteraction();
  const [epsilon, setEpsilon] = useState(spec.defaultEpsilon);
  const [probe, setProbe] = useState(spec.limitPoint);
  const c = spec.limitPoint;
  const limit = spec.limitValue;
  const { xMin, xMax, yMin, yMax } = spec.bounds;
  const rangeX = xMax - xMin;
  const rangeY = yMax - yMin;
  const valid = Number.isFinite(rangeX) && Number.isFinite(rangeY) && rangeX > 0 && rangeY > 0;
  const en = locale === "en";
  const colors = nativeColors[theme];
  const { delta, y, distanceX, distanceY, inside } = epsilonProbe(spec, epsilon, probe);
  const plot = (x: number) => pad + (x - xMin) / rangeX * (width - 2 * pad);
  const ordinate = (y: number) => height - pad - (y - yMin) / rangeY * (height - 2 * pad);
  const curve = useMemo(() => valid ? sampleEpsilonDeltaCurve(spec).map(points => points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${plot(x)},${ordinate(y)}`).join(" ")).join(" ") : "", [spec, valid]);
  const epsLow = Math.max(yMin, limit - epsilon);
  const epsHigh = Math.min(yMax, limit + epsilon);
  const min = spec.defaultEpsilon * 0.1 || spec.defaultEpsilon;
  const max = Math.min(yMax - limit, limit - yMin, spec.defaultEpsilon * 2.2);
  const text = [nativeTypography.bodyRegular, { color: colors.foreground, lineHeight: 20 }];
  if (!valid) return null;

  return <View style={{ gap: 6 }}>
    <View style={{ width: "100%", aspectRatio: width / height }}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} accessibilityRole="image"
        accessibilityLabel={en ? "Graph of the function with epsilon and delta bands" : "Grafik fungsi dengan pita epsilon dan delta"}>
        <Rect x={pad} y={pad} width={width - 2 * pad} height={height - 2 * pad} fill={colors.card} stroke={colors.border} />
        <Rect x={pad} y={ordinate(epsHigh)} width={width - 2 * pad} height={ordinate(epsLow) - ordinate(epsHigh)}
          fill={colors.secondary} fillOpacity={0.18} />
        {delta !== null && <Rect x={plot(c - delta)} y={pad} width={plot(c + delta) - plot(c - delta)} height={height - 2 * pad}
          fill={colors.primary} fillOpacity={0.16} />}
        <Line x1={plot(c)} x2={plot(c)} y1={pad} y2={height - pad} stroke={colors.primary} strokeDasharray="4 4" />
        <Line x1={pad} x2={width - pad} y1={ordinate(limit)} y2={ordinate(limit)} stroke={colors.secondary} strokeDasharray="4 4" />
        <Path d={curve} fill="none" stroke={colors.foreground} strokeWidth={2} />
        <Line x1={plot(probe)} x2={plot(probe)} y1={pad} y2={height - pad} stroke={colors.mutedForeground} />
        {Number.isFinite(y) && y >= yMin && y <= yMax && <Circle cx={plot(probe)} cy={ordinate(y)} r={5} fill={colors.foreground} />}
        <SvgText x={plot(c)} y={height - 3} textAnchor="middle" fill={colors.primary} fontSize={13}>c</SvgText>
        <SvgText x={5} y={ordinate(limit)} fill={colors.secondary} fontSize={13}>L</SvgText>
      </Svg>
    </View>
    <Text style={text}>{`ε = ${display(epsilon)} · δ = ${delta === null ? (en ? "unavailable" : "belum tersedia") : display(delta)}`}</Text>
    <Slider theme={theme} accessibilityLabel={en ? "Epsilon tolerance" : "Toleransi epsilon"} testID="student-solution-epsilon"
      value={epsilon} min={min} max={max} step={spec.defaultEpsilon / 100 || min} disabled={suspended} onValueChange={value => { if (canInteract()) setEpsilon(value); }} />
    <Text style={text}>{`x = ${display(probe)} · f(x) = ${display(y)}\n|x − c| = ${display(distanceX)} · |f(x) − L| = ${display(distanceY)}`}</Text>
    <Slider theme={theme} accessibilityLabel={en ? "Probe x position" : "Posisi x"} testID="student-solution-epsilon-probe"
      value={probe} min={xMin} max={xMax} step={rangeX / 200 || rangeX} disabled={suspended} onValueChange={value => { if (canInteract()) setProbe(value); }} />
    <Text style={text}>{delta === null ? (en ? "This tolerance is below the guaranteed resolution." : "Delta belum dapat dijamin pada toleransi ini.")
      : distanceX === 0 ? (en ? "The limit excludes x = c." : "Syarat limit mengecualikan x = c.")
        : inside ? (en ? "x is inside the delta interval." : "x berada dalam lingkungan delta.")
          : (en ? "x is outside the delta interval." : "x berada di luar lingkungan delta.")}</Text>
    {(epsilon !== spec.defaultEpsilon || probe !== c) && <Button theme={theme} variant="outline" onPress={() => { if (canInteract()) { setEpsilon(spec.defaultEpsilon); setProbe(c); } }}>Reset</Button>}
  </View>;
}
