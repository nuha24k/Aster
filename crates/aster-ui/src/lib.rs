use aster_core::logs::{LogLevel, LogStore};
use aster_core::{Command, LayoutNode, SplitDirection, SurfaceId, SurfaceKind, Workspace, WorkspaceId, WorkspaceMetadata};
use aster_editor::{EditorTab, FileExplorer, FileItem};
use aster_git::{GitService, GitStatus};
use aster_terminal::TerminalSession;
use egui::{CentralPanel, Color32, Context, RichText, SidePanel, TextEdit, TopBottomPanel, Ui};
use std::collections::HashMap;
use std::path::PathBuf;

pub struct AsterApp {
    pub workspaces: Vec<Workspace>,
    pub active_workspace_id: Option<WorkspaceId>,
    pub active_surface_kind: SurfaceKind,
    pub sidebar_open: bool,
    pub active_surface_id: Option<SurfaceId>,
    pub terminals: HashMap<String, TerminalSession>,
    pub pending_commands: Vec<Command>,

    // Git, Logs, Command Palette state
    pub git_status: Option<GitStatus>,
    pub git_commit_message: String,
    pub selected_diff: Option<String>,
    pub log_store: LogStore,

    // Editor state
    pub editor_tabs: Vec<EditorTab>,
    pub active_tab_index: Option<usize>,
    pub file_tree: Vec<FileItem>,
    pub editor_search_query: String,

    // Agent Intelligence state
    pub agent_manager: aster_core::agents::AgentManager,
    pub agent_prompt_input: String,

    // Palette & Quick Open state
    pub command_palette_open: bool,
    pub command_palette_query: String,
    pub quick_open_open: bool,
    pub quick_open_query: String,
}

impl AsterApp {
    pub fn new() -> Self {
        let default_ws_id = WorkspaceId("ws_default".into());
        let default_surface = SurfaceId("term_main".into());
        let root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));

        let log_store = LogStore::new();
        log_store.push("System", LogLevel::Info, "ASTER workspace initialized.");

        let file_tree = FileExplorer::list_dir(&root).unwrap_or_default();

        let mut app = Self {
            workspaces: vec![Workspace {
                id: default_ws_id.clone(),
                name: "Aster Project".into(),
                root_path: root.clone(),
                layout: LayoutNode::Surface(default_surface.clone()),
                metadata: WorkspaceMetadata::default(),
            }],
            active_workspace_id: Some(default_ws_id),
            active_surface_kind: SurfaceKind::Terminal,
            sidebar_open: true,
            active_surface_id: Some(default_surface.clone()),
            terminals: HashMap::new(),
            pending_commands: Vec::new(),

            git_status: None,
            git_commit_message: String::new(),
            selected_diff: None,
            log_store,

            editor_tabs: Vec::new(),
            active_tab_index: None,
            file_tree,
            editor_search_query: String::new(),

            agent_manager: aster_core::agents::AgentManager::new(),
            agent_prompt_input: String::new(),

            command_palette_open: false,
            command_palette_query: String::new(),
            quick_open_open: false,
            quick_open_query: String::new(),
        };

        if let Ok(term) = TerminalSession::new(default_surface.0.clone(), root.clone(), 80, 24) {
            app.terminals.insert(default_surface.0, term);
        }

        app.refresh_git();
        app
    }

    pub fn refresh_git(&mut self) {
        let root_path = self.active_workspace().map(|w| w.root_path.clone());
        if let Some(root) = root_path {
            match GitService::get_status(&root) {
                Ok(status) => self.git_status = Some(status),
                Err(e) => {
                    self.log_store.push("Git", LogLevel::Warn, format!("Failed to read git status: {}", e));
                    self.git_status = None;
                }
            }
            self.file_tree = FileExplorer::list_dir(&root).unwrap_or_default();
        }
    }

    pub fn handle_keyboard_shortcuts(&mut self, ctx: &Context) {
        ctx.input(|i| {
            if i.modifiers.command || i.modifiers.ctrl {
                if i.key_pressed(egui::Key::P) {
                    if i.modifiers.shift {
                        self.command_palette_open = !self.command_palette_open;
                    } else {
                        self.quick_open_open = !self.quick_open_open;
                    }
                } else if i.key_pressed(egui::Key::S) {
                    if let Some(idx) = self.active_tab_index
                        && let Some(tab) = self.editor_tabs.get_mut(idx)
                        && tab.save().is_ok()
                    {
                        self.log_store.push("Editor", LogLevel::Info, format!("Saved file {}", tab.name));
                    }
                } else if i.key_pressed(egui::Key::Z) {
                    if let Some(idx) = self.active_tab_index
                        && let Some(tab) = self.editor_tabs.get_mut(idx)
                    {
                        if i.modifiers.shift {
                            tab.redo();
                        } else {
                            tab.undo();
                        }
                    }
                } else if i.key_pressed(egui::Key::T) {
                    self.pending_commands.push(Command::NewTerminal);
                } else if i.key_pressed(egui::Key::B) {
                    self.pending_commands.push(Command::ToggleSidebar);
                } else if i.key_pressed(egui::Key::D) {
                    self.pending_commands.push(Command::SplitHorizontal);
                } else if i.key_pressed(egui::Key::E) {
                    self.pending_commands.push(Command::SplitVertical);
                } else if i.key_pressed(egui::Key::W) {
                    self.pending_commands.push(Command::CloseSurface);
                }
            }
        });
    }

    pub fn process_commands(&mut self) {
        let commands: Vec<Command> = self.pending_commands.drain(..).collect();
        for cmd in commands {
            match cmd {
                Command::ToggleSidebar => {
                    self.sidebar_open = !self.sidebar_open;
                }
                Command::OpenGit => {
                    self.active_surface_kind = SurfaceKind::Git;
                    self.refresh_git();
                }
                Command::OpenLogs => {
                    self.active_surface_kind = SurfaceKind::Logs;
                }
                Command::NewTerminal => {
                    self.active_surface_kind = SurfaceKind::Terminal;
                    let new_id = format!("term_{}", self.terminals.len() + 1);
                    let surf_id = SurfaceId(new_id.clone());
                    let root = self
                        .active_workspace()
                        .map(|w| w.root_path.clone())
                        .unwrap_or_else(|| PathBuf::from("/"));

                    if let Ok(term) = TerminalSession::new(new_id.clone(), root, 80, 24) {
                        self.terminals.insert(new_id, term);
                        self.active_surface_id = Some(surf_id.clone());
                        if let Some(ws) = self.active_workspace_mut() {
                            ws.layout = LayoutNode::Split {
                                direction: SplitDirection::Horizontal,
                                ratio: 0.5,
                                first: Box::new(ws.layout.clone()),
                                second: Box::new(LayoutNode::Surface(surf_id)),
                            };
                        }
                    }
                }
                Command::SplitVertical => {
                    let new_id = format!("term_{}", self.terminals.len() + 1);
                    let surf_id = SurfaceId(new_id.clone());
                    let root = self
                        .active_workspace()
                        .map(|w| w.root_path.clone())
                        .unwrap_or_else(|| PathBuf::from("/"));

                    if let Ok(term) = TerminalSession::new(new_id.clone(), root, 80, 24) {
                        self.terminals.insert(new_id, term);
                        self.active_surface_id = Some(surf_id.clone());
                        if let Some(ws) = self.active_workspace_mut() {
                            ws.layout = LayoutNode::Split {
                                direction: SplitDirection::Vertical,
                                ratio: 0.5,
                                first: Box::new(ws.layout.clone()),
                                second: Box::new(LayoutNode::Surface(surf_id)),
                            };
                        }
                    }
                }
                Command::SplitHorizontal => {
                    let new_id = format!("term_{}", self.terminals.len() + 1);
                    let surf_id = SurfaceId(new_id.clone());
                    let root = self
                        .active_workspace()
                        .map(|w| w.root_path.clone())
                        .unwrap_or_else(|| PathBuf::from("/"));

                    if let Ok(term) = TerminalSession::new(new_id.clone(), root, 80, 24) {
                        self.terminals.insert(new_id, term);
                        self.active_surface_id = Some(surf_id.clone());
                        if let Some(ws) = self.active_workspace_mut() {
                            ws.layout = LayoutNode::Split {
                                direction: SplitDirection::Horizontal,
                                ratio: 0.5,
                                first: Box::new(ws.layout.clone()),
                                second: Box::new(LayoutNode::Surface(surf_id)),
                            };
                        }
                    }
                }
                Command::CloseSurface => {
                    if let Some(active) = &self.active_surface_id {
                        self.terminals.remove(&active.0);
                    }
                }
                _ => {}
            }
        }
    }

    pub fn active_workspace(&self) -> Option<&Workspace> {
        let active_id = self.active_workspace_id.as_ref()?;
        self.workspaces.iter().find(|w| &w.id == active_id)
    }

    pub fn active_workspace_mut(&mut self) -> Option<&mut Workspace> {
        let active_id = self.active_workspace_id.as_ref()?.clone();
        self.workspaces.iter_mut().find(|w| w.id == active_id)
    }

    fn render_sidebar(&mut self, ctx: &Context) {
        if !self.sidebar_open {
            return;
        }

        SidePanel::left("workspace_sidebar")
            .resizable(true)
            .default_width(200.0)
            .show(ctx, |ui| {
                ui.heading("WORKSPACES");
                ui.add_space(8.0);

                let mut clicked_ws_id = None;
                let active_id = self.active_workspace_id.clone();
                for ws in &self.workspaces {
                    let is_active = active_id.as_ref() == Some(&ws.id);
                    let label = if is_active {
                        RichText::new(format!("● {}", ws.name)).strong().color(Color32::WHITE)
                    } else {
                        RichText::new(format!("○ {}", ws.name)).color(Color32::LIGHT_GRAY)
                    };

                    if ui.selectable_label(is_active, label).clicked() {
                        clicked_ws_id = Some(ws.id.clone());
                    }
                }

                if let Some(id) = clicked_ws_id {
                    self.active_workspace_id = Some(id);
                    self.refresh_git();
                }

                ui.add_space(16.0);
                if ui.button("+ New Workspace").clicked() {
                    let count = self.workspaces.len() + 1;
                    let id = WorkspaceId(format!("ws_{}", count));
                    let surf_id = SurfaceId(format!("term_ws_{}", count));
                    let root = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));

                    self.workspaces.push(Workspace {
                        id: id.clone(),
                        name: format!("Workspace {}", count),
                        root_path: root,
                        layout: LayoutNode::Surface(surf_id),
                        metadata: WorkspaceMetadata::default(),
                    });
                    self.active_workspace_id = Some(id);
                    self.refresh_git();
                }
            });
    }

    fn render_editor_surface(&mut self, ui: &mut Ui) {
        ui.columns(2, |cols| {
            cols[0].group(|ui| {
                ui.heading("FILES");
                ui.separator();
                let tree = self.file_tree.clone();
                for item in tree {
                    let icon = if item.is_dir { "📁" } else { "📄" };
                    if ui.selectable_label(false, format!("{} {}", icon, item.name)).clicked()
                        && !item.is_dir
                        && let Ok(tab) = EditorTab::open(&item.path)
                    {
                        if let Some(existing_idx) = self.editor_tabs.iter().position(|t| t.path == item.path) {
                            self.active_tab_index = Some(existing_idx);
                        } else {
                            self.editor_tabs.push(tab);
                            self.active_tab_index = Some(self.editor_tabs.len() - 1);
                        }
                    }
                }
            });

            cols[1].group(|ui| {
                if self.editor_tabs.is_empty() {
                    ui.label("No file open. Select a file from the explorer.");
                    return;
                }

                ui.horizontal(|ui| {
                    let mut close_idx = None;
                    for (i, tab) in self.editor_tabs.iter().enumerate() {
                        let is_active = self.active_tab_index == Some(i);
                        let title = if tab.is_dirty {
                            format!("{} *", tab.name)
                        } else {
                            tab.name.clone()
                        };

                        if ui.selectable_label(is_active, title).clicked() {
                            self.active_tab_index = Some(i);
                        }
                        if ui.button("x").clicked() {
                            close_idx = Some(i);
                        }
                    }

                    if let Some(i) = close_idx {
                        self.editor_tabs.remove(i);
                        if self.editor_tabs.is_empty() {
                            self.active_tab_index = None;
                        } else if i >= self.editor_tabs.len() {
                            self.active_tab_index = Some(self.editor_tabs.len() - 1);
                        }
                    }
                });
                ui.separator();

                if let Some(idx) = self.active_tab_index
                    && let Some(tab) = self.editor_tabs.get_mut(idx)
                {
                    ui.horizontal(|ui| {
                        ui.label("Search:");
                        ui.text_edit_singleline(&mut self.editor_search_query);
                        if ui.button("Save").clicked() && tab.save().is_ok() {
                            self.log_store.push("Editor", LogLevel::Info, format!("Saved {}", tab.name));
                        }
                            if ui.button("Undo").clicked() {
                                tab.undo();
                            }
                            if ui.button("Redo").clicked() {
                                tab.redo();
                            }
                        });
                        ui.separator();

                        let mut buf = tab.content.clone();
                        let text_edit = TextEdit::multiline(&mut buf)
                            .code_editor()
                            .desired_rows(25)
                            .desired_width(f32::INFINITY);

                        if ui.add(text_edit).changed() {
                            tab.update_content(buf);
                        }
                }
            });
        });
    }

    fn render_agent_panel(&mut self, ui: &mut Ui) {
        ui.group(|ui| {
            ui.heading("DEVELOPER INTELLIGENCE (AGENTS)");
            ui.add_space(4.0);
            ui.horizontal(|ui| {
                ui.label("Ask Agent:");
                ui.text_edit_singleline(&mut self.agent_prompt_input);
                if ui.button("Submit Task").clicked() && !self.agent_prompt_input.is_empty() {
                    let prompt = self.agent_prompt_input.clone();
                    let root = self
                        .active_workspace()
                        .map(|w| w.root_path.clone())
                        .unwrap_or_else(|| PathBuf::from("/"));

                    self.agent_manager.spawn_task(
                        "Workspace Agent Task".into(),
                        prompt,
                        root,
                        self.log_store.clone(),
                    );
                    self.agent_prompt_input.clear();
                }
            });

            ui.add_space(8.0);
            ui.separator();
            ui.label(RichText::new("AGENT TASKS").strong());

            let tasks = self.agent_manager.get_tasks();
            if tasks.is_empty() {
                ui.label("No agent tasks running.");
            } else {
                for task in tasks {
                    ui.group(|ui| {
                        ui.horizontal(|ui| {
                            ui.label(RichText::new(&task.name).strong());
                            let status_text = format!("{:?}", task.status);
                            ui.label(RichText::new(status_text).color(Color32::LIGHT_BLUE));
                        });
                        ui.label(format!("Prompt: {}", task.prompt));
                        if let Some(ref res) = task.result {
                            ui.separator();
                            ui.code(res);
                        }
                    });
                }
            }
        });
    }

    fn render_git_surface(&mut self, ui: &mut Ui) {
        ui.heading("Git Surface");
        ui.add_space(8.0);

        let root_path = self.active_workspace().map(|w| w.root_path.clone());
        if let (Some(status), Some(root)) = (self.git_status.clone(), root_path) {
            ui.label(RichText::new(format!("Branch: {}", status.branch)).strong());
            ui.add_space(8.0);

            ui.columns(2, |cols| {
                cols[0].group(|ui| {
                    ui.label(RichText::new("STAGED CHANGES").strong());
                    for file in &status.staged {
                        ui.horizontal(|ui| {
                            ui.label(format!("{}", file.path.display()));
                            if ui.button("Unstage").clicked() {
                                let _ = GitService::unstage_file(&root, &file.path);
                            }
                        });
                    }

                    ui.add_space(8.0);
                    ui.label(RichText::new("UNSTAGED & UNTRACKED").strong());
                    for file in status.unstaged.iter().chain(status.untracked.iter()) {
                        ui.horizontal(|ui| {
                            if ui.button(format!("{}", file.path.display())).clicked()
                                && let Ok(diff) = GitService::get_diff(&root, &file.path)
                            {
                                self.selected_diff = Some(diff);
                            }
                            if ui.button("Stage").clicked() {
                                let _ = GitService::stage_file(&root, &file.path);
                            }
                        });
                    }

                    ui.add_space(16.0);
                    ui.label(RichText::new("Commit Message").strong());
                    ui.text_edit_singleline(&mut self.git_commit_message);
                    if ui.button("Commit").clicked() && !self.git_commit_message.is_empty() {
                        let msg = self.git_commit_message.clone();
                        if let Ok(()) = GitService::commit(&root, &msg) {
                            self.log_store.push("Git", LogLevel::Info, format!("Committed: {}", msg));
                            self.git_commit_message.clear();
                        }
                    }
                });

                cols[1].group(|ui| {
                    ui.label(RichText::new("DIFF VIEWER").strong());
                    if let Some(ref diff) = self.selected_diff {
                        ui.code(diff);
                    } else {
                        ui.label("Select a file to inspect diff.");
                    }
                });
            });
        } else {
            ui.label("No active Git repository detected.");
        }
    }

    fn render_logs_surface(&mut self, ui: &mut Ui) {
        ui.heading("Application Logs");
        ui.add_space(8.0);

        ui.horizontal(|ui| {
            if ui.button("Clear Logs").clicked() {
                self.log_store.clear();
            }
        });
        ui.separator();

        let events = self.log_store.get_events();
        egui::ScrollArea::vertical().show(ui, |ui| {
            for log in events {
                let color = match log.level {
                    LogLevel::Error => Color32::RED,
                    LogLevel::Warn => Color32::YELLOW,
                    LogLevel::Info => Color32::LIGHT_BLUE,
                    LogLevel::Debug => Color32::GRAY,
                };
                ui.horizontal(|ui| {
                    ui.label(RichText::new(format!("[{}]", log.timestamp)).color(Color32::GRAY));
                    ui.label(RichText::new(format!("[{}]", log.source)).strong());
                    ui.label(RichText::new(&log.message).color(color));
                });
            }
        });
    }

    fn render_layout_node(&mut self, ui: &mut Ui, node: &LayoutNode) {
        match node {
            LayoutNode::Surface(surf_id) => {
                ui.group(|ui| {
                    let is_active = self.active_surface_id.as_ref() == Some(surf_id);
                    let title_text = if is_active {
                        RichText::new(format!("Terminal [{}]", surf_id.0)).strong()
                    } else {
                        RichText::new(format!("Terminal [{}]", surf_id.0))
                    };

                    ui.horizontal(|ui| {
                        ui.label(title_text);
                    });
                    ui.separator();

                    if let Some(term) = self.terminals.get(&surf_id.0) {
                        let output = term.read_output();
                        let text = String::from_utf8_lossy(&output);
                        ui.code(text.to_string());
                    } else {
                        ui.label("Terminal session closed.");
                    }
                });
            }
            LayoutNode::Split {
                direction,
                first,
                second,
                ..
            } => match direction {
                SplitDirection::Horizontal => {
                    ui.columns(2, |columns| {
                        self.render_layout_node(&mut columns[0], first);
                        self.render_layout_node(&mut columns[1], second);
                    });
                }
                SplitDirection::Vertical => {
                    ui.vertical(|ui| {
                        self.render_layout_node(ui, first);
                        ui.separator();
                        self.render_layout_node(ui, second);
                    });
                }
            },
        }
    }
}

impl Default for AsterApp {
    fn default() -> Self {
        Self::new()
    }
}

impl eframe::App for AsterApp {
    fn update(&mut self, ctx: &Context, _frame: &mut eframe::Frame) {
        self.handle_keyboard_shortcuts(ctx);
        self.process_commands();

        TopBottomPanel::top("top_bar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                if ui.button("☰").clicked() {
                    self.pending_commands.push(Command::ToggleSidebar);
                }
                ui.separator();
                if let Some(ws) = self.active_workspace() {
                    ui.label(RichText::new(&ws.name).strong());
                    ui.label(format!("({})", ws.root_path.display()));
                }

                ui.separator();
                ui.selectable_value(&mut self.active_surface_kind, SurfaceKind::Terminal, "Terminal");
                ui.selectable_value(&mut self.active_surface_kind, SurfaceKind::Editor, "Editor");
                ui.selectable_value(&mut self.active_surface_kind, SurfaceKind::Git, "Git");
                ui.selectable_value(&mut self.active_surface_kind, SurfaceKind::Logs, "Logs");

                ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                    if ui.button("+ Terminal").clicked() {
                        self.pending_commands.push(Command::NewTerminal);
                    }
                    if ui.button("Split ❘").clicked() {
                        self.pending_commands.push(Command::SplitHorizontal);
                    }
                    if ui.button("Split ──").clicked() {
                        self.pending_commands.push(Command::SplitVertical);
                    }
                });
            });
        });

        TopBottomPanel::bottom("status_bar").show(ctx, |ui| {
            ui.horizontal(|ui| {
                if let Some(ws) = self.active_workspace() {
                    ui.label(format!("Workspace: {}", ws.name));
                }
                if let Some(ref status) = self.git_status {
                    ui.separator();
                    ui.label(format!("Git: {}", status.branch));
                }
                ui.separator();
                ui.label("Ready");
            });
        });

        self.render_sidebar(ctx);

        CentralPanel::default().show(ctx, |ui| {
            egui::ScrollArea::vertical().show(ui, |ui| {
                match self.active_surface_kind {
                    SurfaceKind::Terminal => {
                        if let Some(ws) = self.active_workspace().cloned() {
                            self.render_layout_node(ui, &ws.layout);
                        } else {
                            ui.label("No active workspace selected.");
                        }
                    }
                    SurfaceKind::Editor => self.render_editor_surface(ui),
                    SurfaceKind::Git => self.render_git_surface(ui),
                    SurfaceKind::Logs => self.render_logs_surface(ui),
                }

                ui.add_space(16.0);
                ui.separator();
                self.render_agent_panel(ui);
            });
        });

        ctx.request_repaint();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_initialization() {
        let app = AsterApp::new();
        assert_eq!(app.workspaces.len(), 1);
        assert!(app.sidebar_open);
        assert!(app.active_workspace_id.is_some());
    }

    #[test]
    fn test_toggle_sidebar_command() {
        let mut app = AsterApp::new();
        app.pending_commands.push(Command::ToggleSidebar);
        app.process_commands();
        assert!(!app.sidebar_open);
    }
}
