use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct GridPt {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Board {
    pub grid_pitch_mm: f32,
    pub width: i32,
    pub height: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Wire {
    pub id: Uuid,
    pub net_id: Uuid,
    pub path: Vec<GridPt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Net {
    pub id: Uuid,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartDef {
    pub id: Uuid,
    pub name: String,
    pub pins: Vec<PinDef>,
    pub occupied: Vec<GridPt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinDef {
    pub name: String,
    pub pos: GridPt,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PartInst {
    pub id: Uuid,
    pub def_id: Uuid,
    pub at: GridPt,
    pub rot: Rot,
    pub refdes: String,
    pub net_assign: HashMap<String, Uuid>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub enum Rot {
    Deg0,
    Deg90,
    Deg180,
    Deg270,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectState {
    pub schema_version: u32,
    pub board: Board,
    pub part_defs: Vec<PartDef>,
    pub part_insts: Vec<PartInst>,
    pub nets: Vec<Net>,
    pub wires: Vec<Wire>,
}

impl Default for ProjectState {
    fn default() -> Self {
        Self {
            schema_version: 1,
            board: Board {
                grid_pitch_mm: 2.54,
                width: 64,
                height: 40,
            },
            part_defs: Vec::new(),
            part_insts: Vec::new(),
            nets: Vec::new(),
            wires: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Command {
    CommitWire { net_id: Uuid, path: Vec<GridPt> },
    AssignNetName { net_id: Uuid, name: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DrcIssue {
    pub level: IssueLevel,
    pub code: String,
    pub message: String,
    pub at: Option<GridPt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IssueLevel {
    Error,
    Warning,
}

pub fn apply_command(state: &mut ProjectState, cmd: Command) -> Result<(), String> {
    match cmd {
        Command::CommitWire { net_id, path } => {
            validate_wire_path(&path)?;
            state.wires.push(Wire {
                id: Uuid::new_v4(),
                net_id,
                path,
            });
            Ok(())
        }
        Command::AssignNetName { net_id, name } => {
            if let Some(net) = state.nets.iter_mut().find(|n| n.id == net_id) {
                net.name = name;
                return Ok(());
            }
            Err("net not found".to_owned())
        }
    }
}

pub fn validate_wire_path(path: &[GridPt]) -> Result<(), String> {
    if path.len() < 2 {
        return Err("wire path must have >=2 points".to_owned());
    }

    for window in path.windows(2) {
        let a = window[0];
        let b = window[1];
        let dx = (a.x - b.x).abs();
        let dy = (a.y - b.y).abs();
        if dx + dy != 1 {
            return Err("wire segments must be one-grid-step Manhattan".to_owned());
        }
    }

    Ok(())
}

pub fn run_drc(state: &ProjectState) -> Vec<DrcIssue> {
    let mut issues = Vec::new();
    let mut occ_wire: HashMap<GridPt, HashSet<Uuid>> = HashMap::new();

    for wire in &state.wires {
        for pt in &wire.path {
            occ_wire.entry(*pt).or_default().insert(wire.net_id);
        }
    }

    for (pt, nets) in occ_wire {
        if nets.len() > 1 {
            issues.push(DrcIssue {
                level: IssueLevel::Error,
                code: "SHORT".to_owned(),
                message: "multiple nets share one grid point".to_owned(),
                at: Some(pt),
            });
        }
    }

    issues
}
