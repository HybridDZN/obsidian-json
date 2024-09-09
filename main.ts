import {
	App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	WorkspaceLeaf,
	ItemView, // Ensure this import is present
} from "obsidian";

// Define plugin settings
interface MyPluginSettings {
	filePath: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	filePath: "",
};

const VIEW_TYPE_JSON_EDITOR = "json-editor-view";

export default class JsonEditorPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// Register the custom view
		this.registerView(VIEW_TYPE_JSON_EDITOR, (leaf: WorkspaceLeaf) => {
			const view = new JsonEditorView(leaf, this);
			return view;
		});

		// Add ribbon icon to trigger the JSON editor
		this.addRibbonIcon("file", "Open JSON Editor", async () => {
			this.activateView();
		});

		// Add setting tab for plugin configuration (if needed later)
		this.addSettingTab(new JsonEditorSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_JSON_EDITOR);
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_JSON_EDITOR);

		await this.app.workspace.getLeaf(true).setViewState({
			type: VIEW_TYPE_JSON_EDITOR,
			active: true,
		});

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(VIEW_TYPE_JSON_EDITOR)[0]
		);
	}
}

// Custom view for JSON editing
class JsonEditorView extends ItemView {
	plugin: JsonEditorPlugin;
	jsonData: unknown = null;
	filePath = "";

	constructor(leaf: WorkspaceLeaf, plugin: JsonEditorPlugin) {
		super(leaf); // Ensure this calls the parent constructor
		this.plugin = plugin;
	}

	getViewType() {
		return VIEW_TYPE_JSON_EDITOR;
	}

	getDisplayText() {
		return "JSON Editor";
	}

	async onOpen() {
		const { contentEl } = this;

		// Add button to load JSON file
		const fileButton = contentEl.createEl("button", {
			text: "Open JSON File",
		});
		fileButton.onclick = async () => {
			// Define a type for the window object
			interface WindowWithFilePicker extends Window {
				showOpenFilePicker: () => Promise<FileSystemFileHandle[]>;
			}

			// Check if showOpenFilePicker is supported
			if (!("showOpenFilePicker" in window)) {
				new Notice("File picker not supported in this browser.");
				return;
			}

			// Use window.showOpenFilePicker for file selection
			const fileHandle = await (
				window as unknown as WindowWithFilePicker
			).showOpenFilePicker();
			if (fileHandle && fileHandle.length > 0) {
				const file = await fileHandle[0].getFile();
				this.filePath = file.name;
				const fileContent = await file.text();
				try {
					this.jsonData = JSON.parse(fileContent);
					new Notice("File loaded successfully!");
					this.displayEditor();
				} catch (e) {
					new Notice("Invalid JSON file.");
				}
			}
		};
	}

	displayEditor() {
		const { contentEl } = this;
		contentEl.empty();

		// Function to create collapsible fields for JSON values
		const createFields = (
			data: Record<string, unknown>,
			parentEl: HTMLElement
		) => {
			// Sort keys alphabetically
			const sortedKeys = Object.keys(data).sort();

			sortedKeys.forEach((key) => {
				const value = data[key];
				if (typeof value === "object" && value !== null) {
					const details = parentEl.createEl("details");
					const summary = details.createEl("summary", { text: key });
					createFields(value as Record<string, unknown>, details);
				} else {
					new Setting(parentEl).setName(key).addText((text) =>
						text.setValue(String(value)).onChange((newValue) => {
							data[key] = newValue;
						})
					);
				}
			});
		};

		// Create fields for the JSON data
		if (this.jsonData && typeof this.jsonData === "object") {
			createFields(this.jsonData as Record<string, unknown>, contentEl);
			new Notice("JSON data displayed successfully!");
		} else {
			new Notice("No valid JSON data to display.");
		}

		// Add Save button with confirmation
		const saveButton = contentEl.createEl("button", {
			text: "Save Changes",
		});
		saveButton.onclick = async () => {
			const confirmSave = confirm(
				"Are you sure you wish to save changes?"
			);
			if (confirmSave) {
				try {
					// Define a type for the window object
					interface WindowWithSaveFilePicker extends Window {
						showSaveFilePicker: (
							options: SaveFilePickerOptions
						) => Promise<FileSystemFileHandle>;
					}

					// Check if showSaveFilePicker is supported
					if (!("showSaveFilePicker" in window)) {
						new Notice(
							"Save file picker not supported in this browser."
						);
						return;
					}

					// Prompt the user to choose where to save the file
					const newFileHandle = await (
						window as unknown as WindowWithSaveFilePicker
					).showSaveFilePicker({
						suggestedName: this.filePath,
						types: [
							{
								description: "JSON Files",
								accept: { "application/json": [".json"] },
							},
						],
					});

					// Create a writable stream and write the updated JSON data to the file
					const writable = await newFileHandle.createWritable();
					await writable.write(
						new Blob([JSON.stringify(this.jsonData, null, 2)], {
							type: "application/json",
						})
					);
					await writable.close();
					new Notice("File saved successfully!");
				} catch (e) {
					console.error("Error saving file:", e);
					new Notice("Failed to save the file.");
				}
			}
		};
	}

	async onClose(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
	}
}

// Plugin settings tab (optional for later)
class JsonEditorSettingTab extends PluginSettingTab {
	plugin: JsonEditorPlugin;

	constructor(app: App, plugin: JsonEditorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Default JSON File Path")
			.setDesc("Set the default path for JSON files")
			.addText((text) =>
				text
					.setPlaceholder("Enter the file path")
					.setValue(this.plugin.settings.filePath)
					.onChange(async (value) => {
						this.plugin.settings.filePath = value;
						await this.plugin.saveSettings();
					})
			);
	}
}

interface SaveFilePickerOptions {
	suggestedName?: string;
	types?: Array<{
		description: string;
		accept: Record<string, string[]>;
	}>;
}
