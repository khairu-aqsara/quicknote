//! QuickNote backend.
//!
//! Rust owns everything that can lose the user's text: the note path, the
//! atomic write, the recovery scan, and the conflict copy. The frontend never
//! builds a path and never touches the filesystem. See PRD Sections 12, 13,
//! and 23.
//!
//! This file does one job — it wires the application together. Every rule it
//! wires up lives in one of the modules below.

mod commands;
mod error;
mod note;
mod paths;
mod settings;
mod state;
mod storage;
mod tray;
mod window;

use std::str::FromStr;

use tauri::{Emitter, Manager, State, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::state::AppState;

/// Starts QuickNote.
///
/// # Panics
///
/// Panics when the Tauri builder cannot produce an application. That is the one
/// panic in the codebase, and it is deliberate: nothing has started yet, so
/// there is no window to report the failure in and no note to protect.
/// Everywhere else, an error is returned.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[allow(clippy::expect_used)]
pub fn run() {
    drop(std::fs::create_dir_all(paths::state_dir()));
    let config = settings::read_config();
    let note_path = commands::initial_note_path(&config);

    let mut builder = tauri::Builder::default();

    // The single-instance plugin must be registered before any other.
    #[cfg(all(desktop, not(any(target_os = "android", target_os = "ios"))))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            window::show(app);
        }));
    }

    builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        window::toggle(app);
                    }
                })
                .build(),
        )
        .manage(AppState::new(note_path.clone()))
        .invoke_handler(tauri::generate_handler![
            commands::note_load,
            commands::note_save,
            commands::note_check,
            commands::note_set_path,
            commands::pick_note_file,
            commands::config_load,
            commands::config_save,
            commands::session_load,
            commands::session_save,
            commands::set_always_on_top,
            commands::set_global_shortcut,
            commands::hide_window,
            commands::quit_app,
            commands::ready_to_exit,
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            // macOS: no Dock icon and no application menu. QuickNote lives in
            // the menu bar and answers the global shortcut. `LSUIElement` in
            // `Info.plist` says the same thing to the bundled application, so
            // the Dock icon never flashes at launch.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            tray::build(&handle)?;
            window::restore_geometry(&handle);

            if config.always_on_top {
                if let Some(main) = handle.get_webview_window("main") {
                    drop(main.set_always_on_top(true));
                }
            }

            commands::allow_note_directory(&handle, &note_path);
            register_startup_shortcut(&handle, &config.global_shortcut);

            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window hides it. The application stays resident so
            // the global shortcut can reopen it fast. PRD Section 14.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                drop(window.app_handle().emit("quicknote://flush-and-hide", ()));
            }
        })
        .build(tauri::generate_context!())
        // Nothing has started yet, so there is no window to report this in and
        // no note to protect. Failing loudly is all that is left.
        .expect("QuickNote failed to start")
        .run(|handle, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                if window::begin_exit(handle) {
                    api.prevent_exit();
                }
            }

            // macOS asks for this when the application is opened again with no
            // window on screen. The tray and the global shortcut are the usual
            // routes back to a hidden window; this covers the rest.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => window::show(handle),

            _ => {}
        });
}

/// Registers the accelerator the settings file asks for, and remembers it.
///
/// A combination another application already owns simply fails to register.
/// QuickNote still starts — the window, the tray, and every other route in are
/// unaffected — and Settings can offer another one.
fn register_startup_shortcut(handle: &tauri::AppHandle, accelerator: &str) {
    let Ok(shortcut) = Shortcut::from_str(accelerator) else {
        return;
    };
    if handle.global_shortcut().register(shortcut).is_err() {
        return;
    }
    let state: State<AppState> = handle.state();
    drop(state.with_shortcut(|current| *current = Some(shortcut)));
}
