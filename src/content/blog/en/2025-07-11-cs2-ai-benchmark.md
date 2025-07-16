---
title: CS2 Match Prediction with AI Multi-Model comparison
excerpt: This is a benchmark of different LLM models that predict matches of Counter-Strike 2 in the 2025 Austin Major Championship.
publishDate: '2025-07-17'
updatedDate: '2025-07-17'
seo:
  image:
    src: '/cs2-benchmark/overall-performance.png'
    alt: Average team advancement prediction accuracy across all stages
---

![Average team advancement prediction accuracy across all stages](/cs2-benchmark/overall-performance.png)

Back in 2024, I wrote a [blog post](https://cieslak.dev/en/blog/2024-03-13-cs2-ai) about predicting Counter-Strike 2 matches inside a Major Championship context using OpenAI's GPT4 model.

In this post, I'm expading the experiment by doing a benchmark of different LLM models with the same purpose.

# TL;DR

All the predictions were run **before** the championship started at [May 30, 2025](https://github.com/luizcieslak/cs2-match-prediction/commit/56a583b3965551e385be143f4206a479307da49f)

When it comes to predict the team advancement between stages in the championship, **it did not have any improvements from the last experiment.** The best performant models were DeepSeek's `deepseek-chat` and OpenAI's `gpt-4.1`, which had a **58.3% avg accuracy** each.

![Average team advancement prediction accuracy across all stages](/cs2-benchmark/accuracy-heatmap.png)

When it comes to matches, Anthropic's `claude-sonnet-4` had the best accuracy: **18 matches predicted correctly** and MaritacaAI's `sabia-3` was a close second: **17 matches predicted correctly.**

![Average team advancement prediction accuracy across all stages](/cs2-benchmark/analysis-per-match-faceted.png)

More on the In Depth Analysis section, but for matches **I've just considered the ones that happened in the real world.** CS2 Major Championship is done in a Swiss format which basically means the matchups of a round are defined based on the results of the previous round.

# Code

The code is open source and available at [luizcieslak/cs2-match-prediction](https://github.com/luizcieslak/cs2-match-prediction).

The main code is built using Node+TypeScript, the data scraping is using Playwright (actually [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-nodejs) to bypass the anti-bot detection) and the analysis/charts are done via Python on Jupyter Notebooks.

# Full Prompt

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

> SYSTEM:
> You are an expert at choosing winning Counter-Strike teams in a "pick ems" competition. The teams are playing in a championship called "Blast Austin CS2 Major Championship". This championship is divided in three stages: Challenger, Legends and Playoffs. We currently are in the stage3 stage in which 16 teams face each other in a Swiss format. The top 8 teams are classified to the next stage and the bottom 8 are eliminated. Elimination and advancements matches are in a Best of 3 format where the others are in a Best of 1 format. This is going to be a Best of 1. In Counter-Strike competitive matches we have first a maps Picks and Bans phase, where the teams with their coach will ban alternatively 3 maps each team, then will play the one that remained.. The highest seed team (classified as 'home' in the input) will be able to start the picks and bans phase first and therefore has an advantage. Notice that this is a high-level competition, so the teams knows in advance their opponent and will study their performance on them.
>
> This is just for fun between friends. There is no betting or money to be made, but you will scrutinize your answer and think carefully.
>
> The user will provide you a JSON blob of two teams of the form (for example):
>
> ```json
> { "home": "FURIA", "away": "Spirit" }
> ```
>
> Your output will be a JSON blob of the form:
>
> ```json
> { "winningTeam": "FURIA", "losingTeam": "Spirit", "mapsPlayed": ["Ancient", "Anubis", "Dust2"] }
> ```
>
> You will evaluate the statistics, articles, scrutinize the picks and bans phase by predicting which maps will be played and explain step-by-step why you think a particular team will win in match. After you choose your winner, criticize your thinking, and then respond with your final answer.
>
> Here are some stats to help you:
>
> # Team Stats
>
> | Team     | Win rate           | Kill death ratio |
> | -------- | ------------------ | ---------------- |
> | Legacy   | 65.35087719298247% | 1.12             |
> | Vitality | 76.43312101910828% | 1.14             |
>
> # World Ranking
>
> | Team     | World Ranking |
> | -------- | ------------- |
> | Legacy   | #46           |
> | Vitality | #1            |
>
> # Event History
>
> | Team   | IEM Dallas 2025 | Thunderpick World Championship 2025 North America Series 1 | ESL Challenger League Season 49 North America |
> | ------ | --------------- | ---------------------------------------------------------- | --------------------------------------------- |
> | Legacy | 13-16th         | 1st                                                        | 3rd                                           |
>
> | Team     | IEM Dallas 2025 | BLAST Rivals 2025 Season 1 | IEM Melbourne 2025 |
> | -------- | --------------- | -------------------------- | ------------------ |
> | Vitality | 1st             | 1st                        | 1st                |

[Removed some of the event history here for brevity. It is collected ALL event history from the last 6 months.]

> # Map Pool
>
> | Team     | Dust2                                                                                                                                                                                                                                                                                            | Inferno                                                                                                                                                                                                                                                                                           | Mirage                                                                                                                                                                                                                                                                                            |
> | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | Legacy   | Rounds won: 344, Times played: 32, Wins / draws / losses: 19 / 0 / 13, Total rounds played: 666, Win percent: 59.4%, Pistol rounds: 64, Pistol rounds won: 26, Pistol round win percent: 40.6%, CT round win percent: 48.5%, T round win percent: 55.3%, Pick percent: 9.8%, Ban percent: 42.7%, | Rounds won: 532, Times played: 46, Wins / draws / losses: 32 / 0 / 14, Total rounds played: 934, Win percent: 69.6%, Pistol rounds: 92, Pistol rounds won: 54, Pistol round win percent: 58.7%, CT round win percent: 56.1%, T round win percent: 57.6%, Pick percent: 57.1%, Ban percent: 3.1%,  | Rounds won: 466, Times played: 38, Wins / draws / losses: 28 / 0 / 10, Total rounds played: 798, Win percent: 73.7%, Pistol rounds: 76, Pistol rounds won: 45, Pistol round win percent: 59.2%, CT round win percent: 58.6%, T round win percent: 58.1%, Pick percent: 27.1%, Ban percent: 19.7%, |
> | Vitality | Rounds won: 394, Times played: 31, Wins / draws / losses: 25 / 0 / 6, Total rounds played: 648, Win percent: 80.6%, Pistol rounds: 62, Pistol rounds won: 36, Pistol round win percent: 58.1%, CT round win percent: 55.9%, T round win percent: 65.6%, Pick percent: 27.7%, Ban percent: 14.1%, | Rounds won: 449, Times played: 34, Wins / draws / losses: 24 / 0 / 10, Total rounds played: 806, Win percent: 70.6%, Pistol rounds: 68, Pistol rounds won: 36, Pistol round win percent: 52.9%, CT round win percent: 60.9%, T round win percent: 50.4%, Pick percent: 15.6%, Ban percent: 12.7%, | Rounds won: 387, Times played: 30, Wins / draws / losses: 26 / 0 / 4, Total rounds played: 637, Win percent: 86.7%, Pistol rounds: 60, Pistol rounds won: 39, Pistol round win percent: 65.0%, CT round win percent: 69.7%, T round win percent: 52.6%, Pick percent: 34.0%, Ban percent: 10.5%,  |

[Removed some of the maps here for brevity. It is collected stats for ALL 7 active maps.]

> Here are some possibly relevant news articles to help you:
>
> ---
>
> # How lux has emerged as one of Brazil's most promising IGLs
>
> Legacy, led by new IGL lux, has quickly qualified for PGL Bucharest and IEM Dallas, showing strong potential despite early setbacks. The team is built around experienced prospects latto and dumau, with n1ssim adding stability and saadzin's aggressive AWPing as a wildcard. lux's leadership, influenced by biguzera, focuses on proactive play and extracting the most from his young roster. Legacy's lack of European bootcamping is a disadvantage, but a planned move to Europe could address this. Their next match against Liquid is unpredictable due to Liquid's new IGL, but Legacy's adaptability and lux's high-fragging leadership are key factors for a potential win.
>
> ---
>
> # Legacy 2-0 Liquid on siuhy's debut
>
> Legacy swept Liquid 2-0, dominating Nuke and closing out Anubis with key clutches from saadzin and latto. dumau and lux were standout performers, especially on Anubis, while Legacy's structured play under new IGL lux was evident. The team exploited Liquid's mid-round mistakes and poor CT sides, particularly on Nuke. Legacy's clutch potential and disciplined protocols were crucial to their win. These strengths position them as a serious threat in future matches if they maintain this level of play.
>
> ---
>
> # Vitality edge past Falcons to secure sixth consecutive grand final and 29th straight win
>
> Vitality edged out Falcons 2-1 to reach their sixth straight grand final, extending their win streak to 29 matches. ZywOo and flameZ delivered standout performances, especially in opening duels and crucial clutches, while mezii and Magisk contributed key rounds. Vitality's strengths lie in their resilience, late-round composure, and multi-frag potential, but they showed vulnerability on Train due to over-aggression and lost mid-rounds. Their ability to recover from deficits and close out tight games remains a major asset. However, against MOUZ, Vitality must avoid risky plays and maintain discipline to secure another trophy.
>
> ---
>
> # Vitality sweep MOUZ to win IEM Dallas and make it six trophies in a row
>
> Vitality defeated MOUZ 3-0 in the IEM Dallas 2025 final, claiming their sixth straight title and a 30-match win streak. ZywOo starred with a 2.22 rating on Mirage, while mezii and flameZ delivered in key rounds, highlighting the team's depth. Despite limited prep and some shaky moments, Vitality consistently closed out maps, exposing MOUZ's mental fragility. Vitality's strengths include resilience, clutch performances, and balanced contributions, but rare lapses like the 5v1 loss on Dust2 could be exploited. Their current form and adaptability make them strong favorites for the upcoming Austin Major.
>
> ---

[Removed some of the articles above here for brevity. There are usually 10 for each team.]

> Here are this same matchup results from the past:
> | Higher seed team | Lower seed team | Winner of the match | Event |
> | --- | --- | --- | --- |
> | Vitality | Legacy | Vitality | IEM Dallas 2025 |
>
> The team name you choose _MUST_ be one of the following:
>
> - Vitality
> - Legacy
>
> Remember to explain step-by-step all of your thinking in great detail. Describe which maps have a likely chance to be played. Use bulleted lists to structure your output. Be decisive – do not hedge your decisions. The presented news articles may or may not be relevant, so assess them carefully.
>
> You must respond directly ONLY with a JSON object that is valid and matching this schema:
>
> ```json
> {
> 	"type": "object",
> 	"description": "Your response to the user. Think step-by-step about the decisions you are about to make. Be careful and thorough. _ALWAYS GENERATE THE `analysis` BEFORE THE `conclusion`._",
> 	"properties": {
> 		"analysis": {
> 			"type": "string",
> 			"description": "Your careful and thorough analysis, thinking step-by-step about each decision you are about to make in your conclusion. _ALWAYS GENERATE THIS FIRST_."
> 		},
> 		"conclusion": {
> 			"type": "object",
> 			"properties": {
> 				"winningTeam": {
> 					"type": "string",
> 					"description": "The name of the winning team."
> 				},
> 				"losingTeam": {
> 					"type": "string",
> 					"description": "The name of the losing team."
> 				},
> 				"analysis": {
> 					"type": "string",
> 					"description": "Analysis done by LLM"
> 				}
> 			},
> 			"required": ["winningTeam", "losingTeam", "analysis"]
> 		}
> 	},
> 	"required": ["analysis", "conclusion"]
> }
> ```
>
> DO NOT use markdown syntax or any other formatting.
>
> USER:
>
> {"home":"Vitality","away":"Legacy","bestOf":"1"}

# In Depth Analysis

For the match prediction analysis, I've just considered the ones that happened in the real world. The [Valve Rulebook about Counter Strike championships](https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/main/major-supplemental-rulebook.md#mid-stage-seed-calculation) states the roudns they happen in a Swiss Format with [Buccholz system](https://en.wikipedia.org/wiki/Buchholz_system). This basically means that the matchups for a round are defined based on the results of the previous round and each team's seeding changes from the match results. **The highest seeding team in the matchup will have the first map ban/pick.** The lowest seeding can choose which side they want to start in that map.

Considering all the predictions were made before the championship even started, **it means that any wrong predicted match done in the first rounds would be carried until the end of the championship.** Therefore, I've filtered the matches that actually happened so we can understand how good a LLM is at predicting a match outcome.

Now, let's check some outputs of how the LLMs built their responses.

## LLMs analysis

Taking the [Lynn Vision vs Legacy match happened on the first round of the first stage](https://www.hltv.org/matches/2382301/lynn-vision-vs-legacy-blasttv-austin-major-2025-stage-1), where Lynn Vision won 13-7, this is the analysis by DeepSeek's `deepseek-chat` model:

> ## CSGO Match Analysis by deepseek-chat: Lynn Vision vs Legacy
>
> ### Match Outcome
>
> **Winner**: Lynn Vision  
> **Loser**: Legacy
>
> ### Detailed Analysis
>
> To determine the likely winner between Lynn Vision and Legacy in a Best of 1 match, we need to analyze several factors: team statistics, world rankings, map pool strengths, and recent performance. Here's a step-by-step breakdown:
>
> ### 1. Team Statistics
>
> - **Win Rate**: Legacy has a higher win rate (65.35%) compared to Lynn Vision (58.91%).
> - **Kill/Death Ratio**: Legacy also has a better K/D ratio (1.12) compared to Lynn Vision (1.05).
>
> ### 2. World Rankings
>
> - Lynn Vision is ranked #25, while Legacy is ranked #46. This suggests Lynn Vision is generally considered the stronger team globally.
>
> ### 3. Map Pool Analysis
>
> - **Ancient**: Lynn Vision has a higher win percentage (68.0%) compared to Legacy (63.3%). Lynn Vision also has a slightly better pistol round win percentage (60.0% vs. 60.2%).
> - **Dust2**: Legacy has a significantly higher win percentage (64.3%) compared to Lynn Vision (47.8%). Legacy also performs better on both CT and T sides.
> - **Mirage**: Both teams have strong win percentages (Lynn Vision 68.6%, Legacy 72.2%). Lynn Vision picks this map frequently (84.4% pick rate), while Legacy bans it less often (20.9% ban rate).
> - **Nuke**: Legacy has a higher win percentage (69.7%) compared to Lynn Vision (57.9%). Legacy also has a better CT-side performance (64.7% vs. 52.3%).
>
> ### 4. Recent Performance and News
>
> - Legacy has shown strong performances in recent matches, including a 2-0 win over Liquid and qualifying for multiple international LANs. Their new IGL, lux, has been impactful.
> - Lynn Vision has had mixed results, including a loss to FURIA at IEM Dallas and a narrow loss to paiN in EPL S21. However, they have shown resilience in qualifiers and have a strong map pool on Mirage.
>
> ### 5. Picks and Bans Phase
>
> - As the higher seed, Lynn Vision will start the picks and bans phase first, giving them a slight advantage in map selection.
> - Likely bans:
>   - Lynn Vision may ban Dust2 (Legacy's strong map) or Nuke (Legacy's strong map).
>   - Legacy may ban Mirage (Lynn Vision's most picked map) or Ancient (Lynn Vision's strong map).
> - The remaining map is likely to be Ancient or Mirage, both of which favor Lynn Vision.
>
> ### 6. Key Factors
>
> - Lynn Vision's higher world ranking and strong performance on Mirage and Ancient give them an edge.
> - Legacy's higher win rate and K/D ratio suggest they are in good form, but their map pool may be exploited by Lynn Vision's bans.
> - Lynn Vision's recent roster changes, including the addition of C4LLM3SU3 and the return of Starry, have improved their firepower and synergy.

It was the only model able to predict the winner on this match but unfortunately it wasn't able to predict the correct map: it was actually a Dust2, which was a strong map in the whole championship for Lynn Vision.

Now, let's see the analysis of a Best Of 3 match between [MOUZ and Vitality](https://www.hltv.org/matches/2382618/mouz-vs-vitality-blasttv-austin-major-2025) on the Playoffs stage, where Vitality won 2-1. This was from Anthropic's `claude-opus-4` model, which is a **reasoning model.**

> ## CSGO Match Analysis: Vitality vs MOUZ
>
> ### Match Outcome
>
> **Winner**: Vitality  
> **Loser**: MOUZ
>
> ### Detailed Analysis
>
> ### Current Form and Recent Performance
>
> - Vitality is on an incredible 30-match win streak and has won 6 consecutive tournaments
> - Vitality has a perfect 4-0 record in this championship, while MOUZ is 4-1 (their only loss to Spirit)
> - Vitality's win rate is 76.43% compared to MOUZ's 56.90%
> - Vitality is ranked #1 in the world, MOUZ is #2
>
> ### Head-to-Head Record
>
> - Looking at their recent matchups, Vitality has dominated MOUZ with 8 wins in their last 9 meetings
> - MOUZ's only recent victory came at IEM Rio 2024
> - Vitality swept MOUZ 3-0 in the IEM Dallas 2025 grand final just recently
> - The psychological edge clearly favors Vitality, with MOUZ having a 6-match losing streak against them
>
> ### Map Pool Analysis and Likely Maps
>
> Since Vitality is the higher seed (home team), they will start the pick/ban phase:
>
> **Vitality's likely bans:**
>
> - Ancient (50% win rate, 24.7% ban rate) - Their weakest map
> - Nuke (87.5% win rate but only 8 games played, they might be uncomfortable)
>
> **MOUZ's likely bans:**
>
> - Dust2 (26.5% ban rate for MOUZ, while Vitality has 81.2% win rate)
> - Mirage (Vitality has 86.2% win rate, MOUZ only 54.1%)
>
> **Likely map picks:**
>
> - Vitality pick: Inferno (70.6% win rate for Vitality, 50% for MOUZ)
> - MOUZ pick: Nuke (66.7% win rate for MOUZ, Vitality has limited data)
> - Decider: Train (MOUZ has 66.7% win rate but only 6 games, Vitality has no recent data)
>
> ### Key Player Performances
>
> - ZywOo has been dominant, earning his 26th career MVP at IEM Dallas with a 1.52 rating
> - torzsi from MOUZ has shown brilliance but faltered in the IEM Dallas final against Vitality
> - flameZ and mezii have been providing crucial support for Vitality
> - Spinx and Jimpphat have been key for MOUZ but couldn't deliver in the final
>
> ### Strengths and Weaknesses
>
> **Vitality strengths:**
>
> - Mental resilience and ability to win close games
> - Deep map pool with strong performances across multiple maps
> - ZywOo's consistent star performance
> - Strong CT sides and late-round execution
> - Experience closing out series and handling pressure
>
> **MOUZ weaknesses:**
>
> - Mental fragility in high-pressure situations against Vitality
> - Tendency to lose control in late-game situations
> - Slow starts on maps
> - Struggles with economy management in crucial rounds
>
> ### Critical Factors
>
> - MOUZ has repeatedly shown they cannot handle the pressure against Vitality
> - Vitality's ability to exploit MOUZ's defensive lapses was evident in Dallas
> - The psychological barrier MOUZ faces against Vitality is significant
> - Vitality's current form and momentum are overwhelming
>
> ### Map Predictions
>
> 1. Inferno (Vitality pick): Vitality's 70.6% win rate and strong CT side should prevail
> 2. Nuke (MOUZ pick): MOUZ's best chance with 66.7% win rate, but Vitality can adapt
> 3. Train (if needed): Limited data but MOUZ's small sample size success might not hold up
>
> Given all these factors, Vitality's dominance over MOUZ is clear and consistent.

It could nail 2 of the 3 maps (Inferno and Train) and predict the winner.

## Reasoning models

On this analysis, the **reasoning models performed worse then the other models.** I could not find the reason why, but it was a surprise to me. I kept the prompt equal to both of them so the results could be better compared and the prompt did incluse the "reasoning" part for both. Perhaps that confused the reasoning ones? If you have any clue, please let me know.

## It is a feature, not a bug

Something that we learn in life is that **the unexpected happens, sometimes. And that is great.**

Take the Vitality vs Legacy match prediction, for example. It was an astounding [3-13](https://www.hltv.org/matches/2382432/vitality-vs-legacy-blasttv-austin-major-2025) match where Legacy, a #46 ranked team wrecked Vitality, the #1 (and the championship winner btw) team. Pretty much no one saw that coming, and this is what makes sports so exciting.

So, the fact the LLMs did not have a great performance on this test might be a feature of the sport itself that is hardly predictable and unexpected.

# Next Steps

For a next analysis, I'd like to avoid run everything **before the championship starts**, but rather execute the predictions **before each stage instead**. This would "reset" the predictions and allow the models to execute their analysis based on each stage individually.

Perhaps it could be even more granular by **running the predictions of each round individually** on a daily basis, as the [original project this was forked from](https://github.com/stevekrenzel/pick-ems) is doing.

Some similar match prediction projects does the full statistic output as well: Instead of outputting the predicted winner, it outputs the probabilities of each team winning. This is something we could play around too.
