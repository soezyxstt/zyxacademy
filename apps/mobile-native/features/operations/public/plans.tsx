import { useState } from "react";
import { View } from "react-native";
import {
  CORE_SUBJECTS, DEFAULT_COURSES, DEFAULT_PERSONS, MAX_COURSES, MAX_PERSONS, MIN_COURSES, MIN_PERSONS,
} from "../../../../../lib/pricing-selection";
import { planTiers } from "../../../../../lib/plan-tiers";
import { Action, Divider, Hero, Label, layout, StatePanel, textWith, usePublic, usePublicResource } from "./ui";

const standardSubjects = CORE_SUBJECTS.slice(0, -1);
const currency = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;

function Stepper({ label, value, decrease, increase }: {
  label: string; value: string;
  decrease: { label: string; onPress: () => void; disabled: boolean };
  increase: { label: string; onPress: () => void; disabled: boolean };
}) {
  return <View style={layout.inline} accessibilityLabel={label}>
    <Action accessibilityLabel={decrease.label} onPress={decrease.onPress} disabled={decrease.disabled}>−</Action>
    <Label tone="meta" live="polite">{value}</Label>
    <Action accessibilityLabel={increase.label} onPress={increase.onPress} disabled={increase.disabled}>+</Action>
  </View>;
}

export function Plans() {
  const { client, copy, colors } = usePublic();
  const { plans, pricing } = copy;
  const [people, setPeople] = useState(DEFAULT_PERSONS);
  const [subjects, setSubjects] = useState(standardSubjects.slice(0, DEFAULT_COURSES));
  const [otherSubjects, setOtherSubjects] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const count = subjects.length + otherSubjects;
  const selection = { people, subjects, otherSubjects };
  const { resource, retry } = usePublicResource(JSON.stringify(selection), client, (api, signal) => api.plans(selection, signal));
  function addCourse() {
    if (count >= MAX_COURSES) return;
    const next = standardSubjects.find((subject) => !subjects.includes(subject));
    if (next) setSubjects([...subjects, next]);
    else setOtherSubjects(otherSubjects + 1);
  }
  function removeCourse() {
    if (count <= MIN_COURSES) return;
    if (otherSubjects) setOtherSubjects(otherSubjects - 1);
    else setSubjects(subjects.slice(0, -1));
  }
  function toggle(subject: string) {
    if (subjects.includes(subject)) {
      if (count > MIN_COURSES) setSubjects(subjects.filter((item) => item !== subject));
    } else if (count < MAX_COURSES) setSubjects([...subjects, subject]);
  }

  return <View testID="public-plans" style={layout.stack}>
    <Hero title={plans.title} description={plans.description} centered />
    <Divider />
    <View style={layout.section}>
      <View style={layout.row}>
        <Stepper
          label={plans.peopleLabel}
          value={textWith(plans.peopleCount, { count: people })}
          decrease={{ label: plans.decreasePeople, onPress: () => setPeople(Math.max(MIN_PERSONS, people - 1)), disabled: people <= MIN_PERSONS }}
          increase={{ label: plans.increasePeople, onPress: () => setPeople(Math.min(MAX_PERSONS, people + 1)), disabled: people >= MAX_PERSONS }}
        />
        <Stepper
          label={plans.coursesLabel}
          value={textWith(plans.courseCount, { count })}
          decrease={{ label: plans.decreaseCourses, onPress: removeCourse, disabled: count <= MIN_COURSES }}
          increase={{ label: plans.increaseCourses, onPress: addCourse, disabled: count >= MAX_COURSES }}
        />
        <Action onPress={() => setExpanded(!expanded)} variant="secondary">{expanded ? plans.close : textWith(plans.courseList, { count })}</Action>
      </View>
      {expanded && <View style={layout.section}>
        <Label tone="meta">{textWith(plans.coveredCourses, { count, max: MAX_COURSES })}</Label>
        <View style={layout.row}>
          {standardSubjects.map((subject) => {
            const selected = subjects.includes(subject);
            return <Action key={subject} onPress={() => toggle(subject)} variant={selected ? "default" : "outline"}
              disabled={selected ? count <= MIN_COURSES : count >= MAX_COURSES}>{subject}</Action>;
          })}
          {otherSubjects ? <Stepper
            label={pricing.otherCourse}
            value={textWith(pricing.otherCourseCount, { count: otherSubjects })}
            decrease={{ label: plans.decreaseOtherCourse, onPress: () => setOtherSubjects(otherSubjects - 1), disabled: count <= MIN_COURSES }}
            increase={{ label: plans.increaseOtherCourse, onPress: () => setOtherSubjects(otherSubjects + 1), disabled: count >= MAX_COURSES }}
          /> : <Action onPress={() => setOtherSubjects(1)} disabled={count >= MAX_COURSES}>{pricing.otherCourse}</Action>}
        </View>
      </View>}
    </View>
    <Divider />
    {resource.status === "error" && <StatePanel kind="error" title={copy.discounts.unavailable} retry={retry} />}
    {resource.status === "loading" && <StatePanel kind="loading" title={pricing.loading} />}
    {planTiers.map(({ key, highlighted }) => {
      const tier = pricing.tiers[key];
      const quote = resource.status === "ready" ? resource.value.quotes.find((item) => item.key === key) : null;
      const custom = key === "custom";
      const free = key === "free";
      return <View key={key} style={[layout.panel, { borderColor: highlighted ? colors.primary : colors.border }]}>
        <View style={layout.between}>
          <Label tone="subheading">{tier.name}</Label>
          {highlighted && <Label tone="link">{pricing.recommended}</Label>}
        </View>
        <Label tone="muted">{tier.note}</Label>
        <Divider />
        {free ? <Label tone="subheading">{plans.free}</Label> : custom ? <Label tone="subheading">{plans.contactAdmin}</Label> : quote ? <View style={layout.item}>
          {quote.isIntroductory && <View style={layout.between}>
            <Label tone="muted" style={{ textDecorationLine: "line-through" }}>{currency(Math.round(quote.regularPrice / people))}</Label>
            <Label tone="link">{textWith(pricing.discount, { percent: quote.discountPercent })}</Label>
          </View>}
          <Label tone="subheading">{currency(Math.round(quote.price / people))} / {pricing.person}</Label>
          <Label tone="meta">{textWith(pricing.totalPerSemester, { price: currency(quote.price) })}</Label>
        </View> : <Label tone="meta">{resource.status === "error" ? copy.discounts.unavailable : pricing.loading}</Label>}
        {!custom && tier.features.map((feature) => <Label key={feature}>{`•  ${feature}`}</Label>)}
        {free ? <Action href="/sign-up" variant={highlighted ? "default" : "outline"}>{plans.startWithFree}</Action> : quote?.contactUrl ?
          <Action href={quote.contactUrl} external variant={highlighted ? "default" : "outline"}>{custom ? pricing.askWhatsapp : pricing.askPlanWhatsapp}</Action> :
          <Action disabled>{resource.status === "loading" ? pricing.loading : plans.contactUnavailable}</Action>}
      </View>;
    })}
  </View>;
}
