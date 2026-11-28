# Contrastive Few-Shot Examples: English Instructional Prose

Use these `<bad_example>` vs `<good_example>` pairs to calibrate syntax, cohesion, and voice before drafting. Replicate the structural decisions, not the literal phrasing.

---

## 1. Low Cohesion → High Cohesion (Reverse Cohesion Effect)

<bad_example>
The membrane becomes permeable to sodium. Depolarization occurs.
</bad_example>

**Diagnosis:** Missing causal connective and implicit bridging inference force low-prior-knowledge readers to guess how permeability produces depolarization.

<good_example>
Because the cell membrane opens its channels and lets sodium ions rush inside, the electrical charge across the membrane shifts. This shift in charge is called **depolarization**.
</good_example>

---

## 2. Center-Embedding → Adjacent Subject-Verb + Separate Sentence

<bad_example>
Any payment (all such benefits under Section 3a being referred to as Total Payments) subject to tax shall be reduced.
</bad_example>

**Diagnosis:** A 12-word center-embedded clause splits the subject (`Any payment`) from its verb (`shall be reduced`), exhausting working memory.

<good_example>
If any payment is subject to tax, the company reduces the cash severance payment. In Section 3a, we refer to all of these benefits as **Total Payments**.
</good_example>

---

## 3. Nominalization → Congruent Active Clause

<bad_example>
The implementation of the new attendance policy caused a significant reduction in first-year enrollment.
</bad_example>

**Diagnosis:** Stacked nominalizations (`implementation`, `reduction`) hide the agent and add measurable processing delay.

<good_example>
When the college implemented the new attendance policy, first-year enrollment dropped sharply.
</good_example>

---

## 4. Passive Voice → Agent-First Active Voice

<bad_example>
Glucose is broken down into pyruvate during glycolysis by ten enzymes in the cytoplasm.
</bad_example>

**Diagnosis:** Passive voice delays the agent (`ten enzymes`) until the end, working against readers' agent-first parsing heuristic.

<good_example>
During glycolysis, ten enzymes in the cytoplasm break glucose down into pyruvate.
</good_example>

---

## 5. Vague Jargon → Concepts-First + Structure & Function Definition

<bad_example>
Kinases play an important regulatory role in intracellular signaling cascades.
</bad_example>

**Diagnosis:** Introduces jargon (`kinases`, `signaling cascades`) without stating what a kinase is (structure) or what it actually does (function).

<good_example>
Cells often switch proteins on or off by attaching a small chemical tag called a phosphate group. A **kinase** is an enzyme [structure] that attaches a phosphate group to another molecule using energy from ATP [function].
</good_example>

---

## 6. Dangling "This" + Distant Third-Person → Given-New + Conversational POV with Task Relevance

<bad_example>
The student must compare the sample mean to the population mean. This is necessary in order to compute a z-score. Furthermore, one should check the standard deviation first.
</bad_example>

**Diagnosis:** Combines distant third-person (`the student`, `one`), dangling `This`, bureaucratic filler (`in order to`), additive bloat (`Furthermore`), and zero task relevance.

<good_example>
When you evaluate whether a test score is unusually high, you need a way to measure how far it sits from the average. To do that, you compare your sample mean to the population mean and divide by the standard deviation. This comparison gives you a **z-score**, a standardized number that tells you how many standard deviations a score falls above or below the mean.
</good_example>
