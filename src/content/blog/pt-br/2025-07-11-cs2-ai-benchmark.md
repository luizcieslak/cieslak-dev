---
title: Previsão de Resultados de CS2 - Análise Comparativa de Modelos de IA
exceprt: Um Benchmark de diferentes modelos de IA que preveem partidas de Counter-Strike 2 no Major de Austin em 2025.
publishDate: '2025-07-17'
updatedDate: '2025-07-17'
seo:
  image:
    src: '/cs2-benchmark/overall-performance.png'
    alt: Média da precisão no avanço de equipes entre as fases do campeonato
---

![Média da precisão no avanço de equipes entre as fases do campeonato](/cs2-benchmark/overall-performance.png)

Em 2024, escrevi um [post](https://cieslak.dev/en/blog/2024-03-13-cs2-ai) sobre a previsão de partidas de Counter-Strike 2 dentro de um contexto do Major usando o modelo GPT4 da OpenAI.

Nesse novo post, expandi o experimento para fazer um _benchmark_ entre diferentes modelos de IA com o mesmo objetivo, a fim de entender qual deles é melhor para esse tipo de tarefa.

# Resumo

Todas as previsões foram feitas **antes** do início do campeonato, em [30 de maio de 2025](https://github.com/luizcieslak/cs2-match-prediction/commit/56a583b3965551e385be143f4206a479307da49f).

Quando se trata de prever o avanço das equipes entre as fases do campeonato, **não houve melhorias em relação ao último experimento.** Os modelos com melhor desempenho foram o `deepseek-chat` da DeepSeek e o `gpt-4.1` da OpenAI, que tiveram uma **precisão média de 58,3%** cada.

![Precisão média da previsão do avanço das equipes em todas as fases](/cs2-benchmark/accuracy-heatmap.png)

Quando se trata de partidas individuais, o `claude-sonnet-4` da Anthropic teve a melhor precisão: **18 partidas previstas corretamente**, e o `sabia-3` da MaritacaAI ficou em segundo lugar: **17 partidas previstas corretamente.**

![Precisão média da previsão do avanço das equipes em todas as fases](/cs2-benchmark/analysis-per-match-faceted.png)

Elaboro mais na seção [Análise aprofundada](#in-depth-analysis), mas para as partidas **eu considerei apenas as que aconteceram no mundo real.** O CS2 Major Championship é realizado no formato suíço, o que basicamente significa que os confrontos de uma rodada são definidos com base nos resultados da rodada anterior.

# Code

The code is open source and available at [luizcieslak/cs2-match-prediction](https://github.com/luizcieslak/cs2-match-prediction).

O código de _open-source_ está disponível em [luizcieslak/cs2-match-prediction](https://github.com/luizcieslak/cs2-match-prediction).

É uma aplicação Node usando TypeScript, a extração de dados é feita usando o Playwright (nd verdade [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright-nodejs) para passar da detecção de bots) e a análise/gráficos são feitas usando Python em Jupyter Notebooks.

# Prompt Completo

O prompt permaneceu semelhante ao usado na postagem anterior, com algumas alterações:

- Adicionado uma nova estatística do desempenho dos times em cada mapa.
- Tentar prever quais seriam os mapas jogados e a sequência de _picks/bans_ e, em teoria, poder prever o resultado com maior precisão.

O prompt já tinha:

- Resumo dos últimos 10 artigos sobre cada equipe
- Estatísticas gerais de cada equipe
- Posição do ranking mundial de cada equipe
- Histórico de eventos passados de cada equipe
- Contexto atual do campeonato (fase atual, quantidade de jogos já feitos, etc.)

Aqui está o exemplo completo do prompt, na partida entre Legacy e Vitality (em inglês):

> SYSTEM:
> You are an expert at choosing winning Counter-Strike teams in a "pick ems" competition. The teams are playing in a championship called "Blast Austin CS2 Major Championship". This championship is divided in four stages: Stage 1, Stage2, Stage 3 and Playoffs. We currently are in the stage3 stage in which 16 teams face each other in a Swiss format. The top 8 teams are classified to the next stage and the bottom 8 are eliminated. Elimination and advancements matches are in a Best of 3 format where the others are in a Best of 1 format. This is going to be a Best of 1 match.
>
> In Counter-Strike competitive matches we have first a maps Picks and Bans phase, where the teams with their coach will ban alternatively 3 maps each team, then will play the one that remained. The highest seed team (classified as 'home' in the input) will be able to start the picks and bans phase first and therefore has an advantage. Notice that this is a high-level competition, so the teams knows in advance their opponent and will study their performance on all the maps available to play.
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

[Removi parte das estatísticas de eventos aqui para não ficar longo. É fornecido TODO o histórico de eventos dos últimos 6 meses.]

> # Map Pool
>
> | Team     | Dust2                                                                                                                                                                                                                                                                                            | Inferno                                                                                                                                                                                                                                                                                           | Mirage                                                                                                                                                                                                                                                                                            |
> | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | Legacy   | Rounds won: 344, Times played: 32, Wins / draws / losses: 19 / 0 / 13, Total rounds played: 666, Win percent: 59.4%, Pistol rounds: 64, Pistol rounds won: 26, Pistol round win percent: 40.6%, CT round win percent: 48.5%, T round win percent: 55.3%, Pick percent: 9.8%, Ban percent: 42.7%, | Rounds won: 532, Times played: 46, Wins / draws / losses: 32 / 0 / 14, Total rounds played: 934, Win percent: 69.6%, Pistol rounds: 92, Pistol rounds won: 54, Pistol round win percent: 58.7%, CT round win percent: 56.1%, T round win percent: 57.6%, Pick percent: 57.1%, Ban percent: 3.1%,  | Rounds won: 466, Times played: 38, Wins / draws / losses: 28 / 0 / 10, Total rounds played: 798, Win percent: 73.7%, Pistol rounds: 76, Pistol rounds won: 45, Pistol round win percent: 59.2%, CT round win percent: 58.6%, T round win percent: 58.1%, Pick percent: 27.1%, Ban percent: 19.7%, |
> | Vitality | Rounds won: 394, Times played: 31, Wins / draws / losses: 25 / 0 / 6, Total rounds played: 648, Win percent: 80.6%, Pistol rounds: 62, Pistol rounds won: 36, Pistol round win percent: 58.1%, CT round win percent: 55.9%, T round win percent: 65.6%, Pick percent: 27.7%, Ban percent: 14.1%, | Rounds won: 449, Times played: 34, Wins / draws / losses: 24 / 0 / 10, Total rounds played: 806, Win percent: 70.6%, Pistol rounds: 68, Pistol rounds won: 36, Pistol round win percent: 52.9%, CT round win percent: 60.9%, T round win percent: 50.4%, Pick percent: 15.6%, Ban percent: 12.7%, | Rounds won: 387, Times played: 30, Wins / draws / losses: 26 / 0 / 4, Total rounds played: 637, Win percent: 86.7%, Pistol rounds: 60, Pistol rounds won: 39, Pistol round win percent: 65.0%, CT round win percent: 69.7%, T round win percent: 52.6%, Pick percent: 34.0%, Ban percent: 10.5%,  |

[Removi alguns mapas aqui para ficar curto. É fornecido estatísticas para TODOS os 7 mapas ativos.]

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

[Removi a maioria dos artigos aqui para ficar curto. Normalmente há 10 para cada time.]

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

# Análise aprofundada

Para a análise de jogos individuais, **considerei apenas aqueles que ocorreram no mundo real**. O [Regulamento da Valve sobre os campeonatos de Counter Strike](https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/main/major-supplemental-rulebook.md#mid-stage-seed-calculation) estabelece que as rodadas ocorrem no formato suíço com o [sistema Buccholz](https://en.wikipedia.org/wiki/Buchholz_system).

Nesse formato, **os confrontos de uma rodada são definidos com base nos resultados da rodada anterior** e a classificação (chamado de _seed_ em inglês) de cada equipe muda de acordo com os resultados das partidas. **A equipe com o maior _seed_ no confronto terá a primeiro pick/ban de mapa.** O _seed_ mais baixo portanto pode escolher de que lado quer começar o jogo nesse mapa.

Considerando que todas as previsões foram feitas antes mesmo do início do campeonato, **isso significa que qualquer partida prevista incorretamente na primeira rodada será mantida até o final do campeonato.** Então, filtrei as partidas que realmente aconteceram para que possamos entender o quão bom um LLM é em prever o resultado de uma partida isolada.

Agora, coloco aqui abaixo alguns resultados de como as LLMs construíram suas respostas.

## Análise das LLMs

Considerando a partida entre Lynn Vision e Legacy que aconteceu na primeira rodada da primeira fase (https://www.hltv.org/matches/2382301/lynn-vision-vs-legacy-blasttv-austin-major-2025-stage-1), em que Lynn Vision venceu por 13 a 7, esta é a análise do modelo `deepseek-chat` da DeepSeek (em inglês):

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

Esse foi o único modelo capaz de prever corretamente o vencedor nessa partida. Porém, não preveu o mapa que foi jogado: Na verdade, foi uma Dust2, que inclusive foi um mapa forte no campeonato inteiro para a Lynn Vision.

Now, let's see the analysis of a Best Of 3 match between [MOUZ and Vitality](https://www.hltv.org/matches/2382618/mouz-vs-vitality-blasttv-austin-major-2025) on the Playoffs stage, where Vitality won 2-1. This was from Anthropic's `claude-opus-4`, a **reasoning model.**

Agora, vamos ver a análise de uma partida entre [MOUZ e Vitality](https://www.hltv.org/matches/2382618/mouz-vs-vitality-blasttv-austin-major-2025) na fase Playoffs, onde Vitality venceu por 2-1. Essa análise é feita pelo modelo `claude-opus-4` da Anthropic, que é um **modelo de _reasoning_** (em inglês).

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

Ele conseguiu acertar 2 dos 3 mapas (Inferno e Train) e prever o vencedor.

## Modelos de raciocínio

Nesta análise, os **modelos de raciocínio (_reasoning_) tiveram um desempenho pior do que os outros modelos.** Não consegui descobrir o motivo, mas foi uma surpresa para mim.

**O prompt é exatamente o mesmo para todos os modelos, independentemente**, para que então os resultados poderiam comparados entre si. O prompt também incluía a parte de “raciocínio” dentro dele (em inglês):

> You will evaluate the statistics, articles, scrutinize the picks and bans phase by predicting which maps will be played and explain step-by-step why you think a particular team will win in match. After you choose your winner, criticize your thinking, and then respond with your final answer.

> Your response to the user. Think step-by-step about the decisions you are about to make. Be careful and thorough. \_ALWAYS GENERATE THE `analysis` BEFORE THE `conclusion`

> Your careful and thorough analysis, thinking step-by-step about each decision you are about to make in your conclusion. _ALWAYS GENERATE THIS FIRST_.

Talvez isso tenha confundido os modelos de raciocínio? Se você tiver alguma ideia do motivo, por favor, me mande uma mensagem!

## É um recurso, não um bug

**Na vida, aprendemos que às vezes acontecem coisas inesperadas. E isso é ótimo.**

Veja a previsão da partida entre Vitality e Legacy, por exemplo. Foi uma partida surpreendente [3-13](https://www.hltv.org/matches/2382432/vitality-vs-legacy-blasttv-austin-major-2025) em que o Legacy, time classificado em 46º lugar, derrotou o Vitality, time classificado em 1º lugar (e vencedor do campeonato, aliás). Praticamente ninguém previu isso, e é isso que torna os esportes tão emocionantes.

Logo, o fato de os LLMs não terem tido um ótimo desempenho neste teste pode ser uma boa característica do próprio esporte, que é dificilmente previsível e inesperado.

# Próximos passos

Para uma próxima análise, gostaria de evitar executar tudo **antes do início do campeonato**, mas sim executar as previsões **antes de cada etapa**. Isso “reiniciaria” as previsões e permitiria que os modelos executassem suas análises com base em cada etapa individualmente.

Talvez pudesse ser ainda mais granular, **executando as previsões de cada rodada individualmente** todos os dias, como o [projeto original do qual este foi derivado](https://github.com/stevekrenzel/pick-ems) está fazendo.

Alguns trabalhos semelhantes de previsão de partidas também fornecem resultados estatísticos completos: em vez de apresentar o vencedor previsto, eles apresentam as probabilidades de cada time vencer. Isso é algo que também poderíamos solicitar no prompt.
