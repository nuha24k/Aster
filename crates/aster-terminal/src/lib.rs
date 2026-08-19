use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtyPair, PtySize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum TerminalError {
    #[error("PTY creation error: {0}")]
    PtyCreation(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Session terminated")]
    Terminated,
}

pub struct TerminalSession {
    pub id: String,
    pub title: String,
    pub cwd: PathBuf,
    master: Box<dyn MasterPty + Send>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    reader_buffer: Arc<Mutex<Vec<u8>>>,
}

impl TerminalSession {
    pub fn new(id: String, cwd: PathBuf, cols: u16, rows: u16) -> Result<Self, TerminalError> {
        let pty_system = native_pty_system();
        let pair: PtyPair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| TerminalError::PtyCreation(e.to_string()))?;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-l");
        cmd.cwd(&cwd);

        // Forward environment variables from parent process
        for (key, val) in std::env::vars() {
            cmd.env(key, val);
        }
        // Force TERM and COLORTERM for proper xterm-256color rendering & Oh-My-Posh support
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");


        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| TerminalError::PtyCreation(e.to_string()))?;

        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| TerminalError::PtyCreation(e.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| TerminalError::PtyCreation(e.to_string()))?;

        let reader_buffer = Arc::new(Mutex::new(Vec::new()));
        let buffer_clone = reader_buffer.clone();

        std::thread::spawn(move || {
            let mut reader = reader;
            let mut buf = [0u8; 1024];
            while let Ok(n) = reader.read(&mut buf) {
                if n == 0 {
                    break;
                }
                let mut guard = buffer_clone.lock();
                guard.extend_from_slice(&buf[..n]);
            }
        });

        Ok(Self {
            id,
            title: "Terminal".to_string(),
            cwd,
            master: pair.master,
            writer: Arc::new(Mutex::new(writer)),
            reader_buffer,
        })
    }

    pub fn write_bytes(&self, bytes: &[u8]) -> Result<(), TerminalError> {
        let mut writer = self.writer.lock();
        writer.write_all(bytes)?;
        writer.flush()?;
        Ok(())
    }

    pub fn read_output(&self) -> Vec<u8> {
        let mut guard = self.reader_buffer.lock();
        std::mem::take(&mut *guard)
    }

    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<(), TerminalError> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| TerminalError::PtyCreation(e.to_string()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_terminal_session_creation() {
        let temp_dir = std::env::temp_dir();
        let session = TerminalSession::new("term_1".into(), temp_dir, 80, 24);
        assert!(session.is_ok());
        let session = session.unwrap();
        session.write_bytes(b"echo hello\n").unwrap();
        std::thread::sleep(Duration::from_millis(200));
        let output = session.read_output();
        assert!(!output.is_empty());
    }
}
