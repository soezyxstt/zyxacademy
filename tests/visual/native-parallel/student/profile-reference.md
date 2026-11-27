# Student academic profile and weekly reflections

The web fixture runs the production academic form from `/profile/edit` and the production archive component from `/profile/reflections`. Both screens read the same synthetic account and owned reflection inputs as native. These cases cover the form and archive content at the Android and iOS reference extents.

- **Academic profile.** The saved FMIPA and Matematika values load for the current test account. Selecting FITB clears the previous major. Selecting Teknik Geologi completes the revised form while retaining the entry year. The captures are made before saving. Privacy, appearance, and navigation are outside this comparison.
- **Weekly reflections.** The owned week shows the same quiz, flashcard, material, and mastery counts in Indonesian light and English dark. Native opens the row before capture to match the details already displayed on web. The empty case uses the same Student scope and has no week to disclose.

The native flows assert the rendered locale/theme and the visible state before each capture. Signed web access and native device run results are recorded separately.
