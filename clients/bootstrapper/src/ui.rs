// Zekoro splash. The window is borderless and transparent; we paint a rounded
// dark card with a soft drop-shadow ourselves and overlay the bundled
// `icon.png` logo, a status string ("Upgrading Zekoro..." while installing),
// a green progress bar, and a Cancel button. Modelled on the modern Roblox
// upgrade modal — same colours and proportions, just rebranded.

use std::sync::{Arc, Mutex};

use eframe::egui::{
    self, Align2, Color32, ColorImage, FontId, Pos2, Rect, Rounding, Sense, Stroke,
    TextureHandle, TextureOptions, Vec2,
};

use crate::config::Kind;

/// Embedded brand image. Used both as the splash logo and the window/taskbar
/// icon (decoded once and reused for both via `app_icon_rgba()`).
pub const APP_ICON_BYTES: &[u8] = include_bytes!("../icon.png");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Phase {
    Connecting,
    Configuring,
    Starting,
    Done,
    Idle,
    Failed,
}

pub struct BootstrapState {
    pub phase: Phase,
    pub status: String,
    pub play_url: Option<String>,
    /// Absolute path to a local Studio file (.rblx/.rbxl/.rbxlx) when the
    /// launcher was invoked via the registered file association rather than
    /// via a URL scheme. Mutually exclusive with `play_url` in practice.
    pub local_file: Option<String>,
    pub client: String,
    pub kind: Kind,
    /// Standalone-installer mode. The pipeline installs both Player and
    /// Studio, never spawns the game, and the modal stays open in success
    /// state until the user clicks Cancel/Close.
    pub install_only: bool,
    pub request_close: bool,
    pub error: Option<String>,
    /// `None` → indeterminate; `Some(0.0..=1.0)` → determinate.
    pub progress: Option<f32>,
}

impl BootstrapState {
    pub fn new(
        play_url: Option<String>,
        local_file: Option<String>,
        client: String,
        kind: Kind,
        install_only: bool,
    ) -> Self {
        let status = if install_only {
            "Connecting to Zekoro...".to_string()
        } else {
            format!("Connecting to {}...", kind.label())
        };
        Self {
            phase: Phase::Connecting,
            status,
            play_url,
            local_file,
            client,
            kind,
            install_only,
            request_close: false,
            error: None,
            progress: None,
        }
    }

    pub fn fail(&mut self, message: impl Into<String>) {
        let msg = message.into();
        self.phase = Phase::Failed;
        self.status = msg.clone();
        self.error = Some(msg);
    }
}

pub struct BootstrapApp {
    state: Arc<Mutex<BootstrapState>>,
    started_at: std::time::Instant,
    logo: Option<TextureHandle>,
    logo_aspect: f32, // width / height
}

impl BootstrapApp {
    pub fn new(cc: &eframe::CreationContext<'_>, state: Arc<Mutex<BootstrapState>>) -> Self {
        let (logo, aspect) = match decode_logo(&cc.egui_ctx) {
            Ok((tex, w, h)) => (Some(tex), (w as f32) / (h as f32).max(1.0)),
            Err(err) => {
                log::warn!("failed to load embedded logo: {err:#}");
                (None, 4.0)
            }
        };
        Self {
            state,
            started_at: std::time::Instant::now(),
            logo,
            logo_aspect: aspect,
        }
    }
}

fn decode_logo(ctx: &egui::Context) -> anyhow::Result<(TextureHandle, u32, u32)> {
    let img = image::load_from_memory(APP_ICON_BYTES)?.to_rgba8();
    let (w, h) = (img.width(), img.height());
    let pixels = img.into_raw();
    let color_image = ColorImage::from_rgba_unmultiplied([w as usize, h as usize], &pixels);
    let tex = ctx.load_texture("zekoro_logo", color_image, TextureOptions::LINEAR);
    Ok((tex, w, h))
}

/// Decode the bundled `icon.png` into raw RGBA + dimensions, ready for
/// `egui::ViewportBuilder::with_icon` (window/taskbar icon).
pub fn app_icon_rgba() -> Option<(Vec<u8>, u32, u32)> {
    match image::load_from_memory(APP_ICON_BYTES) {
        Ok(img) => {
            let img = img.to_rgba8();
            let (w, h) = (img.width(), img.height());
            Some((img.into_raw(), w, h))
        }
        Err(err) => {
            log::warn!("failed to decode embedded icon for window: {err:#}");
            None
        }
    }
}

impl eframe::App for BootstrapApp {
    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        [0.0, 0.0, 0.0, 0.0]
    }

    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        ctx.request_repaint_after(std::time::Duration::from_millis(16));

        let snapshot = {
            let s = self.state.lock().unwrap();
            (
                s.phase,
                s.status.clone(),
                s.request_close,
                s.error.clone(),
                s.progress,
            )
        };
        if snapshot.2 {
            ctx.send_viewport_cmd(egui::ViewportCommand::Close);
            return;
        }

        egui::CentralPanel::default()
            .frame(egui::Frame::none())
            .show(ctx, |ui| {
                let rect = ui.max_rect();
                draw_card(ui.painter(), rect);
                self.draw_logo(ui.painter(), rect);
                draw_status(ui.painter(), rect, &snapshot.1);
                draw_progress(
                    ui.painter(),
                    rect,
                    snapshot.0,
                    snapshot.4,
                    self.started_at.elapsed().as_secs_f32(),
                );
                draw_cancel_button(ui, rect);
                if snapshot.0 == Phase::Failed {
                    if let Some(err) = &snapshot.3 {
                        draw_error(ui.painter(), rect, err);
                    }
                }
            });
    }
}

// --- palette: dark Roblox-style upgrade modal ----------------------------
// The card body is a very dark grey (close to #1F1F1F), the progress bar
// uses Roblox's bright green (#00B500-ish) on a light grey track, and the
// Cancel button is a white text label inside a thin white rounded outline.
const CARD_BG: Color32 = Color32::from_rgb(0x1E, 0x1E, 0x1E);
const CARD_SHADOW: Color32 = Color32::from_rgba_premultiplied(0, 0, 0, 96);
const CARD_BORDER: Color32 = Color32::from_rgb(0x2C, 0x2C, 0x2C);
// Bright green progress fill, matching the screenshot reference.
const PROGRESS_FILL: Color32 = Color32::from_rgb(0x2F, 0xC4, 0x32);
const PROGRESS_TRACK: Color32 = Color32::from_rgb(0xD9, 0xD9, 0xD9);
const TEXT_PRIMARY: Color32 = Color32::from_rgb(0xEE, 0xEE, 0xEE);
const TEXT_MUTED: Color32 = Color32::from_rgb(0xA0, 0xA0, 0xA0);
const BUTTON_BORDER: Color32 = Color32::from_rgb(0xC8, 0xC8, 0xC8);
const BUTTON_HOVER_BG: Color32 = Color32::from_rgba_premultiplied(255, 255, 255, 24);

fn draw_card(p: &egui::Painter, rect: Rect) {
    // Soft drop shadow under the card.
    let shadow = rect.shrink(6.0).translate(Vec2::new(0.0, 6.0));
    // Sharp corners across the whole splash — explicit `Rounding::ZERO` on
    // every rect so egui never falls back to its default rounded edges.
    p.rect_filled(shadow, Rounding::ZERO, CARD_SHADOW);

    let card = rect.shrink(10.0);
    p.rect_filled(card, Rounding::ZERO, CARD_BG);
    p.rect_stroke(card, Rounding::ZERO, Stroke::new(1.0, CARD_BORDER));
}

/// Outlined "Cancel" button at the bottom-centre, matching the Roblox
/// upgrade modal. Clicking it requests window close (which exits the
/// process via main's eframe::run_native return).
fn draw_cancel_button(ui: &mut egui::Ui, rect: Rect) {
    let btn_w = 110.0;
    let btn_h = 30.0;
    let btn_rect = Rect::from_min_size(
        Pos2::new(rect.center().x - btn_w * 0.5, rect.bottom() - 56.0),
        Vec2::new(btn_w, btn_h),
    );

    let response = ui.interact(btn_rect, egui::Id::new("cancel_btn"), Sense::click());
    let bg = if response.hovered() {
        BUTTON_HOVER_BG
    } else {
        Color32::TRANSPARENT
    };
    let painter = ui.painter();
    let btn_rounding = Rounding::same(8.0);
    painter.rect_filled(btn_rect, btn_rounding, bg);
    painter.rect_stroke(btn_rect, btn_rounding, Stroke::new(1.2, BUTTON_BORDER));
    painter.text(
        btn_rect.center(),
        Align2::CENTER_CENTER,
        "Cancel",
        FontId::proportional(14.0),
        TEXT_PRIMARY,
    );

    if response.clicked() {
        ui.ctx().send_viewport_cmd(egui::ViewportCommand::Close);
    }
}

impl BootstrapApp {
    fn draw_logo(&self, p: &egui::Painter, rect: Rect) {
        let target_h = 78.0;
        match &self.logo {
            Some(tex) => {
                let target_w = target_h * self.logo_aspect;
                let center_x = rect.center().x;
                let top_y = rect.top() + 34.0;
                let logo_rect = Rect::from_min_size(
                    Pos2::new(center_x - target_w * 0.5, top_y),
                    Vec2::new(target_w, target_h),
                );
                p.image(
                    tex.id(),
                    logo_rect,
                    Rect::from_min_max(Pos2::new(0.0, 0.0), Pos2::new(1.0, 1.0)),
                    Color32::WHITE,
                );
            }
            None => {
                p.text(
                    Pos2::new(rect.center().x, rect.top() + 70.0),
                    Align2::CENTER_CENTER,
                    "ZEKORO",
                    FontId::proportional(38.0),
                    TEXT_PRIMARY,
                );
            }
        }
    }
}

fn draw_status(p: &egui::Painter, rect: Rect, status: &str) {
    p.text(
        Pos2::new(rect.center().x, rect.top() + 144.0),
        Align2::CENTER_CENTER,
        status,
        FontId::proportional(15.0),
        TEXT_PRIMARY,
    );
}

fn draw_progress(p: &egui::Painter, rect: Rect, phase: Phase, progress: Option<f32>, t: f32) {
    let track_h = 8.0;
    let track_margin_x = 40.0;
    let track_y = rect.top() + 178.0;
    let track = Rect::from_min_max(
        Pos2::new(rect.left() + track_margin_x, track_y),
        Pos2::new(rect.right() - track_margin_x, track_y + track_h),
    );
    p.rect_filled(track, Rounding::ZERO, PROGRESS_TRACK);

    if phase == Phase::Failed {
        return;
    }

    match progress {
        Some(frac) => {
            let frac = frac.clamp(0.0, 1.0);
            let fill_w = (track.width() * frac).max(2.0);
            let bar = Rect::from_min_size(track.min, Vec2::new(fill_w, track_h));
            p.rect_filled(bar, Rounding::ZERO, PROGRESS_FILL);

            let pct = (frac * 100.0).round() as i32;
            p.text(
                Pos2::new(rect.center().x, track_y + 22.0),
                Align2::CENTER_CENTER,
                &format!("{} ({pct}%)", subtitle_for(phase)),
                FontId::proportional(12.0),
                TEXT_MUTED,
            );
        }
        None => {
            let segment_w = track.width() * 0.30;
            let travel = track.width() - segment_w;
            let cycle = ((t * 1.4).sin() * 0.5 + 0.5).clamp(0.0, 1.0);
            let x0 = track.left() + travel * cycle;
            let bar = Rect::from_min_size(Pos2::new(x0, track.top()), Vec2::new(segment_w, track_h));
            p.rect_filled(bar, Rounding::ZERO, PROGRESS_FILL);

            p.text(
                Pos2::new(rect.center().x, track_y + 22.0),
                Align2::CENTER_CENTER,
                subtitle_for(phase),
                FontId::proportional(12.0),
                TEXT_MUTED,
            );
        }
    }
}

fn subtitle_for(phase: Phase) -> &'static str {
    match phase {
        Phase::Connecting => "Checking files",
        Phase::Configuring => "Applying update",
        Phase::Starting => "Launching",
        Phase::Done => "Have fun!",
        Phase::Idle => "Waiting for a play request",
        Phase::Failed => "",
    }
}

fn draw_error(p: &egui::Painter, rect: Rect, err: &str) {
    // Failed-state inline text. Sits between the (now-frozen) progress bar
    // and the Cancel button. Bright red so it reads against the dark card.
    const ERROR_TEXT: Color32 = Color32::from_rgb(0xFF, 0x6A, 0x6A);
    p.text(
        Pos2::new(rect.center().x, rect.top() + 218.0),
        Align2::CENTER_CENTER,
        err,
        FontId::proportional(11.0),
        ERROR_TEXT,
    );
}
