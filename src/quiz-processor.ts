import { App, MarkdownRenderer, MarkdownPostProcessorContext, MarkdownView, Notice, Plugin, TFile } from "obsidian";

interface SectionInfo {
    lineStart: number;
    lineEnd: number;
    text: string;
}

type OptionState = " " | "x";

interface QuizOption {
    state: OptionState;
    letter: string;
    text: string;
    lineIndex: number;
}

interface ParsedQuiz {
    questionNumber: string;
    question: string;
    options: QuizOption[];
    details?: string;
}

interface ParseError {
    message: string;
}

type ParseResult = { quiz: ParsedQuiz } | { error: ParseError };

const OPTION_RE = /^\[([ x])\] ([A-Z])\. (.*)$/; // Lettered options
const FENCE_RE = /^```+\s*quiz\s+#(\d+)\s*$/;

function letterForIndex(i: number): string {
    return String.fromCharCode(65 + i); 
}

function parseQuestionNumber(sec: SectionInfo | null): string | null {
    if (!sec) return null;
    const fenceLine = sec.text.split("\n")[sec.lineStart] ?? "";
    const match = FENCE_RE.exec(fenceLine.trim());
    return match ? (match[1] ?? null) : null;
}

function parseQuiz(source: string, questionNumber: string): ParseResult {
    const lines = source.split("\n");
    const questionLines: string[] = [];
    const options: QuizOption[] = [];
    let firstOptionFound = false;
    let expectedLetterIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) continue;

        const match = OPTION_RE.exec(line);
        const looksLikeOption = /^\[[ x]\] /.test(line);

        if (match) {
            firstOptionFound = true;
            const letter = match[2] ?? "";
            const expected = letterForIndex(expectedLetterIndex);
            if (letter !== expected) {
                return {
                    error: {
                        message: `Options must be lettered sequentially (A, B, C…). Expected "${expected}." but found "${letter}." in: ${line}`,
                    },
                };
            }
            options.push({
                state: (match[1] as OptionState),
                letter,
                text: match[3] ?? "",
                lineIndex: i,
            });
            expectedLetterIndex++;
        } else if (looksLikeOption) {
            return {
                error: {
                    message: `Options must be lettered, e.g. "[ ] A. text". Found: ${line}`,
                },
            };
        } else if (!firstOptionFound) {
            questionLines.push(line);
        }
    }

    if (options.length === 0) {
        return { error: { message: 'No lettered options found. Write options as "[ ] A. text".' } };
    }

    let qStart = 0;
    while (qStart < questionLines.length && questionLines[qStart]?.trim() === "") qStart++;
    let qEnd = questionLines.length - 1;
    while (qEnd >= qStart && questionLines[qEnd]?.trim() === "") qEnd--;
    const question = qStart <= qEnd ? questionLines.slice(qStart, qEnd + 1).join("\n") : "";

    const lastOptionIndex = Math.max(...options.map(o => o.lineIndex));
    const afterLines = lines.slice(lastOptionIndex + 1);
    let start = 0;
    while (start < afterLines.length && afterLines[start]?.trim() === "") start++;
    let end = afterLines.length - 1;
    while (end >= start && afterLines[end]?.trim() === "") end--;
    const details = start <= end ? afterLines.slice(start, end + 1).join("\n") : undefined;

    return { quiz: { questionNumber, question, options, details } };
}

function stateToClass(state: OptionState): string {
    switch (state) {
        case " ": return "quiz-option--unselected";
        case "x": return "quiz-option--chosen";
    }
}

function renderError(el: HTMLElement, message: string): void {
    el.empty();
    const block = el.createDiv({ cls: "quiz-block quiz-block--error" });
    block.createDiv({ cls: "quiz-error--title", text: "quizblock error" });
    block.createDiv({ cls: "quiz-error--message", text: message });
}

function renderQuiz(el: HTMLElement, quiz: ParsedQuiz, isInteractive: boolean): void {
    el.empty();

    const block = el.createDiv({
        cls: isInteractive ? "quiz-block" : "quiz-block quiz-block--readonly",
    });

    block.createDiv({ cls: "quiz-number", text: `Question ${quiz.questionNumber}` });

    const isSingleLine = !quiz.question.includes("\n");
    block.createDiv({ cls: isSingleLine ? "quiz-question quiz-question--single" : "quiz-question" });

    const optionsEl = block.createDiv({ cls: "quiz-options" });
    for (const option of quiz.options) {
        const cls = ["quiz-option", stateToClass(option.state)].join(" ");
        const optEl = optionsEl.createDiv({ cls });
        optEl.dataset["lineIndex"] = String(option.lineIndex);

        const markerText = `[${option.state}]`;
        optEl.createSpan({ cls: "quiz-option__marker", text: markerText });
        optEl.createSpan({ cls: "quiz-option__text", text: ` ${option.letter}. ${option.text}` });
    }

    if (quiz.details !== undefined) {
        const toggle = block.createDiv({ cls: "quiz-details-toggle" });
        const arrow = toggle.createSpan({ cls: "quiz-details-toggle__arrow", text: "▸" });
        const label = toggle.createSpan({ cls: "quiz-details-toggle__label", text: "Show explanation" });

        const details = block.createDiv({ cls: "quiz-details" });

        toggle.addEventListener("click", () => {
            const visible = details.classList.toggle("quiz-details--visible");
            arrow.setText(visible ? "▾" : "▸");
            label.setText(visible ? "Hide explanation" : "Show explanation");
        });
    }
}

// Frontmatter attempt #
function attemptFromValue(raw: unknown): number {
    let n: number;
    if (typeof raw === "number") n = raw;
    else if (typeof raw === "string") n = parseInt(raw, 10);
    else n = NaN;
    return Number.isFinite(n) && n >= 1 ? n : 1;
}

// Current frontmatter attempt #
function currentAttempt(app: App, file: TFile): number {
    const fm: Record<string, unknown> | undefined = app.metadataCache.getFileCache(file)?.frontmatter;
    return attemptFromValue(fm?.["quiz_attempt"]);
}

function inlineDataviewFieldsRegEx(questionNumber: string, attempt: number): RegExp {
    return new RegExp(
        `^- \\[Attempt:: ${attempt}\\] \\[Question:: ${questionNumber}\\] \\[Answer:: [A-Z]?\\] \\[Result:: [^\\]]*\\]\\s*$`
    );
}

function inlineDataviewFieldLine(questionNumber: string, attempt: number, answer: string): string {
    return `- [Attempt:: ${attempt}] [Question:: ${questionNumber}] [Answer:: ${answer}] [Result:: ]`;
}


// Insert or update inline dataview fields
function upsertInlineField(
    editor: MarkdownView["editor"],
    sec: SectionInfo,
    quiz: ParsedQuiz,
    attempt: number,
    answer: string
): void {
    const lineText = inlineDataviewFieldLine(quiz.questionNumber, attempt, answer);
    const re = inlineDataviewFieldsRegEx(quiz.questionNumber, attempt);
    const lineCount = editor.lineCount();

    let closingFence = -1;
    for (let i = sec.lineStart + 1; i < lineCount; i++) {
        if (/^```+\s*$/.test(editor.getLine(i))) {
            closingFence = i;
            break;
        }
    }
    if (closingFence === -1) return;

    const searchStart = closingFence + 1;
    for (let i = searchStart; i < lineCount; i++) {
        const line = editor.getLine(i);
        if (re.test(line)) {
            editor.setLine(i, lineText);
            return;
        }
        if (line.trim() !== "" && !/^- \[Attempt:: /.test(line)) break;
    }

    // None found
    editor.replaceRange(`${lineText}\n`, { line: searchStart, ch: 0 });
}

function attachClickHandlers(
    el: HTMLElement,
    quiz: ParsedQuiz,
    ctx: MarkdownPostProcessorContext,
    app: App
): void {
    el.querySelectorAll<HTMLElement>(".quiz-option").forEach((optEl) => {
        optEl.addEventListener("click", () => {
            const view = app.workspace.getActiveViewOfType(MarkdownView);
            if (!view || view.getMode() === "preview") {
                new Notice("Switch to editing mode to interact with this quiz.");
                return;
            }
            
            const sec = ctx.getSectionInfo(el);
            if (!sec) return;
            const file = view.file;
            if (!file) return;

            const lineIndexStr = optEl.dataset["lineIndex"];
            if (lineIndexStr === undefined) return;

            const lineIndex = parseInt(lineIndexStr, 10);
            const option = quiz.options.find((o) => o.lineIndex === lineIndex);
            if (!option) return;

            const editor = view.editor;
            const attempt = currentAttempt(app, file);

            // setLine() triggers a re-render that destroys the focused element,
            // causing CodeMirror to scroll to the cursor. Save and restore position.
            const scroller = view.containerEl.querySelector<HTMLElement>(".cm-scroller");
            const savedScrollTop = scroller?.scrollTop ?? 0;

            const wasChosen = option.state === "x";
            const newState: OptionState = wasChosen ? " " : "x";

            const findOptionLine = (o: QuizOption): number => {
                for (let i = sec.lineStart; i <= sec.lineEnd; i++) {
                    const m = OPTION_RE.exec(editor.getLine(i));
                    if (m && m[2] === o.letter && (m[3] ?? "") === o.text) return i;
                }
                return -1;
            };

            if (newState === "x") {
                for (const other of quiz.options) {
                    if (other.lineIndex === lineIndex) continue;
                    if (other.state === "x") {
                        const ln = findOptionLine(other);
                        if (ln !== -1) editor.setLine(ln, `[ ] ${other.letter}. ${other.text}`);
                        other.state = " ";
                    }
                }
            }

            const targetLine = findOptionLine(option);
            if (targetLine === -1) return;
            editor.setLine(targetLine, `[${newState}] ${option.letter}. ${option.text}`);
            option.state = newState;

            //Update line
            upsertInlineField(editor, sec, quiz, attempt, newState === "x" ? option.letter : "");

            if (scroller) {
                requestAnimationFrame(() => {
                    scroller.scrollTop = savedScrollTop;
                });
            }
        });
    });
}

// New quiz attempt
export async function startNewAttempt(app: App): Promise<void> {
    const view = app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.getMode() === "preview") return;
    const file = view.file;
    if (!file) return;

    const editor = view.editor;
    const lineCount = editor.lineCount();
    let inQuizBlock = false;
    const changes: { line: number; text: string }[] = [];

    for (let i = 0; i < lineCount; i++) {
        const line = editor.getLine(i);
        if (!inQuizBlock && /^```+\s*quiz\s+#\d+\s*$/.test(line)) {
            inQuizBlock = true;
            continue;
        }
        if (inQuizBlock && /^```+\s*$/.test(line)) {
            inQuizBlock = false;
            continue;
        }
        if (inQuizBlock && line.startsWith("[x] ")) {
            changes.push({ line: i, text: "[ ] " + line.slice(4) });
        }
    }

    if (changes.length > 0) {
        editor.transaction({
            changes: changes.map(({ line, text }) => ({
                from: { line, ch: 0 },
                to: { line, ch: editor.getLine(line).length },
                text,
            })),
        });
    }

    await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
        fm["quiz_attempt"] = attemptFromValue(fm["quiz_attempt"]) + 1;
    });

    new Notice("Started a new quiz attempt.");
}

export function registerQuizProcessor(plugin: Plugin): void {
    plugin.registerMarkdownCodeBlockProcessor("quiz", async (source, el, ctx: MarkdownPostProcessorContext) => {
        const sec = ctx.getSectionInfo(el);

        const questionNumber = parseQuestionNumber(sec);
        if (questionNumber === null) {
            renderError(el, "Add a question number to the fence, e.g. ```quiz #1");
            return;
        }

        const result = parseQuiz(source, questionNumber);
        if ("error" in result) {
            renderError(el, result.error.message);
            return;
        }
        const quiz = result.quiz;

        renderQuiz(el, quiz, sec !== null);

        const questionEl = el.querySelector<HTMLElement>(".quiz-question");
        if (questionEl) {
            await MarkdownRenderer.render(plugin.app, quiz.question, questionEl, ctx.sourcePath, plugin);
        }

        if (quiz.details !== undefined) {
            const detailsEl = el.querySelector<HTMLElement>(".quiz-details");
            if (detailsEl) {
                await MarkdownRenderer.render(plugin.app, quiz.details, detailsEl, ctx.sourcePath, plugin);
            }
        }

        attachClickHandlers(el, quiz, ctx, plugin.app);
    });
}
