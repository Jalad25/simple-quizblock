> [!important]
> Fork of quizblock by Oliver Cheng. See [LICENSE](LICENSE).

# Simple Quizblock

As the name implies: a simple quiz block format to help create interactive multiple-choice quizzes in your Obsidian notes. quizblock is intentionally lightweight and adds just two things:
- A `quiz` fenced code block to specify each multiple-choice question
- A "Start new quiz attempt in note" command

The widget is minimal but interactive. The format is plain Markdown, so it is easy to write by hand.

This fork records each answer as a [Dataview](https://github.com/blacksmithgu/obsidian-dataview) inline field rather than marking correctness inside the block, so you can query and grade your attempts across your whole vault.



## Installation

1. Download `main.js`, `manifest.json`, and `styles.css`.
2. Create a folder called `simple-quizblock` in your vault's `.obsidian/plugins/` directory.
3. Place the files inside.
4. Open Obsidian, go to Settings → Community plugins, and enable Simple Quizblock.

## How to use
Here is a quiz block:
<pre>
```quiz #1
What is 1 + 1?
[ ] A. 1
[ ] B. 2
[ ] C. 3
[ ] D. 4

This is an explanation. It supports Markdown:
- ==Highlights==, **bold**, and lists all work
```
</pre>

You can preview this block in Live Preview or Reading mode. In Live Preview mode you can answer it interactively. Click an option to select it. Selecting an option writes an `x` into that option's marker (`[x]`) and persists straight into the Markdown text, so your progress is saved in the file. Selecting a different option updates the choice. Only one option can be selected at a time.

If the block has an explanation (any text after the options, separated by a blank line), a collapsible **Show explanation** toggle appears below the options.

## Format
The anatomy of a quiz block is:
<pre>
```quiz #1
Question stem prompt
[ ] A. Answer A
[ ] B. Answer B
[ ] C. Answer C
[ ] D. Answer D

Explanation, in Markdown, supports Obsidian's Markdown features
```
</pre>

Rules enforced by the plugin:

- **The fence must carry a question number**, e.g. ` ```quiz #1 `. A bare ` ```quiz ` fence renders an error. The number identifies the question when recording answers.
- **The first lines, up to the first option, are the question.** A single-line question is typical; a multi-line question is supported and renders as Markdown.
- **Options use the marker `[ ]` (unselected) or `[x]` (selected), followed by a sequential capital letter and a period**: `A.`, `B.`, `C.`, … in order. A misordered or mislettered option renders an error.
- **The explanation is optional.** Put it after the options, separated by one blank line. It supports Markdown and can span multiple lines.

Unlike the upstream plugin, **the block itself does not encode which answer is correct**! There are no `[c]`/`[w]`/`[r]` markers. The `[x]` marker only records the answer the user selected. Grading is done separately.

## Recording and grading answers
When you select an option, the plugin writes (or updates) a Dataview inline-field line directly beneath the block:

```
- [Attempt:: 1] [Question:: 1] [Answer:: C] [Result:: ]
```

- `Attempt` — the current attempt number (see below).
- `Question` — the number from the fence (` ```quiz #1 `).
- `Answer` — the letter of the selected option (blank if you deselect).
- `Result` — left blank by the plugin. This is where *you* record whether the answer was correct.

Because answers live in inline fields, you can grade and review attempts with Dataview queries across a note or your whole vault, rather than the plugin tracking correctness for you.

### Attempts
The current attempt number is stored in the note's frontmatter under `quiz_attempt` (default `1`). The **"Start new quiz attempt in note"** command:

- increments `quiz_attempt`, and
- clears every selected option (`[x]` → `[ ]`) in the note's quiz blocks.

Previously recorded inline-field lines are left untouched, so each attempt's answers accumulate as separate `[Attempt:: N]` lines. To start over cleanly, run the command, then remove the old inline-field lines manually.

## Motivation
I just wanted a way to record the quizzes I'm taking for an online course. That's it.

## Credits

Originally created by [Oliver Cheng](https://github.com/olliecheng). This fork changes how the code block records answers (via Dataview inline fields), keeping the original's styling and interactive rendering.
