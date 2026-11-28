# Contrastive Few-Shot Examples: English Instructional Prose

Use these `<bad_example>` vs `<good_example>` pairs to calibrate a **warm, natural peer-tutor voice** before drafting. Replicate the conversational rhythm, clarity, and cohesion (not the literal opening sentence).

---

## 1. Stiff Textbook Prose → Warm Peer-Tutor Explanation (Cross-Axis Sensitivity)

<bad_example>
Cross-axis sensitivity constitutes the response to acceleration perpendicular to the primary measurement axis. A value of 5 mV/g indicates that a 1 g acceleration along the transverse axis adds approximately 5 mV to the output. If one assumes all output originates from the primary axis, this is equivalent to an apparent error of 0.05 g. The 0.05 g conversion is an apparent reading on the primary axis; the transverse input remains 1 g.
</bad_example>

**Diagnosis:** Cold encyclopedia tone (`constitutes`, `one assumes`, `apparent reading`), uncontracted stiff syntax, dangling `this`, and zero conversational bridges or pitfall guidance.

<good_example>
Picture an accelerometer whose main job is measuring up-and-down vibration. Now, sometimes a sideways shake "leaks" into that signal. That unwanted pickup from a direction perpendicular to the main axis is called **cross-axis sensitivity** (a sensor's unintended electrical response to sideways motion).

Say the cross-axis sensitivity is 5 mV/g. That means a 1 g sideways shake can sneak about 5 mV into your output signal. What do you think happens if we treat all 5 mV as if it came from the main axis? With a main sensitivity of 100 mV/g, that extra 5 mV looks like a 0.05 g reading on the main axis.

Watch out here, because it's easy to mix these two numbers up. That 0.05 g reading doesn't mean the sideways shake was only 0.05 g. The sideways input is still a full 1 g; 0.05 g is just the false reading you get on the main axis when you mistake that leaked 5 mV for main-axis motion.
</good_example>

---

## 2. Impersonal Steps → Guiding a Classmate Through the Next Move

<bad_example>
Once the total voltage is obtained, substitution into the primary sensitivity equation is performed to determine the measured acceleration. This facilitates finding the solution.
</bad_example>

**Diagnosis:** Passive voice, nominalization (`substitution`), dangling `This`, and stiff vocabulary (`facilitates`).

<good_example>
Now, once we have the total voltage, we can plug it straight into the main sensitivity formula. From there, it's much easier to find the measured acceleration.
</good_example>

---

## 3. Low Cohesion → High Cohesion (Reverse Cohesion Effect)

<bad_example>
The membrane becomes permeable to sodium. Depolarization occurs.
</bad_example>

**Diagnosis:** Missing causal link forces low-prior-knowledge readers to guess how permeability causes depolarization.

<good_example>
Because the cell membrane opens its channels and lets sodium ions rush inside, the electrical charge across the membrane flips. We call this flip in charge **depolarization**.
</good_example>

---

## 4. Center-Embedding & Nominalization → Crisp Active Clauses

<bad_example>
The implementation of the new attendance policy (which the committee approved in March after two rounds of review) caused a reduction in first-year enrollment.
</bad_example>

**Diagnosis:** Center-embedded parenthetical splits subject from verb, while stacked nominalizations (`implementation`, `reduction`) slow reading down.

<good_example>
In March, the committee approved a new attendance policy after two rounds of review. Once the college rolled out that policy, first-year enrollment dropped sharply.
</good_example>

---

## 5. Vague Jargon → Concepts-First + Structure & Function

<bad_example>
Kinases play an important regulatory role in intracellular signaling cascades. Obviously, this is simple once you memorize the pathway.
</bad_example>

**Diagnosis:** Undefined jargon plus condescending phrasing (`Obviously`, `simple`).

<good_example>
Cells switch proteins on or off by clipping a tiny chemical tag called a phosphate group onto them. A **kinase** is an enzyme [structure] that attaches that phosphate tag to another molecule using energy from ATP [function]. Once you spot that "tag-attaching" job, signaling pathways become much easier to trace.
</good_example>
