-- Seed the former hardcoded TSX blog articles into the managed blog CMS.

-- Idempotent: existing slugs are left untouched.

INSERT INTO "blog_post" ("slug", "status", "title", "description", "body", "title_ja", "description_ja", "body_ja", "author", "featured", "published_at")
VALUES (
  $t$chatgpt-vs-claude-vs-gemini$t$,
  'published',
  $t$ChatGPT vs Claude vs Gemini: how we pick for daily work$t$,
  $t$A practical comparison of ChatGPT, Claude, and Gemini based on task failure modes, not brand loyalty.$t$,
  $body$We do not pick a permanent winner. We pick the model whose usual failure mode is cheapest to catch for the task in front of us.

## Brand loyalty is a weak default

People ask us which model we use. The honest answer is that we use more than one, often in the same afternoon. A writing pass, a code review, and a research summary do not share the same failure cost.

ChatGPT vs Claude vs Gemini is a useful search because the names are familiar. It is a weak decision framework if you stop at reputation. The stable question is: if this answer is wrong, how will I notice, and how much work does that create?

- **ChatGPT: broad first pass** — We reach for GPT-family models when the task is mixed: a draft, a plan, a rewrite, and a short explanation in one thread. The failure mode to watch is fluent overconfidence on details it did not actually check.
- **Claude: long context and careful prose** — We use Claude when the input is a long document, a policy, or a codebase excerpt that needs to stay internally consistent. The failure mode is over-hedging, or a polished answer that still missed a constraint buried in the middle.
- **Gemini: fast synthesis across messy sources** — Gemini is useful when the job is to gather, cluster, and restate material from several notes or links. The failure mode is blending sources so cleanly that you cannot tell which claim came from where.
- **None of them: high-stakes facts** — For numbers, legal-adjacent claims, medical questions, or anything that will be published as fact, the model is a drafter. The decision happens after a human check against a source outside the chat.

## How we actually assign the first model

Start with the output you need, not the logo. If you need a messy idea turned into a usable draft, a fast general model is enough. If you need a 20-page brief reduced without losing the exception buried on page 14, long-context discipline matters more than clever phrasing.

Then name the review step. Code gets tests. A public paragraph gets a source check. A meeting summary gets a scan for invented owners and dates. If you cannot name the review step, you are not ready to pick a model. You are still defining the task.

Only after that do we compare. In Deni AI we switch models in the same thread when the first answer is plausible but the stakes rose: a draft that will be sent, a patch that will be merged, or a claim that will be repeated to a customer.

## What comparison is for

Running the same vague prompt through three models and ranking the answers by style is entertainment. Useful comparison asks for the same structure: assumptions, unknowns, and the one claim that would change the decision if it were false.

When two models disagree, do not average them. Isolate the disputed sentence and check it outside the chat. Disagreement is valuable because it points at the exact place a human has to look.

## A one-minute picker

- Need a first draft or a rewrite? Start with a fast general model.
- Need to stay faithful to a long document? Prefer a careful long-context model.
- Need to cluster messy notes or several sources? Prefer a synthesis-oriented model.
- Need a fact that will be published? Draft with any model, then verify outside the chat.
- Need implementation in a real repo? Use a coding-capable model and run the tests.

## What we stopped doing

We stopped treating the newest model as the default for every small task. That habit made simple work slower and trained us to outsource judgment. A cheaper first pass plus a named review step is usually faster end to end.

We also stopped arguing about which provider is winning the quarter. Those rankings expire. The task profiles do not: draft, analyze, implement, translate, decide. If you can name the profile, the ChatGPT vs Claude vs Gemini question gets smaller.

## Common questions

### Which model is best overall?

There is no best overall model for daily work. ChatGPT, Claude, and Gemini have different failure modes. Pick the one that is cheapest to review for the current task.

### Should I run every prompt through all three?

No. Compare models when the output will be published, the task is ambiguous, or a wrong answer creates expensive rework. Otherwise one good first pass is faster.

### Does Deni AI replace ChatGPT, Claude, or Gemini?

Deni AI is a workspace for switching between those families without opening three apps. The point is the workflow, not a fourth personality.

---

- [Guide: how to choose a model](/guides/model-selection)
- [Next: when not to use AI](/blog/when-not-to-use-ai)$body$,
  $t$ChatGPT vs Claude vs Gemini：日常業務での選び方$t$,
  $t$ブランドへの忠誠ではなく、タスクの失敗の形で見る、ChatGPT・Claude・Geminiの実務比較です。$t$,
  $body$永久の勝者は選びません。目の前のタスクで、いつもの失敗がいちばん安く見つかるモデルを選びます。

## ブランド忠誠は弱い初期値

どのモデルを使っているか聞かれます。正直な答えは、複数です。同じ午後に使うことも多い。執筆、コードレビュー、調査要約は、失敗のコストが同じではありません。

ChatGPT vs Claude vs Gemini は、名前が知られているので検索としては有用です。評判で止めるなら、判断の枠としては弱い。安定した問いは、この答えが間違っていたらどう気づき、どれだけ仕事が増えるかです。

- **ChatGPT：広い初手** — 下書き、計画、書き直し、短い説明が一つのスレッドに混ざるとき、GPT系を使います。見るべき失敗は、実際には確認していない細部への流暢な過信です。
- **Claude：長い文脈と慎重な文章** — 長い文書、方針、一貫性が必要なコード抜粋では Claude を使います。失敗は慎重すぎること、または途中に埋まった制約を落とすきれいな回答です。
- **Gemini：散らかった情報の速い整理** — 複数のメモやリンクを集め、まとめて言い直す仕事では Gemini が役立ちます。失敗は、出典が分からないほどきれいに混ぜてしまうことです。
- **どれでもない：重大な事実** — 数字、法務に近い主張、医療の問い、事実として公開するものでは、モデルは下書き係です。判断は、チャットの外の出典を人が見たあとにします。

## 最初のモデルの実際の割り当て方

ロゴではなく、必要な出力から始めてください。散らかったアイデアを使える下書きにするなら、速い汎用モデルで足ります。20ページの資料から14ページ目の例外を落とさず縮めるなら、巧みな言い回しより長い文脈の規律です。

次にレビュー手順を名付けます。コードはテスト。公開文は出典確認。議事要約は捏造された担当者と日付の点検。レビューを名指しできないなら、モデル選びの準備はできていません。まだタスクを定義しています。

比較はそのあとです。Deni AIでは、最初の答えはそれらしいのに賭け金が上がったとき、同じスレッドで切り替えます。送る下書き、マージするパッチ、顧客に繰り返す主張です。

## 比較の目的

曖昧な同じプロンプトを3モデルに流し、文体で順位をつけるのは娯楽です。役に立つ比較は同じ構造を求めます。前提、未知、それが偽なら判断が変わる一文。

2つのモデルが食い違っても平均しないでください。争点の文を切り出し、チャットの外で確認します。食い違いは、人が見るべき場所を指すので価値があります。

## 1分で選ぶ

- 初稿や書き直しが必要？速い汎用モデルから始める。
- 長い文書に忠実でいたい？慎重な長文脈モデルを優先する。
- 散らかったメモや複数出典をまとめたい？整理向きのモデルを優先する。
- 公開する事実が必要？どのモデルでも下書きし、チャットの外で検証する。
- 本物のリポジトリに実装する？コーディング向きのモデルを使い、テストを走らせる。

## やめたこと

最新モデルを小さな仕事の初期値にするのをやめました。簡単な仕事が遅くなり、判断を外注する癖がつきます。安い初手と、名前のついたレビューのほうが、大抵は終わりまで速いです。

今四半期の勝者論争もやめました。順位は期限切れになります。タスクの型は残ります。下書き、分析、実装、翻訳、決定。型を名指しできれば、ChatGPT vs Claude vs Gemini の問いは小さくなります。

## よくある質問

### 総合的にいちばん良いモデルはどれですか？

日常業務に総合一位はありません。ChatGPT、Claude、Geminiは失敗の形が違います。今のタスクでレビューがいちばん安いものを選んでください。

### 毎回3つ全部に同じプロンプトを流すべきですか？

いいえ。公開する、曖昧、間違いのやり直しが高い、ときに比較してください。そうでなければ、良い初手が速いです。

### Deni AIは ChatGPT、Claude、Gemini の代わりですか？

Deni AIは、3つのアプリを開かずにそれらの系統を切り替える作業場です。目的は4つ目の人格ではなく、進め方です。

---

- [ガイド：モデルの選び方](/ja/guides/model-selection)
- [次：AIを使わないとき](/ja/blog/when-not-to-use-ai)$body$,
  'Deni AI team',
  false,
  '2026-08-14 12:00:00'
)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

INSERT INTO "blog_post" ("slug", "status", "title", "description", "body", "title_ja", "description_ja", "body_ja", "author", "featured", "published_at")
VALUES (
  $t$ai-for-bilingual-writing$t$,
  'published',
  $t$Using AI for bilingual writing without sounding like a machine$t$,
  $t$A two-pass workflow for English and Japanese drafts that keeps meaning, tone, and audience fit under human control.$t$,
  $body$Literal accuracy is the first pass, not the last. A bilingual draft fails when it is correct and still sounds like nobody would say it.

## Why bilingual drafts still need a human

Deni AI ships in English and Japanese, so we see the same machine-voice problems visitors see. A model can move meaning across languages quickly. It is much worse at deciding how close the reader is, how much explanation they need, and which words should stay untranslated.

The tell is not a grammar error. It is a sentence that is technically right and socially wrong: an English paragraph that explains what the Japanese never said, or a Japanese sentence that sounds like a translated press release.

- **Pass one: meaning** — Ask the model to preserve claims, numbers, names, and constraints. Tell it not to improve the argument yet. The job is transfer, not rewrite.
- **Pass two: voice** — In a second prompt, ask only for tone: shorter sentences, natural particles, fewer nominalizations, or a less salesy English rhythm. Do not let it reopen the facts.
- **Pass three: a real reader** — Read the result as the person who will receive it. If a phrase would feel stiff in Slack or too casual in a contract, fix that yourself. Models average the internet. Your audience is not the internet.
- **Keep a do-not-translate list** — Product names, legal defined terms, and error strings often should stay in the source language. Put those in the prompt so the model does not invent a local equivalent.

## Failures we keep seeing

Over-explaining. English drafts often add a helpful clause that was never in the Japanese. That extra clause can change a promise. If the source did not say it, the translation should not say it.

Register mismatch. A model will happily turn a blunt internal note into polite customer copy, or the reverse. Tell it the relationship: teammate, customer, lawyer, or public reader.

False friends in product language. Words like agent, memory, workspace, and free plan do not have one perfect pair. We keep a glossary and force the model to use it. Without that, every page slowly drifts.

## Prompt skeleton we reuse

- Audience and relationship: who reads this, and how formal should it sound?
- Do-not-translate list: product names, legal terms, and error strings.
- Preserve: numbers, dates, claims, and anything that looks like a promise.
- Do not add explanations that are missing from the source.
- After the meaning pass, run a second prompt that may change rhythm only.

## When to stop using the model

Legal pages, commercial disclosure, and anything that creates a customer obligation should be reviewed by a person who can read both languages. AI can propose a first pass. It cannot sign the policy.

If a sentence is doing social work — an apology, a refusal, a joke — write it yourself. Those sentences are short. The risk of a wrong tone is higher than the time you save.

## Common questions

### Can I translate a whole site in one prompt?

You can draft it that way. You should not ship it that way. Split by page purpose: UI chrome, legal text, and marketing copy fail in different ways.

### Is Japanese to English harder than English to Japanese?

They fail differently. English often gets too long and explanatory. Japanese often gets too stiff or too casual for the relationship. Review for the failure you actually see.

### Should I use the same model for both languages?

Use whatever model handles the source text faithfully, then do a voice pass. If two models disagree on a claim, check the source sentence instead of blending the translations.

---

- [Guide: prompt patterns](/guides/prompt-patterns)
- [Next: how we pick models](/blog/chatgpt-vs-claude-vs-gemini)$body$,
  $t$機械翻訳っぽくならない、バイリンガル執筆の使い方$t$,
  $t$意味・トーン・読み手への適合を人が握ったまま、英語と日本語の下書きを進める2パスの手順です。$t$,
  $body$逐語の正確さは最初のパスであり、最後のパスではありません。正しいのに、誰もそんな言い方をしない文になった時点で、バイリンガル原稿は失敗しています。

## バイリンガル原稿に人が必要な理由

Deni AIは英語と日本語で公開しているので、訪問者が見るのと同じ機械声の問題をこちらでも見ます。モデルは意味を言語間で速く動かせます。読み手がどれだけ近いか、どこまで説明が要るか、どの語を訳さないかは、ずっと苦手です。

兆候は文法ミスではありません。技術的には正しく、社会的には違う文です。日本語にない説明を足した英語や、翻訳したプレスリリースのような日本語です。

- **パス1：意味** — 主張、数字、固有名、制約を保つよう指示してください。まだ議論を良くしないこと。仕事は言い換えではなく、移すことです。
- **パス2：声** — 2つ目のプロンプトではトーンだけを直します。文を短くする、助詞を自然にする、名詞化を減らす、売り込み調の英語リズムを落とす。事実は触らせないでください。
- **パス3：本物の読み手** — 受け取る人の立場で読んでください。Slackでは堅すぎる、契約書では軽すぎる、と感じたら自分で直します。モデルはインターネットの平均です。あなたの読み手はインターネットではありません。
- **訳さないリストを持つ** — 製品名、法律上の定義語、エラー文言は原文のまま残すことが多いです。プロンプトに入れて、モデルに現地語の言い換えを作らせないでください。

## 繰り返し見ている失敗

説明の足しすぎ。英語原稿は、日本語になかった親切な節を足しがちです。その一文で約束が変わります。原文が言っていないことは、訳も言ってはいけません。

レジスターのずれ。モデルは社内のぶっきらぼうなメモを丁寧な顧客文に変えたり、その逆をしたりします。相手との関係を書いてください。同僚、顧客、弁護士、一般読者。

製品語の偽の対応。agent、memory、workspace、free plan に完璧な一対一はありません。用語集を持ち、モデルにそれを使わせます。それがないと、ページごとに少しずつずれます。

## 使い回しているプロンプトの骨組み

- 読み手と関係：誰が読むか、どのくらいフォーマルか。
- 訳さないリスト：製品名、法務用語、エラー文言。
- 残すもの：数字、日付、主張、約束に見えるもの。
- 原文にない説明を足さない。
- 意味のパスのあと、リズムだけ変えてよい2つ目のプロンプトを走らせる。

## モデルを使うのをやめるとき

法務ページ、特定商取引法の表示、顧客への義務を生む文は、両言語を読める人が確認してください。AIは初稿を出せます。方針に署名はできません。

謝罪、断り、冗談など、対人の仕事をしている文は自分で書いてください。短い文です。トーンを外すリスクのほうが、節約できる時間より大きいです。

## よくある質問

### サイト全体を1つのプロンプトで訳してよいですか？

下書きならできます。公開はそのまましないでください。UI、法務文、マーケティング文は失敗の仕方が違います。用途ごとに分けてください。

### 日本語から英語のほうが、英語から日本語より難しいですか？

失敗の形が違います。英語は長く説明的になりやすく、日本語は関係性に対して硬すぎるか砕けすぎることが多い。見えている失敗を直してください。

### 両方の言語で同じモデルを使うべきですか？

原文を忠実に扱えるモデルで意味を移し、そのあと声のパスをかけます。主張で2つのモデルが食い違ったら、訳を混ぜず原文を確認してください。

---

- [ガイド：プロンプトの型](/ja/guides/prompt-patterns)
- [次：モデルの選び方](/ja/blog/chatgpt-vs-claude-vs-gemini)$body$,
  'Deni AI team',
  false,
  '2026-08-08 12:00:00'
)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

INSERT INTO "blog_post" ("slug", "status", "title", "description", "body", "title_ja", "description_ja", "body_ja", "author", "featured", "published_at")
VALUES (
  $t$when-not-to-use-ai$t$,
  'published',
  $t$When you should not use AI$t$,
  $t$The fastest AI workflow is sometimes no AI. A decision guide for tasks where a model adds risk, rework, or false confidence.$t$,
  $body$The useful question is not whether AI can produce an answer. It is whether the answer will be cheaper to trust than doing the work yourself.

## AI is optional even when it is available

We build a multi-model chat product, so it would be easy to pretend every task belongs in a prompt box. That is not how we work, and it is not how we want visitors to work.

The hidden cost of AI is not the token bill. It is the time spent reading a plausible answer that you still have to rebuild, plus the social pressure to accept something that looks finished.

- **The cost of being wrong is immediate** — Safety, legal, medical, financial, and production-access work still needs a qualified human and a source of truth. A fluent draft can hide the fact that nobody checked.
- **You cannot name the review step** — If you do not know how you will check the output, you are not using a tool. You are hoping. Skip the model until the check is obvious: a test, a document, a calculator, or a person.
- **The task is already faster by hand** — Renaming one variable, sending a two-line reply, or looking up a value you already know often takes longer once you write a prompt, wait, and edit the result.
- **The material should not leave your head** — Secrets, credentials, unreleased security findings, and confidential personal data do not belong in a consumer chat, even when the product says it will not train on your conversations.

## The ten-minute test

If you can finish the task in ten minutes without a model, do that. Prompting, waiting, and editing often consume the same ten minutes and leave you less sure than if you had written the first version yourself.

Use AI when the first ten minutes would be spent on boilerplate: outlining a long email, clustering messy notes, generating practice questions, or proposing a patch you will immediately run.

## Tasks that look like AI work and are not

Deciding a price, accepting a legal interpretation, or closing an incident from a generated summary. Those are judgment tasks. A model can list options. It cannot own the consequence.

Remembering something you should retrieve yourself. Students and professionals both lose the plot when they ask a model to hold the structure of an argument they have not practiced. If the point of the work is that you can recall it later, do the recall.

Filling a blank page when you have not decided the audience. A model will invent a tone. You will then spend longer removing that tone than you would have spent writing a blunt first paragraph.

## Skip the model when

- You cannot describe how you will verify the answer.
- The material includes secrets, credentials, or confidential personal data.
- A wrong answer would ship, publish, or spend money immediately.
- You already know the two-sentence reply.
- The real blocker is a decision, not missing text.

## What we do instead

We write the ugly first sentence, look up the source, or ask the person who owns the decision. Then, if the remaining work is mechanical, we open a chat. That order keeps the model in the part of the job it is good at: expansion, contrast, and cleanup.

If you want a longer method for the cases where AI is appropriate, read the verification guide and the privacy guide. Those pages assume you already decided the task belongs in a chat.

## Common questions

### Is it anti-AI to skip the model?

No. Skipping AI is part of using it well. The goal is a trustworthy next step, not a transcript that proves you used a model.

### What should I do instead of prompting?

Do the small task by hand, look up the source, write the first ugly draft yourself, or ask a person who owns the decision. Use AI after the problem is small enough to review.

### Does Deni AI encourage people not to use the product?

We would rather people use the workspace for tasks it can actually help with. A bloated chat full of unverified answers is not a successful session.

---

- [Guide: privacy habits](/guides/privacy-when-using-ai)
- [Next: workplace hallucinations](/blog/what-ai-hallucinations-look-like)$body$,
  $t$AIを使わないほうがいいとき$t$,
  $t$いちばん速いAIの進め方は、使わないことです。モデルがリスク、やり直し、偽の自信を足すタスクの判断ガイドです。$t$,
  $body$役に立つ問いは、AIが答えを出せるかではありません。自分でやるより、その答えを信じるほうが安いかです。

## 使えるときでも、AIは任意

マルチモデルのチャット製品を作っているので、すべての仕事が入力欄に入ると装うのは簡単です。私たちの働き方でも、訪問者に望む働き方でもありません。

AIの隠れたコストはトークン代ではありません。それらしい答えを読んで、結局作り直し、完成して見えるものを受け入れる圧力です。

- **間違いのコストがすぐ来る** — 安全、法務、医療、財務、本番アクセスの仕事は、資格ある人と正本がまだ必要です。流暢な下書きは、誰も確認していないことを隠せます。
- **レビュー手順を名指しできない** — 出力の確認方法が分からないなら、道具を使っていません。祈っています。テスト、文書、電卓、人など、確認が明らかになるまでモデルを飛ばしてください。
- **手作業のほうがすでに速い** — 変数名を一つ変える、2行の返信を送る、すでに知っている値を調べる。プロンプトを書き、待ち、結果を直すと、かえって長くなりがちです。
- **頭の外に出してはいけない材料** — 秘密、認証情報、未公開のセキュリティ発見、機微な個人データは、会話を学習に使わないと製品が言っても、一般向けチャットに入れません。

## 10分テスト

モデルなしで10分で終わるなら、そうしてください。プロンプト、待機、編集で同じ10分を使い、自分で書いた初版より確信が残らないことが多いです。

最初の10分が定型作業ならAIを使います。長いメールの骨子、散らかったメモの整理、練習問題の生成、すぐ実行するパッチ案です。

## AIの仕事に見えて、そうではないもの

価格を決める、法解釈を受け入れる、生成要約だけで障害を閉じる。それらは判断の仕事です。モデルは選択肢を並べられます。結果は引き取れません。

自分で思い出すべきことを預ける。学生も実務者も、練習していない議論の骨格をモデルに持たせると筋を失います。あとで思い出せることが仕事なら、自分で思い出してください。

読み手を決めていない空白を埋める。モデルはトーンを発明します。ぶっきらぼうな最初の段落を書くより、そのトーンを落とす時間が長くなります。

## モデルを飛ばすとき

- 答えの検証方法を説明できない。
- 材料に秘密、認証情報、機微な個人データがある。
- 間違った答えが、すぐ出荷、公開、支払いになる。
- 2文の返信をすでに知っている。
- 本当の詰まりは文章不足ではなく、判断である。

## 代わりにしていること

汚い最初の文を書く、出典を見る、判断の持ち主に聞く。残りの仕事が機械的なら、そのあとチャットを開きます。その順番で、モデルは得意な部分に留まります。広げ、対比し、整える。

AIが適切な場合の長い方法が必要なら、検証ガイドとプライバシーガイドを読んでください。それらのページは、すでにその仕事がチャットに入ると決めた前提です。

## よくある質問

### モデルを飛ばすのは反AIですか？

いいえ。飛ばすことは、上手な使い方の一部です。目標は、モデルを使った証明の記録ではなく、信頼できる次の一歩です。

### プロンプトの代わりに何をすべきですか？

小さな仕事は手でやる、出典を見る、最初の汚い下書きを自分で書く、判断の持ち主に聞く。問題がレビューできる大きさになってからAIを使ってください。

### Deni AIは、製品を使わないよう勧めていますか？

実際に助けられる仕事でワークスペースを使ってほしいです。検証していない答えで膨らんだチャットは、成功したセッションではありません。

---

- [ガイド：プライバシーの習慣](/ja/guides/privacy-when-using-ai)
- [次：職場のハルシネーション](/ja/blog/what-ai-hallucinations-look-like)$body$,
  'Deni AI team',
  false,
  '2026-08-04 12:00:00'
)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

INSERT INTO "blog_post" ("slug", "status", "title", "description", "body", "title_ja", "description_ja", "body_ja", "author", "featured", "published_at")
VALUES (
  $t$ai-meeting-notes$t$,
  'published',
  $t$How to turn messy meeting notes into decisions with AI$t$,
  $t$A capture-and-synthesis method that turns scattered notes into owners, dates, and open questions you can actually use.$t$,
  $body$A summary that nobody acts on is just a cleaner pile of words. The useful output of meeting notes is a decision, an owner, and a date.

## Notes fail when they only describe the hour

We see the same pattern in our own work: someone pastes a transcript, asks for a summary, and receives a polite paragraph that could apply to any meeting. Nobody can tell what changed.

AI meeting notes are useful when they extract the parts that create work: a decision, a disagreement that was left open, and an action with a name. Everything else is atmosphere.

- **Capture ugly, not complete** — During the meeting, write fragments: names, numbers, disagreements, and anything that sounded like a commitment. Do not ask a model to invent the meeting you failed to attend.
- **Ask for decisions, not a recap** — Prompt for three lists only: decisions, open questions, and actions with owners. If the model cannot find an owner, it must leave the line marked unknown instead of assigning someone.
- **Verify dates and names** — Models fill gaps with plausible Tuesdays and familiar teammates. Check every date and owner against your calendar and the attendee list before the note becomes the record.
- **Redact before you paste** — Customer names, salaries, health details, and access credentials do not belong in a chat. Replace them with roles or initials if the structure is what you need.

## The prompt we actually use

We ask for four headings and nothing else: Decisions, Actions, Open questions, and Claims that need a source. Under Actions, every line must have an owner and a date, or the word unknown.

We also say: do not invent attendees, do not turn a maybe into a plan, and quote the fragment from the notes if a decision is unclear. That last instruction is the one that stops the model from sounding sure.

## How false confidence shows up

A model will turn “we should look at pricing later” into “Pricing review scheduled for Friday.” It will assign the quietest person in the notes as the owner because that name appeared nearby. These are not random errors. They are the model completing a template.

Your review is therefore not literary. Scan owners, dates, and any sentence that sounds more decisive than the meeting felt. If you were not in the room, send the draft to someone who was before it becomes the official note.

## Do not paste

- Customer records, health details, or anything covered by a confidentiality agreement.
- Passwords, tokens, or private meeting links.
- Compensation, performance, or disciplinary discussion.
- A transcript you are not allowed to export from the meeting tool.

## When the notes are done

Move the confirmed actions into the tracker your team already uses. Do not leave them inside a chat thread. A chat is a drafting surface. It is a bad system of record.

If you want a reusable skeleton for this kind of structured output, the prompt patterns guide covers goals, constraints, and repair loops that transfer between models.

## Common questions

### Can AI replace a meeting note-taker?

It can turn fragments into a structured draft. Someone who was in the room still has to confirm what was actually decided.

### Should I paste a full transcript?

Only if the transcript is already allowed to leave the meeting tool and you have removed secrets. A short list of raw notes is often enough and safer.

### What if the model invents an action item?

Treat any action without a quoted source in your notes as unconfirmed. Delete it or mark it as a question. Do not publish invented work.

---

- [Guide: prompt patterns](/guides/prompt-patterns)
- [Next: keep chats useful](/blog/keep-ai-chats-useful)$body$,
  $t$散らかった議事メモを、AIで意思決定に変える$t$,
  $t$断片メモを、担当者・日付・未決の問いに変える、記録と整理の方法です。$t$,
  $body$誰も動かない要約は、きれいな言葉の山です。議事メモの成果物は、決定と担当者と日付です。

## その1時間を描写するだけのメモは失敗する

自分たちの仕事でも同じです。文字起こしを貼り、要約を頼み、どの会議にも使える丁寧な段落が返る。何が変わったか分かりません。

AIの議事メモが役立つのは、仕事を生む部分を取り出したときです。決定、残った対立、名前のついたアクション。それ以外は雰囲気です。

- **きれいに取らず、汚く取る** — 会議中は断片で書いてください。名前、数字、対立、約束に聞こえたこと。出ていない会議を、モデルに作らせないでください。
- **要約ではなく決定を聞く** — リストは3つだけです。決定、未決の問い、担当者つきのアクション。担当者が見つからなければ、誰かを当てず unknown と残させます。
- **日付と名前を確認する** — モデルはそれらしい火曜日と、よく見る同僚名で穴を埋めます。記録になる前に、カレンダーと出席者で日付と担当者を確認してください。
- **貼る前に伏せる** — 顧客名、給与、健康情報、認証情報はチャットに入れません。構造だけ必要なら、役割やイニシャルに置き換えてください。

## 実際に使っているプロンプト

見出しは4つだけです。決定、アクション、未決の問い、出典が必要な主張。アクションは担当者と日付、または unknown を必須にします。

加えて、出席者を作らない、maybe を計画にしない、決定が曖昧ならメモの断片を引用する、と書きます。最後の指示が、モデルを自信満々に見せなくします。

## 偽の自信の出方

モデルは「あとで料金を見たほうがいいかも」を「金曜に料金レビューを予定」に変えます。近くに名前があったという理由で、いちばん静かだった人を担当者にします。ランダムな誤りではありません。テンプレートを埋めているだけです。

レビューは文学ではありません。担当者、日付、会議の感触より決然としている文を見てください。その場にいなかったなら、公式メモにする前にいた人へ下書きを送ってください。

## 貼らないもの

- 顧客記録、健康情報、秘密保持契約の対象になるもの。
- パスワード、トークン、非公開の会議リンク。
- 報酬、評価、懲戒の話。
- 会議ツールから書き出してはいけない文字起こし。

## メモが終わったら

確認したアクションは、チームが既に使っているトラッカーへ移してください。チャットスレッドに残さないでください。チャットは下書き台です。正式な記録システムではありません。

この種の構造化出力の骨組みが必要なら、プロンプトの型ガイドが、目標・制約・修復ループをモデル横断で扱っています。

## よくある質問

### AIは議事録係の代わりになりますか？

断片を構造化した下書きにはできます。その場にいた人が、実際に決まったことを確認する必要があります。

### 全文の文字起こしを貼るべきですか？

会議ツールから出してよく、秘密も除いた場合だけです。生の短いメモのほうが十分なことも多く、より安全です。

### モデルがアクション項目を捏造したら？

メモに引用できる根拠がないアクションは未確認です。消すか、問いとして残してください。捏造した仕事を公開しないでください。

---

- [ガイド：プロンプトの型](/ja/guides/prompt-patterns)
- [次：チャットを使い続ける](/ja/blog/keep-ai-chats-useful)$body$,
  'Deni AI team',
  false,
  '2026-07-24 12:00:00'
)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

INSERT INTO "blog_post" ("slug", "status", "title", "description", "body", "title_ja", "description_ja", "body_ja", "author", "featured", "published_at")
VALUES (
  $t$what-ai-hallucinations-look-like$t$,
  'published',
  $t$What AI hallucinations look like at work$t$,
  $t$The workplace versions of hallucination are quieter than invented facts: fake citations, plausible APIs, and flattened disagreement.$t$,
  $body$The textbook example is a made-up fact. The workplace version is a sentence that is almost right, easy to paste, and expensive to unwind later.

## The dangerous ones do not look wild

People expect hallucination to announce itself: a city in the wrong country, a law that does not exist. Those are easy. The ones that survive review at work are local and polite.

In a multi-model workspace we see the same shapes across providers. The wording changes. The failure does not: the model fills a gap with the most typical next sentence.

- **Citations that almost exist** — A paper title, a docs URL, or a case name that looks like the real one. The first click is the review. If the source does not open, the claim is unverified, no matter how confident the sentence sounded.
- **APIs the library never shipped** — A function name that matches the house style, with arguments that feel right. This is the most expensive hallucination in engineering work because it compiles in your head.
- **Flattened disagreement** — Two options become a compromise that nobody in the room accepted. The model prefers a tidy ending. Work often needs the conflict left visible.
- **Tone that invents a relationship** — An email that thanks a customer for patience they did not show, or an apology for a bug you have not confirmed. Social hallucinations feel polite. They still create commitments.

## A work example, not a lab example

You ask for a summary of an incident. The model names a retry budget your service never had, because retry budgets appear in many postmortems. You paste the paragraph into the report. A week later someone tries to change a setting that does not exist.

Nothing in the prose looked fake. The invented part was a familiar object. That is why “does this sound right?” is a weak check. Ask “where did this object come from?” instead.

## How we force the gap into the open

We ask the model to separate facts, inferences, and guesses. If it cannot point at a source in the pasted material, the line goes in guesses. That single constraint removes a lot of false confidence.

When two models disagree, we do not pick the nicer paragraph. We extract the disputed claim and check it. Disagreement is a highlight, not a vote.

## Review the places hallucinations hide

- URLs, paper titles, issue numbers, and “according to” clauses.
- Function names, flags, and config keys that were not in the repo excerpt.
- Owners, dates, and dollar amounts.
- Apologies, promises, and timelines in outbound mail.
- Any sentence that resolves a conflict the source left open.

## What this is not

This is not an argument that AI is unusable. It is an argument that workplace hallucination is a review problem. The verification guide is the longer method. This post is the field guide to what you are looking for.

## Common questions

### Are hallucinations just lying?

No. The model is completing a pattern. It is not checking a database unless you connected one. Treat fluent text as a draft until a source or a test says otherwise.

### Does a stronger model remove hallucinations?

Stronger models reduce some sloppy errors and still invent plausible details. The review step stays. What changes is how often you need a second model to challenge the first.

### How do I catch them faster?

Ask for assumptions and unknowns. Click every citation. Run the code. Check names against the attendee list. Hallucinations hide in the parts you are tempted to skip.

---

- [Guide: verify AI answers](/guides/verify-ai-answers)
- [Next: review generated code](/blog/review-ai-generated-code)$body$,
  $t$仕事場で見るAIハルシネーション$t$,
  $t$職場のハルシネーションは、捏造された事実より静かです。偽の引用、それらしいAPI、均された対立です。$t$,
  $body$教科書の例は作られた事実です。職場の版は、ほとんど正しく、貼りやすく、あとでほどくのが高い文です。

## 危険なものは派手に見えない

人はハルシネーションが自己申告すると期待します。国を間違えた都市、存在しない法律。それは簡単です。職場のレビューを生き延びるのは、局所的で丁寧なものです。

マルチモデルの作業場では、プロバイダが違っても同じ形を見ます。言い回しは変わります。失敗は変わりません。モデルは、いちばんありふれた次の文で穴を埋めます。

- **ほとんど存在する引用** — 論文名、ドキュメントURL、判例名が本物に見えます。最初のクリックがレビューです。出典が開かなければ、文がどれほど自信満々でも未検証です。
- **ライブラリが出したことのないAPI** — 家の流儀に合う関数名と、正しそうな引数。頭の中ではコンパイルするので、エンジニアリングではいちばん高いハルシネーションです。
- **均された対立** — 2つの案が、誰も受け入れていない妥協になります。モデルはきれいな終わりを好みます。仕事は、対立を見えるまま残す必要があることが多いです。
- **関係を捏造するトーン** — 見せていない忍耐に感謝するメールや、確認していないバグへの謝罪。対人のハルシネーションは丁寧に見えます。それでも約束を作ります。

## 実験室ではなく、仕事の例

障害の要約を頼みます。モデルは、多くの事後報告に出てくるという理由で、サービスに存在しないリトライ予算を名指しします。その段落を報告書へ貼ります。1週間後、存在しない設定を誰かが変えようとします。

文章は偽物に見えません。捏造されたのは見慣れた対象です。だから「正しそうか」は弱い確認です。「この対象はどこから来たか」と聞いてください。

## 穴を表に出す方法

事実、推論、推測を分けさせます。貼った材料に出典を指せなければ、その行は推測です。その制約ひとつで、偽の自信はかなり減ります。

2つのモデルが食い違っても、きれいな段落を選びません。争点の主張を切り出して確認します。食い違いは投票ではなく、ハイライトです。

## ハルシネーションが隠れる場所を見る

- URL、論文名、課題番号、「によると」の節。
- リポジトリ抜粋になかった関数名、フラグ、設定キー。
- 担当者、日付、金額。
- 外に出すメールの謝罪、約束、期限。
- 出典が開いたままにしていた対立を、閉じる文。

## これは何ではないか

AIが使えないという主張ではありません。職場のハルシネーションはレビューの問題だという主張です。長い方法は検証ガイドです。この記事は、何を探すかの現場ガイドです。

## よくある質問

### ハルシネーションは嘘ですか？

いいえ。モデルはパターンを埋めています。接続しない限りデータベースは見ていません。出典かテストが出るまで、流暢な文は下書きとして扱ってください。

### 強いモデルならハルシネーションは消えますか？

強いモデルは雑な誤りを減らしつつ、それらしい細部はまだ作ります。レビューは残ります。変わるのは、最初の答えに2つ目のモデルで挑む頻度です。

### より速く見つけるには？

前提と未知を聞いてください。引用は全部クリック。コードは実行。名前は出席者と照合。ハルシネーションは、飛ばしたくなる場所に隠れます。

---

- [ガイド：AIの答えを検証する](/ja/guides/verify-ai-answers)
- [次：生成コードのレビュー](/ja/blog/review-ai-generated-code)$body$,
  'Deni AI team',
  false,
  '2026-07-18 12:00:00'
)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

INSERT INTO "blog_post" ("slug", "status", "title", "description", "body", "title_ja", "description_ja", "body_ja", "author", "featured", "published_at")
VALUES (
  $t$review-ai-generated-code$t$,
  'published',
  $t$How to review AI-generated code before you merge it$t$,
  $t$A review checklist for AI patches: file boundaries, tests, invented APIs, and the moment you should throw the draft away.$t$,
  $body$Fluent code is not correct code. An AI patch is a suggestion that still has to survive the same review you would give a rushed teammate.

## Review the patch, not the confidence

AI-generated code often arrives with comments, a migration plan, and a calm explanation of why the change is safe. That packaging is not evidence. The evidence is a diff you can run.

We treat generated patches the way we treat a pull request from someone who has never seen the repo: assume they guessed the boundaries, then prove otherwise.

- **Did it touch the right files?** — Ask the model to name files before it writes a patch. If the answer wanders into unrelated modules, treat the whole draft as a sketch. Scope errors are cheaper to catch than logic errors.
- **Can you run it immediately?** — If you cannot paste the change and run tests, types, or the app, you do not have a patch. You have a description of a patch. Do not review prose as if it were a diff.
- **What did it invent?** — Scan for new helpers, flags, env vars, and endpoints that were not in the excerpt you pasted. Invented APIs are the default failure mode of coding models, not a rare bug.
- **Is it faster to rewrite?** — If the draft fights the existing style, ignores tests, or requires a paragraph of cleanup per file, throw it away. Keeping a bad AI patch out of loyalty wastes more time than starting from the failing test.

## A review order that stays cheap

First, confirm the intended behavior in one sentence. If you and the model do not share that sentence, stop. Prompting for more code will only decorate the misunderstanding.

Second, look at file list and public API. A good patch is boring: it changes the smallest surface that can carry the behavior. A bad patch refactors neighbors to make the new idea fit.

Third, run the smallest check that can fail: a unit test, a typecheck, or the one screen the change affects. Reading without running is how invented helpers survive.

## Security is not a later pass

Watch for new network calls, loosened auth checks, logged secrets, and copy-pasted snippets that pull in a dependency you did not ask for. Models optimize for “it works in the story,” not for your threat model.

If the task touches auth, billing, or user data, the human review is the product. The model can propose a patch. It cannot accept the risk.

## Merge checklist

- The behavior is stated in one sentence you agree with.
- The file list is small and named before the patch.
- No new API, flag, or env var appeared without a source in the repo.
- Tests or a manual path were run, not only described.
- You would still understand the change if the chat disappeared tomorrow.

## How this fits a multi-model workspace

In Deni AI we start with a coding-capable model, then switch only if the first answer cannot explain its constraints. The workspace is for that switch. It is not a substitute for the typechecker.

If you want the broader verification method for facts and citations, not only code, use the verify-AI-answers guide. The habits are the same: name the failure, then check it outside the chat.

## Common questions

### Should I ask the model to write the tests too?

You can. Then run them. Tests generated with the same guess can share the same blind spot. Prefer a test you understand over a green suite you cannot explain.

### Is a coding model enough, or do I need a second model?

Use a coding-capable model for the first patch. Bring a second model only when the task is ambiguous or the first answer cannot name its constraints. Running two models does not replace running the code.

### When is AI code not worth reviewing?

When you cannot describe the expected behavior, or when the change is one line you already know. Review cost should not exceed the cost of writing it yourself.

---

- [Guide: verify AI answers](/guides/verify-ai-answers)
- [Next: workplace hallucinations](/blog/what-ai-hallucinations-look-like)$body$,
  $t$マージする前に、AI生成コードをレビューする方法$t$,
  $t$AIパッチのレビューリストです。ファイル境界、テスト、捏造API、下書きを捨てる瞬間。$t$,
  $body$流暢なコードは正しいコードではありません。AIパッチは提案です。急いだ同僚の変更と同じレビューを生き延びる必要があります。

## 自信ではなくパッチを見る

AI生成コードは、コメント、移行計画、安全だという落ち着いた説明つきで来ることが多いです。その包装は証拠ではありません。証拠は実行できる差分です。

生成パッチは、リポジトリを見たことがない人のプルリクエストと同じに扱います。境界は推測だと仮定し、そうでないことを証明します。

- **正しいファイルに触れましたか？** — パッチを書く前に、ファイル名を言わせてください。関係ないモジュールへ迷うなら、下書き全体をスケッチとして扱います。範囲の誤りは、論理の誤りより安く見つかります。
- **すぐ実行できますか？** — 変更を貼ってテスト、型、アプリを回せないなら、パッチではありません。パッチの説明です。文章を差分のようにレビューしないでください。
- **何を捏造しましたか？** — 貼った抜粋にない新しいヘルパー、フラグ、環境変数、エンドポイントを見てください。捏造APIはコーディングモデルの既定の失敗であり、珍しいバグではありません。
- **書き直したほうが速いですか？** — 下書きが既存の流儀と争い、テストを無視し、ファイルごとに一段落の掃除が要るなら捨ててください。悪いAIパッチへの忠誠は、失敗するテストから始めるより時間がかかります。

## 安く済むレビューの順番

まず、意図する振る舞いを一文で確認します。モデルとその一文を共有できなければ止めてください。さらにコードを頼むと、誤解が装飾されるだけです。

次にファイル一覧と公開API。良いパッチは退屈です。振る舞いを載せられる最小面だけ変えます。悪いパッチは、新しい考えを入れるために隣をリファクタします。

3番目に、失敗しうる最小の確認を走らせます。単体テスト、型検査、その変更が触る画面。読んだだけで走らせないことが、捏造ヘルパーを生き延びさせます。

## セキュリティは後回しではない

新しいネットワーク呼び出し、緩んだ認証、ログに出る秘密、頼んでいない依存を引く貼り付けに注意してください。モデルは「話の中では動く」を最適化します。あなたの脅威モデルではありません。

認証、課金、ユーザーデータに触れるなら、人のレビューが製品です。モデルはパッチを提案できます。リスクは引き受けられません。

## マージ前の確認

- 振る舞いは、合意できる一文になっている。
- ファイル一覧は小さく、パッチの前に名前がある。
- リポジトリに根拠のない新しいAPI、フラグ、環境変数が増えていない。
- テストか手動の経路を、説明だけでなく実行した。
- 明日チャットが消えても、変更を理解できる。

## マルチモデルの作業場との関係

Deni AIではコーディング向きのモデルから始め、最初の答えが制約を説明できないときだけ切り替えます。ワークスペースはその切り替えのためです。型検査の代わりではありません。

コードだけでなく事実や引用の検証方法が必要なら、AIの答えを検証するガイドを使ってください。習慣は同じです。失敗を名指しし、チャットの外で確認する。

## よくある質問

### テストもモデルに書かせるべきですか？

書けます。そのあと実行してください。同じ推測で作ったテストは、同じ死角を共有します。説明できない緑より、理解できるテストを優先してください。

### コーディングモデルだけで足りますか？2つ目が要りますか？

最初のパッチはコーディング向きのモデル。タスクが曖昧、または最初の答えが制約を言えないときだけ2つ目を使います。2モデルを走らせても、コード実行の代わりにはなりません。

### AIコードをレビューする価値がないのはいつですか？

期待する振る舞いを言えないとき、またはすでに知っている1行の変更のときです。レビューコストが、自分で書くコストを超えてはいけません。

---

- [ガイド：AIの答えを検証する](/ja/guides/verify-ai-answers)
- [次：職場のハルシネーション](/ja/blog/what-ai-hallucinations-look-like)$body$,
  'Deni AI team',
  false,
  '2026-07-10 12:00:00'
)
ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint

INSERT INTO "blog_post" ("slug", "status", "title", "description", "body", "title_ja", "description_ja", "body_ja", "author", "featured", "published_at")
VALUES (
  $t$keep-ai-chats-useful$t$,
  'published',
  $t$How to keep AI chats useful after the first week$t$,
  $t$Chat history becomes landfill unless you treat threads as tasks. A simple system for titles, handoffs, and starting over.$t$,
  $body$The first chat feels magical. The twentieth is a scroll of half-finished tasks. Usefulness after week one is an organization problem, not a model problem.

## Week one is not the product

Most people judge an AI workspace by the first answer. They should judge it by whether last Tuesday’s work is still findable. That is the point where chat tools start to feel like email: full, and somehow empty.

We designed Deni AI around switching models in one place. That only stays useful if the thread still represents a single job after you switch. Otherwise the history is just a more expensive notepad.

- **One job per thread** — Name the outcome in the title before you type the first prompt: “Rewrite pricing FAQ” or “Failing login test.” If the job changes, start a new thread. Mixed threads cannot be searched later.
- **Park the result outside the chat** — When a draft is good enough, move it to the doc, ticket, or repo that actually owns the work. A chat is a workbench. It is a bad filing cabinet.
- **Restart when the model is arguing with old context** — Long threads accumulate stale constraints. If you keep correcting the same assumption, copy the current goal into a new chat. That is cheaper than fighting a ghost requirement from message four.
- **Delete or archive the landfill** — Exploratory chats that went nowhere still clutter the list. Archive them. The cost of keeping every experiment is that you cannot find the one thread you will need on Friday.

## A title is a retrieval tool

Write the title as if you will search for it in two weeks while slightly annoyed. Include the object: the page, the function, the customer segment, the language pair. Do not include how you feel about the task.

If the workspace can store a project, use it as a shelf, not as one giant conversation. The project holds related threads. Each thread should still stand alone if the others disappear.

## What to save, what to throw away

Save the final draft, the decision, and the prompt that actually worked. Throw away the five failed tones and the tangent about lunch. Those messages train you to reread noise.

If a prompt is reusable, put the skeleton in a note you control. Do not rely on finding it in chat search. Prompt patterns belong in a short personal library: goal, constraints, output shape, repair step.

## Weekly cleanup

- Rename any thread still called “New chat.”
- Move finished drafts out of the workspace into the real system of record.
- Start a new thread for any job that changed direction mid-conversation.
- Archive experiments you will not reopen.

## When the chat is no longer the right surface

If the work is now a checklist, a spec, or a pull request, leave the chat. Continuing to prompt after the artifact exists is how people lose the source of truth. The model can still help later, in a new thread, against the current artifact.

## Common questions

### Should I keep one long chat for a whole project?

No. Keep a project folder if your workspace has one, and give each task its own thread. A project is a container. A thread is a job.

### How do I hand a chat to a teammate?

Do not forward a 40-message scroll. Paste the goal, the current draft, and the open questions into a new thread or a ticket. Handoffs need a summary, not a transcript.

### Is search enough to organize chats?

Search helps only if titles and first messages contain the real nouns: the feature, the customer, the file. “Help with this” is unsearchable forever.

---

- [Guide: multi-model workflows](/guides/multi-model-workflows)
- [Next: meeting notes](/blog/ai-meeting-notes)$body$,
  $t$最初の1週間のあと、AIチャットを使い続ける方法$t$,
  $t$スレッドをタスクとして扱わないと、履歴は埋め立て地になります。タイトル、引き継ぎ、やり直しの簡単な仕組みです。$t$,
  $body$最初のチャットは魔法のようです。20個目は未完了タスクのスクロールです。1週間後の有用さは、モデルの問題ではなく整理の問題です。

## 最初の1週間は製品ではない

多くの人は最初の答えでワークスペースを評価します。評価すべきは、火曜の仕事がまだ見つかるかどうかです。そこでチャットはメールに似てきます。いっぱいなのに、空っぽです。

Deni AIは、一つの場所でモデルを切り替える前提で設計しています。切り替えたあともスレッドが一つの仕事を表しているときだけ、それが役に立ちます。そうでなければ履歴は、高いメモ帳です。

- **スレッドは仕事ひとつ** — 最初のプロンプトの前に、タイトルへ成果を書いてください。「料金FAQの書き直し」や「失敗するログインテスト」。仕事が変わったら新しいスレッド。混ざったスレッドは後から探せません。
- **成果はチャットの外に置く** — 下書きが十分なら、仕事の本体であるドキュメント、チケット、リポジトリへ移してください。チャットは作業台です。書庫には向きません。
- **古い文脈とモデルが争ったらやり直す** — 長いスレッドには古い制約が溜まります。同じ前提を直し続けるなら、今の目標を新しいチャットへコピーしてください。4通目の幽霊要件と争うより安いです。
- **埋め立て地は消すかアーカイブする** — 行き止まりの探索チャットも一覧を汚します。アーカイブしてください。実験を全部残すコストは、金曜に必要な一本が見つからなくなることです。

## タイトルは検索の道具

2週間後、少し苛立った自分が見つけるつもりで書いてください。対象を入れてください。ページ、関数、顧客セグメント、言語ペア。気持ちは入れないでください。

プロジェクトを保存できるなら、巨大な会話ではなく棚として使ってください。プロジェクトは関連スレッドを持ちます。他が消えても、各スレッドは自立しているべきです。

## 残すもの、捨てるもの

最終稿、決定、実際に効いたプロンプトは残します。失敗した5つのトーンと昼食の脱線は捨てます。そういうメッセージは、ノイズを読み返す癖を作ります。

使い回せるプロンプトは、自分で握れるメモへ骨組みを置いてください。チャット検索に頼らないでください。プロンプトの型は短い個人ライブラリです。目標、制約、出力の形、修復の一歩。

## 週次の掃除

- まだ「New chat」のスレッドは改名する。
- 終わった下書きは、本物の記録システムへ出す。
- 途中で方向が変わった仕事は、新しいスレッドを始める。
- 再開しない実験はアーカイブする。

## チャットがもう正しい面ではないとき

仕事がチェックリスト、仕様、プルリクエストになったら、チャットを離れてください。成果物があるのにプロンプトを続けると、正本を失います。モデルはあとから、新しいスレッドで、今の成果物に対して助けられます。

## よくある質問

### プロジェクト全体を1本の長いチャットにすべきですか？

いいえ。ワークスペースにプロジェクトがあれば棚として使い、タスクごとにスレッドを分けてください。プロジェクトは入れ物です。スレッドは仕事です。

### チャットを同僚に渡すには？

40通のスクロールを転送しないでください。目標、今の下書き、未決の問いを新しいスレッドかチケットへ貼ります。引き継ぎに必要なのは要約であり、文字起こしではありません。

### 検索だけでチャットは整理できますか？

タイトルと最初のメッセージに、機能、顧客、ファイルなど本物の名詞があるときだけ役立ちます。「これ手伝って」は、永遠に検索できません。

---

- [ガイド：マルチモデルの進め方](/ja/guides/multi-model-workflows)
- [次：議事メモ](/ja/blog/ai-meeting-notes)$body$,
  'Deni AI team',
  false,
  '2026-06-12 12:00:00'
)
ON CONFLICT ("slug") DO NOTHING;
