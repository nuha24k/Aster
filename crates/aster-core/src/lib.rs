pub mod agents;
pub mod logs;

use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceId(pub String);

#[derive(Debug, Clone, PartialEq)]
pub enum SplitDirection {
    Vertical,
    Horizontal,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SurfaceId(pub String);

#[derive(Debug, Clone, PartialEq)]
pub enum SurfaceKind {
    Terminal,
    Editor,
    Git,
    Logs,
}

#[derive(Debug, Clone, PartialEq)]
pub enum LayoutNode {
    Surface(SurfaceId),
    Split {
        direction: SplitDirection,
        ratio: f32,
        first: Box<LayoutNode>,
        second: Box<LayoutNode>,
    },
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct WorkspaceMetadata {
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Workspace {
    pub id: WorkspaceId,
    pub name: String,
    pub root_path: PathBuf,
    pub layout: LayoutNode,
    pub metadata: WorkspaceMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Command {
    NewWorkspace,
    OpenWorkspace,
    NewTerminal,
    SplitVertical,
    SplitHorizontal,
    CloseSurface,
    ToggleSidebar,
    OpenGit,
    OpenLogs,
    QuickOpen,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_instantiation() {
        let ws = Workspace {
            id: WorkspaceId("ws_1".into()),
            name: "Default Workspace".into(),
            root_path: PathBuf::from("/"),
            layout: LayoutNode::Surface(SurfaceId("surf_1".into())),
            metadata: WorkspaceMetadata::default(),
        };
        assert_eq!(ws.id.0, "ws_1");
    }
}
