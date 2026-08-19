use aster_ui::AsterApp;

fn main() -> eframe::Result<()> {
    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_inner_size([1100.0, 720.0])
            .with_title("ASTER Developer Workspace"),
        ..Default::default()
    };

    eframe::run_native(
        "ASTER",
        native_options,
        Box::new(|_cc| Ok(Box::new(AsterApp::new()))),
    )
}
