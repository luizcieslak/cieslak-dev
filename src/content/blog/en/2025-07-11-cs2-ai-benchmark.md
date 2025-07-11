---
title: CS2 Match Prediction with AI Multi-Model comparison
excerpt: This is a benchmark of different LLM models that predict matches of Counter-Strike 2 in the 2025 Austin Major Championship.
publishDate: '2025-07-11'
updatedDate: '2025-07-11'
seo:
  image:
    src: '/cs2-benchmark/overall-performance.png'
    alt: Average team advancement prediction accuracy across all stages
---

![Average team advancement prediction accuracy across all stages](/cs2-benchmark/overall-performance.png)

Back in 2024, I wrote a blog post about Counter-Strike 2 matches inside a Major Championship context using OpenAI's GPT4 model.
In this post, I'm doing a benchmark of different LLM models for the same purpose.

Plus, add the map pool stats and did a tweak in the prompt to ask the LLM to try to predict the played maps.

All the predictions were run **before** the championship started at [May 30, 2025](https://github.com/luizcieslak/cs2-match-prediction/commit/56a583b3965551e385be143f4206a479307da49f)

# TL;DR

When it comes to predict the team advancement between stages in the championship, **it did not have any improvements from the last experiment.** The best performant model was the `deepseek-chat` and `gpt-4.1`, which had a **58.3% avg accuracy**.

![Average team advancement prediction accuracy across all stages](/cs2-benchmark/accuracy-heatmap.png)

When it comes to matches, `claude-opus-4` had the best accuracy and `sabia-3` as a close second. **Claude Opus 4 had a incredible accuracy of 100% on the last 2 stages**, even though the amount of matches that it predicted to happen was very low. **Sabia 3 on the other side had a very good accuracy of 78.6% on the first stage**, but a striking 0% accuracy on the last one.

More on the In Depth Analysis section, but for matches **I've just considered the ones that happened in the real world.** CS2 Major Championship is done in a Swiss format which basically means the matchups are based on the previous round.

![Average team advancement prediction accuracy across all stages](/cs2-benchmark/analysis-per-match-faceted.png)

# Prompt

# In Depth Analysis

For the match prediction analysis, I've just considered the ones that happened in the real world. The [Valve Rulebook about Counter Strike championships](https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/main/major-supplemental-rulebook.md#mid-stage-seed-calculation) states that they are done in a Swiss Format with [Buccholz system](https://en.wikipedia.org/wiki/Buchholz_system). This means that the matchups for a round are defined based on the results of the previous round. Then you also have the **seeding** system, which determines which team in the matchup will have the highest seed and therefore have the first map pick/ban.

Considering all the predictions were made before the championship even started, **it means that any wrong predicted match done in the first rounds would be carried until the end of the championship.** Therefore, I've filtered the matches that actually happened so we can understand how good a LLM is at predicting a match outcome.

# Next Steps
