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

When it comes to matches, `claude-sonnet-4` had the best accuracy: **18 matches predicted correctly** and `sabia-3` as a close second: **17 matches predicted correctly.**

![Average team advancement prediction accuracy across all stages](/cs2-benchmark/analysis-per-match-faceted.png)

More on the In Depth Analysis section, but for matches **I've just considered the ones that happened in the real world.** CS2 Major Championship is done in a Swiss format which basically means the matchups of a round are defined based on the results of the previous round.

# Code

The code is full open source and available at [luizcieslak/cs2-match-prediction](https://github.com/luizcieslak/cs2-match-prediction).

The main code is built using Node+TypeScript, the data scraping is using Playwright (actually Patchwright to bypass the anti-bot detection) and the analysis is done Python.

# Prompt

The prompt was the same as the one used in the previous post, but with a few tweaks:

- Asked the LLM to try to predict the played maps and the picks/bans sequence.
- Provide each active map stats in the prompt, so the LLM had the information about each team's performance in each map and in theory could predict the result with a higher accuracy.

The prompt already had:

- Summary of the last 5 articles about each team
- Each team's overall statistics
- Each team's world ranking number
- Each team's past events history
- Current championship context (current stage, amount of maps in the round, etc)

Here's the full prompt example, in the match of Legacy vs Vitality:

```text
You are a CS2 match prediction AI.
```

# In Depth Analysis

For the match prediction analysis, I've just considered the ones that happened in the real world. The [Valve Rulebook about Counter Strike championships](https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/main/major-supplemental-rulebook.md#mid-stage-seed-calculation) states that they are done in a Swiss Format with [Buccholz system](https://en.wikipedia.org/wiki/Buchholz_system). This means that the matchups for a round are defined based on the results of the previous round. Then you also have the **seeding** system, which determines which team in the matchup will have the highest seed and therefore have the first map pick/ban.

Considering all the predictions were made before the championship even started, **it means that any wrong predicted match done in the first rounds would be carried until the end of the championship.** Therefore, I've filtered the matches that actually happened so we can understand how good a LLM is at predicting a match outcome.?

Now, let's check some outputs of how the LLMs built their responses.

//add some outputs here from different models
// perhaps discuss about the reasoning models? why did they not perform better?

# Next Steps

For a next analysis, I'd like to avoid run everything **before the championship started**, but rather execute the predictions **before each stage instead**. This would "reset" the predictions and allow the models to execute their analysis based on each stage individually.

Perhaps it could be even more granular by **running the predictions of each round individually** on a daily basis, as the [original project this was forked from](https://github.com/stevekrenzel/pick-ems) is doing.
