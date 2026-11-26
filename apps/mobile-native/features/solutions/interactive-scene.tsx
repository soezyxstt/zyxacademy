import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Text, View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, G, Line, Path, Polygon, Polyline, Rect, Text as SvgText } from "react-native-svg";
import { initialSceneState, sceneValue, setSceneParameter, type InteractiveSceneSpec, type SceneShape, type SceneState } from "../../../../lib/materials/interactive-scene";
import { nativeColors, nativeLinkInks } from "../../../../packages/design-tokens/native-colors";
import { Button } from "../../components/Button";
import { Slider } from "../../components/Slider";
import { useReducedMotion } from "../../device/reduced-motion";
import { useProtectedInteraction } from "../../routing/protected-interaction";
import { nativeTypography } from "../../typography";
import { applySceneAction, sceneBoardPoint, sceneReadout, visibleSceneShapes } from "./structured-visual-model";

type Theme = keyof typeof nativeColors;
type DragAction = Extract<NonNullable<SceneShape["action"]>, { type: "drag" }>;

function sceneShape(shape: SceneShape, box: InteractiveSceneSpec["viewBox"], state: SceneState, theme: Theme) {
  const palette = nativeColors[theme];
  const color = { foreground: palette.foreground, primary: palette.primary, muted: palette.mutedForeground,
    success: nativeLinkInks.success, warning: nativeLinkInks["tertiary-2"], destructive: palette.destructive }[shape.color];
  const strokeWidth = Math.max(box.width, box.height) / 240;
  const n = (value: string | number) => sceneValue(value, state);
  const ink = { stroke: color, strokeWidth, fill: shape.fill ? color : "none" };
  switch (shape.type) {
    case "line": {
      const x1 = n(shape.x1), y1 = n(shape.y1), x2 = n(shape.x2), y2 = n(shape.y2);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const size = Math.min(strokeWidth * 5, Math.hypot(x2 - x1, y2 - y1) * 0.35);
      return <>
        <Line x1={x1} x2={x2} y1={y1} y2={y2} {...ink} />
        {shape.arrow && size > 0 && <Polyline fill="none" stroke={color} strokeWidth={strokeWidth}
          points={`${x2 - size * Math.cos(angle - .5)},${y2 - size * Math.sin(angle - .5)} ${x2},${y2} ${x2 - size * Math.cos(angle + .5)},${y2 - size * Math.sin(angle + .5)}`} />}
      </>;
    }
    case "circle": {
      const r = n(shape.r);
      if (r < 0) throw new Error("Circle radius");
      return <Circle cx={n(shape.cx)} cy={n(shape.cy)} r={r} {...ink} />;
    }
    case "rect": {
      const width = n(shape.width), height = n(shape.height);
      if (width < 0 || height < 0) throw new Error("Rectangle dimensions");
      return <Rect x={n(shape.x)} y={n(shape.y)} width={width} height={height} {...ink} />;
    }
    case "polygon": {
      const points = shape.points.map(point => `${n(point.x)},${n(point.y)}`).join(" ");
      return shape.closed ? <Polygon points={points} {...ink} /> : <Polyline points={points} {...ink} fill="none" />;
    }
    case "path": {
      const d = shape.commands.map(command => {
        if (command.op === "Z") return "Z";
        const point = `${n(command.x)},${n(command.y)}`;
        if (command.op === "Q") return `Q${n(command.x1)},${n(command.y1)} ${point}`;
        if (command.op === "C") return `C${n(command.x1)},${n(command.y1)} ${n(command.x2)},${n(command.y2)} ${point}`;
        return command.op + point;
      }).join(" ");
      return <Path d={d} {...ink} />;
    }
    case "text": {
      const value = shape.value === undefined ? null : sceneReadout(shape.value, state);
      return <SvgText x={n(shape.x)} y={n(shape.y)} fill={color} fontSize={Math.max(box.width, box.height) * .030}>
        {value === null ? shape.text : `${shape.text} ${value}`}
      </SvgText>;
    }
  }
}

export function SolutionInteractiveScene({ spec, locale, theme }: { spec: InteractiveSceneSpec; locale: "id" | "en"; theme: Theme }) {
  const [state, setState] = useState(() => initialSceneState(spec));
  const [drag, setDrag] = useState<DragAction>();
  const [playing, setPlaying] = useState(false);
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  const reducedMotion = useReducedMotion();
  const focused = useIsFocused();
  const { suspended, canInteract } = useProtectedInteraction();
  const en = locale === "en";
  const timeParameter = spec.parameters.find(parameter => parameter.id === spec.time?.parameter);
  const ready = focused && !suspended;
  const colors = nativeColors[theme];
  const text = [nativeTypography.bodyRegular, { color: colors.foreground, lineHeight: 20 }];
  const options = useMemo(() => visibleSceneShapes(spec, state), [spec, state]);
  const drawable = useMemo(() => {
    try { return options?.map(({ shape, index }) => ({ shape, index, element: sceneShape(shape, spec.viewBox, state, theme) })) ?? null; }
    catch { return null; }
  }, [options, spec.viewBox, state, theme]);

  useEffect(() => {
    if (!ready || reducedMotion) setPlaying(false);
  }, [ready, reducedMotion]);
  useEffect(() => {
    if (!playing || !ready || reducedMotion || !timeParameter || !spec.time) return;
    const parameter = timeParameter;
    const rate = spec.time.rate;
    let previous = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const elapsed = Math.max(0, Math.min(150, now - previous)) / 1000;
      previous = now;
      setState(current => ({ ...current, [parameter.id]: Math.min(parameter.max, current[parameter.id] + elapsed * rate) }));
    }, 33);
    return () => clearInterval(timer);
  }, [playing, ready, reducedMotion, spec.time, timeParameter]);
  useEffect(() => {
    if (timeParameter && state[timeParameter.id] >= timeParameter.max) setPlaying(false);
  }, [state, timeParameter]);

  function change(id: string, value: number) {
    if (!canInteract()) return;
    if (id === timeParameter?.id) setPlaying(false);
    setState(current => setSceneParameter(spec, current, id, value));
  }
  function useShape(action: SceneShape["action"]) {
    if (!canInteract() || !action) return;
    setPlaying(false);
    if (action.type === "drag") {
      setDrag(previous => previous === action ? undefined : action);
      return;
    }
    setState(current => applySceneAction(spec, current, action));
  }
  function move(event: GestureResponderEvent) {
    if (!drag || !canInteract()) return;
    const { locationX, locationY } = event.nativeEvent;
    const point = sceneBoardPoint(spec.viewBox, layout.width, layout.height, locationX, locationY);
    if (!point) return;
    setState(current => setSceneParameter(spec, setSceneParameter(spec, current, drag.xParameter, point.x), drag.yParameter, point.y));
  }

  const { x, y, width, height } = spec.viewBox;
  return <View style={{ gap: 8 }} testID="student-solution-scene">
    {drawable ? <View onLayout={({ nativeEvent }) => setLayout(nativeEvent.layout)}
      onStartShouldSetResponder={() => Boolean(drag) && ready}
      onResponderGrant={move} onResponderMove={move} onResponderRelease={() => setDrag(undefined)}
      onResponderTerminate={() => setDrag(undefined)} style={{ aspectRatio: Math.max(.8, Math.min(1.8, width / height)), width: "100%", borderWidth: 1, borderColor: colors.border }}>
      <Svg width="100%" height="100%" viewBox={`${x} ${y} ${width} ${height}`} accessibilityRole="image"
        accessibilityLabel={spec.label} pointerEvents={drag ? "none" : "auto"}>
        {drawable.map(({ shape, index, element }) => <G key={index} onPress={shape.action ? () => useShape(shape.action) : undefined}>{element}</G>)}
      </Svg>
    </View> : <Text style={text}>{en ? "This state cannot be drawn. Change a value or reset." : "Keadaan ini tidak dapat ditampilkan. Ubah nilai atau reset."}</Text>}
    {drag && <Text style={text}>{en ? "Drag on the scene to change both coordinates." : "Geser pada visual untuk mengubah kedua koordinat."}</Text>}
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {timeParameter && <Button theme={theme} variant="outline" disabled={reducedMotion || !ready} onPress={() => {
        if (!canInteract()) return;
        if (state[timeParameter.id] >= timeParameter.max) change(timeParameter.id, timeParameter.min);
        setPlaying(previous => !previous);
      }}>{playing ? (en ? "Pause" : "Jeda") : (en ? "Play" : "Putar")}</Button>}
      <Button theme={theme} variant="outline" onPress={() => { if (canInteract()) { setPlaying(false); setDrag(undefined); setState(initialSceneState(spec)); } }}>Reset</Button>
      {options?.filter(({ shape }) => shape.action).map(({ shape, index }) => <Button key={index} theme={theme} variant={drag === shape.action ? "default" : "outline"}
        accessibilityState={shape.action?.type === "drag" ? { selected: drag === shape.action } : undefined}
        onPress={() => useShape(shape.action)}>{shape.actionLabel}</Button>)}
    </View>
    {spec.outputs.map((output, index) => {
      const value = sceneReadout(output.value, state);
      return <Text key={index} style={text}>{`${output.label} · ${value ?? (en ? "unavailable" : "belum tersedia")}${value === null || !output.unit ? "" : ` ${output.unit}`}`}</Text>;
    })}
    {spec.parameters.map(parameter => {
      const value = state[parameter.id];
      const unit = parameter.unit ? ` ${parameter.unit}` : "";
      return <View key={parameter.id} style={{ gap: 4 }}>
        <Text style={text}>{parameter.control === "range" ? `${parameter.label} · ${Number(value.toPrecision(6))}${unit}` : parameter.label}</Text>
        {parameter.control === "range" ? <Slider theme={theme} accessibilityLabel={parameter.label} min={parameter.min} max={parameter.max} step={parameter.step}
          value={value} onValueChange={next => change(parameter.id, next)} testID={`student-scene-parameter-${parameter.id}`} /> :
          parameter.control === "toggle" ? <Button theme={theme} variant="outline" accessibilityRole="switch"
            accessibilityLabel={parameter.label} accessibilityState={{ checked: value === parameter.options?.[1].value }}
            onPress={() => { const options = parameter.options; if (options) change(parameter.id, value === options[0].value ? options[1].value : options[0].value); }}>
            {parameter.options?.find(option => option.value === value)?.label}
          </Button> : <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {parameter.options?.map(option => <Button key={option.value} theme={theme} variant={option.value === value ? "default" : "outline"}
              accessibilityState={{ selected: option.value === value }} onPress={() => change(parameter.id, option.value)}>{option.label}</Button>)}
          </View>}
      </View>;
    })}
  </View>;
}
