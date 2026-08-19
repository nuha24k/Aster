use std::sync::Arc;
use parking_lot::Mutex;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LogLevel {
    Info,
    Warn,
    Error,
    Debug,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogEvent {
    pub timestamp: String,
    pub source: String,
    pub level: LogLevel,
    pub message: String,
}

#[derive(Clone, Default)]
pub struct LogStore {
    events: Arc<Mutex<Vec<LogEvent>>>,
}

impl LogStore {
    pub fn new() -> Self {
        Self {
            events: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub fn push(&self, source: impl Into<String>, level: LogLevel, message: impl Into<String>) {
        let timestamp = chrono::Local::now().format("%H:%M:%S").to_string();
        let event = LogEvent {
            timestamp,
            source: source.into(),
            level,
            message: message.into(),
        };
        let mut guard = self.events.lock();
        guard.push(event);
    }

    pub fn get_events(&self) -> Vec<LogEvent> {
        self.events.lock().clone()
    }

    pub fn clear(&self) {
        self.events.lock().clear();
    }
}
