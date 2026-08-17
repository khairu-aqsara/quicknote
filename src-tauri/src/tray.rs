//! QuickNote in the system tray: the macOS menu bar, the Windows notification
//! area, the Linux status area.
//!
//! The tray is the only thing on screen once the Dock icon is gone, so it
//! carries both actions the user still needs — open the note and quit. A left
//! click toggles the window, because reaching the note in one click is the
//! point of the application. A right click opens the menu.

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::AppHandle;

use crate::window;

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open QuickNote", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit QuickNote", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &separator, &quit])?;

    TrayIconBuilder::with_id("main")
        .icon(tauri::include_image!("./icons/tray.png"))
        // macOS paints a template image in the menu bar colour, so one black
        // glyph follows both the light and the dark menu bar.
        .icon_as_template(true)
        .tooltip("QuickNote")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => window::show(app),
            "quit" => {
                window::begin_exit(app);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                window::toggle(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}
