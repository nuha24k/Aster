//! Native application menu bar.
//!
//! Custom items emit a single `menu` event carrying the item id; the React side
//! owns the behaviour. Predefined items (undo, copy, paste, minimize, …) are
//! handled by the OS / webview directly — no code needed.

use tauri::menu::{
    AboutMetadata, CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

fn sep<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<PredefinedMenuItem<R>> {
    PredefinedMenuItem::separator(app)
}

/// Recently opened folders, most recent first.
fn recent_folders<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
    app.try_state::<crate::AppState>()
        .and_then(|state| state.store.lock().ok().map(|s| s.recent_folders.clone()))
        .unwrap_or_default()
}

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let it = |id: &str, label: &str, accel: Option<&str>| {
        MenuItem::with_id(app, id, label, true, accel)
    };

    #[cfg(target_os = "macos")]
    let app_menu = Submenu::with_items(
        app,
        "ASTER",
        true,
        &[
            &PredefinedMenuItem::about(
                app,
                Some("About ASTER"),
                Some(AboutMetadata {
                    name: Some("ASTER".into()),
                    version: Some(env!("CARGO_PKG_VERSION").into()),
                    comments: Some("ASTER Developer Workspace".into()),
                    ..Default::default()
                }),
            )?,
            &sep(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &sep(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &sep(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    // ─── Open Recent ────────────────────────────────────────────────────────
    let recents = recent_folders(app);
    let recent_items: Vec<MenuItem<R>> = recents
        .iter()
        .map(|path| MenuItem::with_id(app, format!("recent:{path}"), path, true, None::<&str>))
        .collect::<tauri::Result<_>>()?;
    let mut recent_refs: Vec<&dyn tauri::menu::IsMenuItem<R>> =
        recent_items.iter().map(|i| i as &dyn tauri::menu::IsMenuItem<R>).collect();
    let no_recents = it("noop", "No Recent Folders", None)?;
    if recent_refs.is_empty() {
        no_recents.set_enabled(false)?;
        recent_refs.push(&no_recents);
    }
    let recent_sep = sep(app)?;
    let clear_recents = it("clear_recents", "Clear Recently Opened", None)?;
    recent_refs.push(&recent_sep);
    recent_refs.push(&clear_recents);
    let open_recent = Submenu::with_items(app, "Open Recent", true, &recent_refs)?;

    let auto_save = CheckMenuItem::with_id(app, "auto_save", "Auto Save", true, false, None::<&str>)?;

    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &it("new_file", "New Text File", Some("CmdOrCtrl+N"))?,
            &it("new_file_on_disk", "New File…", Some("Ctrl+Alt+CmdOrCtrl+N"))?,
            &it("new_workspace", "New Workspace", Some("CmdOrCtrl+Shift+N"))?,
            &sep(app)?,
            &it("open_file", "Open…", Some("CmdOrCtrl+O"))?,
            &it("open_folder", "Open Folder…", None)?,
            &open_recent,
            &sep(app)?,
            &it("save", "Save", Some("CmdOrCtrl+S"))?,
            &it("save_as", "Save As…", Some("CmdOrCtrl+Shift+S"))?,
            &it("save_all", "Save All", Some("Alt+CmdOrCtrl+S"))?,
            &sep(app)?,
            &auto_save,
            &it("revert_file", "Revert File", None)?,
            &sep(app)?,
            &it("reveal_in_finder", "Reveal in File Manager", None)?,
            &sep(app)?,
            &it("close_tab", "Close Editor", Some("CmdOrCtrl+W"))?,
            &it("reopen_tab", "Reopen Closed Editor", Some("CmdOrCtrl+Shift+T"))?,
            &it("close_folder", "Close Folder", None)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &sep(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &sep(app)?,
            &it("find", "Find", Some("CmdOrCtrl+F"))?,
            &it("replace", "Replace", Some("Alt+CmdOrCtrl+F"))?,
            &it("find_in_files", "Find in Files", Some("Shift+CmdOrCtrl+F"))?,
            &it("find_next", "Find Next", Some("CmdOrCtrl+G"))?,
            &it("find_prev", "Find Previous", Some("Shift+CmdOrCtrl+G"))?,
            &sep(app)?,
            &it("toggle_comment", "Toggle Line Comment", Some("CmdOrCtrl+/"))?,
            &it("toggle_block_comment", "Toggle Block Comment", Some("Shift+Alt+A"))?,
            &it("format_document", "Format Document", Some("Shift+Alt+F"))?,
        ],
    )?;

    let selection = Submenu::with_items(
        app,
        "Selection",
        true,
        &[
            &PredefinedMenuItem::select_all(app, None)?,
            &it("expand_selection", "Expand Selection", Some("Ctrl+Shift+CmdOrCtrl+ArrowRight"))?,
            &it("shrink_selection", "Shrink Selection", Some("Ctrl+Shift+CmdOrCtrl+ArrowLeft"))?,
            &sep(app)?,
            &it("copy_line_up", "Copy Line Up", Some("Shift+Alt+ArrowUp"))?,
            &it("copy_line_down", "Copy Line Down", Some("Shift+Alt+ArrowDown"))?,
            &it("move_line_up", "Move Line Up", Some("Alt+ArrowUp"))?,
            &it("move_line_down", "Move Line Down", Some("Alt+ArrowDown"))?,
            &it("duplicate_selection", "Duplicate Selection", None)?,
            &it("delete_line", "Delete Line", Some("Shift+CmdOrCtrl+K"))?,
            &sep(app)?,
            &it("cursor_above", "Add Cursor Above", Some("Alt+CmdOrCtrl+ArrowUp"))?,
            &it("cursor_below", "Add Cursor Below", Some("Alt+CmdOrCtrl+ArrowDown"))?,
            &it("cursors_line_ends", "Add Cursors to Line Ends", Some("Shift+Alt+I"))?,
            // ⌘D stays Split Right for the terminal, so this sits on ⌥⌘D.
            &it("add_next_occurrence", "Add Next Occurrence", Some("Alt+CmdOrCtrl+D"))?,
            &it("add_prev_occurrence", "Add Previous Occurrence", None)?,
            &it("select_all_occurrences", "Select All Occurrences", Some("Shift+CmdOrCtrl+L"))?,
        ],
    )?;

    let go = Submenu::with_items(
        app,
        "Go",
        true,
        &[
            &it("find_file", "Go to File…", Some("CmdOrCtrl+P"))?,
            &it("go_to_line", "Go to Line…", Some("Ctrl+G"))?,
            &it("go_to_symbol", "Go to Symbol…", Some("Shift+CmdOrCtrl+O"))?,
        ],
    )?;

    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &it("toggle_sidebar", "Toggle Sidebar", Some("CmdOrCtrl+B"))?,
            &sep(app)?,
            &it("surface_terminal", "Terminal", Some("CmdOrCtrl+1"))?,
            &it("surface_editor", "Editor", Some("CmdOrCtrl+2"))?,
            &it("surface_git", "Git & Diff", Some("CmdOrCtrl+3"))?,
            &it("surface_kanban", "Task Board", Some("CmdOrCtrl+4"))?,
            &it("surface_logs", "Logs", Some("CmdOrCtrl+5"))?,
            &sep(app)?,
            &it("command_palette", "Command Palette…", Some("CmdOrCtrl+K"))?,
            &it("editor_commands", "Editor Commands…", Some("Shift+CmdOrCtrl+P"))?,
            &it("agent_panel", "AI Agent Panel", Some("CmdOrCtrl+I"))?,
            &sep(app)?,
            &it("devtools", "Toggle Developer Tools", Some("CmdOrCtrl+Alt+I"))?,
        ],
    )?;

    let terminal = Submenu::with_items(
        app,
        "Terminal",
        true,
        &[
            &it("new_terminal", "New Terminal", Some("CmdOrCtrl+T"))?,
            &sep(app)?,
            &it("split_vertical", "Split Right", Some("CmdOrCtrl+D"))?,
            &it("split_horizontal", "Split Down", Some("CmdOrCtrl+Shift+D"))?,
            &it("close_pane", "Close Pane", Some("Alt+CmdOrCtrl+W"))?,
            &sep(app)?,
            &it("next_pane", "Next Pane", Some("CmdOrCtrl+]"))?,
            &it("prev_pane", "Previous Pane", Some("CmdOrCtrl+["))?,
        ],
    )?;

    let git = Submenu::with_items(
        app,
        "Git",
        true,
        &[
            &it("surface_git", "Open Git Cockpit", None)?,
            &it("git_refresh", "Refresh Status", Some("CmdOrCtrl+Shift+R"))?,
            &sep(app)?,
            &it("git_pull", "Pull", None)?,
            &it("git_push", "Push", None)?,
        ],
    )?;

    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
        ],
    )?;

    let help = Submenu::with_items(
        app,
        "Help",
        true,
        &[&PredefinedMenuItem::about(app, Some("About ASTER"), None)?],
    )?;

    Menu::with_items(
        app,
        &[
            #[cfg(target_os = "macos")]
            &app_menu,
            &file,
            &edit,
            &selection,
            &go,
            &view,
            &terminal,
            &git,
            &window,
            &help,
        ],
    )
}

/// Forward every custom menu click to the frontend as a `menu` event.
pub fn on_event<R: Runtime>(app: &AppHandle<R>, id: &str) {
    match id {
        "noop" => {}
        "devtools" => {
            #[cfg(debug_assertions)]
            if let Some(w) = app.get_webview_window("main") {
                if w.is_devtools_open() {
                    w.close_devtools();
                } else {
                    w.open_devtools();
                }
            }
        }
        _ => {
            let _ = app.emit("menu", id);
        }
    }
}
