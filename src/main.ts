import { Plugin } from "obsidian";
import { registerQuizProcessor, startNewAttempt } from "./quiz-processor";

export default class ObsidiQuizPlugin extends Plugin {
    async onload() {
        registerQuizProcessor(this);
        this.addCommand({
            id: "start-new-quiz-attempt",
            name: "Start new quiz attempt in note",
            editorCallback: () => { void startNewAttempt(this.app); },
        });
    }
}
